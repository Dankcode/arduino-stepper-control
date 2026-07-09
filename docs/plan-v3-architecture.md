# Plan v3 (2026-07-09) — Hub/Agent Architecture

Amends `docs/plan-2026-07-09.md`. Decisions locked with Leon: **LAN PC/home server hosts
the heavy services**, **FastAPI + Python**, **Docker Compose on the hub, systemd on the Pi**.
Design only — no code written.

The v2 plan's core decision (single serial owner, §2) still holds, but the owner changes:
the **Pi agent** owns the serial port and camera; the **hub** owns everything else.
`RoutineRunner`, scheduling, DB, and image storage all move OFF the Pi Zero 2.

---

## 1. TARGET TOPOLOGY

```
┌──────────────── LAN PC / home server (Docker Compose) ────────────────┐
│  dashboard   Next.js container (existing app, dockerized)             │
│  hub-api     FastAPI: REST + WebSocket, routine orchestration,        │
│              motion planning, image index/search, APScheduler         │
│  postgres    routines, schedules, well params, image metadata         │
│  volumes     ./data/images (full-res + thumbnails)                    │
└───────────────┬───────────────────────────────────────────────────────┘
                │  HTTP (commands) + WebSocket (progress/events)
┌───────────────▼───────────── Raspberry Pi Zero 2 (systemd) ───────────┐
│  agent       FastAPI (uvicorn, 1 worker): serial, camera, GPIO only   │
│              no DB, no cron, no planning, no image retention          │
└──────┬──────────────────┬──────────────────┬──────────────────────────┘
       │ USB serial       │ CSI              │ GPIO 21
    Arduino (fw v2)    Pi camera          blue light
```

Browser talks **only to the hub** (single origin — kills the current CORS/mixed-URL mess).
The hub proxies the camera stream from the agent. Agent and hub authenticate with a shared
bearer token (`AGENT_API_TOKEN` in both `.env`s).

### What moves off the Pi
| Concern | Today (Pi) | Target |
|---|---|---|
| Flask API + SQLite | backend.py on Pi | hub-api + Postgres on server |
| Motion planning (`motion/`) | Pi | hub (pure Python, no hardware deps — moves as-is) |
| Routine orchestration | cron → routine.py on Pi | `RoutineRunner` service on hub |
| Scheduling | cron/systemd timer | APScheduler inside hub-api (schedules read from DB) |
| Picture storage + zip download | Pi SD card | hub volume (agent uploads after capture) |
| Runtime estimate `/api/motion/estimate` | Pi | hub |
| Serial + camera + GPIO | Pi | **stays on Pi** (physics) |

Pi Zero 2 ends up running: uvicorn + pyserial + picamera2 + gpiozero. Nothing else.

---

## 2. REPO LAYOUT (mainstream monorepo)

```
/hub/
  app/main.py            FastAPI app factory, routers, lifespan
  app/routers/           routines.py, schedules.py, images.py, camera.py,
                         motion.py, agent_events.py, health.py
  app/services/          routine_runner.py, agent_client.py, image_index.py,
                         scheduler.py (APScheduler wiring)
  app/motion/            kinematics.py, dynamics.py, trajectory.py (moved from Pi)
  app/db/                models.py (SQLModel), session.py
  alembic/               migrations (replaces hand-rolled init_db DDL)
  tests/                 pytest: planner, runner state machine, image search
  Dockerfile
/agent/
  main.py                FastAPI app: hardware routes only
  hardware/serial_link.py   (moved from backend.py SerialLink, + asyncio lock)
  hardware/camera.py        CameraManager (persistent Picamera2, dual-stream)
  hardware/light.py         (from b_light.py, seconds-only API)
  agent.service          systemd unit
/dashboard/              existing Next.js app (moved from repo root), Dockerfile
docker-compose.yml       dashboard + hub-api + postgres
.env.example             per-service sections
```

Deleted by this move: `src/app/RaspiBackend/` (entire), `pi_agent/` timers,
`scripts/deploy_pi.sh` (replaced by an `agent/deploy.sh` rsync of `/agent` only),
`src/pythonBackend/`, `src/app/serial.js`, `src/app/arduino.C`.
SQLite → Postgres: one-time migration script `hub/scripts/import_sqlite.py`.

---

## 3. AGENT API (Pi — thin, dumb, stable)

All routes require the bearer token. Return shapes are pydantic models.

| Route | Behavior |
|---|---|
| `GET /healthz` | `{serial: bool, camera: bool, uptime}` |
| `POST /serial/connect` / `/serial/disconnect` | manage port |
| `POST /serial/command` | `{command, expect_done}` → forwards to Arduino, parses `OK:/ERR:` (reuse SerialLink logic). asyncio.Lock serializes access |
| `POST /serial/abort` | send `!`, flush queue |
| `GET /serial/position` | send `?` → `{x, y, z, queue, enabled}` |
| `POST /light/pulse` | `{seconds: float}` — guard `0 < s <= 60` |
| `GET /camera/stream.mjpeg` | MJPEG from **lores** stream (see §5), multi-client via shared frame buffer |
| `POST /camera/capture` | `{exposure_us, upload_to, routine, well_id}` → full-res still from **main** stream WITHOUT stopping preview; POSTs the JPEG to hub `upload_to` URL with metadata; returns `{ok, bytes}` |
| `GET/POST /camera/controls` | get: current values + valid ranges from `camera_controls`; post: `{exposure_us?, analogue_gain?, ae_enable?, awb_enable?}` applied live to preview |
| `WS /events` (agent→hub optional) | not needed v1 — hub polls/commands synchronously; keep the door open |

**CameraManager (agent/hardware/camera.py)** — the key fix for "view the picture live":
- One persistent `Picamera2` instance created at startup (fixes today's subprocess-per-capture
  and the `_stream_active` single-client stream that fights stills for the sensor).
- `create_video_configuration(main={size: full_res}, lores={size: (1280,720)})` — picamera2
  supports simultaneous streams: lores feeds the MJPEG preview, `capture_file(..., name="main")`
  grabs full-res stills mid-stream. Preview never stops during capture.
- `set_controls()` applies exposure/gain changes to the live preview immediately — user sees
  the effect before capturing.
- Frame pump: background task encodes lores → JPEG at capped ~8–10 fps (Zero 2 CPU budget);
  all MJPEG clients read the latest frame from one shared buffer (no per-client encode).

---

## 4. HUB API (server — all the logic)

### Routers (same surface the dashboard uses today, plus new)
- `routines.py`: CRUD + activate/deactivate (port existing backend.py handlers to SQLModel).
- `schedules.py`: CRUD; writes trigger `scheduler.py` to (re)register APScheduler jobs.
  APScheduler replaces cronjob.py entirely — jobs call `RoutineRunner.start(name)` in-process.
- `motion.py`: `POST /api/motion/estimate` (unchanged contract for Designer V2).
- `camera.py`: `GET /api/camera/stream` — async proxy of agent MJPEG (httpx streaming);
  `POST /api/camera/capture`, `GET/POST /api/camera/controls` — forward to agent;
  manual captures are ingested like routine images (routine="manual").
- `images.py`: see §6.
- `agent_events.py`: `POST /api/internal/image-upload` (agent pushes captures here — writes
  file to volume, thumbnail, DB row); token-guarded.
- `health.py`: hub health + last-seen agent status.
- `WS /api/ws/status`: pushes `{connection, routine_progress, current_well}` to the dashboard —
  replaces the 30 s polling in page.js and the 2 s progress polling from plan v2.

### services/routine_runner.py (moved from plan-v2 §3, now on hub)
Same state machine as plan v2, different transport:
- `start(filename)` → plan via `motion.trajectory.plan_routine()` → for each step:
  `agent_client.serial_command(f"M {dx} {dy} {dz}", expect_done=True)` → light pulse
  (`agent_client.light_pulse(ms/1000)` — ms→s conversion lives here, closes B3) →
  `agent_client.capture(exposure_us, routine, well_id)` → update progress → broadcast on WS.
- `abort()` → `agent_client.abort()`; runner checks abort flag between wells.
- Network-failure policy: any agent call that errors → abort routine, mark
  `{error, last_well}`, motors disabled via best-effort `D`.

### services/agent_client.py
Thin async httpx wrapper: `serial_command`, `abort`, `position`, `light_pulse`, `capture`,
`camera_controls`, `health`. One place for the token, base URL, timeouts, and retries
(retry only idempotent GETs; never retry moves).

---

## 5. CAMERA UX (dashboard)

Replace `CameraStream.js` with `CameraPanel.js`:
- **Live view**: `<img src="/api/camera/stream">` via hub proxy; Start/Stop toggle stays.
- **Manual controls sidebar**: exposure (µs, log-scale slider + NumberField), analogue gain,
  AE/AWB toggles — `POST /api/camera/controls` on change (debounced 150 ms); the live view
  visibly responds, which is the point.
- **Capture button**: `POST /api/camera/capture` — preview does not freeze; on success a
  toast + thumbnail of the just-captured full-res image appears beside the stream
  (fetched from the hub image index, so it's the real saved file).
- **State**: show current controls fetched from `GET /api/camera/controls` on mount, not
  local guesses.

---

## 6. IMAGE BROWSER + SEARCH ("better folder searching")

Storage moves to the hub, so indexing becomes cheap and search becomes a DB query
instead of SD-card directory walks.

### DB: `images` table
`id, routine, well_id, plate, captured_at, exposure_us, gain, path, thumb_path, size_bytes`
— written on every ingest (`agent_events.image-upload`). Thumbnails (Pillow, 256 px) at ingest.

### API (images.py)
| Route | Behavior |
|---|---|
| `GET /api/images` | params `q` (matches routine/well/filename, case-insensitive), `routine`, `well`, `date_from`, `date_to`, `sort` (date/name/size ±), `page`, `page_size` → paginated results with thumb URLs |
| `GET /api/images/{id}/file` and `/thumb` | serve full-res / thumbnail |
| `GET /api/images/facets` | distinct routines + date range, powers filter dropdowns |
| `GET /api/images/export` | same filter params → streamed zip (replaces `/pictures/download`; now runs on server CPU, not the Pi) |
| `GET /api/files` | legacy fallback: recursive filesystem listing with `q` filter over the images volume, for anything pre-dating the index |

### Dashboard: `PictureBrowser.js` rework
- Search box (debounced) + filter row (routine dropdown, date range, well) driven by facets.
- Thumbnail grid (not a file list) with lazy loading; click → lightbox with full-res,
  metadata (well, exposure, time), prev/next arrows, download.
- Keep breadcrumb view as a secondary "Folders" tab backed by `/api/files` for legacy data.
- "Download results as zip" button wired to `/api/images/export` with the active filters.

One-time backfill: `hub/scripts/index_existing.py` walks pictures rsync'd off the Pi,
parses `routine/well` from the existing path convention, inserts rows + thumbnails.

---

## 7. DEPLOYMENT

- `docker-compose.yml`: `dashboard` (Next standalone build), `hub-api` (uvicorn), `postgres`
  (volume-backed), shared network; `restart: unless-stopped`. Optional later: Caddy for TLS.
- Agent: `agent/agent.service` systemd unit (uvicorn, `Restart=always`), deployed by rsync
  script. **No Docker on the Zero 2** — 512 MB RAM is better spent on picamera2.
- Config: `NEXT_PUBLIC_HUB_URL` (dashboard), `AGENT_URL` + `AGENT_API_TOKEN` + `DATABASE_URL`
  (hub), `AGENT_API_TOKEN` + `SERIAL_PORT` (agent).
- Logging: structlog JSON on both services; hub logs to stdout (docker logs); `/api/logs`
  route reads the hub's ring buffer (keeps the dashboard Logs tab working).
- CI hook (later): pytest for `hub/tests` — planner and search are pure functions now,
  fully testable without hardware.

---

## 8. MIGRATION ORDER (each step leaves the system runnable)

1. **Repo reshape**: create `/hub`, `/agent`, `/dashboard`; move Next.js app; compose file
   with dashboard + postgres only. Old Pi backend still serves until step 5.
2. **Agent v1** on the Pi: serial + light routes only (port `SerialLink`). Verify with curl.
3. **Hub v1**: routines/schedules/motion routers + Alembic schema + SQLite import script.
   Dashboard env flipped to hub URL for those tabs.
4. **RoutineRunner on hub** + APScheduler; run a full routine end-to-end
   (hub plans → agent moves → light → capture-to-hub). Delete cronjob path.
5. **CameraManager on agent** + hub camera proxy + `CameraPanel.js`. Delete old
   stream/take-picture routes.
6. **Image index + browser rework** + backfill script. Delete `/pictures*` routes.
7. **Deletions** (plan-v2 §6 list + `src/app/RaspiBackend/`, `pi_agent/` timers) and
   README/context.md rewrite for the new topology.

Plan-v2 items unaffected and still queued: Designer V2 mount, styled-jsx → tokens migration,
shared UI components, firmware v2 promotion (unchanged — agent speaks the same v2 protocol).

## 9. ACCEPTANCE TESTS

- Pi idle load: with a routine running, Pi CPU is only stepping/serial/camera — no DB or
  planner processes (`htop` during run).
- Live view + capture: stream stays live while a full-res capture completes; captured file
  appears in the browser grid within ~2 s, correct exposure metadata.
- Controls: moving the exposure slider visibly changes the live preview within ~300 ms.
- Search: `q=B7` returns only well-B7 images across routines; date filter + zip export match.
- Resilience: kill the agent mid-routine → hub marks routine error within one timeout,
  dashboard toast; restart agent → status WS shows reconnected without page reload.
- Scheduler: schedule row change in UI reflects in APScheduler next-run within 5 s (no cron).
- Single origin: browser network tab shows only hub-origin requests (no direct Pi calls).

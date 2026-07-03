# Project Context

This repository controls a microscope motion and imaging setup over a local LAN.

## System

- Web dashboard: Next.js App Router in `src/app` and reusable UI in `src/components`.
- Raspberry Pi Zero agent: Flask API and automation scripts in `src/app/RaspiBackend`.
- Firmware: Arduino-compatible stepper controller sketch in `firmware/stepper_controller`.
- Data store: SQLite database on the Raspberry Pi, configurable with `STEPPER_DATABASE_FILE`.
- Hardware: Raspberry Pi Zero, Arduino/ESP8266 wall-plate serial bridge, stepper drivers, Pi camera, and GPIO-controlled blue light.

## Runtime Flow

1. The Next.js dashboard runs on a LAN host and reads `NEXT_PUBLIC_PI_BACKEND_URL`.
2. The dashboard sends routine, manual motor, camera, and blue-light commands to the Pi Flask API.
3. The Pi API stores routines in SQLite and sends serial commands to the Arduino firmware.
4. The firmware converts compact serial commands into X, Y/Z, enable, disable, and test actions.
5. The scheduler invokes `routine.py` from cron or the provided systemd timer to run active routines.

---

# MASTER PLAN (2026-07-03) — scaffolded, to be completed

Everything below is the implementation plan. Function scaffolds with `TODO(complete)` comments
were created in the files listed in each section. Nothing existing was modified; all new code
is in new files so the current app keeps working while you fill in the stubs.

New scaffold files:

- `src/app/RaspiBackend/backend.py` — the MISSING Pi Flask API (see Bug B1)
- `src/app/RaspiBackend/motion/kinematics.py` — steps↔mm↔well-coordinate mapping
- `src/app/RaspiBackend/motion/dynamics.py` — accel limits, load model, speed profiles
- `src/app/RaspiBackend/motion/trajectory.py` — trapezoidal/S-curve planner + path ordering
- `firmware/stepper_controller_v2/stepper_controller_v2.ino` — non-blocking firmware with accel + abort
- `src/components/ui/tokens.js` — design tokens (single source of truth for colors/spacing/type)
- `src/components/ui/ProgressBar.js` — loading/progress bar component
- `src/components/ui/StatusToast.js` — non-blocking feedback toasts
- `src/components/RoutineDesignerV2.js` — compact, professional routine designer shell

---

## 1. DEBUG REPORT (audit of the older code)

### Critical

- **B1 — The Pi Flask backend is missing from the repo.** The frontend calls
  `/save_routine_sql`, `/routines/all`, `/routines/schedule-update`, `/routines/rename`,
  `/routines/delete`, `/routines/move-to-active-sql`, `/routines/move-to-inactive-sql`,
  `/api/logs`, `/api/camera/take-picture`, `/api/camera/stream`, `/api/bluelight/manual`,
  `/api/connect|disconnect|status|steps|motor/*` — but no file in `src/app/RaspiBackend`
  implements them. `src/pythonBackend/stepperbotBackend.py` only covers the motor endpoints.
  → Scaffolded the full route surface in `src/app/RaspiBackend/backend.py`.

- **B2 — `src/components/plateSchema` has no `.js` extension.** `RoutineBuilder.js` imports
  `./plateSchema`; an extensionless file resolves inconsistently under webpack/Next and can
  break builds. Fix: `git mv src/components/plateSchema src/components/plateSchema.js`.
  Also: schema is missing a `switchPlate` default (wells start with `switchPlate: undefined`),
  and defaults are strings (`"1"`) so every well starts "active" (`stepAmount != 0`).

- **B3 — Blue-light unit mismatch (ms vs s).** `routine.py` comments say `lightTime` is ms
  from the DB, but `trigger_blue_light(duration_sec)` passes the value straight to
  `b_light.py automate <seconds>`. A 500 ms lightTime lights the well for 500 s.
  Decide one unit (recommend ms end-to-end; convert to seconds only inside `b_light.py`).

- **B4 — `routine.py` "Y" moves are really Z+Y.** `move_y()` sends `A`/`a`, which the firmware
  maps to Z_AXIS + Y_AXIS together. Focus (Z) changes on every row move. Firmware has no
  Y-only or Z-only command. → v2 firmware adds per-axis moves (`M <x> <y> <z>`).

- **B5 — `routine.py` send_command never verifies responses.** `send_command` returns
  `(True, response)` even when the Arduino answers `ERR:*` or the read times out
  (empty string). Position tracking (`x_position_steps`) then silently drifts.
  Fix: parse `OK:`/`ERR:` prefixes; propagate failure; re-sync or abort on error.

### High

- **B6 — Firmware moves are fully blocking.** `moveAxis`/`moveTwoAxes` busy-loop with
  `delayMicroseconds`; serial input is ignored mid-move, so a move cannot be stopped and
  long moves freeze the whole chain (this is the "stopping outside the necessary parts"
  lag). No acceleration ramp either — fixed ~830 Hz step rate, so speed is capped by the
  worst-case stall speed. → replaced by non-blocking tick scheduler in v2 scaffold.

- **B7 — `stepperbotBackend.py` race + blind writes.** `send_command` sleeps 100 ms between
  `S<steps>` and the move command with no response read; commands can interleave with the
  Arduino's replies. `/api/status` never reports the port; `debug=True` in production;
  no auto-reconnect when the USB cable drops.

- **B8 — RoutineBuilder runtime estimate is meaningless units.** `totalRuntime` adds
  stepAmount (steps) + delay (ms) + lightTime (ms) + exposure (µs) and formats as seconds.
  Fix in V2 designer: runtime = Σ travel_time(kinematics) + lightTime + exposure + overhead.

- **B9 — Global Ctrl+C/Ctrl+V hijack.** `MergedPlateTable` attaches `keydown` on `document`
  and `preventDefault()`s every copy/paste, breaking copy in text inputs anywhere on the
  page while the tab is mounted. Fix: ignore events when `event.target` is an input/textarea,
  and scope the listener to the table wrapper (it already has `tabIndex={0}`).

- **B10 — Quadrant math hard-codes 96-well dimensions.** `quadrantMap` (RoutineBuilder) and
  `getQuadrantFromCoords` (MergedPlateTable) assume 8×12 offsets even when a quadrant is
  48-well (6×8), so selection/copy/paste across 48-well plates targets wrong wells.
  Selected-well label `String.fromCharCode(65 + (rowIndex % 8))` is wrong for 48-well too.

### Medium / Low

- **B11 — `src/app/serial.js` is dead code**: Node `serialport` required from a client-side
  Next.js app; can never run in the browser. Delete or move to a Node-only utility.
- **B12 — `stepperbotUI.py`**: crashes at import when the port is absent (no try/except);
  "Update Steps" only shows a messagebox and never sends `S<steps>` to the Arduino;
  `arduino.close()` after `mainloop()` is unreachable on window close.
- **B13 — `fetch_routine_data()` in routine.py is a hard-coded stub** (always 12×8).
- **B14 — cronjob.py weekday scheme (1=Mon..7=Sun) must match what the frontend writes**
  via `/routines/schedule-update`; frontend sends `repeatInterval` (once/daily/hourly) which
  nothing maps into `routine_schedule.start_time/schedule_day` rows yet (backend missing, B1).
- **B15 — `handleWellTest` labels say "A1 to A2 (X Forward)" but calls `x-forward` after
  labeling the first step `A1 to A2` while the ZY steps mislabel B1/A2 transitions.** Minor,
  but confusing during hardware bring-up.
- **B16 — Repeat-count and numeric params stored as strings** (`repeatCount`, well params via
  `e.target.value`). Coerce with `Number()` at the state boundary in V2.
- **B17 — routine.py `enable_motors()` reads a response but `disable_motors()` doesn't wait**,
  so the final disable can race with the last move's completion message.

### Fix order (when completing the code)

1. B1 backend.py (unblocks everything), 2. B2 rename + schema defaults, 3. B3 units,
4. B5 response parsing, 5. B6 firmware v2, 6. B4 per-axis moves, 7. UI bugs B8–B10, B16.

---

## 2. FRONTEND / DESIGN SYSTEM PLAN

### Design-system audit summary

- All styling today is per-component `<style jsx global>` blocks with ~40 hard-coded hex
  values repeated across 6 components (`#0ea5e9`, `#1e293b`, `#334155`, `#0f172a`, ...).
  Global leakage: identical class names (`.container`, `.card`) styled globally from
  different components — a change in one tab restyles another. Tailwind is configured but
  unused.
- Token coverage: colors 0 defined / ~40 hard-coded; spacing ad-hoc rem values; typography
  two fonts referenced by string in 9 places.
- Perf: giant styled-jsx global blocks re-injected on tab mount, 384 well cells re-render on
  every drag event because range state lives in the parent and every cell recomputes classes.

### Plan (scaffolded in `src/components/ui/`)

- `tokens.js`: export `colors`, `spacing`, `font`, `radii`, `shadows`, `motion`. Wire into
  `tailwind.config.js` (`theme.extend`) so components use Tailwind classes instead of
  styled-jsx. Kill all `<style jsx global>` blocks during migration.
- Components to build from tokens: `Button` (primary/ghost/danger, loading state),
  `Input/NumberField` (with unit suffix), `Panel`, `Tabs`, `ProgressBar`, `StatusToast`,
  `ConnectionBadge`.
- Perf fixes: memoize well cells (`React.memo` + cell-level props), move drag range into a
  ref + rAF-throttled state commit, `useMemo` for row arrays, and virtualize nothing —
  384 cells is fine once memoized.
- Loading UX: every network action gets (a) inline `ProgressBar` (determinate for routine
  save/upload using request phases, indeterminate for connect), (b) `StatusToast` instead of
  the bottom message `<div>`s, (c) disabled+spinner buttons standardized via `Button`.
- Routine progress: backend.py scaffold includes `/api/routine/progress` (wells_done /
  wells_total, current well). `ProgressBar` polls it while a routine runs.

### Routine Designer V2 (`RoutineDesignerV2.js`)

Problems today: 260 px sidebar + 4 always-rendered quadrants eat the viewport; parameters
are edited blind (panel shows only the first selected well); cells show raw numbers with no
legend; unprofessional look.

New layout (all in the scaffold's comments):

- Top toolbar: routine name, save/import, schedule popover, estimated runtime (correct units).
- Left: plate canvas only — quadrants render only when active, auto-fit zoom, heatmap
  coloring per selected parameter, row/column header click = select row/col, marquee select.
- Right: collapsible 300 px inspector that shows the ACTUAL selection (n wells), per-param
  inputs with unit suffixes, mixed-value indicator ("—" when values differ), stepper
  arrows + drag-to-scrub, and live preview: edited wells highlight on the plate as you type.
- Bottom status bar: selection summary, validation warnings, save state.
- Everything keyboard accessible; values always visible while editing (inspector + heatmap).

---

## 3. KINEMATICS + ROBOT DYNAMICS PLAN (Python ↔ Arduino)

Goal: move continuously through the well path at the highest safe speed, only stopping where
physics (capture/light) requires it — instead of fixed-rate blocking moves per well.

### Layering

1. `motion/kinematics.py` — geometry only. steps/mm calibration per axis, well pitch
   (9 mm for 96-well, 13 mm for 48-well), `well_to_steps()`, `steps_to_well()`,
   forward/inverse kinematics for the XY(Z) stage, soft limits.
2. `motion/dynamics.py` — physics. max velocity/accel per axis from motor torque curve +
   stage mass, `time_for_move()` used by both the planner and the UI runtime estimate,
   optional load-dependent derating.
3. `motion/trajectory.py` — planning. Trapezoidal (upgrade: S-curve) profile generation,
   boustrophedon (serpentine) well ordering, move batching/lookahead so the Arduino never
   idles between wells, stop only at capture points.
4. `firmware v2` — execution. Non-blocking tick stepper (Bresenham multi-axis), accel ramps
   computed from `V <vmax> <accel>` command, `M <dx> <dy> <dz>` relative moves, `!` instant
   abort, `?` position report, `OK:done <x> <y> <z>` completion messages, command queue
   (depth 4) so the Pi can stream ahead.

### Protocol v2 (documented in the .ino scaffold)

- `M dx dy dz` queue relative move (steps) • `V vmax acc` set profile • `H` home •
  `!` abort+flush • `?` report `POS x y z; Q n; EN b` • legacy `X/x/A/a/S/E/D/T` kept for
  backward compatibility.

### Completion references

- Trapezoidal profiles: implement `plan_trapezoid(distance, vmax, acc)` in trajectory.py;
  same math in firmware `computeRamp()`. Cross-check with AccelStepper (avr) source.
- Multi-axis sync: dominant-axis Bresenham as in Grbl's `st_prep_buffer` (grbl/stepper.c).
- Calibration routine: `kinematics.calibrate()` steps a known count, user measures travel;
  store `steps_per_mm` in SQLite `config` table (backend.py scaffold has the route).

---

## 4. CONFIGURATION (unchanged)

- `NEXT_PUBLIC_PI_BACKEND_URL`: browser-visible Pi API URL, currently `http://192.168.1.43:5000`.
- `STEPPER_SERIAL_PORT`: Arduino serial device on the Pi (`/dev/ttyUSB0` or `/dev/ttyACM0`).
- `STEPPER_PI_HOME`: root folder for routines, pictures, database, and logs.
- `STEPPER_BLUE_LIGHT_PIN`: BCM GPIO pin for the blue light.

## 5. HOW TO FINISH (checklist)

1. Fill in `backend.py` route bodies (each has a TODO with the exact request/response shape
   the existing frontend already sends/expects).
2. Rename `plateSchema` → `plateSchema.js`; add `switchPlate: {default:false}`; make defaults
   numeric with `stepAmount: 0`.
3. Implement kinematics/dynamics/trajectory stubs; unit-test `time_for_move` and
   `plan_trapezoid` on the Pi with `pytest` (no hardware needed).
4. Flash `stepper_controller_v2.ino` after implementing `tickSteppers()`/`computeRamp()`;
   verify with `?` and `!` over a serial monitor before wiring the Pi to it.
5. Port `routine.py` to use `trajectory.plan_routine()` + streaming `M` commands.
6. Migrate components onto `ui/tokens.js` + Tailwind; replace RoutineBuilder with
   RoutineDesignerV2 once feature-parity (import JSON, copy/paste, schedule) is done.
7. Regression pass: B3 unit test (lightTime=500 → 0.5 s pulse), B9 (copy text in the
   filename input while plate tab open), B10 (48-well quadrant selection).

# Microscope Stepper Control

Local LAN control system for a microscope stepper stage, Raspberry Pi Zero backend, Arduino-compatible stepper firmware, Pi camera, and GPIO blue light.

## Layout

- `src/app` and `src/components`: Next.js dashboard.
- `src/app/RaspiBackend`: Raspberry Pi Flask agent, scheduler, camera, blue-light, and routine runner.
- `firmware/stepper_controller`: Arduino upload target.
- `pi_agent`: Pi requirements and systemd service templates.
- `scripts/deploy_pi.sh`: LAN deployment helper for copying the Pi backend.
- `context.md` and `rules.md`: project operating context and maintenance rules.

## Web Dashboard

Create `.env.local` from `.env.example` and set the Pi URL:

```bash
NEXT_PUBLIC_PI_BACKEND_URL=http://192.168.1.43:5000
```

Run locally:

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

## Raspberry Pi Agent

Install dependencies on the Pi:

```bash
sudo apt install -y python3-picamera2 python3-rpi.gpio
python3 -m venv --system-site-packages ~/stepper-agent-venv --clear
~/stepper-agent-venv/bin/pip install -r pi_agent/requirements.txt
```

`picamera2` is installed by Raspberry Pi OS through apt. The agent venv must use
`--system-site-packages` so the Flask process can import it; OpenCV is not needed
for the MJPEG stream.

Deploy over LAN:

```bash
PI_HOST=192.168.1.43 PI_USER=dank scripts/deploy_pi.sh
```

Run manually on the Pi:

```bash
cd /home/dank/backend
python3 backend
```

## Routine Storage

`POST /save_routine_sql` is a legacy route name. It saves routines as rows in the
SQLite database at `$STEPPER_DATABASE_FILE`, which defaults to
`$STEPPER_PI_HOME/routine_data.db` (`/home/dank/routine_data.db` on the Pi), not
as individual `.sql` files. The backend automatically upgrades older databases
when it starts, including the schedule columns required by the current routine designer.

To inspect the Pi database after a save:

```bash
sqlite3 /home/dank/routine_data.db 'SELECT filename FROM routines ORDER BY filename;'
```

## Firmware

Open `firmware/stepper_controller_v2/stepper_controller_v2.ino` in the Arduino IDE or CLI and upload it to the controller board. The V2 protocol is required for streamed routine moves and mid-move Abort; the legacy V1 sketch remains in the tree for manual-control compatibility during migration.

The serial protocol is documented in `firmware/README.md`.

## Repository Split

The current structure is split-ready while preserving the existing working tree. See `docs/repository-split.md` for suggested separate GitHub repositories and push commands.

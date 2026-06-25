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
python3 -m venv ~/stepper-agent-venv
~/stepper-agent-venv/bin/pip install -r pi_agent/requirements.txt
```

Deploy over LAN:

```bash
PI_HOST=192.168.1.43 PI_USER=dank scripts/deploy_pi.sh
```

Run manually on the Pi:

```bash
cd /home/dank/backend
python3 backend
```

## Firmware

Open `firmware/stepper_controller/stepper_controller.ino` in the Arduino IDE or CLI and upload it to the controller board.

The serial protocol is documented in `firmware/README.md`.

## Repository Split

The current structure is split-ready while preserving the existing working tree. See `docs/repository-split.md` for suggested separate GitHub repositories and push commands.

# Raspberry Pi Agent

The Pi agent is the Python backend in `src/app/RaspiBackend`. This folder contains the install-facing files that make that backend easier to deploy onto a Raspberry Pi Zero.

## Install

```bash
python3 -m venv ~/stepper-agent-venv
~/stepper-agent-venv/bin/pip install -r pi_agent/requirements.txt
```

Copy `.env.example` to a Pi-local environment file and set:

```bash
STEPPER_PI_HOME=/home/dank
STEPPER_SERIAL_PORT=/dev/ttyUSB0
STEPPER_BLUE_LIGHT_PIN=21
```

## Run Manually

```bash
cd ~/backend
python3 backend
```

The Flask API listens on port `5000` by default.

## systemd

Use the files in `pi_agent/systemd` as templates:

- `stepper-agent.service` runs the Flask API.
- `stepper-scheduler.service` runs one scheduler check.
- `stepper-scheduler.timer` runs the scheduler every minute.

Edit paths and usernames before installing them under `/etc/systemd/system`.

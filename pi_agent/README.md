# Raspberry Pi Agent

The Pi agent is the Python backend in `src/app/RaspiBackend`. This folder contains the install-facing files that make that backend easier to deploy onto a Raspberry Pi Zero.

## Install

```bash
sudo apt install -y python3-picamera2 python3-rpi.gpio
python3 -m venv --system-site-packages ~/stepper-agent-venv --clear
~/stepper-agent-venv/bin/pip install -r pi_agent/requirements.txt
```

Copy `.env.example` to a Pi-local environment file and set:

```bash
STEPPER_PI_HOME=/home/dank
# Optional: leave unset to auto-detect /dev/ttyUSB* and /dev/ttyACM*.
# A stable /dev/serial/by-id/... path is preferred when available.
STEPPER_SERIAL_PORT=/dev/serial/by-id/<your-controller>
STEPPER_BLUE_LIGHT_PIN=21
```

`picamera2` comes from Raspberry Pi OS apt packages, so `--system-site-packages`
is required for the agent venv. The MJPEG stream uses picamera2 directly; do not
install OpenCV for it.

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

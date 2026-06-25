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

## Canonical Layout

- `src/app`: Next.js pages, metadata, and global styles.
- `src/components`: dashboard components for routine building, manual control, camera stream, pictures, and Pi routine management.
- `src/app/RaspiBackend`: canonical Pi backend scripts kept in their original location so existing imports continue to work.
- `firmware`: clean Arduino upload target.
- `pi_agent`: Pi installation notes, Python requirements, and systemd unit templates.
- `scripts/deploy_pi.sh`: LAN deploy helper for copying the Pi backend to a Raspberry Pi.

## Configuration

Use `.env.local` for the web app and shell environment variables for the Pi service. Start from `.env.example`.

The most important values are:

- `NEXT_PUBLIC_PI_BACKEND_URL`: browser-visible Pi API URL, currently `http://192.168.1.43:5000`.
- `STEPPER_SERIAL_PORT`: Arduino serial device on the Pi, usually `/dev/ttyUSB0` or `/dev/ttyACM0`.
- `STEPPER_PI_HOME`: root folder for routines, pictures, database, and logs.
- `STEPPER_BLUE_LIGHT_PIN`: BCM GPIO pin for the blue light.

## Current Cleanup Notes

- The UI no longer hard-codes two different Raspberry Pi IP addresses.
- The Pi backend now uses centralized environment-driven config.
- Manual picture capture uses the requested exposure and the correct `camera.py --mode manual` CLI.
- Manual blue-light control has a matching `/api/bluelight/manual` backend route.
- Serial connect failures now return failure instead of being treated as success.
- Routine execution uses more efficient row scanning and avoids homing X after every row.

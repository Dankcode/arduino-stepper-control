#!/usr/bin/env bash
set -euo pipefail

PI_HOST="${PI_HOST:-raspberrypi.local}"
PI_USER="${PI_USER:-dank}"
PI_BACKEND_DIR="${PI_BACKEND_DIR:-/home/dank/backend}"

echo "Deploying Raspberry Pi backend to ${PI_USER}@${PI_HOST}:${PI_BACKEND_DIR}"
ssh "${PI_USER}@${PI_HOST}" "mkdir -p '${PI_BACKEND_DIR}'"
rsync -av --delete \
  --exclude '__pycache__' \
  --exclude '*.pyc' \
  src/app/RaspiBackend/ \
  "${PI_USER}@${PI_HOST}:${PI_BACKEND_DIR}/"

echo "Deploy complete. Restart the service with:"
echo "  ssh ${PI_USER}@${PI_HOST} 'sudo systemctl restart stepper-agent.service'"

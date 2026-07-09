#!/usr/bin/env bash
# Run the Flask backend on THIS computer (no Raspberry Pi needed).
#
# Routines, the SQLite database, logs, and pictures are stored under
# ~/stepper-data so nothing touches the Pi's paths. Serial/camera/GPIO
# features will report as unavailable, but routine saving, editing,
# import/export, and scheduling data all work.
#
# Usage:
#   scripts/run_backend_local.sh
#
# Then point the dashboard at it by setting in .env.local:
#   NEXT_PUBLIC_PI_BACKEND_URL=http://localhost:5000
# and restart `npm run dev`.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${STEPPER_PI_HOME:-$HOME/stepper-data}"
mkdir -p "$DATA_DIR"

echo "Backend code : $REPO_DIR/src/app/RaspiBackend/backend.py"
echo "Data folder  : $DATA_DIR (database: routine_data.db)"
echo "URL          : http://localhost:${STEPPER_BACKEND_PORT:-5000}"
echo

if ! python3 -c "import flask, flask_cors" 2>/dev/null; then
  echo "Installing Flask dependencies..."
  python3 -m pip install flask flask-cors pyserial
fi

cd "$REPO_DIR/src/app/RaspiBackend"
STEPPER_PI_HOME="$DATA_DIR" \
STEPPER_BACKEND_HOST="${STEPPER_BACKEND_HOST:-127.0.0.1}" \
STEPPER_BACKEND_PORT="${STEPPER_BACKEND_PORT:-5000}" \
python3 backend.py

# Project Rules

## Languages

- Use Python for Raspberry Pi backend logic.
- Use Arduino C/C++ for firmware.
- Use JavaScript with React functional components for the Next.js dashboard.

## Repository Boundaries

- Keep browser UI code under `src/app` and `src/components`.
- Keep Pi runtime code under `src/app/RaspiBackend` until a separate Pi repository is created.
- Keep Arduino uploadable firmware under `firmware`.
- Keep deployment helpers under `scripts`.
- Do not delete legacy files or functions without an explicit decision; preserve compatibility while introducing cleaner targets.

## Configuration

- Do not hard-code LAN IP addresses, Pi usernames, serial ports, database paths, or GPIO pins in UI components.
- Use `NEXT_PUBLIC_PI_BACKEND_URL` for the dashboard API target.
- Use `STEPPER_*` environment variables for Raspberry Pi settings.
- Keep secrets out of the repository.

## Backend

- Wrap API calls and subprocess calls with clear error responses.
- Serialize motor commands with the shared controller lock.
- Validate user-provided paths with `os.path.commonpath` before reading or downloading files.
- Prefer `sys.executable` and configured script paths for Python subprocesses.
- Keep SQLite schema simple: `routines`, `well_data`, and `routine_schedule`.

## Frontend

- Prefer functional components and hooks.
- Keep API calls in `try`/`catch` blocks and show user-readable messages.
- Avoid external runtime/build dependencies for fonts or assets on the LAN dashboard.
- Keep controls compact and operational rather than marketing-oriented.
- Use camelCase for variables and PascalCase for components.

## Firmware

- Keep serial commands compact and line-terminated.
- Respond with `OK:` or `ERR:` messages so the Pi can detect failures.
- Keep pin assignments and timing constants at the top of the sketch.
- Disable motors on explicit `D`; do not silently move while disabled.

## Deployment

- Build the web app with `npm run build` before deploying.
- Compile-check Pi scripts before uploading when possible.
- Use `scripts/deploy_pi.sh` to copy backend code to the Pi over LAN.
- Install systemd units from `pi_agent/systemd` only after confirming paths and user names.

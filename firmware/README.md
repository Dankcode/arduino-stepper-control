# Firmware

Upload `firmware/stepper_controller_v2/stepper_controller_v2.ino` to the Arduino-compatible controller connected to the Raspberry Pi over USB or the ESP8266 wall-plate serial bridge. This is the protocol used by the routine runner and supports position reports, queued relative moves, and Abort.

`firmware/stepper_controller/stepper_controller.ino` remains available as the legacy V1 sketch for manual-control compatibility only. Its blocking moves cannot be aborted mid-motion.

## Serial Protocol

- `M <dx> <dy> <dz>` queues a relative move in steps.
- `V <max_velocity> <acceleration>` sets the motion profile.
- `H` homes the stage.
- `!` aborts the active move and clears the queue.
- `?` returns position, queue depth, and motor state.
- `E` enables and `D` disables the stepper drivers.

V2 also accepts the legacy `S`, `X`, `x`, `A`, `a`, and `T` commands while the dashboard migration is in progress.

Every command should end with `\n`.

# Firmware

Upload `firmware/stepper_controller/stepper_controller.ino` to the Arduino-compatible controller connected to the Raspberry Pi over USB or the ESP8266 wall-plate serial bridge.

## Serial Protocol

- `S400` sets the current move size to 400 steps.
- `X` moves X forward by the current step size.
- `x` moves X backward by the current step size.
- `A` moves the paired Z/Y axis forward by the current step size.
- `a` moves the paired Z/Y axis backward by the current step size.
- `E` enables the stepper drivers.
- `D` disables the stepper drivers.
- `T` returns a test response.
- `?` returns firmware status.

Every command should end with `\n`.

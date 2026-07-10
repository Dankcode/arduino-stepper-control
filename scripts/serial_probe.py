#!/usr/bin/env python3
"""Direct Arduino serial probe - run this ON the Raspberry Pi.

Bypasses Flask entirely and talks straight to the serial port so we can see
exactly what the board sends, byte for byte, at each baud rate.

Usage (on the Pi):
    python3 serial_probe.py                # probes /dev/ttyUSB0
    python3 serial_probe.py /dev/ttyACM0   # or another port

Interpreting results:
- "OK:steps=..." or "OK:microscope_stepper_ready" at 9600  -> firmware v1, use 9600
- "POS ..." or "OK:..." at 115200                          -> firmware v2, use 115200
- Nothing but 00/FF bytes at every baud -> wrong sketch flashed, dead board,
  or a wiring/level problem - no backend change can fix that.
"""
import sys
import time

try:
    import serial
except ImportError:
    sys.exit("pyserial is not installed. Run: pip install pyserial")

PORT = sys.argv[1] if len(sys.argv) > 1 else "/dev/ttyUSB0"
BAUDS = [9600, 115200, 57600, 74880]
COMMANDS = ["?", "E", "S50", "X"]


def hexdump(data: bytes) -> str:
    if not data:
        return "(nothing)"
    printable = data.decode("ascii", errors="replace").replace("\r", "\\r").replace("\n", "\\n")
    return f"{data.hex(' ')}  |  {printable!r}"


for baud in BAUDS:
    print(f"\n=== {PORT} @ {baud} baud ===")
    try:
        conn = serial.Serial(PORT, baud, timeout=2)
    except Exception as exc:
        print(f"  could not open port: {exc}")
        continue
    time.sleep(2.5)  # board resets on open; wait for the bootloader
    boot = conn.read(conn.in_waiting or 0)
    if boot:
        print(f"  boot output: {hexdump(boot)}")
    conn.reset_input_buffer()
    for cmd in COMMANDS:
        conn.write(f"{cmd}\n".encode())
        time.sleep(1.2)
        reply = conn.read(conn.in_waiting or 0)
        print(f"  {cmd!r:6} -> {hexdump(reply)}")
    conn.close()

print(
    "\nDone. Whichever baud produced readable 'OK:' text is the correct "
    "STEPPER_BAUD_RATE. If none did, the problem is the firmware or wiring, "
    "not the backend."
)

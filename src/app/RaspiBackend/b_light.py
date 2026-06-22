import RPi.GPIO as GPIO
import time
import sys
from config import BLUE_LIGHT_PIN

# --- Hardware Configuration ---
# GPIO 21 (Physical Pin 40 on Pi Zero)
LIGHT_PIN = BLUE_LIGHT_PIN

def setup_gpio():
    """Initializes the GPIO settings."""
    GPIO.setmode(GPIO.BCM)
    GPIO.setwarnings(False)
    GPIO.setup(LIGHT_PIN, GPIO.OUT)

def manual_control(state):
    """
    Directly sets the pin state.
    state: True for ON, False for OFF
    """
    setup_gpio()
    if state:
        GPIO.output(LIGHT_PIN, GPIO.HIGH)
        print(f"GPIO {LIGHT_PIN}: MANUAL_ON")
    else:
        GPIO.output(LIGHT_PIN, GPIO.LOW)
        print(f"GPIO {LIGHT_PIN}: MANUAL_OFF")

def automated_pulse(duration):
    """
    Turns the light on for a set duration, then off.
    duration: time in seconds
    """
    setup_gpio()
    try:
        GPIO.output(LIGHT_PIN, GPIO.HIGH)
        print(f"GPIO {LIGHT_PIN}: AUTO_ON (Duration: {duration}s)")
        time.sleep(duration)
        GPIO.output(LIGHT_PIN, GPIO.LOW)
        print(f"GPIO {LIGHT_PIN}: AUTO_OFF")
    except KeyboardInterrupt:
        GPIO.output(LIGHT_PIN, GPIO.LOW)
        GPIO.cleanup()

if __name__ == "__main__":
    # This section allows the script to be called via command line or Subprocess
    if len(sys.argv) < 2:
        print("Usage: python3 b_light.py [on|off|automate] [duration_seconds]")
        sys.exit(1)

    cmd = sys.argv[1].lower()

    if cmd == "on":
        manual_control(True)
    elif cmd == "off":
        manual_control(False)
    elif cmd == "automate":
        if len(sys.argv) == 3:
            automated_pulse(float(sys.argv[2]))
        else:
            print("Error: Automation requires a duration in seconds.")

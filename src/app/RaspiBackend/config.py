import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
PI_HOME = Path(os.getenv("STEPPER_PI_HOME", "/home/dank"))

SERIAL_PORT = os.getenv("STEPPER_SERIAL_PORT", "/dev/ttyUSB0")
BAUD_RATE = int(os.getenv("STEPPER_BAUD_RATE", "9600"))
SERIAL_TIMEOUT = float(os.getenv("STEPPER_SERIAL_TIMEOUT", "1.5"))

ROUTINES_DIR = Path(os.getenv("STEPPER_ROUTINES_DIR", PI_HOME / "routines"))
ACTIVE_ROUTINES_DIR = Path(os.getenv("STEPPER_ACTIVE_ROUTINES_DIR", PI_HOME / "active_routines"))
PICTURES_DIR = Path(os.getenv("STEPPER_PICTURES_DIR", PI_HOME / "saved_pictures"))
LOG_FILE_PATH = Path(os.getenv("STEPPER_LOG_FILE", PI_HOME / "routine_scheduler.log"))
DATABASE_FILE = Path(os.getenv("STEPPER_DATABASE_FILE", PI_HOME / "routine_data.db"))

CAMERA_SCRIPT_PATH = Path(os.getenv("STEPPER_CAMERA_SCRIPT", BASE_DIR / "camera.py"))
LIGHT_SCRIPT_PATH = Path(os.getenv("STEPPER_LIGHT_SCRIPT", BASE_DIR / "b_light.py"))
ROUTINE_SCRIPT_PATH = Path(os.getenv("STEPPER_ROUTINE_SCRIPT", BASE_DIR / "routine.py"))

BLUE_LIGHT_PIN = int(os.getenv("STEPPER_BLUE_LIGHT_PIN", "21"))
DEFAULT_EXPOSURE_TIME_US = int(os.getenv("STEPPER_DEFAULT_EXPOSURE_US", "50000"))

BACKEND_HOST = os.getenv("STEPPER_BACKEND_HOST", "0.0.0.0")
BACKEND_PORT = int(os.getenv("STEPPER_BACKEND_PORT", "5000"))
BACKEND_DEBUG = os.getenv("STEPPER_BACKEND_DEBUG", "0").lower() in {"1", "true", "yes"}

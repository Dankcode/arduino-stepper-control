# -*- coding: utf-8 -*- 
import os
import argparse
from datetime import datetime
from pathlib import Path
import time

# --- Third-party library import ---
try:
    from picamera2 import Picamera2
except ImportError:
    print("WARNING: The 'picamera2' library is not installed or not found. Install it with 'pip install picamera2'.")
    # Define a mock class for testing on non-Pi machines
    class Picamera2:
        def __init__(self): pass
        def create_still_configuration(self): return {}
        def configure(self, config): pass
        def start(self): print("Camera start simulated.")
        def set_controls(self, controls): pass
        def capture_file(self, path): print(f"Simulated capture to {path}")
        def stop(self): print("Camera stop simulated.")
        def capture_metadata(self): pass
        @property
        def started(self): return True

# --- Configuration ---
# Set the default exposure time in microseconds (50ms)
DEFAULT_EXPOSURE_TIME_US = 50000 

# --- New function for manual capture ---
def capture_manual_snapshot(exposure_time: int):
    """
    Captures a single snapshot and saves it to a dedicated manual folder 
    with a timestamped filename.
    
    :param exposure_time: The exposure time in microseconds.
    """
    picam2 = None
    try:
        # 1. Initialize Picamera2 and Configuration
        picam2 = Picamera2()
        config = picam2.create_still_configuration()
        picam2.configure(config)

        # 2. Apply exposure time setting
        print(f"Setting manual exposure time to {exposure_time} µs ({exposure_time/1000} ms)...")
        
        # Explicitly disable Automatic Exposure (AeEnable: False) to set manual exposure (ExposureTime)
        controls = {
            "ExposureTime": exposure_time, 
            "AeEnable": False, 
            "AnalogueGain": 1.0 # Use minimum gain for quality
        }
        picam2.set_controls(controls)
        
        # Start the camera with the applied controls
        picam2.start()
        
        # Wait for the camera to stabilize after setting manual controls
        time.sleep(1.0) 

        # 3. Determine and 4. Create the save path
        # Base directory for all pictures
        base_dir = Path("/home/dank/saved_pictures")
        # Dedicated folder for manual snapshots
        save_dir = base_dir / "manual_pictures" 

        # Create the directory if it doesn't exist
        os.makedirs(save_dir, exist_ok=True)
        
        # Create a unique filename using a full timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{timestamp}.jpg"
        file_path = save_dir / filename

        print(f"Saving snapshot to: {file_path}")

        # 5. Capture and save the picture
        picam2.capture_file(str(file_path))
        print(f"\n✅ Snapshot captured and saved as {filename}.")

    except Exception as e:
        print(f"\n❌ An error occurred during camera operation: {e}")
    finally:
        # Stop the camera safely
        if picam2 and getattr(picam2, 'started', False):
            picam2.stop()


def main():
    parser = argparse.ArgumentParser(
        description="Capture a single snapshot using Raspberry Pi libcamera.",
        formatter_class=argparse.RawTextHelpFormatter
    )
    
    # We keep a placeholder argument for the backend to use (method_name/routine_name), 
    # but it's not used for naming or directory creation in this manual mode.
    # It must remain for compatibility with the backend subprocess call structure.
    parser.add_argument(
        "placeholder_name",
        type=str,
        help="Placeholder argument for compatibility with the calling script."
    )
    
    parser.add_argument(
        "--exposure",
        type=int,
        default=DEFAULT_EXPOSURE_TIME_US,
        help=(
            f"Manually set the exposure time in **microseconds (µs)**.\n"
            f"Default is {DEFAULT_EXPOSURE_TIME_US} µs ({DEFAULT_EXPOSURE_TIME_US/1000} ms)."
        )
    )
    
    args = parser.parse_args()
    
    # Call the new manual capture function
    capture_manual_snapshot(args.exposure)

if __name__ == "__main__":
    main()
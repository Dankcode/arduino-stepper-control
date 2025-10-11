import os
import argparse
import time
from datetime import datetime
from pathlib import Path

# --- Third-party library import ---
try:
    from picamera2 import Picamera2
except ImportError:
    print("WARNING: The 'picamera2' library not found. Using mock camera.")
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
DEFAULT_EXPOSURE_TIME_US = 50000 
BASE_SAVE_DIR = Path("/home/dank/saved_pictures")

def configure_camera(picam2: Picamera2, exposure_time: int):
    """Initializes and configures the camera with manual exposure."""
    config = picam2.create_still_configuration()
    picam2.configure(config)
    
    # Explicitly set manual controls
    controls = {
        "ExposureTime": exposure_time, 
        "AeEnable": False, 
        "AnalogueGain": 1.0 
    }
    picam2.set_controls(controls)
    picam2.start()
    time.sleep(1.0) # Wait for camera to stabilize

def capture_single_image(exposure_time: int, output_path: Path):
    """Generic function to initialize camera, capture, and save one image."""
    picam2 = None
    try:
        picam2 = Picamera2()
        
        # 1. Configure and start camera
        configure_camera(picam2, exposure_time)
        
        # 2. Ensure the directory exists before saving
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        # 3. Capture and save
        print(f"  -> Saving image to: {output_path}")
        picam2.capture_file(str(output_path))
        print(f"✅ Capture complete.")

    except Exception as e:
        print(f"\n❌ An error occurred during camera operation: {e}")
    finally:
        # 4. Stop camera safely
        if picam2 and getattr(picam2, 'started', False):
            picam2.stop()

# --- Capture Modes ---

def manual_snapshot(exposure_time: int):
    """Handles manual single-picture capture with timestamped naming."""
    print(f"\n--- Manual Snapshot Mode ---")
    
    manual_dir = BASE_SAVE_DIR / "manual_pictures"
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"manual_{timestamp}.jpg"
    output_path = manual_dir / filename
    
    capture_single_image(exposure_time, output_path)

def routine_well_capture(exposure_time: int, output_path: Path):
    """Handles routine capture saving to the exact specified path."""
    print(f"\n--- Routine Well Capture Mode ---")
    
    capture_single_image(exposure_time, output_path)

# --- Main Execution ---

def main():
    parser = argparse.ArgumentParser(
        description="Camera script for manual snapshots or routine captures.",
        formatter_class=argparse.RawTextHelpFormatter
    )
    
    parser.add_argument(
        "--mode",
        type=str,
        required=True,
        choices=['manual', 'routine'],
        help="Operating mode: 'manual' for single snapshot, 'routine' for automated well capture."
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

    parser.add_argument(
        "--output-path",
        type=str,
        default=None,
        help="Full file path to save the routine image. REQUIRED in 'routine' mode."
    )
    
    args = parser.parse_args()
    
    if args.mode == 'manual':
        manual_snapshot(args.exposure)
        
    elif args.mode == 'routine':
        if not args.output_path:
            parser.error("--output-path is required when --mode is 'routine'")
        routine_well_capture(args.exposure, Path(args.output_path))

if __name__ == "__main__":
    main()
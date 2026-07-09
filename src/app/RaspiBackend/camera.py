import argparse
import sys
import time
from datetime import datetime
from pathlib import Path
from config import DEFAULT_EXPOSURE_TIME_US, PICTURES_DIR

# --- Third-party library import ---
try:
    from picamera2 import Picamera2
    CAMERA_IMPORT_ERROR = None
except ImportError as exc:
    Picamera2 = None
    CAMERA_IMPORT_ERROR = str(exc)

# --- Configuration ---
BASE_SAVE_DIR = PICTURES_DIR

def configure_camera(picam2, exposure_time: int):
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
    if Picamera2 is None:
        raise RuntimeError(
            "picamera2 is unavailable. Install python3-picamera2 and create the "
            f"agent venv with --system-site-packages ({CAMERA_IMPORT_ERROR})."
        )
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
        print("Capture complete.")
    finally:
        # Stop and close even if capture fails so the next attempt can use the sensor.
        if picam2:
            try:
                if getattr(picam2, 'started', False):
                    picam2.stop()
            finally:
                try:
                    picam2.close()
                except Exception:
                    pass

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
            f"Manually set the exposure time in **microseconds**.\n"
            f"Default is {DEFAULT_EXPOSURE_TIME_US} us ({DEFAULT_EXPOSURE_TIME_US/1000} ms)."
        )
    )

    parser.add_argument(
        "--output-path",
        type=str,
        default=None,
        help="Full file path to save the routine image. REQUIRED in 'routine' mode."
    )
    
    args = parser.parse_args()
    
    try:
        if args.mode == 'manual':
            manual_snapshot(args.exposure)
        elif args.mode == 'routine':
            if not args.output_path:
                parser.error("--output-path is required when --mode is 'routine'")
            routine_well_capture(args.exposure, Path(args.output_path))
    except Exception as exc:
        print(f"ERROR: Camera capture failed: {exc}", file=sys.stderr)
        return 1
    return 0

if __name__ == "__main__":
    raise SystemExit(main())

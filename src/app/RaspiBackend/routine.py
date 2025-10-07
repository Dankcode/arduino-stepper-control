import os
import time
import json
import sqlite3
import subprocess
from datetime import datetime
from pathlib import Path

# --- Configuration ---
DATABASE_FILE = '/home/dank/routine_data.db'
ROUTINES_DIR = '/home/dank/routines/'
SAVED_PICTURES_DIR = '/home/dank/saved_pictures'

# Default step sizes for a 96-well plate (can be modified via function parameter)
DEFAULT_X_STEP = 10 
DEFAULT_Y_STEP = 10
ROW_COUNT_96_WELL = 8  # A to H
COL_COUNT_96_WELL = 12 # 1 to 12

# --- Stepper Motor Controller Mock/Placeholder ---
# NOTE: Replace this class with your actual motor control logic
# (e.g., communication via serial port to an Arduino or a dedicated motor driver library).
class StepperController:
    """Mock controller for stepper motor actions."""
    def __init__(self):
        print("Motor Controller Initialized.")
        self.is_enabled = False

    def enable_motors(self):
        print("ACTION: Motors Enabled.")
        self.is_enabled = True
        return True

    def disable_motors(self):
        print("ACTION: Motors Disabled.")
        self.is_enabled = False
        return True

    def move_x(self, steps: int):
        """Moves the X axis. Positive steps move forward/right."""
        if not self.is_enabled:
            print("ERROR: Motors must be enabled before moving.")
            return False
        print(f"ACTION: Moving X axis by {steps} steps.")
        return True
    
    def move_y(self, steps: int):
        """Moves the Y axis. Positive steps move down (to the next row)."""
        if not self.is_enabled:
            print("ERROR: Motors must be enabled before moving.")
            return False
        print(f"ACTION: Moving Y axis by {steps} steps.")
        return True

# Initialize the controller instance
controller = StepperController()


# --- Utility Functions ---

def get_db_connection():
    """Establishes a connection to the SQLite database."""
    conn = sqlite3.connect(DATABASE_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def get_well_name(row_index, col_index):
    """Converts zero-based indices (0-7, 0-11) to A1, B2 format."""
    row_char = chr(ord('A') + row_index)
    col_num = col_index + 1
    return f"{row_char}{col_num}"

def run_camera_script(exposure_time: int, save_path: Path):
    """
    Calls the external camera.py script to take a picture.
    NOTE: This uses the manual capture function for simple single-file execution.
    For routine runs, we pass the final image path to camera.py if it supports it, 
    but based on the previous manual mode, we'll adapt by running a different 
    subprocess structure (or assuming camera.py is adapted to this routine structure).

    To simplify, we'll assume a new 'routine_capture.py' or modify the call to 
    the original camera.py to save one file, overriding its manual logic.
    Since the previous camera.py was updated for *manual* capture, let's 
    run the capture inline here to have granular control over the filename, 
    but this requires duplicating the picamera2 logic or having a dedicated capture script.

    For this solution, we will call an *adapted* camera script which accepts the final path.
    Let's assume a simplified script call for now, focusing on the motor/routine logic. 
    
    If the original camera.py is used, we must pass the exposure time and a placeholder 
    for the routine name, but the file naming must be handled here.

    We will use a new dedicated function/script 'capture_well.py' that takes the exposure 
    time and the full file path.
    
    Since I cannot create 'capture_well.py', I will define a mock function here 
    that logs the action.
    """
    print(f"  -> CAPTURE: Calling camera with Exposure={exposure_time} µs. Saving to {save_path.name}")
    
    # Example subprocess call for a dedicated routine camera script:
    # command = ['python3', 'capture_well.py', str(exposure_time), str(save_path)]
    # subprocess.run(command, check=True)
    time.sleep(0.5) # Simulate capture time
    print(f"  -> CAPTURE: Complete.")
    return True


# --- Core Routine Logic ---

def run_plate_routine(routine_name: str, quadrant_key: str, quadrant_data: list, 
                      exposure_time: int, x_step: int = DEFAULT_X_STEP, 
                      y_step: int = DEFAULT_Y_STEP):
    """
    Executes the well-by-well movement and picture capture for a single plate (quadrant).
    """
    num_rows = len(quadrant_data)
    if num_rows == 0:
        return

    num_cols = len(quadrant_data[0])
    print(f"\n-- Starting Plate Routine for {routine_name} ({quadrant_key.upper()} - {num_rows}x{num_cols}) --")
    
    # 1. Ensure motor is enabled
    if not controller.is_enabled:
        controller.enable_motors()

    # 2. Define the base save directory
    date_str = datetime.now().strftime("%Y-%m-%d")
    save_dir = Path(SAVED_PICTURES_DIR) / f"{routine_name}_{quadrant_key}" / date_str
    os.makedirs(save_dir, exist_ok=True)
    print(f"Pictures will be saved to: {save_dir}")

    total_x_steps = 0 # Track total steps to return to zero position

    for r in range(num_rows):
        row_letter = chr(ord('A') + r)
        print(f"\n--- Starting Row {row_letter} ---")

        for c in range(num_cols):
            well_name = get_well_name(r, c)
            well_params = quadrant_data[r][c]
            step_time = well_params.get('runtime', 0)
            
            # 2. Check for skip condition
            if step_time == 0:
                print(f"  > Skipping well {well_name}: runtime is 0.")
                
                # Still need to move the stepper motor *before* the next well if not the last column
                if c < num_cols - 1:
                    if controller.move_x(x_step):
                        total_x_steps += x_step
                continue

            print(f"  > Processing well {well_name}: runtime={step_time}s")
            
            # 3. Take Picture and Move
            
            # Capture the image
            filename = f"{well_name}.jpg"
            run_camera_script(exposure_time, save_dir / filename)
            
            # Apply runtime delay (post-capture delay)
            if step_time > 0:
                print(f"  > Delaying for {step_time} seconds...")
                time.sleep(step_time)

            # Move to the next well (X-axis)
            if c < num_cols - 1:
                # Move X for the next well
                if controller.move_x(x_step):
                    total_x_steps += x_step
            
            # If it's the last column, we don't move X forward

        # 4. End of Row: Move X back and move Y down
        
        # Move X axis back to the starting position (A1 column)
        print(f"  <- Returning X axis by {total_x_steps} steps.")
        controller.move_x(-total_x_steps)
        total_x_steps = 0 # Reset X step counter

        # Move Y axis down to the next row (if not the last row)
        if r < num_rows - 1:
            print(f"  v Moving Y axis down by {y_step} steps for Row {chr(ord('A') + r + 1)}.")
            controller.move_y(y_step)

    print(f"\n-- Plate Routine for {quadrant_key.upper()} Complete --")
    # Return Y axis to the start position after the last row
    total_y_steps_moved = (num_rows - 1) * y_step
    if total_y_steps_moved > 0:
        print(f"  ^ Returning Y axis by {total_y_steps_moved} steps.")
        controller.move_y(-total_y_steps_moved)
    
    controller.disable_motors()


def execute_all_active_routines(x_step_unit=DEFAULT_X_STEP, y_step_unit=DEFAULT_Y_STEP):
    """
    Main function to find active routines and execute the capture sequence for each.
    """
    print(f"\n--- Routine Executor Started: {datetime.now()} ---")
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Fetch all routines currently marked as active
        cursor.execute("SELECT filename FROM routine_status WHERE is_active = 1")
        active_routines = [row['filename'] for row in cursor.fetchall()]
        conn.close()
        
    except sqlite3.Error as e:
        print(f"ERROR: Database error when fetching active routines: {e}")
        return

    if not active_routines:
        print("INFO: No active routines found in the database.")
        return

    print(f"INFO: Found {len(active_routines)} active routines: {active_routines}")

    for routine_filename in active_routines:
        routine_name = routine_filename.replace('.json', '')
        json_path = Path(ROUTINES_DIR) / routine_filename

        if not json_path.exists():
            print(f"WARNING: JSON file not found for routine '{routine_name}'. Skipping.")
            continue

        try:
            with open(json_path, 'r') as f:
                routine_data = json.load(f)
            
            # Extract configuration data
            exposure_time = routine_data.get('exposureTime')
            if not exposure_time:
                 # Fallback/Error handling if exposure time is missing
                 exposure_time = 50000 
                 print(f"WARNING: 'exposureTime' missing in JSON. Defaulting to {exposure_time} µs.")
                 
            # Extract quadrant data from the routine content
            content = routine_data.get('routine_content', {})
            quadrant_layouts = content.get('quadrantLayouts', {})
            quadrant_data = content.get('quadrantData', {})
            
        except json.JSONDecodeError:
            print(f"ERROR: Could not decode JSON for routine '{routine_name}'. Skipping.")
            continue
        except Exception as e:
            print(f"ERROR: Failed to load routine data for '{routine_name}': {e}. Skipping.")
            continue

        # Execute the routine for all four quadrants
        for key in ['tl', 'tr', 'bl', 'br']:
            layout = quadrant_layouts.get(key)
            data = quadrant_data.get(key)
            
            if layout and layout != 'none' and data and len(data) > 0:
                print(f"\n--- Executing Routine: {routine_name} - Quadrant: {key.upper()} ({layout}) ---")
                
                # The data structure holds the well parameters (runtime, etc.)
                run_plate_routine(
                    routine_name=routine_name,
                    quadrant_key=key,
                    quadrant_data=data,
                    exposure_time=exposure_time,
                    x_step=x_step_unit,
                    y_step=y_step_unit
                )
            else:
                print(f"INFO: Quadrant {key.upper()} is set to 'none' or has no data. Skipping.")
                
    print(f"\n--- Routine Executor Finished: {datetime.now()} ---")


if __name__ == "__main__":
    # Example call: Run all active routines with default step sizes
    execute_all_active_routines()
    
    # Example call for a 48-well plate (if all quadrants were 48-well, step size might change)
    # execute_all_active_routines(x_step_unit=20, y_step_unit=20)
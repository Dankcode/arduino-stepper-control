import os
import time
import json
import sqlite3
import subprocess
import argparse # Must be imported for argument parsing
from datetime import datetime
from pathlib import Path

# --- Configuration ---
DATABASE_FILE = '/home/dank/routine_data.db'
ROUTINES_DIR = '/home/dank/routines/'
# Base directory for all pictures (must match BASE_SAVE_DIR in camera.py)
SAVED_PICTURES_DIR = Path('/home/dank/saved_pictures') 
CAMERA_SCRIPT_PATH = 'camera.py' # Path to the camera script

# Default step sizes for a 96-well plate 
DEFAULT_X_STEP = 10 
DEFAULT_Y_STEP = 10
DEFAULT_EXPOSURE_TIME_US = 50000 # Must be defined here for fallback

# --- Stepper Motor Controller Mock/Placeholder ---
class StepperController:
    """Mock controller for stepper motor actions."""
    def __init__(self):
        print("Motor Controller Initialized (Mock).")
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
        if not self.is_enabled: 
            print("ERROR: Motors must be enabled before moving.")
            return False
        print(f"ACTION: Moving X axis by {steps} steps.")
        return True
    
    def move_y(self, steps: int):
        if not self.is_enabled: 
            print("ERROR: Motors must be enabled before moving.")
            return False
        print(f"ACTION: Moving Y axis by {steps} steps.")
        return True

controller = StepperController()


# --- Utility Functions ---

def get_db_connection():
    conn = sqlite3.connect(DATABASE_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def get_well_name(row_index, col_index):
    """Converts zero-based indices (0-7, 0-11) to A1, B2 format."""
    row_char = chr(ord('A') + row_index)
    col_num = col_index + 1
    return f"{row_char}{col_num}"

def run_camera_script_routine(exposure_time: int, output_path: Path):
    """
    Calls camera.py in 'routine' mode with the final output path.
    """
    command = [
        'python3', 
        CAMERA_SCRIPT_PATH, 
        '--mode', 'routine', 
        '--exposure', str(exposure_time), 
        '--output-path', str(output_path)
    ]
    
    print(f"  -> CAPTURE: Executing camera.py for {output_path.name}")
    
    try:
        subprocess.run(
            command, 
            capture_output=True, 
            text=True, 
            check=True
        )
        return True
        
    except subprocess.CalledProcessError as e:
        print(f"  ❌ CAPTURE ERROR: Camera script failed. Stderr:\n{e.stderr.strip()}")
        return False
    except FileNotFoundError:
        print(f"  ❌ CAPTURE ERROR: Python or {CAMERA_SCRIPT_PATH} not found.")
        return False
        
# --- Core Routine Logic ---

def run_plate_routine(routine_name: str, quadrant_key: str, quadrant_data: list, 
                      exposure_time: int, x_step: int = DEFAULT_X_STEP, 
                      y_step: int = DEFAULT_Y_STEP):
    """
    Executes the well-by-well movement and picture capture for a single plate (quadrant).
    (Logic remains the same as previous step)
    """
    num_rows = len(quadrant_data)
    if num_rows == 0: return
    num_cols = len(quadrant_data[0])
    
    print(f"\n-- Starting Plate Routine for {routine_name} ({quadrant_key.upper()} - {num_rows}x{num_cols}) --")
    
    if not controller.is_enabled:
        controller.enable_motors()

    # Define the save directory: /saved_pictures/RoutineName_quadrant/2025-10-05/
    date_str = datetime.now().strftime("%Y-%m-%d")
    save_dir = SAVED_PICTURES_DIR / f"{routine_name}_{quadrant_key}" / date_str
    os.makedirs(save_dir, exist_ok=True)
    print(f"Pictures will be saved to: {save_dir}")

    total_x_steps = 0 

    for r in range(num_rows):
        print(f"\n--- Starting Row {chr(ord('A') + r)} ---")

        for c in range(num_cols):
            well_name = get_well_name(r, c)
            well_params = quadrant_data[r][c]
            step_time = well_params.get('runtime', 0)
            
            if step_time == 0:
                print(f"  > Skipping well {well_name}: runtime is 0.")
            else:
                print(f"  > Processing well {well_name}: runtime={step_time}s")
                
                # 1. Take Picture
                filename = f"{well_name}.jpg"
                output_path = save_dir / filename
                run_camera_script_routine(exposure_time, output_path)
                
                # 2. Apply runtime delay
                if step_time > 0:
                    print(f"  > Delaying for {step_time} seconds...")
                    time.sleep(step_time)

            # 3. Move to the next well (X-axis)
            if c < num_cols - 1:
                if controller.move_x(x_step):
                    total_x_steps += x_step

        # 4. End of Row: Move X back and move Y down
        
        print(f"  <- Returning X axis by {total_x_steps} steps.")
        controller.move_x(-total_x_steps)
        total_x_steps = 0 

        if r < num_rows - 1:
            print(f"  v Moving Y axis down by {y_step} steps for Row {chr(ord('A') + r + 1)}.")
            controller.move_y(y_step)

    print(f"\n-- Plate Routine for {quadrant_key.upper()} Complete --")
    
    # 5. Return Y axis to the start position 
    total_y_steps_moved = (num_rows - 1) * y_step
    if total_y_steps_moved > 0:
        print(f"  ^ Returning Y axis by {total_y_steps_moved} steps.")
        controller.move_y(-total_y_steps_moved)
    
    controller.disable_motors()


def execute_single_routine(routine_filename: str, x_step_unit=DEFAULT_X_STEP, y_step_unit=DEFAULT_Y_STEP):
    """
    Loads and executes a single routine specified by the routine filename.
    This is the function called by cronjob.py.
    """
    routine_name = routine_filename.replace('.json', '')
    json_path = Path(ROUTINES_DIR) / routine_filename
    
    print(f"\n--- Single Routine Executor Started for: {routine_name} ---")

    if not json_path.exists():
        print(f"ERROR: Routine JSON file not found at {json_path}. Aborting.")
        return
    
    try:
        with open(json_path, 'r') as f:
            routine_data = json.load(f)
        
        exposure_time = routine_data.get('exposureTime', DEFAULT_EXPOSURE_TIME_US)
        content = routine_data.get('routine_content', {})
        quadrant_layouts = content.get('quadrantLayouts', {})
        quadrant_data = content.get('quadrantData', {})
        
    except Exception as e:
        print(f"ERROR: Failed to load/parse routine data for '{routine_name}': {e}. Aborting.")
        return

    # Execute the routine for all four quadrants (tl, tr, bl, br)
    for key in ['tl', 'tr', 'bl', 'br']:
        layout = quadrant_layouts.get(key)
        data = quadrant_data.get(key)
        
        # Check for valid data structure
        if layout and layout != 'none' and data and len(data) > 0 and len(data[0]) > 0:
            
            run_plate_routine(
                routine_name=routine_name,
                quadrant_key=key,
                quadrant_data=data,
                exposure_time=exposure_time,
                x_step=x_step_unit,
                y_step=y_step_unit
            )
        else:
            print(f"INFO: Quadrant {key.upper()} is skipped (layout is 'none' or no data).")
            
    print(f"--- Single Routine Execution for {routine_name} Finished ---")


def execute_all_active_routines(x_step_unit=DEFAULT_X_STEP, y_step_unit=DEFAULT_Y_STEP):
    """
    Original function to find ALL active routines (kept as a fallback/alternative mode).
    """
    print(f"\n--- Fallback: Running ALL Active Routines ---")
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT filename FROM routine_status WHERE is_active = 1")
        active_routines = [row['filename'] for row in cursor.fetchall()]
        conn.close()
    except sqlite3.Error as e:
        print(f"ERROR: Database error when fetching active routines: {e}")
        return

    if not active_routines:
        print("INFO: No active routines found in the database.")
        return

    for routine_filename in active_routines:
        # Use the single routine executor for cleanliness
        execute_single_routine(routine_filename, x_step_unit, y_step_unit)
    
    print(f"\n--- Fallback Executor Finished: {datetime.now()} ---")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Execute a specific routine or all active routines.",
        formatter_class=argparse.RawTextHelpFormatter
    )
    
    parser.add_argument(
        "--routine",
        type=str,
        default=None,
        help="The filename of the routine to execute (e.g., 'MyRoutine.json')."
    )
    
    parser.add_argument(
        "--xstep",
        type=int,
        default=DEFAULT_X_STEP,
        help=f"X-axis step size. Default: {DEFAULT_X_STEP}"
    )

    parser.add_argument(
        "--ystep",
        type=int,
        default=DEFAULT_Y_STEP,
        help=f"Y-axis step size. Default: {DEFAULT_Y_STEP}"
    )

    args = parser.parse_args()

    if args.routine:
        # This is the path for the scheduled cronjob
        execute_single_routine(args.routine, args.xstep, args.ystep)
    else:
        # Fallback if the script is run directly without arguments
        execute_all_active_routines(args.xstep, args.ystep)
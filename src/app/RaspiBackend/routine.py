import os
import time
import sqlite3
import subprocess
import argparse
from datetime import datetime
from pathlib import Path

# NEW IMPORTS for Motor Control
import serial
import logging
import sys

# --- Configuration ---

# Logging setup
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Serial Configuration
DEFAULT_SERIAL_PORT = '/dev/ttyUSB0'
BAUD_RATE = 9600
SERIAL_TIMEOUT = 1.5

# General Configuration
# Placeholder values for environment paths
DATABASE_FILE = '/home/dank/routine_data.db'
SAVED_PICTURES_DIR = Path('/home/dank/saved_pictures')
CAMERA_SCRIPT_PATH = '/home/dank/backend/camera.py'

# 🚨🚨 DEFAULT MOTOR SETTINGS 🚨🚨
DEFAULT_X_STEP = 10  # Steps between wells in X direction
DEFAULT_Y_STEP = 10  # Steps between rows in Y direction
DEFAULT_EXPOSURE_TIME_US = 50000

# --- Database and Routine Parameter Functions (MOCK) ---

def fetch_routine_data(routine_name):
    """Mocks fetching routine parameters from the database. Replace with actual DB logic."""
    logging.info(f"MOCK: Fetching parameters for routine: {routine_name}")
    # Returns example parameters required by the scanning function
    return {
        'num_wells_x': 12,  # Number of columns
        'num_wells_y': 8,   # Number of rows
        'description': f"Data for {routine_name}"
    }

def fetch_well_scan_map(routine_name, num_wells_y, num_wells_x):
    """
    Mocks fetching a boolean map indicating which wells need scanning.
    True = Scan, False = Skip.

    Example Map (skips A2, A3, B-row, E-row):
    - Row A: [T, F, F, T, T, T, T, T, T, T, T, T]
    - Row B: [F, F, F, F, F, F, F, F, F, F, F, F] (Entire row skipped)
    - Row C: [T, T, T, T, T, T, T, T, T, T, T, T]
    ...
    """
    logging.info(f"MOCK: Fetching well scan map for {routine_name}")

    # Generate a map where most are True, but introduce skips for demonstration
    scan_map = []
    for r in range(num_wells_y):
        row_map = [True] * num_wells_x
        row_letter = chr(65 + r)
        
        # Example: Skip A2, A3
        if row_letter == 'A':
            row_map[1] = False # A2
            row_map[2] = False # A3
        # Example: Skip entire Row B
        elif row_letter == 'B':
            row_map = [False] * num_wells_x
        # Example: Skip E6, E7
        elif row_letter == 'E':
            row_map[5] = False # E6
            row_map[6] = False # E7
            
        scan_map.append(row_map)
        
    return scan_map

def capture_well_image(well_id, exposure_time_us=DEFAULT_EXPOSURE_TIME_US):
    """Captures an image of the current well and saves it with the well ID."""
    try:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        image_filename = f"{well_id}_{timestamp}.jpg"
        image_path = SAVED_PICTURES_DIR / image_filename

        # Ensure the pictures directory exists
        SAVED_PICTURES_DIR.mkdir(parents=True, exist_ok=True)

        # Call the camera script with well ID and exposure time
        command = [
            'python', CAMERA_SCRIPT_PATH,
            '--well_id', well_id,
            '--exposure_us', str(exposure_time_us),
            '--output', str(image_path)
        ]

        logging.info(f"Capturing image for well {well_id}...")
        result = subprocess.run(command, capture_output=True, text=True, timeout=30)

        if result.returncode == 0:
            logging.info(f"Successfully captured image for well {well_id}: {image_path}")
            return True
        else:
            logging.error(f"Camera script failed for well {well_id}: {result.stderr}")
            return False

    except subprocess.TimeoutExpired:
        logging.error(f"Camera script timeout for well {well_id}.")
        return False
    except Exception as e:
        logging.error(f"Error capturing image for well {well_id}: {e}")
        return False

def well_id_from_position(row, col):
    """Converts row and column indices to well ID (e.g., A1, A2, ..., H12)."""
    row_letter = chr(65 + row)  # Convert row index to letter (A-H)
    well_number = col + 1  # Column index to 1-based well number
    return f"{row_letter}{well_number}"

# --- Stepper Motor Controller Class (Unchanged for this update) ---

class StepperController:
    """
    Manages the state and serial communication for the Stepper Motors,
    including position tracking for homing.
    """
    def __init__(self, port=DEFAULT_SERIAL_PORT, baud=BAUD_RATE):
        self.port = port
        self.baud = baud
        self.serial_conn = None
        self.is_connected = False
        self.current_steps = None

        # Position tracking variables (steps from defined origin)
        self.x_position_steps = 0
        self.zy_position_steps = 0

    def connect(self):
        """Initializes the serial connection to the Arduino."""
        if self.is_connected and self.serial_conn:
            logging.info(f"Already connected to {self.port}.")
            return True

        try:
            logging.info(f"Attempting connection to {self.port}...")
            self.serial_conn = serial.Serial(self.port, self.baud, timeout=SERIAL_TIMEOUT)
            time.sleep(2)
            self.is_connected = True
            logging.info(f"Successfully connected to {self.port}.")
            return True
        except serial.SerialException as e:
            self.is_connected = False
            logging.error(f"Failed to connect to {self.port}: {e}")
            return False

    def disconnect(self):
        """Closes the serial connection."""
        if self.serial_conn and self.is_connected:
            self.serial_conn.close()
            self.is_connected = False
            logging.info("Serial connection closed.")
            return True
        return False

    def send_command(self, command: str, wait_for_response=True):
        """Sends a command to the Arduino and optionally waits for a response."""
        if not self.is_connected or not self.serial_conn:
            logging.error(f"Cannot send command '{command}'. Serial connection is not active.")
            return False, "Connection not active."

        try:
            full_command = (command + '\n').encode('ascii')
            self.serial_conn.write(full_command)
            if wait_for_response:
                response_line = self.serial_conn.readline().decode('ascii').strip()
                if "OK" in response_line or "Ready" in response_line:
                    return True, response_line
                else:
                    return False, f"Received non-success response: {response_line}"

            return True, "Command sent."

        except serial.SerialException as e:
            logging.error(f"Serial error while sending command {command}: {e}")
            return False, f"Serial error: {e}"

    def _set_steps(self, new_steps):
        """Internal function to set the step size for the next move."""
        self.current_steps = new_steps
        command = f"S{new_steps}"
        return self.send_command(command, wait_for_response=True)[0]

    # --- Combined Movement Functions (with tracking) ---

    def move_x_steps(self, steps: int, forward: bool = True):
        """Sets step size, moves the X motor, and updates position tracker."""
        if steps <= 0: return True

        self._set_steps(steps)
        command = 'x' if forward else 'X'
        success, response = self.send_command(command)

        if success:
            self.x_position_steps += steps if forward else -steps
        return success

    def move_zy_steps(self, steps: int, forward: bool = True):
        """Sets step size, moves the Z+Y motors, and updates position tracker."""
        if steps <= 0: return True

        self._set_steps(steps)
        command = 'A' if forward else 'a'
        success, response = self.send_command(command)

        if success:
            self.zy_position_steps += steps if forward else -steps
        return success

    # --- Homing Functions (Calculate steps moved and return to origin) ---
    def home_x(self):
        """
        Calculates steps to return to the relative X origin (0) and moves in the **opposite direction**.
        Called after a column is completed.
        """
        steps_to_move = abs(self.x_position_steps)
        # Move opposite: forward if position is negative, backward if position is positive
        forward_direction = self.x_position_steps < 0

        if steps_to_move == 0:
            logging.info("X-Axis is already at origin (0 steps).")
            return True

        logging.info(f"X-Home: Returning {steps_to_move} steps to origin.")
        success = self.move_x_steps(steps_to_move, forward=forward_direction)

        if success:
            self.x_position_steps = 0
            logging.info("X-Axis successfully returned to origin.")
        else:
            logging.error("X-Axis homing failed.")

        return success

    def home_y(self):
        """
        Calculates steps to return to the relative Y origin (0) and moves in the **opposite direction**.
        Called after all wells are completed.
        """
        steps_to_move = abs(self.zy_position_steps)
        # Move opposite: forward if position is negative, backward if position is positive
        forward_direction = self.zy_position_steps < 0

        if steps_to_move == 0:
            logging.info("Y-Axis is already at row starting position (0 steps).")
            return True

        logging.info(f"Y-Home: Returning {steps_to_move} steps to row start.")
        success = self.move_zy_steps(steps_to_move, forward=forward_direction)

        if success:
            self.zy_position_steps = 0
            logging.info("Y-Axis successfully returned to row starting position.")
        else:
            logging.error("Y-Axis homing failed.")

        return success

    def enable_motors(self):
        """Enables all stepper motor drivers. C command: 'E'."""
        return self.send_command("E")[0]

    def disable_motors(self):
        """Disables all stepper motor drivers. C command: 'D'."""
        return self.send_command("D", wait_for_response=False)[0]


# --- Routine Execution Logic (MODIFIED) ---

def execute_96well_plate_routine(routine_name, controller, exposure_time_us=DEFAULT_EXPOSURE_TIME_US):
    """
    Executes the complete 96-well plate scanning routine, skipping wells/rows
    based on a pre-fetched scan map.

    Process:
    1. For each row (A-H):
       - Calculate total X-steps required for this row by grouping contiguous skips.
       - Move along X axis, capturing images only for wells marked True.
       - After completing each column, move X back to origin.
       - Move Y down to the *next* row that requires scanning.
    2. After all rows are complete, return Y axis to origin using home_y()
    """

    # Fetch routine parameters from database
    routine_data = fetch_routine_data(routine_name)
    num_wells_x = routine_data['num_wells_x']  # 12 columns
    num_wells_y = routine_data['num_wells_y']  # 8 rows
    
    # Fetch the well scanning map
    scan_map = fetch_well_scan_map(routine_name, num_wells_y, num_wells_x)

    logging.info(f"Starting 96-well plate routine (Skipping enabled): {routine_name}")
    logging.info(f"Grid dimensions: {num_wells_x} columns × {num_wells_y} rows")

    # Enable motors
    if not controller.enable_motors():
        logging.error("Failed to enable motors. Aborting routine.")
        return False

    wells_captured = 0
    total_wells = num_wells_x * num_wells_y
    
    # Pre-calculate the next row that needs scanning for the row-skipping logic
    rows_to_scan = [r for r, row_map in enumerate(scan_map) if any(row_map)]
    current_row_index = 0

    try:
        while current_row_index < num_wells_y:
            row = current_row_index
            row_letter = chr(65 + row)
            row_map = scan_map[row]
            
            # 1. Row Skipping Logic (Moves Y-axis past entirely skipped rows)
            # Find the next row that contains at least one well to scan
            is_scan_row = any(row_map)
            
            if not is_scan_row:
                logging.info(f"Skipping entire row {row_letter} (no wells to scan).")
                
                # Check how many contiguous rows are skipped to calculate Y movement
                skipped_rows_count = 1
                for next_r in range(row + 1, num_wells_y):
                    if not any(scan_map[next_r]):
                        skipped_rows_count += 1
                    else:
                        break # Found the next row to scan
                        
                # Move Y-axis the distance of the skipped rows + the current row
                y_steps_to_move = skipped_rows_count * DEFAULT_Y_STEP
                
                logging.info(f"Moving Y-axis {y_steps_to_move} steps (skipping {skipped_rows_count} rows).")
                if not controller.move_zy_steps(y_steps_to_move, forward=True):
                    logging.error(f"Failed to move Y-axis after row {row_letter}")
                    raise RuntimeError("Y-axis movement failed")
                    
                # Update current_row_index to the row *after* the skipped block
                current_row_index += skipped_rows_count
                continue # Skip to the next iteration (which will use the new current_row_index)

            # --- Row Scanning Logic ---
            
            logging.info(f"Starting row {row_letter}...")
            col = 0
            while col < num_wells_x:
                
                if row_map[col]:
                    # Current well needs scanning
                    well_id = well_id_from_position(row, col)
                    logging.info(f"Processing well {well_id} ({wells_captured + 1}/{total_wells})")
                    
                    # Capture image of current well
                    if not capture_well_image(well_id, exposure_time_us):
                        logging.warning(f"Failed to capture image for well {well_id}")
                    
                    wells_captured += 1
                    
                    # Move to the *next* well in X direction, unless it's the last column
                    if col < num_wells_x - 1:
                        logging.info(f"Moving X-axis {DEFAULT_X_STEP} steps to column {col + 2}")
                        if not controller.move_x_steps(DEFAULT_X_STEP, forward=True):
                            logging.error(f"Failed to move X to well {well_id}")
                            raise RuntimeError("X-axis movement failed")
                    
                    col += 1
                
                else:
                    # Current well is skipped - calculate step size to the next well to scan (or end of row)
                    
                    skipped_count = 0
                    for next_col in range(col, num_wells_x):
                        if not row_map[next_col]:
                            skipped_count += 1
                        else:
                            break # Found the next well to scan

                    # Steps = number of skipped wells * steps per well
                    x_steps_to_move = skipped_count * DEFAULT_X_STEP
                    
                    if x_steps_to_move > 0:
                        logging.info(f"Skipping {skipped_count} wells. Moving X-axis {x_steps_to_move} steps.")
                        if not controller.move_x_steps(x_steps_to_move, forward=True):
                            logging.error(f"Failed to move X past skipped wells starting at {col+1}")
                            raise RuntimeError("X-axis movement failed (skip)")
                    
                    col += skipped_count # Advance column index past the skipped block

            # After completing a row, return X axis to origin
            logging.info(f"Row {row_letter} complete. Returning X-axis to origin...")
            if not controller.home_x():
                logging.error("Failed to return X-axis to origin")
                raise RuntimeError("X-axis homing failed")
            
            # Move Y-axis down *one* row step, as the row-skipping logic handles larger jumps
            if row < num_wells_y - 1:
                logging.info(f"Moving Y-axis down one step ({DEFAULT_Y_STEP} steps)...")
                if not controller.move_zy_steps(DEFAULT_Y_STEP, forward=True):
                    logging.error(f"Failed to move Y-axis after row {row_letter}")
                    raise RuntimeError("Y-axis movement failed")
                    
            current_row_index += 1 # Advance to the next row (will be checked by the while loop condition)
        
        # After all wells are processed, return Y axis to origin
        logging.info("All wells processed. Returning Y-axis to origin...")
        if not controller.home_y():
            logging.error("Failed to return Y-axis to origin")
            raise RuntimeError("Y-axis homing failed")
        
        logging.info(f"Routine completed successfully! {wells_captured} wells captured.")
        return True
        
    except Exception as e:
        logging.error(f"Routine execution failed: {e}")
        return False
    
    finally:
        # Disable motors
        controller.disable_motors()
        logging.info("Motors disabled.")


# --- Main Entry Point (Unchanged for this update) ---

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Execute 96-well plate scanning routine")
    parser.add_argument('--routine', type=str, default='default_96well',
                        help='Name of the routine to execute')
    parser.add_argument('--port', type=str, default=DEFAULT_SERIAL_PORT,
                        help='Serial port for motor controller')
    parser.add_argument('--exposure', type=int, default=DEFAULT_EXPOSURE_TIME_US,
                        help='Camera exposure time in microseconds')

    args = parser.parse_args()

    # Initialize stepper motor controller
    controller = StepperController(port=args.port)

    # Connect to motor controller
    if not controller.connect():
        logging.error("Failed to connect to motor controller. Exiting.")
        sys.exit(1)
    controller.enable_motors()
    time.sleep(0.5)

    try:
        # Execute the 96-well plate routine
        success = execute_96well_plate_routine(
            routine_name=args.routine,
            controller=controller,
            exposure_time_us=args.exposure
        )

        sys.exit(0 if success else 1)

    finally:
        # Ensure connection is closed
        controller.disconnect()
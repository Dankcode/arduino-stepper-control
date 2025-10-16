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

# --- Stepper Motor Controller Class ---

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
        Called after each well is completed.
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


# ----------------------------------------------------------------------
# --- Scanning Logic Functions ---
# ----------------------------------------------------------------------

def scan_column_well(controller, y_step_unit, exposure_time_us):
    """
    Handles movement and actions for a single well within a column scan.
    
    Pattern: Y-Move Down -> Action. (Y-Return Home is moved to scan_entire_column).
    """
    
    # 1. Y-Move Down: Move Y (Z+Y) down to the next well position. (Forward=True)
    # This move accumulates in controller.zy_position_steps.
    controller.move_zy_steps(y_step_unit, forward=True) 
    
    # 2. Execute routine action (e.g., take picture)
    logging.info(f"ACTION: Capturing well at X: {controller.x_position_steps}, Y: {controller.zy_position_steps}")
    # subprocess.run([sys.executable, CAMERA_SCRIPT_PATH, f"--exposure={exposure_time_us}"], check=True)
    # insert_scan_record(...)
    time.sleep(0.1) # Simulate picture time


def scan_entire_column(controller, x_step_unit, y_step_unit, num_wells_y, exposure_time_us):
    """
    Scans all wells in a single column (down the Y-axis) and resets the Y-axis position.
    
    Pattern: Y-Loop (Well Scan) -> Y-Return Home -> X-Move to Next Column
    """
    
    for well_index_y in range(num_wells_y):
        logging.info(f"  Processing Well in Row {well_index_y + 1}")
        # Note: Removed x_step_unit from the call as it's not used in well movement
        scan_column_well(controller, y_step_unit, exposure_time_us)
        
    # 1. Y-Return Home: Y-axis returns to the original start position after the column is completed.
    # This reverses the total accumulated Y-steps (num_wells_y * y_step_unit) 
    # and resets controller.zy_position_steps to 0.
    controller.home_y()

    # 2. X-Move to Next Column: Move X forward by one step unit. 
    # This move will set the new origin displacement for the next column's home_x() call.
    logging.info(f"Moving X-axis {x_step_unit} steps for next column.")
    controller.move_x_steps(x_step_unit, forward=True)


def execute_single_routine(routine_name, x_step_unit, y_step_unit, exposure_time_us, routine_params):
    """
    Executes the stepper motor and camera routine using a column-first scanning pattern.
    """
    controller = StepperController()
    if not controller.connect():
        sys.exit(1)
        
    controller.enable_motors()
    time.sleep(0.5)

    num_wells_x = routine_params.get('num_wells_x', 1)
    num_wells_y = routine_params.get('num_wells_y', 1)

    try:
        logging.info(f"\n--- Starting Column-First Scan: {num_wells_x} Columns, {num_wells_y} Rows. ---")
        
        # Initial X Move: Move X to the first column's starting position
        logging.info(f"Initial X move to start of first column ({x_step_unit} steps).")
        controller.move_x_steps(x_step_unit, forward=True)

        for col_index in range(num_wells_x):
            logging.info(f"\n--- Starting Column {col_index + 1} of {num_wells_x} ---")
            
            # The next column's initial X-move is handled at the end of scan_entire_column
            # for all subsequent columns. The final column will only execute the home_x.
            scan_entire_column(controller, x_step_unit, y_step_unit, num_wells_y, exposure_time_us)
            
        logging.info(f"\n--- Column-First Scan Completed ---")

    except Exception as e:
        print(f"FATAL ERROR during routine execution: {e}")
        raise 
        
    finally:
        # Finalization: Reset all axes to absolute origin (0, 0) and disable motors
        # The last X-move was already the 'home' move (if successful), 
        # but calling home_x again ensures a full reset if any steps remain.
        print(f"\n--- Finalizing Routine: Resetting Motors and Disconnecting ---\n")
        
        if controller.x_position_steps != 0:
            controller.home_x()
        
        controller.disable_motors() 
        controller.disconnect()
        print("Motors Disabled. Serial Connection Closed.")
        print(f"\n--- Single Routine Execution for {routine_name} Finished ---")


# ----------------------------------------------------------------------
# --- Main Execution Block ---
# ----------------------------------------------------------------------
if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Execute a specific routine by querying the database for its parameters.",
        formatter_class=argparse.RawTextHelpFormatter
    )
    
    parser.add_argument(
        "--routine",
        type=str,
        required=True,
        help="The base name of the routine to execute (e.g., 'testshort')."
    )
    
    parser.add_argument(
        "--xstep",
        type=int,
        default=DEFAULT_X_STEP,
        help=f"X-axis step size (distance between columns). Default: {DEFAULT_X_STEP}"
    )

    parser.add_argument(
        "--ystep",
        type=int,
        default=DEFAULT_Y_STEP,
        help=f"Y-axis step size (distance between wells in a column). Default: {DEFAULT_Y_STEP}"
    )
    
    parser.add_argument(
        "--exposure",
        type=int,
        default=DEFAULT_EXPOSURE_TIME_US,
        help=f"Camera exposure time in microseconds. Default: {DEFAULT_EXPOSURE_TIME_US}"
    )

    args = parser.parse_args()
    
    # 1. Fetch routine data
    routine_params = fetch_routine_data(args.routine)
    
    # 2. Extract exposure time
    exposure_time_us = args.exposure 
    
    # 3. Execute the routine
    execute_single_routine(
        routine_name=args.routine,
        x_step_unit=args.xstep,
        y_step_unit=args.ystep,
        exposure_time_us=exposure_time_us,
        routine_params=routine_params
    )
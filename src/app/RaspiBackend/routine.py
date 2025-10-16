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


# --- Routine Execution Logic ---

def execute_96well_plate_routine(routine_name, controller, exposure_time_us=DEFAULT_EXPOSURE_TIME_US):
    """
    Executes the complete 96-well plate scanning routine.
    
    Process:
    1. For each row (A-H):
       - Move along X axis (columns 1-12) and capture images
       - After completing each column, move X back to origin
       - Move Y down one row
    2. After all rows are complete, return Y axis to origin using home_y()
    """
    
    # Fetch routine parameters from database
    routine_data = fetch_routine_data(routine_name)
    num_wells_x = routine_data['num_wells_x']  # 12 columns
    num_wells_y = routine_data['num_wells_y']  # 8 rows
    
    logging.info(f"Starting 96-well plate routine: {routine_name}")
    logging.info(f"Grid dimensions: {num_wells_x} columns × {num_wells_y} rows")
    
    # Enable motors
    if not controller.enable_motors():
        logging.error("Failed to enable motors. Aborting routine.")
        return False
    
    wells_captured = 0
    total_wells = num_wells_x * num_wells_y
    
    try:
        # Iterate through each row
        for row in range(num_wells_y):
            row_letter = chr(65 + row)  # Convert to letter (A-H)
            logging.info(f"Starting row {row_letter}...")
            
            # Iterate through each column in the row
            for col in range(num_wells_x):
                well_id = well_id_from_position(row, col)
                logging.info(f"Processing well {well_id} ({wells_captured + 1}/{total_wells})")
                
                # Capture image of current well
                if not capture_well_image(well_id, exposure_time_us):
                    logging.warning(f"Failed to capture image for well {well_id}")
                
                wells_captured += 1
                ß
                # Move to next well in X direction (except on last column)
                if col < num_wells_x - 1:
                    if not controller.move_x_steps(DEFAULT_X_STEP, forward=True):
                        logging.error(f"Failed to move X to well {well_id}")
                        raise RuntimeError("X-axis movement failed")
            
            # After completing a row, return X axis to origin
            logging.info(f"Row {row_letter} complete. Returning X-axis to origin...")
            if not controller.home_x():
                logging.error("Failed to return X-axis to origin")
                raise RuntimeError("X-axis homing failed")
            
            # Move to next row in Y/Z direction (except after last row)
            if row < num_wells_y - 1:
                logging.info(f"Moving Y-axis down to row {chr(65 + row + 1)}...")
                if not controller.move_zy_steps(DEFAULT_Y_STEP, forward=True):
                    logging.error(f"Failed to move Y-axis after row {row_letter}")
                    raise RuntimeError("Y-axis movement failed")
        
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


# --- Main Entry Point ---

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
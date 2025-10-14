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
# 🚨 Changed to ttyUSB0
DEFAULT_SERIAL_PORT = '/dev/ttyUSB0'
BAUD_RATE = 9600
SERIAL_TIMEOUT = 5.0 

# General Configuration
DATABASE_FILE = '/home/dank/routine_data.db'
SAVED_PICTURES_DIR = Path('/home/dank/saved_pictures') 
CAMERA_SCRIPT_PATH = '/home/dank/backend/camera.py' 

# 🚨🚨 DEFAULT MOTOR SETTINGS (Set here for manual adjustment) 🚨🚨
DEFAULT_X_STEP = 10 
DEFAULT_Y_STEP = 10 
DEFAULT_EXPOSURE_TIME_US = 50000 

# --- Stepper Motor Controller Class ---

class StepperController:
    """
    Manages the state and serial communication for the Stepper Motors.
    """
    def __init__(self, port=DEFAULT_SERIAL_PORT, baud=BAUD_RATE):
        self.port = port
        self.baud = baud
        self.serial_conn = None
        self.is_connected = False
        self.current_steps = 400

    def connect(self):
        """Initializes the serial connection to the Arduino."""
        if self.is_connected and self.serial_conn:
            logging.info(f"Already connected to {self.port}.")
            return True, f"Already connected to {self.port}."
        
        try:
            logging.info(f"Attempting connection to {self.port}...")
            self.serial_conn = serial.Serial(self.port, self.baud, timeout=SERIAL_TIMEOUT)
            time.sleep(2) 
            self.is_connected = True
            logging.info(f"Successfully connected to {self.port}.")
            return True, f"Successfully connected to {self.port}."
        except serial.SerialException as e:
            self.is_connected = False
            logging.error(f"Failed to connect to {self.port}: {e}")
            return False, f"Failed to connect to {self.port}: {e}"

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
            logging.debug(f"Command sent: {command}")

            if wait_for_response:
                response_line = self.serial_conn.readline().decode('ascii').strip()
                if not response_line:
                    return False, f"No response received after {command} command (Timeout)."
                
                logging.debug(f"Response received: {response_line}")
                if "OK" in response_line or "Ready" in response_line:
                    return True, response_line
                else:
                    return False, f"Received non-success response: {response_line}"
            
            return True, "Command sent (No response expected)."

        except serial.SerialException as e:
            logging.error(f"Serial error while sending command {command}: {e}")
            return False, f"Serial error: {e}"
        except Exception as e:
            logging.error(f"Unexpected error while sending command {command}: {e}")
            return False, f"Unexpected error: {e}"

    # --- Motor Action Methods ---
    def home_x(self):
        """Homes the X motor to its origin. C command: 'H' (Assumed)."""
        logging.info("Executing: H (Home X-Axis)")
        return self.send_command("H")[0]

    def home_y(self):
        """Homes the Y motor (Z+Y parallel rail) to its origin. C command: 'h' (Assumed)."""
        logging.info("Executing: h (Home Y-Axis)")
        return self.send_command("h")[0]
        
    def set_steps(self, new_steps):
        """Sets the step size for the next move. C command: 'S' followed by value (e.g., 'S400')."""
        self.current_steps = new_steps
        command = f"S{new_steps}"
        logging.info(f"Setting step size to: {new_steps}")
        return self.send_command(command, wait_for_response=True)[0]
    
    def move_x(self, forward=True):
        """Moves the X motor. C commands: 'X' (forward), 'x' (backward)."""
        command = 'X' if forward else 'x'
        logging.info(f"Executing: {command} (X-Axis, {self.current_steps} steps)")
        return self.send_command(command)[0]

    def move_zy(self, forward=True):
        """Moves the Z+Y motors (used for plate switching AND row advance). C commands: 'A' (forward), 'a' (backward)."""
        command = 'A' if forward else 'a'
        logging.info(f"Executing: {command} (Z+Y-Axes, {self.current_steps} steps)")
        return self.send_command(command)[0]

    def enable_motors(self):
        """Enables all stepper motor drivers. C command: 'E'."""
        logging.info("Executing: E (ENABLE_ALL)")
        return self.send_command("E")[0]
    
    def disable_motors(self):
        """Disables all stepper motor drivers. C command: 'D'."""
        logging.info("Executing: D (DISABLE_ALL)")
        return self.send_command("D", wait_for_response=False)[0]


# --- Stepper Motor Controller Initialization ---
controller = StepperController()


# --- Utility Functions ---

def get_db_connection():
    """Establishes a connection to the SQLite database."""
    conn = sqlite3.connect(DATABASE_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def run_camera_script_routine(exposure_time: int, output_path: Path):
    """Calls camera.py with the specific exposure time and saves the picture."""
    command = [
        'python3', CAMERA_SCRIPT_PATH, '--mode', 'routine', 
        '--exposure', str(exposure_time), '--output-path', str(output_path)
    ]
    
    # 🚨 Changed µs to us
    print(f"  -> CAPTURE: Executing camera.py for {output_path.name} @ {exposure_time} us exposure time")
    
    try:
        # Check=True ensures subprocess.CalledProcessError is raised on non-zero exit code
        subprocess.run(command, capture_output=True, text=True, check=True)
        return True
    except subprocess.CalledProcessError as e:
        print(f"  ❌ CAPTURE ERROR: Camera script failed. Stderr:\n{e.stderr.strip()}")
        return False
    except FileNotFoundError:
        print(f"  ❌ CAPTURE ERROR: Python or {CAMERA_SCRIPT_PATH} not found.")
        return False

# --- Core Routine Execution Logic ---

def get_well_row_id(well_id: str) -> str:
    """Extracts the letter (row ID) from the well ID (e.g., 'B1' -> 'B')."""
    import re
    match = re.match(r"([a-zA-Z]+)", well_id)
    return match.group(0).upper() if match else ''

def execute_single_routine(routine_name: str, x_step_unit=DEFAULT_X_STEP, y_step_unit=DEFAULT_Y_STEP):
    """
    Fetches all well details and executes the movement, capture, and delay for each well,
    implementing row-by-row movement logic with skipping for stepAmount <= 0.
    """
    
    print(f"\n--- Single Routine Executor Started for: {routine_name} ---")

    # 0. Connect to Arduino
    success, message = controller.connect()
    if not success:
        print(f"FATAL ERROR: Could not connect to Arduino. Cannot run routine. Message: {message}")
        return

    # 1. Fetch Well Data (Ordered by plate and then by well ID to ensure A1, A2, B1, B2 sequence)
    conn = None
    well_data_records = []
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        query_wells = """
        SELECT plateNumber, wellId, stepAmount, delayBetweenStep, lightTime, exposureTime, switchPlate 
        FROM well_data
        WHERE filename = ?
        ORDER BY plateNumber ASC, wellId ASC
        """
        cursor.execute(query_wells, (routine_name,))
        well_data_records = cursor.fetchall()
        
        if not well_data_records:
            print(f"ERROR: No well parameters found in database for '{routine_name}'.")
    except sqlite3.Error as e:
        print(f"FATAL ERROR: Database error: {e}")
    finally:
        if conn:
            conn.close()

    # 2. Sequential Execution (wrapped in try/finally for motor safety)
    try:
        if not well_data_records:
            return

        controller.enable_motors() 
        
        current_plate = -1
        current_row_id = ''
        date_str = datetime.now().strftime("%Y-%m-%d")

        for record in well_data_records:
            plate_num = record['plateNumber']
            well_id = record['wellId']
            
            new_row_id = get_well_row_id(well_id) 

            # Access columns using [] and handle None
            step_amount = record['stepAmount'] if record['stepAmount'] is not None else 0
            delay_time = record['delayBetweenStep'] if record['delayBetweenStep'] is not None else 0
            exposure_time = record['exposureTime'] if record['exposureTime'] is not None else DEFAULT_EXPOSURE_TIME_US
            switch_plate = record['switchPlate'] if record['switchPlate'] is not None else 0
            
            # --- PLATE CHANGE LOGIC (Higher priority than row change) ---
            if plate_num != current_plate:
                if current_plate != -1 and switch_plate == 1:
                    print(f"\n--- PLATE SWITCH: Moving Z+Y for Plate {plate_num} ---")
                    controller.set_steps(y_step_unit) 
                    controller.move_zy(forward=True) # Z+Y movement for plate change
                
                print(f"\n--- Starting Routine Execution for Plate {plate_num} / Row {new_row_id} ---")
                current_plate = plate_num
                current_row_id = new_row_id
                
                # Create save directory
                plate_key = f"P{plate_num}"
                save_dir = SAVED_PICTURES_DIR / f"{routine_name}_{plate_key}" / date_str
                os.makedirs(save_dir, exist_ok=True)
                print(f"Pictures will be saved to: {save_dir}")
            
            # --- ROW CHANGE LOGIC (e.g., A1 -> B1) ---
            if new_row_id != current_row_id:
                print(f"\n--- ROW ADVANCE: Resetting X-Axis for Row {new_row_id} ---")
                
                # 1. Reset X-axis back to origin
                controller.home_x() 
                
                # 2. Move Z+Y axis down by DEFAULT_Y_STEP
                # Row advance is always 10 steps down (using DEFAULT_Y_STEP), as requested.
                controller.set_steps(DEFAULT_Y_STEP)
                controller.move_zy(forward=True) 
                
                current_row_id = new_row_id


            # --- WELL MOVEMENT/SKIPPING LOGIC ---
            
            # A. Move to the Well (X-axis movement)
            if step_amount > 0:
                # Set steps based on the well's stepAmount (this is the distance to the *next* well)
                controller.set_steps(step_amount)
                controller.move_x(forward=True)
                print(f"  ➡️ Moved X-Axis by {step_amount} steps to Well {well_id}")
            else:
                # If stepAmount is 0 or less, the well is skipped and no movement is executed for X.
                print(f"  ⏭️ Skipping X-axis move for Well {well_id} (stepAmount: {step_amount}).")
                
            
            # B. Take Picture (accounts for exposure time check)
            filename = f"{well_id}.jpg"
            output_path = save_dir / filename
            run_camera_script_routine(exposure_time, output_path)

            # C. Apply Delay (accounts for SQL delay)
            if delay_time > 0:
                print(f"  > Delaying for {delay_time} seconds...")
                time.sleep(delay_time)
            
            print(f"  ✅ Well {plate_num}-{well_id} completed.")
            
    except Exception as e:
        print(f"FATAL ERROR during routine execution: {e}")
        raise 
        
    finally:
        # 3. Finalization: Reset X and Y (Z+Y) to origin and disable motors
        print(f"\n--- Finalizing Routine: Resetting Motors and Disabling ---\n")
        controller.home_x()
        controller.home_y()
        controller.disable_motors() 
        controller.disconnect()
        print("Motors Disabled. Serial Connection Closed.")
        print(f"\n--- Single Routine Execution for {routine_name} Finished ---")


# --- Main Execution Block ---
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
        help=f"X-axis step size. Default: {DEFAULT_X_STEP}"
    )

    parser.add_argument(
        "--ystep",
        type=int,
        default=DEFAULT_Y_STEP,
        help=f"Y-axis step size. Default: {DEFAULT_Y_STEP}. Used for plate switching."
    )

    args = parser.parse_args()
    execute_single_routine(args.routine, args.xstep, args.ystep)
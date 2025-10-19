import os
import time
import sqlite3
import subprocess
import argparse 
from datetime import datetime
from pathlib import Path
import serial
import logging
import sys 

# ============================================================================
# CONFIGURATION
# ============================================================================

# Logging setup
logging.basicConfig(
    level=logging.INFO, 
    format='%(asctime)s - %(levelname)s - %(message)s'
)

# Serial Configuration
DEFAULT_SERIAL_PORT = '/dev/ttyUSB0'
BAUD_RATE = 9600
SERIAL_TIMEOUT = 1.5 

# File paths
DATABASE_FILE = '/home/dank/routine_data.db'
SAVED_PICTURES_DIR = Path('/home/dank/saved_pictures') 
CAMERA_SCRIPT_PATH = '/home/dank/backend/camera.py' 

# Motor Configuration
DEFAULT_X_STEP = 10          # Steps between columns
DEFAULT_Y_STEP = 10          # Steps between rows
DEFAULT_EXPOSURE_TIME_US = 50000


# ============================================================================
# DATABASE FUNCTIONS
# ============================================================================

def get_db_connection():
    """Establish connection to SQLite database."""
    conn = sqlite3.connect(DATABASE_FILE)
    conn.row_factory = sqlite3.Row
    return conn


def fetch_routine_data(routine_name):
    """
    Fetch routine metadata from database.
    
    Returns:
        dict: Contains num_wells_x (12) and num_wells_y (8)
    """
    logging.info(f"Fetching routine data: {routine_name}")
    return {
        'num_wells_x': 12,
        'num_wells_y': 8,
        'description': f"Data for {routine_name}"
    }


def fetch_wells_to_scan(routine_name, plate_number=1):
    """
    Fetch wells to scan from database.
    
    Wells with stepAmount = 0 are skipped (filtered out).
    
    Args:
        routine_name (str): Filename of the routine
        plate_number (int): Plate number to scan
        
    Returns:
        set: Well IDs to scan (e.g., {'A1', 'A2', 'B5'})
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT wellId FROM well_data
            WHERE filename = ? AND plateNumber = ? AND stepAmount != 0
        """, (routine_name, plate_number))
        
        rows = cursor.fetchall()
        conn.close()
        
        wells = {row['wellId'] for row in rows}
        logging.info(
            f"Fetched {len(wells)} wells for routine '{routine_name}', plate {plate_number}"
        )
        
        return wells
        
    except sqlite3.Error as e:
        logging.error(f"Database error: {e}")
        return set()


# ============================================================================
# CAMERA FUNCTIONS (in routine.py)
# ============================================================================

def capture_well_image(routine_name, well_id, exposure_time_us=DEFAULT_EXPOSURE_TIME_US):
    """
    Capture image of a well using the camera script.
    
    Args:
        routine_name (str): The name of the routine (used for subdirectory)
        well_id (str): Well identifier (e.g., 'A1')
        exposure_time_us (int): Exposure time in microseconds
        
    Returns:
        bool: True if successful, False otherwise
    """
    try:
        # --- Construct the required file path ---
        date_today = datetime.now().strftime("%Y-%m-%d") # Format: 2025-10-19
        
        # New directory: /home/dank/saved_pictures/routine_name/2025-10-19
        well_save_dir = SAVED_PICTURES_DIR / routine_name / date_today
        
        # New filename format: A1.jpg, B12.jpg
        image_filename = f"{well_id}.jpg" 
        image_path = well_save_dir / image_filename
        
        # Create directory if it doesn't exist (important before calling camera.py)
        well_save_dir.mkdir(parents=True, exist_ok=True)
        
        # --- Execute camera script with the full path ---
        command = [
            'python', CAMERA_SCRIPT_PATH,
            '--mode', 'routine',                                # Set routine mode
            '--exposure', str(exposure_time_us),
            '--output-path', str(image_path)                    # Pass the full, correct path
        ]
        
        logging.info(f"Capturing image for well {well_id} to: {image_path.relative_to(SAVED_PICTURES_DIR)}...")
        result = subprocess.run(
            command, 
            capture_output=True, 
            text=True, 
            timeout=30,
            # close_fds=True # Optional, often default, but can help
        )
        
        if result.returncode == 0:
            logging.info(f"Successfully captured and saved: {image_path}")
            return True
        else:
            logging.error(f"Camera failed for {well_id}: {result.stderr}")
            return False
            
    except subprocess.TimeoutExpired:
        logging.error(f"Camera timeout for {well_id}")
        return False
    except Exception as e:
        logging.error(f"Error capturing {well_id}: {e}")
        return False

# ============================================================================
# WELL POSITION FUNCTIONS
# ============================================================================

def well_id_from_position(row, col):
    """
    Convert row and column indices to well ID.
    
    Args:
        row (int): Row index (0-7)
        col (int): Column index (0-11)
        
    Returns:
        str: Well ID (e.g., 'A1', 'H12')
    """
    row_letter = chr(65 + row)
    well_number = col + 1
    return f"{row_letter}{well_number}"


def position_from_well_id(well_id):
    """
    Convert well ID to row and column indices.
    
    Args:
        well_id (str): Well ID (e.g., 'A1')
        
    Returns:
        tuple: (row_index, col_index)
    """
    row = ord(well_id[0]) - 65
    col = int(well_id[1:]) - 1
    return row, col


def get_wells_in_row(row_index, wells_to_scan):
    """
    Get all column indices in a row that need scanning.
    
    Args:
        row_index (int): Row index (0-7)
        wells_to_scan (set): Set of well IDs to scan
        
    Returns:
        list: Sorted column indices for this row
    """
    cols_in_row = []
    
    for col_index in range(12):
        well_id = well_id_from_position(row_index, col_index)
        if well_id in wells_to_scan:
            cols_in_row.append(col_index)
    
    return sorted(cols_in_row)


def get_rows_with_wells(wells_to_scan):
    """
    Get all row indices that have wells to scan.
    
    This pre-calculation allows skipping empty rows entirely.
    
    Args:
        wells_to_scan (set): Set of well IDs to scan
        
    Returns:
        list: Sorted row indices containing wells
    """
    rows_with_wells_set = set()
    
    for well_id in wells_to_scan:
        row, col = position_from_well_id(well_id)
        rows_with_wells_set.add(row)
    
    return sorted(list(rows_with_wells_set))


def calculate_x_steps(current_col, target_col):
    """
    Calculate X-axis steps needed to move between columns.
    
    Accounts for skipped columns in the calculation.
    
    Example:
        Col 0 to Col 3: 3 * 10 = 30 steps
        Col 0 to Col 5: 5 * 10 = 50 steps (skipped columns counted)
    
    Args:
        current_col (int): Current column index
        target_col (int): Target column index
        
    Returns:
        int: Steps to move
    """
    col_distance = abs(target_col - current_col)
    return col_distance * DEFAULT_X_STEP


# ============================================================================
# STEPPER MOTOR CONTROLLER
# ============================================================================

class StepperController:
    """
    Manages serial communication with stepper motor Arduino.
    Tracks position and provides movement commands.
    """
    
    def __init__(self, port=DEFAULT_SERIAL_PORT, baud=BAUD_RATE):
        self.port = port
        self.baud = baud
        self.serial_conn = None
        self.is_connected = False
        
        # Position tracking (in steps from origin)
        self.x_position_steps = 0  
        self.y_position_steps = 0

    def connect(self):
        """Establish serial connection to Arduino."""
        if self.is_connected and self.serial_conn:
            logging.info(f"Already connected to {self.port}")
            return True
        
        try:
            logging.info(f"Connecting to {self.port}...")
            self.serial_conn = serial.Serial(
                self.port, 
                self.baud, 
                timeout=SERIAL_TIMEOUT
            )
            time.sleep(2) 
            self.is_connected = True
            logging.info(f"Connected to {self.port}")
            return True
            
        except serial.SerialException as e:
            self.is_connected = False
            logging.error(f"Connection failed: {e}")
            return False

    def disconnect(self):
        """Close serial connection."""
        if self.serial_conn and self.is_connected:
            self.serial_conn.close()
            self.is_connected = False
            logging.info("Disconnected")
            return True
        return False

    def send_command(self, command, wait_for_response=True):
        """
        Send command to Arduino.
        
        Args:
            command (str): Command to send
            wait_for_response (bool): Wait for Arduino response
            
        Returns:
            tuple: (success, response_message)
        """
        if not self.is_connected or not self.serial_conn:
            return False, "Connection not active"
        
        try:
            full_command = (command + '\n').encode('ascii')
            self.serial_conn.write(full_command)
            time.sleep(0.1)
            
            if wait_for_response:
                response = self.serial_conn.readline().decode('ascii').strip()
                if response:
                    logging.debug(f"Command '{command}' -> {response}")
                    return True, response
                else:
                    logging.debug(f"Command '{command}' sent (no response)")
                    return True, "Command sent"
            
            return True, "Command sent"

        except serial.SerialException as e:
            logging.error(f"Serial error: {e}")
            return False, str(e)

    def _set_steps(self, num_steps):
        """Set step size for next movement."""
        self.current_steps = num_steps
        return self.send_command(f"S{num_steps}", wait_for_response=True)[0]

    def move_x(self, steps, forward=True):
        """
        Move X motor and update position.
        
        Args:
            steps (int): Number of steps to move
            forward (bool): Direction (True = forward, False = backward)
            
        Returns:
            bool: Success status
        """
        if steps <= 0:
            return True 

        self._set_steps(steps)
        command = 'x' if forward else 'X'
        success, _ = self.send_command(command)
        
        if success:
            self.x_position_steps += steps if forward else -steps
        return success

    def move_y(self, steps, forward=True):
        """
        Move Y motor and update position.
        
        Args:
            steps (int): Number of steps to move
            forward (bool): Direction (True = forward, False = backward)
            
        Returns:
            bool: Success status
        """
        if steps <= 0:
            return True 

        self._set_steps(steps)
        command = 'A' if forward else 'a'
        success, _ = self.send_command(command)
        
        if success:
            self.y_position_steps += steps if forward else -steps
        return success
    
    def home_x(self):
        """Return X motor to origin."""
        steps_to_move = abs(self.x_position_steps)
        
        if steps_to_move == 0:
            logging.info("X-axis already at origin")
            return True

        # Move opposite direction to return to origin
        forward_direction = self.x_position_steps < 0
        
        logging.info(f"X-homing: returning {steps_to_move} steps")
        success = self.move_x(steps_to_move, forward=forward_direction)

        if success:
            self.x_position_steps = 0 
            logging.info("X-axis homed")
        else:
            logging.error("X-homing failed")

        return success

    def home_y(self):
        """Return Y motor to origin."""
        steps_to_move = abs(self.y_position_steps)
        
        if steps_to_move == 0:
            logging.info("Y-axis already at origin")
            return True

        # Move opposite direction to return to origin
        forward_direction = self.y_position_steps < 0
        
        logging.info(f"Y-homing: returning {steps_to_move} steps")
        success = self.move_y(steps_to_move, forward=forward_direction)

        if success:
            self.y_position_steps = 0 
            logging.info("Y-axis homed")
        else:
            logging.error("Y-homing failed")
            
        return success

    def enable_motors(self):
        """Enable stepper motor drivers."""
        success, response = self.send_command("E", wait_for_response=True)
        logging.info(f"Motors enabled: {response}")
        return success
    
    def disable_motors(self):
        """Disable stepper motor drivers."""
        success, _ = self.send_command("D", wait_for_response=False)
        logging.info("Motors disabled")
        return success


# ============================================================================
# ROUTINE EXECUTION
# ============================================================================

def execute_96well_plate_routine(
    routine_name, 
    controller, 
    plate_number=1, 
    exposure_time_us=DEFAULT_EXPOSURE_TIME_US
):
    """
    Execute optimized 96-well plate scanning routine.
    
    Only visits wells marked for scanning in the database.
    Skips empty columns and rows to minimize movement time.
    
    Process:
    1. Fetch wells to scan from database
    2. Pre-calculate rows that have wells
    3. For each row with wells:
       - Move Y-axis to reach the row (skip empty rows)
       - For each column with wells:
         - Move X-axis to column
         - Capture image
       - Return X-axis to origin
    4. Return Y-axis to origin
    
    Args:
        routine_name (str): Name of routine to execute
        controller (StepperController): Motor controller instance
        plate_number (int): Plate number to scan
        exposure_time_us (int): Camera exposure time
        
    Returns:
        bool: True if successful, False otherwise
    """
    
    # Fetch data
    routine_data = fetch_routine_data(routine_name)
    wells_to_scan = fetch_wells_to_scan(routine_name, plate_number)
    rows_with_wells = get_rows_with_wells(wells_to_scan)
    
    logging.info(f"\n{'='*60}")
    logging.info(f"Starting routine: {routine_name}")
    logging.info(f"Plate: {plate_number}")
    logging.info(f"Total wells: {len(wells_to_scan)}")
    logging.info(f"Rows with wells: {[chr(65 + r) for r in rows_with_wells]}")
    logging.info(f"{'='*60}\n")
    
    # Enable motors
    if not controller.enable_motors():
        logging.warning("Motor enable failed, continuing anyway...")
    
    wells_captured = 0
    current_row_position = 0  # Current row position (0-7)
    
    try:
        # Process each row that has wells
        for row_index in rows_with_wells:
            row_letter = chr(65 + row_index)
            cols_in_row = get_wells_in_row(row_index, wells_to_scan)
            
            logging.info(f"\n--- Row {row_letter} ---")
            logging.info(f"Columns to scan: {[c + 1 for c in cols_in_row]}")
            
            # Move Y-axis to target row
            rows_to_move = row_index - current_row_position
            if rows_to_move > 0:
                y_steps = rows_to_move * DEFAULT_Y_STEP
                logging.info(f"Moving Y-axis {rows_to_move} rows ({y_steps} steps)...")
                
                if not controller.move_y(y_steps, forward=True):
                    logging.error("Y-axis movement failed")
                    raise RuntimeError("Y-axis movement failed")
            
            current_row_position = row_index
            current_col_position = 0  # Reset X position for new row
            
            # Process each column in this row
            for target_col in cols_in_row:
                well_id = well_id_from_position(row_index, target_col)
                wells_captured += 1
                
                # Move X-axis to target column
                x_steps = calculate_x_steps(current_col_position, target_col)
                if x_steps > 0:
                    direction = target_col > current_col_position
                    logging.info(
                        f"  Well {well_id} ({wells_captured}/{len(wells_to_scan)}) - "
                        f"Moving {x_steps} steps..."
                    )
                    
                    if not controller.move_x(x_steps, forward=direction):
                        logging.error(f"X-axis movement failed for {well_id}")
                        raise RuntimeError("X-axis movement failed")
                
                current_col_position = target_col
                
                # Capture image
                if not capture_well_image(routine_name, well_id, exposure_time_us): 
                    logging.warning(f"Image capture failed for {well_id}")
            
            # Return X-axis to origin after row
            logging.info(f"Returning X-axis to origin...")
            if not controller.home_x():
                logging.error("X-axis homing failed")
                raise RuntimeError("X-axis homing failed")
        
        # Return Y-axis to origin
        logging.info(f"\nReturning Y-axis to origin...")
        if not controller.home_y():
            logging.error("Y-axis homing failed")
            raise RuntimeError("Y-axis homing failed")
        
        logging.info(f"\n{'='*60}")
        logging.info(f"Routine completed! Captured {wells_captured} wells")
        logging.info(f"{'='*60}\n")
        
        return True
        
    except Exception as e:
        logging.error(f"Routine failed: {e}")
        return False
    
    finally:
        controller.disable_motors()


# ============================================================================
# MAIN
# ============================================================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Execute optimized 96-well plate scanning routine"
    )
    parser.add_argument(
        '--routine', 
        type=str, 
        default='default_96well', 
        help='Routine name (filename)'
    )
    parser.add_argument(
        '--plate', 
        type=int, 
        default=1,
        help='Plate number to scan'
    )
    parser.add_argument(
        '--port', 
        type=str, 
        default=DEFAULT_SERIAL_PORT,
        help='Serial port for motor controller'
    )
    parser.add_argument(
        '--exposure', 
        type=int, 
        default=DEFAULT_EXPOSURE_TIME_US,
        help='Camera exposure time (microseconds)'
    )
    
    args = parser.parse_args()
    
    # Initialize controller
    controller = StepperController(port=args.port)
    
    # Connect
    if not controller.connect():
        logging.error("Failed to connect to motor controller")
        sys.exit(1)
    
    try:
        # Execute routine
        success = execute_96well_plate_routine(
            routine_name=args.routine,
            controller=controller,
            plate_number=args.plate,
            exposure_time_us=args.exposure
        )
        
        sys.exit(0 if success else 1)
        
    finally:
        controller.disconnect()
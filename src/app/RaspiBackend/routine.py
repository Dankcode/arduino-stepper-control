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
from config import (
    BAUD_RATE,
    CAMERA_SCRIPT_PATH,
    DATABASE_FILE,
    DEFAULT_EXPOSURE_TIME_US,
    LIGHT_SCRIPT_PATH,
    PICTURES_DIR,
    SERIAL_PORT,
    SERIAL_TIMEOUT,
)

# ============================================================================
# CONFIGURATION
# ============================================================================

logging.basicConfig(
    level=logging.INFO, 
    format='%(asctime)s - %(levelname)s - %(message)s'
)

DEFAULT_SERIAL_PORT = SERIAL_PORT
SAVED_PICTURES_DIR = PICTURES_DIR

DEFAULT_X_STEP = 20
DEFAULT_Y_STEP = 20
# ============================================================================
# DATABASE FUNCTIONS
# ============================================================================

def get_db_connection():
    conn = sqlite3.connect(DATABASE_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def fetch_routine_data(routine_name):
    return {
        'num_wells_x': 12,
        'num_wells_y': 8,
        'description': f"Data for {routine_name}"
    }

def fetch_wells_to_scan(routine_name, plate_number=1):
    """
    Fetches wells AND their associated lightTime from the database.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT wellId, lightTime FROM well_data
            WHERE filename = ? AND plateNumber = ? AND stepAmount != 0
        """, (routine_name, plate_number))
        
        rows = cursor.fetchall()
        conn.close()
        
        # Return a dictionary {wellId: lightTime}
        wells = {row['wellId']: row['lightTime'] for row in rows}
        logging.info(f"Fetched {len(wells)} wells for routine '{routine_name}'")
        return wells
        
    except sqlite3.Error as e:
        logging.error(f"Database error: {e}")
        return {}

# ============================================================================
# HARDWARE COMMAND FUNCTIONS
# ============================================================================

def trigger_blue_light(duration_sec):
    """
    Calls b_light.py to pulse the GPIO 21 light.
    Updated: Now treats input as seconds directly.
    """
    if duration_sec <= 0:
        return True
    
    try:
        logging.info(f"Triggering blue light for {duration_sec}s...")
        # Direct pass-through of seconds
        result = subprocess.run(
            [sys.executable, str(LIGHT_SCRIPT_PATH), 'automate', str(duration_sec)],
            capture_output=True,
            text=True,
            timeout=float(duration_sec) + 5
        )
        return result.returncode == 0
    except Exception as e:
        logging.error(f"Failed to trigger blue light: {e}")
        return False
    
def capture_well_image(routine_name, well_id, exposure_time_us=DEFAULT_EXPOSURE_TIME_US):
    try:
        date_today = datetime.now().strftime("%Y-%m-%d")
        well_save_dir = SAVED_PICTURES_DIR / routine_name / date_today
        image_filename = f"{well_id}.jpg" 
        image_path = well_save_dir / image_filename
        
        well_save_dir.mkdir(parents=True, exist_ok=True)
        
        command = [
            sys.executable, str(CAMERA_SCRIPT_PATH),
            '--mode', 'routine',
            '--exposure', str(exposure_time_us),
            '--output-path', str(image_path)
        ]
        
        result = subprocess.run(command, capture_output=True, text=True, timeout=30)
        
        if result.returncode == 0:
            logging.info(f"Saved: {image_path}")
            return True
        else:
            logging.error(f"Camera error: {result.stderr}")
            return False
    except Exception as e:
        logging.error(f"Error capturing {well_id}: {e}")
        return False

# ============================================================================
# WELL POSITIONING HELPER FUNCTIONS
# ============================================================================

def well_id_from_position(row, col):
    return f"{chr(65 + row)}{col + 1}"

def position_from_well_id(well_id):
    row = ord(well_id[0]) - 65
    col = int(well_id[1:]) - 1
    return row, col

def calculate_x_steps(current_col, target_col):
    return abs(target_col - current_col) * DEFAULT_X_STEP

# ============================================================================
# STEPPER MOTOR CONTROLLER
# ============================================================================

class StepperController:
    def __init__(self, port=DEFAULT_SERIAL_PORT, baud=BAUD_RATE):
        self.port = port
        self.baud = baud
        self.serial_conn = None
        self.is_connected = False
        self.x_position_steps = 0  
        self.y_position_steps = 0

    def connect(self):
        try:
            self.serial_conn = serial.Serial(self.port, self.baud, timeout=SERIAL_TIMEOUT)
            time.sleep(2) 
            self.is_connected = True
            logging.info(f"Connected to Arduino on {self.port}")
            return True
        except Exception as e:
            logging.error(f"Serial Connection Error: {e}")
            return False

    def disconnect(self):
        if self.serial_conn: self.serial_conn.close()

    def send_command(self, command, wait_for_response=True):
        if not self.is_connected: return False, "Not connected"
        self.serial_conn.write((command + '\n').encode('ascii'))
        if wait_for_response:
            return True, self.serial_conn.readline().decode('ascii').strip()
        return True, "Sent"

    def move_x(self, steps, forward=True):
        if steps <= 0: return True 
        self.send_command(f"S{steps}")
        success, _ = self.send_command('X' if forward else 'x')
        if success: self.x_position_steps += steps if forward else -steps
        return success

    def move_y(self, steps, forward=True):
        if steps <= 0: return True 
        self.send_command(f"S{steps}")
        success, _ = self.send_command('A' if forward else 'a')
        if success: self.y_position_steps += steps if forward else -steps
        return success
    
    def home_x(self):
        success = self.move_x(abs(self.x_position_steps), forward=(self.x_position_steps < 0))
        if success: self.x_position_steps = 0
        return success

    def home_y(self):
        success = self.move_y(abs(self.y_position_steps), forward=(self.y_position_steps < 0))
        if success: self.y_position_steps = 0
        return success

    def enable_motors(self): return self.send_command("E")[0]
    def disable_motors(self): return self.send_command("D", False)[0]

# ============================================================================
# ROUTINE EXECUTION
# ============================================================================

def execute_96well_plate_routine(routine_name, controller, plate_number=1, exposure_time_us=DEFAULT_EXPOSURE_TIME_US):
    # Fetch dictionary of {wellId: lightTime}
    wells_data = fetch_wells_to_scan(routine_name, plate_number)
    wells_to_scan = set(wells_data.keys())
    
    # Pre-calculate rows to skip empty ones
    rows_with_wells = sorted(list({position_from_well_id(w)[0] for w in wells_to_scan}))
    
    controller.enable_motors()
    current_row = 0
    current_col = 0
    wells_captured = 0

    try:
        for row_idx in rows_with_wells:
            # Move Y to row
            y_move = row_idx - current_row
            if y_move > 0:
                controller.move_y(y_move * DEFAULT_Y_STEP, forward=True)
            current_row = row_idx

            # Find columns in this row that need scanning. Move in the nearest
            # direction from the current column to avoid homing after each row.
            cols_in_row = sorted([position_from_well_id(w)[1] for w in wells_to_scan if position_from_well_id(w)[0] == row_idx])
            if cols_in_row and abs(cols_in_row[-1] - current_col) < abs(cols_in_row[0] - current_col):
                cols_in_row.reverse()
            
            for col_idx in cols_in_row:
                well_id = well_id_from_position(row_idx, col_idx)
                
                # Move X to column
                x_delta = col_idx - current_col
                x_move = abs(x_delta) * DEFAULT_X_STEP
                if x_move > 0:
                    controller.move_x(x_move, forward=x_delta > 0)
                current_col = col_idx

                # --- STEP: Blue Light Pulse ---
                # Get lightTime from our database fetch (ms)
                l_time = wells_data.get(well_id, 0)
                if l_time > 0:
                    trigger_blue_light(l_time)

                # --- STEP: Image Capture ---
                capture_well_image(routine_name, well_id, exposure_time_us)
                wells_captured += 1
        controller.home_y()
        controller.home_x()
        return True

    except Exception as e:
        logging.error(f"Routine Error: {e}")
        return False
    finally:
        controller.disable_motors()

# ============================================================================
# MAIN
# ============================================================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--routine', type=str, default='default_96well')
    parser.add_argument('--plate', type=int, default=1)
    parser.add_argument('--port', type=str, default=DEFAULT_SERIAL_PORT)
    parser.add_argument('--exposure', type=int, default=DEFAULT_EXPOSURE_TIME_US)
    args = parser.parse_args()
    
    controller = StepperController(port=args.port)
    if not controller.connect(): sys.exit(1)
    
    try:
        success = execute_96well_plate_routine(args.routine, controller, args.plate, args.exposure)
        sys.exit(0 if success else 1)
    finally:
        controller.disconnect()

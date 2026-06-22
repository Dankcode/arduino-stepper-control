import serial
import threading
import time
import logging # Import logging module for better error tracing
from config import BAUD_RATE, SERIAL_PORT, SERIAL_TIMEOUT

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Configuration ---
# IMPORTANT: Configure the Arduino serial port with STEPPER_SERIAL_PORT.
# Common ports: '/dev/ttyACM0' (Linux/Pi), 'COM3' (Windows), '/dev/tty.usbmodemXXXX' (Mac)
DEFAULT_SERIAL_PORT = SERIAL_PORT

class StepperController:
    """
    Manages the state and serial communication for the Stepper Motors.
    """
    def __init__(self, port=DEFAULT_SERIAL_PORT, baud=BAUD_RATE):
        self.port = port
        self.baud = baud
        self.serial_conn = None
        self.is_connected = False
        self.current_steps = 400 # Default step value, initialized to 400 for consistency

    def connect(self):
        """Initializes the serial connection to the Arduino."""
        if self.is_connected and self.serial_conn:
            logging.info(f"Already connected to {self.port}.")
            return True, f"Already connected to {self.port}."
        
        try:
            logging.info(f"Attempting connection to {self.port} at {self.baud} baud...")
            self.serial_conn = serial.Serial(
                self.port, 
                self.baud, 
                timeout=SERIAL_TIMEOUT
            )
            time.sleep(2) # Wait for Arduino to reset after connection
            
            # Flush buffers to clear any old data
            self.serial_conn.flushInput()
            self.serial_conn.flushOutput()
            
            self.is_connected = True
            logging.info(f"Successfully connected to Arduino on {self.port}")
            return True, f"Successfully connected to Arduino on {self.port}"
        except serial.SerialException as e:
            self.is_connected = False
            self.serial_conn = None
            logging.error(f"Failed to connect on {self.port}. Error: {e}")
            return False, f"Failed to connect on {self.port}. Error: {e}"

    def disconnect(self):
        """Closes the serial connection."""
        if self.serial_conn and self.is_connected:
            self.serial_conn.close()
            self.is_connected = False
            self.serial_conn = None
            logging.info("Successfully disconnected.")
            return True, "Successfully disconnected."
        return True, "Controller was already disconnected."

    def send_command(self, command_str):
        """
        Sends a command string to the Arduino (e.g., 'X', 'a', 'S400')
        and waits for the Arduino's response.
        """
        if not self.is_connected or not self.serial_conn:
            logging.warning(f"Failed to send command '{command_str}': Controller is not connected.")
            return False, "Controller is not connected."

        try:
            # 1. Send Command (The C code expects a newline termination)
            full_command = f"{command_str}\n"
            self.serial_conn.write(full_command.encode('utf-8'))
            logging.info(f"SENT: {command_str}")
            
            # 2. Read Response (Blocking read until newline or timeout)
            # This captures the first line of the Arduino's response, e.g., "Motors enabled\n"
            response = self.serial_conn.readline().decode('utf-8').strip()
            
            # 3. Flush the remaining lines (if any) but don't check them.
            # This prevents the next command from reading old, leftover output.
            time.sleep(0.1) # Small pause to let the last byte arrive
            self.serial_conn.flushInput() 
            
            # 4. Process Response
            if not response:
                logging.error(f"Serial read timeout. No response from Arduino after command: {command_str}")
                return False, "Serial read timeout. No response from Arduino."

            # Success is determined by receiving ANY response from the Arduino within the timeout
            logging.info(f"RECEIVED (Confirmation line): {response}")
            return True, f"Command sent and confirmed by response: {response}"
                
        except serial.SerialTimeoutException:
            logging.error(f"Serial read timeout for command: {command_str}")
            return False, "Serial read timeout. No response from Arduino."
        except Exception as e:
            logging.critical(f"Unexpected Serial communication error for command '{command_str}': {e}")
            return False, f"Serial communication error: {e}"

    # --- Manual Control Methods (Now sending single-character commands) ---

    def move_x(self, forward=True):
        """Moves the X-axis motor. C commands: 'X' (forward), 'x' (backward)."""
        command = 'X' if forward else 'x'
        logging.info(f"Executing: {command} (X-Axis)")
        success, message = self.send_command(command)
        return success

    def move_zy(self, forward=True):
        """Moves the Z+Y motors simultaneously. C commands: 'A' (forward), 'a' (backward)."""
        command = 'A' if forward else 'a'
        logging.info(f"Executing: {command} (Z+Y-Axes)")
        success, message = self.send_command(command)
        return success

    def enable_motors(self):
        """Enables all stepper motor drivers. C command: 'E'."""
        logging.info("Executing: E (ENABLE_ALL)")
        return self.send_command("E")[0]
    
    def disable_motors(self):
        """Disables all stepper motor drivers. C command: 'D'."""
        logging.info("Executing: D (DISABLE_ALL)")
        return self.send_command("D")[0]

    def test_motors(self):
        """Runs a short test sequence. C command: 'T'."""
        logging.info("Executing: T (TEST)")
        return self.send_command("T")[0]
        
    def set_steps(self, new_steps):
        """
        Sets the step size for the next manual move. 
        C command: 'S' followed by the integer value (e.g., 'S400').
        """
        if new_steps <= 0:
            logging.warning(f"Rejected invalid step size: {new_steps}")
            return False

        self.current_steps = new_steps
        command = f"S{new_steps}"
        logging.info(f"Step size set internally and sent to Arduino: {new_steps}")
        # Send the command to the Arduino
        success, message = self.send_command(command)
        return success

# --- Global Initialization (The objects your backend file imports) ---
controller_lock = threading.Lock()
global_controller = StepperController()
        

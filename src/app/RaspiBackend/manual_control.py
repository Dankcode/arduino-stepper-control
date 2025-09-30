import serial
import threading
import time

# --- Configuration ---
# IMPORTANT: Update this to your Arduino's serial port!
# Common ports: '/dev/ttyACM0' (Linux/Pi), 'COM3' (Windows), '/dev/tty.usbmodemXXXX' (Mac)
DEFAULT_SERIAL_PORT = '/dev/ttyUSB0'
BAUD_RATE = 9600
SERIAL_TIMEOUT = 1  # Timeout for serial read/write operations

class StepperController:
    """
    Manages the state and serial communication for the Stepper Motors.
    """
    def __init__(self, port=DEFAULT_SERIAL_PORT, baud=BAUD_RATE):
        self.port = port
        self.baud = baud
        self.serial_conn = None
        self.is_connected = False
        self.current_steps = 0 # Example state: Tracks total steps taken

    def connect(self):
        """Initializes the serial connection to the Arduino."""
        if self.is_connected and self.serial_conn:
            return True, f"Already connected to {self.port}."
        
        try:
            self.serial_conn = serial.Serial(
                self.port, 
                self.baud, 
                timeout=SERIAL_TIMEOUT
            )
            time.sleep(2) # Wait for Arduino to reset after connection
            self.is_connected = True
            return True, f"Successfully connected to Arduino on {self.port}"
        except serial.SerialException as e:
            self.is_connected = False
            self.serial_conn = None
            return False, f"Failed to connect on {self.port}. Error: {e}"

    def disconnect(self):
        """Closes the serial connection."""
        if self.serial_conn and self.is_connected:
            self.serial_conn.close()
            self.is_connected = False
            self.serial_conn = None
            return True, "Successfully disconnected."
        return True, "Controller was already disconnected."

    def send_command(self, command_str):
        """Sends a command string to the Arduino and waits for confirmation."""
        if not self.is_connected or not self.serial_conn:
            return False, "Controller is not connected."

        try:
            # Send the command followed by a newline character
            self.serial_conn.write(f"{command_str}\n".encode('utf-8'))
            
            # Wait for a response (e.g., 'OK' or 'ERROR') from the Arduino
            response = self.serial_conn.readline().decode('utf-8').strip()
            
            if response == "OK":
                return True, "Command confirmed by Arduino."
            else:
                return False, f"Arduino error: {response}"
        except serial.SerialTimeoutException:
            return False, "Serial read timeout. No response from Arduino."
        except Exception as e:
            return False, f"Serial communication error: {e}"

    # --- Manual Control Methods (Called by Flask Routes) ---

    def move_x(self, forward=True):
        """Moves the X-axis motor."""
        command = f"MOVE_X{'F' if forward else 'B'}:{self.current_steps}"
        success, message = self.send_command(command)
        
        # If movement is successful, update internal step count (for demonstration)
        if success:
            self.current_steps += self.current_steps if forward else -self.current_steps
        return success

    def move_zy(self, forward=True):
        """Moves the Z+Y motors simultaneously."""
        command = f"MOVE_ZY{'F' if forward else 'B'}:{self.current_steps}"
        success, message = self.send_command(command)
        return success

    def enable_motors(self):
        """Enables all stepper motor drivers."""
        return self.send_command("ENABLE_ALL")[0]
    
    def disable_motors(self):
        """Disables all stepper motor drivers."""
        return self.send_command("DISABLE_ALL")[0]

    def test_motors(self):
        """Runs a short test sequence."""
        return self.send_command("TEST")[0]
    
    def set_steps(self, new_steps):
        """Sets the step size for the next manual move."""
        self.current_steps = new_steps
        # Note: Sending this value to Arduino is optional, depending on your sketch
        return True
        
# --- Global Initialization (The objects your backend file imports) ---
controller_lock = threading.Lock()
global_controller = StepperController()

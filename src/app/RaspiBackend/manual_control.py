import serial
import time
import sys
import threading
import atexit

# --- Configuration ---
# IMPORTANT: Update this line to match the port of your Arduino on the Pi Zero
# Typical ports are /dev/ttyACM0 (for Uno/Mega) or /dev/ttyUSB0 (for clones/adapters)
DEFAULT_PORT = '/dev/ttyUSB0' 
BAUD_RATE = 9600
INITIAL_STEPS = 400

# Global instance to manage the connection, ensuring only one serial port is open
# This is crucial for both CLI and API usage.
global_controller = None
controller_lock = threading.Lock() # Lock for thread-safe access to the serial connection

class StepperController:
    """
    Manages the serial connection and state for the Arduino stepper motor control.
    """
    def __init__(self, port=DEFAULT_PORT, baud=BAUD_RATE):
        self.port = port
        self.baud = baud
        self.serial_connection = None
        self.current_steps = INITIAL_STEPS
        self.is_connected = False
        self.read_thread = None
        self.stop_event = threading.Event()
        atexit.register(self.disconnect) # Ensure disconnect runs on program exit

    def start_read_thread(self):
        """Starts a background thread to continuously read data from the Arduino."""
        if self.read_thread is None or not self.read_thread.is_alive():
            self.stop_event.clear()
            self.read_thread = threading.Thread(target=self._serial_reader, daemon=True)
            self.read_thread.start()
            print("Background reader started.")

    def _serial_reader(self):
        """Reads and prints data received from the Arduino."""
        while not self.stop_event.is_set():
            try:
                if self.serial_connection and self.serial_connection.in_waiting:
                    line = self.serial_connection.readline().decode('utf-8', errors='ignore').strip()
                    if line:
                        print(f"← Arduino (Async): {line}", file=sys.stderr)
                time.sleep(0.01) # Small delay to prevent high CPU usage
            except serial.SerialException as e:
                # This usually means the device was unplugged
                if self.is_connected:
                    print(f"Serial port error in reader thread: {e}", file=sys.stderr)
                    self.disconnect()
                break
            except Exception as e:
                print(f"Unexpected error in reader thread: {e}", file=sys.stderr)
                break
        print("Background reader stopped.")

    def connect(self):
        """Initializes and opens the serial connection."""
        with controller_lock:
            if self.is_connected:
                print("Connection already open.")
                return True
                
            try:
                print(f"Attempting to connect to {self.port} at {self.baud}...")
                
                # Initialize serial connection
                self.serial_connection = serial.Serial(
                    port=self.port,
                    baudrate=self.baud,
                    timeout=1 # Read timeout in seconds
                )
                
                # Wait for the Arduino to reset after connecting (crucial)
                time.sleep(2) 
                
                self.is_connected = True
                print("✅ Connection successful. Motors should be initialized.")
                
                # Start the asynchronous reader thread
                self.start_read_thread()
                
                # Immediately send the initial step amount to the Arduino
                self.update_step_amount(self.current_steps)
                
                return True
            except serial.SerialException as e:
                print(f"❌ ERROR: Could not open serial port {self.port}.")
                print("Please ensure the Arduino is plugged in and the port name is correct.")
                print(f"Details: {e}")
                self.is_connected = False
                self.serial_connection = None
                return False

    def disconnect(self):
        """Closes the serial connection."""
        with controller_lock:
            if self.serial_connection and self.is_connected:
                # Signal the reader thread to stop
                self.stop_event.set()
                if self.read_thread and self.read_thread.is_alive():
                    self.read_thread.join(timeout=1) # Wait for thread to finish

                try:
                    self.serial_connection.close()
                    self.is_connected = False
                    print("🔌 Disconnected successfully.")
                except Exception as e:
                    print(f"Warning: Could not close port cleanly: {e}")
            else:
                print("Not currently connected.")

    def send_command(self, command, expect_response=False):
        """Sends a single character command."""
        if not self.is_connected:
            return False

        with controller_lock:
            try:
                # Send command as bytes
                self.serial_connection.write(command.encode('utf-8'))
                self.serial_connection.flush()
                return True
            
            except Exception as e:
                print(f"❌ Error sending command '{command}': {e}")
                # Attempt to close connection on error
                self.disconnect()
                return False

    def update_step_amount(self, steps):
        """
        Sends the 'S' command to the Arduino to update the default step amount.
        Command format: S<value>\n (e.g., S1000\n)
        """
        try:
            steps = int(steps)
            if steps <= 0:
                print("Step amount must be positive.")
                return False

            self.current_steps = steps
            # Construct command: 'S' + number + newline character
            command = f"S{steps}\n" 
            print(f"→ Sending step update: {steps}")
            return self.send_command(command, expect_response=True)
            
        except ValueError:
            print("Invalid input. Please enter a number for steps.")
            return False

    # --- Motor Movement Methods (Mapping to UI Buttons/Endpoints) ---

    def move_x(self, forward=True):
        """Sends X (forward) or x (backward) command."""
        cmd = 'X' if forward else 'x'
        print(f"→ Moving X {'Forward' if forward else 'Backward'}")
        return self.send_command(cmd)

    def move_zy(self, forward=True):
        """Sends A (forward) or a (backward) command."""
        cmd = 'A' if forward else 'a'
        print(f"→ Moving Z+Y {'Forward' if forward else 'Backward'} simultaneously")
        return self.send_command(cmd)

    def enable_motors(self):
        """Sends E (Enable) command."""
        print("→ Enabling Motors")
        return self.send_command('E')

    def disable_motors(self):
        """Sends D (Disable) command."""
        print("→ Disabling Motors")
        return self.send_command('D')

    def test_motors(self):
        """Sends T (Test) command."""
        print("→ Running Test")
        return self.send_command('T')

def display_menu(controller):
    """Displays the interactive CLI menu."""
    status = "CONNECTED" if controller.is_connected else "DISCONNECTED"
    port_status = f"Port: {controller.port} | Status: {status} | Steps: {controller.current_steps}"
    
    print("\n" + "="*50)
    print("      Stepper Motor CLI Control (Arduino via Pi Zero)")
    print(f"          {port_status}")
    print("="*50)
    print("  CONNECT/STATUS:")
    print("    1. connect       (Connect to Arduino)")
    print("    2. disconnect    (Close connection)")
    print("    3. set <steps>   (e.g., set 1000 to change step amount)")
    print("  MOVEMENT COMMANDS:")
    print("    X / x            (X-Axis Forward / Backward)")
    print("    A / a            (Z+Y Axes Forward / Backward)")
    print("  POWER & UTILITY:")
    print("    E                (Enable Motors)")
    print("    D                (Disable Motors)")
    print("    T                (Test Connection)")
    print("    Q / quit         (Quit application)")
    print("="*50)
    return input("Enter command: ").strip().lower()

def run_cli():
    """Main function to run the command-line interface."""
    global global_controller
    
    # Initialize controller instance if it doesn't exist
    if global_controller is None:
        global_controller = StepperController()

    controller = global_controller
    
    # Check for custom port passed as command line argument
    if len(sys.argv) > 1:
        controller.port = sys.argv[1]
        print(f"Using custom port: {controller.port}")

    # Initial connection attempt
    controller.connect()

    try:
        while True:
            user_input = display_menu(controller)

            if user_input in ('q', 'quit'):
                break
            
            # Handle multi-argument commands (like 'set 1000')
            if user_input.startswith('set '):
                try:
                    steps_value = int(user_input.split()[1])
                    controller.update_step_amount(steps_value)
                except (IndexError, ValueError):
                    print("Usage: set <integer>")
                continue
            
            # Handle single-character commands
            if len(user_input) == 1:
                cmd = user_input.upper()
                if cmd == '1':
                    controller.connect()
                elif cmd == '2':
                    controller.disconnect()
                elif cmd == 'X':
                    controller.move_x(forward=True)
                elif cmd == 'x':
                    controller.move_x(forward=False)
                elif cmd == 'A':
                    controller.move_zy(forward=True)
                elif cmd == 'a':
                    controller.move_zy(forward=False)
                elif cmd == 'E':
                    controller.enable_motors()
                elif cmd == 'D':
                    controller.disable_motors()
                elif cmd == 'T':
                    controller.test_motors()
                else:
                    print("Unknown command.")
            elif user_input == 'connect':
                controller.connect()
            elif user_input == 'disconnect':
                controller.disconnect()
            else:
                print("Unknown command. Please use the menu options.")

    except KeyboardInterrupt:
        print("\n\nProgram interrupted.")
        
    finally:
        # Ensure connection is closed cleanly upon exiting
        controller.disconnect()
        print("Application shutting down.")

# --- Main CLI Loop ---
if __name__ == "__main__":
    run_cli()

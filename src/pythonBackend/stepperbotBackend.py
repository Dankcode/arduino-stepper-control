import serial
import time
from flask import Flask, request, jsonify
from flask_cors import CORS # Import CORS for cross-origin requests

app = Flask(__name__)
CORS(app) # Enable CORS for all routes

# Initialize serial connection
# IMPORTANT: Adjust 'COM4' to your Arduino's serial port.
# On Linux/macOS, it might be something like '/dev/ttyACM0' or '/dev/ttyUSB0'.
# Ensure the baud rate (9600) matches your Arduino sketch.
try:
    arduino = serial.Serial('COM4', 9600, timeout=1)
    time.sleep(2)  # Wait for the connection to establish
    print("Serial connection to Arduino established.")
except serial.SerialException as e:
    print(f"Error establishing serial connection: {e}")
    print("Please check if the Arduino is connected and the port is correct.")
    arduino = None # Set arduino to None if connection fails

# Function to send commands to the Arduino
def send_command_to_arduino(command, steps=None):
    if arduino is None:
        print("Arduino not connected. Cannot send command.")
        return False

    try:
        if steps is not None:
            # Send steps as a string (e.g., "S500" for 500 steps)
            # Ensure your Arduino sketch can parse this "S" prefix for steps.
            arduino.write(f"S{steps}".encode())
            time.sleep(0.1) # Small delay to ensure steps are processed before command

        arduino.write(command.encode())
        print(f"Sent command: {command} (Steps: {steps if steps is not None else 'N/A'})")
        return True
    except Exception as e:
        print(f"Error sending command to Arduino: {e}")
        return False

@app.route('/')
def home():
    return "CNC Motor Control Backend is running!"

@app.route('/command', methods=['POST'])
def handle_manual_control():
    data = request.json
    command = data.get('command')
    steps = data.get('steps')
    # You can reuse send_command_to_arduino or implement specific logic here
    if not command:
        return jsonify({"status": "error", "message": "No command provided"}), 400

    success = send_command_to_arduino(command, steps)
    if success:
        return jsonify({"status": "success", "message": f"Manual command '{command}' sent."}), 200
    else:
        return jsonify({"status": "error", "message": f"Failed to send manual command '{command}'."}), 500

@app.route('/update_steps', methods=['POST'])
def update_steps():
    data = request.json
    steps = data.get('steps')

    if steps is None:
        return jsonify({"status": "error", "message": "No steps provided"}), 400

    try:
        steps = int(steps)
        if steps <= 0:
            raise ValueError("Steps must be a positive integer")
        
        # In this setup, 'update_steps' simply confirms the new step amount
        # The actual sending of steps with a command happens in handle_command
        # We can optionally send a dummy command or just acknowledge
        # For now, we'll just acknowledge the update.
        print(f"Frontend requested step amount update to: {steps}")
        return jsonify({"status": "success", "message": f"Step amount updated to {steps}"}), 200
    except ValueError as e:
        return jsonify({"status": "error", "message": str(e)}), 400

if __name__ == '__main__':
    # Run the Flask app
    # Host '0.0.0.0' makes it accessible from other devices on your network
    # if your Next.js app is running on a different machine.
    # Port 5000 is a common default for Flask.
    app.run(host='0.0.0.0', port=5000, debug=True)

    # This part will only execute if the Flask app stops (e.g., Ctrl+C)
    if arduino and arduino.is_open:
        arduino.close()
        print("Serial connection closed.")

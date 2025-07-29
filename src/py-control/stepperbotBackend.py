from flask import Flask, request, jsonify
import serial
import time

app = Flask(__name__)

# Initialize serial connection (adjust the port as necessary)
arduino = serial.Serial('COM4', 9600, timeout=1)
time.sleep(2)  # Wait for the connection to establish

# Function to send commands to the Arduino
def send_command(command, steps=None):
    if steps is not None:
        # Send steps as a string (e.g., "S500" for 500 steps)
        arduino.write(f"S{steps}".encode())
    arduino.write(command.encode())

# Function to execute a routine
def execute_routine(routine):
    for step in routine:
        command = step["command"]
        steps = step.get("steps", None)
        time_to_wait = step.get("timeToWait", 0)  # Default to 0 if not provided

        send_command(command, steps)
        time.sleep(time_to_wait / 1000)  # Convert milliseconds to seconds
    return "Routine executed successfully"

# API endpoint to run the routine
@app.route('/run-routine', methods=['POST'])
def run_routine():
    data = request.json
    routine = data.get("routine", [])
    print(data)
    if not routine:
        return jsonify({"error": "No routine provided"}), 400
    result = execute_routine(routine)
    return jsonify({"message": result})

# Start the Flask server
if __name__ == '__main__':
    app.run(port=5000)
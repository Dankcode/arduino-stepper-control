from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import serial
import time
import threading
import atexit

app = Flask(__name__)
CORS(app)  # Enable CORS for Next.js frontend

# Global variables
arduino = None
current_steps = 400  # Default step amount
serial_lock = threading.Lock()
SERIAL_PORT = os.getenv("STEPPER_SERIAL_PORT", os.getenv("ARDUINO_SERIAL_PORT", "/dev/ttyUSB0"))

def initialize_arduino():
    """Initialize the Arduino serial connection"""
    global arduino
    try:
        arduino = serial.Serial(SERIAL_PORT, 9600, timeout=1)
        time.sleep(2)  # Wait for the connection to establish
        print("Arduino connected successfully")
        return True
    except Exception as e:
        print(f"Failed to connect to Arduino: {e}")
        return False

def send_command(command, steps=None):
    """Send commands to the Arduino"""
    global arduino
    if arduino is None:
        return False, "Arduino not connected"
    
    try:
        with serial_lock:
            if steps is not None:
                # Send steps as a string (e.g., "S500" for 500 steps)
                arduino.write(f"S{steps}\n".encode())
                time.sleep(0.1)  # Small delay between commands
            arduino.write(f"{command}\n".encode())
            return True, "Command sent successfully"
    except Exception as e:
        return False, f"Error sending command: {e}"

def cleanup():
    """Clean up resources on exit"""
    global arduino
    if arduino:
        arduino.close()
        print("Arduino connection closed")

# Register cleanup function
atexit.register(cleanup)

@app.route('/api/status', methods=['GET'])
def get_status():
    """Get the current status of the system"""
    return jsonify({
        'connected': arduino is not None and arduino.is_open if arduino else False,
        'current_steps': current_steps
    })

@app.route('/api/connect', methods=['POST'])
def connect_arduino():
    """Connect to Arduino"""
    if initialize_arduino():
        return jsonify({'success': True, 'message': 'Arduino connected successfully'})
    else:
        return jsonify({'success': False, 'message': 'Failed to connect to Arduino'}), 500

@app.route('/api/disconnect', methods=['POST'])
def disconnect_arduino():
    """Disconnect from Arduino"""
    global arduino
    try:
        if arduino:
            arduino.close()
            arduino = None
        return jsonify({'success': True, 'message': 'Arduino disconnected'})
    except Exception as e:
        return jsonify({'success': False, 'message': f'Error disconnecting: {e}'}), 500

@app.route('/api/steps', methods=['POST'])
def update_steps():
    """Update the step amount"""
    global current_steps
    try:
        data = request.get_json()
        steps = int(data.get('steps', 0))
        
        if steps <= 0:
            return jsonify({'success': False, 'message': 'Steps must be a positive integer'}), 400
        
        current_steps = steps
        return jsonify({'success': True, 'message': f'Step amount updated to {steps}', 'steps': steps})
    except ValueError:
        return jsonify({'success': False, 'message': 'Invalid step value'}), 400
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/command', methods=['POST'])
def send_motor_command():
    """Send a command to the motors"""
    try:
        data = request.get_json()
        command = data.get('command')
        use_steps = data.get('use_steps', True)
        
        if not command:
            return jsonify({'success': False, 'message': 'Command is required'}), 400
        
        # Send command with or without steps
        steps = current_steps if use_steps else None
        success, message = send_command(command, steps)
        
        if success:
            return jsonify({'success': True, 'message': message})
        else:
            return jsonify({'success': False, 'message': message}), 500
            
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/motor/x-forward', methods=['POST'])
def x_forward():
    """Move X motor forward"""
    success, message = send_command('X', current_steps)
    return jsonify({'success': success, 'message': message})

@app.route('/api/motor/x-backward', methods=['POST'])
def x_backward():
    """Move X motor backward"""
    success, message = send_command('x', current_steps)
    return jsonify({'success': success, 'message': message})

@app.route('/api/motor/zy-forward', methods=['POST'])
def zy_forward():
    """Move Z+Y motors forward"""
    success, message = send_command('A', current_steps)
    return jsonify({'success': success, 'message': message})

@app.route('/api/motor/zy-backward', methods=['POST'])
def zy_backward():
    """Move Z+Y motors backward"""
    success, message = send_command('a', current_steps)
    return jsonify({'success': success, 'message': message})

@app.route('/api/motor/enable', methods=['POST'])
def enable_motors():
    """Enable motors"""
    success, message = send_command('E')
    return jsonify({'success': success, 'message': message})

@app.route('/api/motor/disable', methods=['POST'])
def disable_motors():
    """Disable motors"""
    success, message = send_command('D')
    return jsonify({'success': success, 'message': message})

@app.route('/api/motor/test', methods=['POST'])
def test_motors():
    """Test motors"""
    success, message = send_command('T')
    return jsonify({'success': success, 'message': message})

@app.errorhandler(404)
def not_found(error):
    return jsonify({'success': False, 'message': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'success': False, 'message': 'Internal server error'}), 500

if __name__ == '__main__':
    print("Starting Stepper Motor Control Backend...")
    print("Attempting to connect to Arduino...")
    
    # Try to connect to Arduino on startup
    if initialize_arduino():
        print("Arduino connected successfully on startup")
    else:
        print("Arduino not connected on startup - you can connect later via API")
    
    print("Server starting on http://localhost:5000")
    app.run(host='0.0.0.0', port=5000, debug=True)

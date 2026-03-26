import os
import subprocess
import threading
import atexit
import time
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import serial

app = Flask(__name__)
CORS(app)  # Enable CORS for Next.js frontend

# Configuration
CACHE_DIR = Path('/home/dank/cache')
CAMERA_SCRIPT_PATH = Path('/home/dank/backend/camera.py')
LIGHT_SCRIPT_PATH = Path('/home/dank/backend/b_light.py')

# Ensure cache directory exists
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Global variables
arduino = None
current_steps = 400  # Default step amount
serial_lock = threading.Lock()

def initialize_arduino():
    """Initialize the Arduino serial connection"""
    global arduino
    try:
        # Note: Port might need adjustment depending on the environment (COM4, /dev/ttyUSB0, etc.)
        port = 'COM4' if os.name == 'nt' else '/dev/ttyUSB0'
        arduino = serial.Serial(port, 9600, timeout=1)
        time.sleep(2)  # Wait for the connection to establish
        print(f"Arduino connected successfully on {port}")
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
                arduino.write(f"S{steps}".encode())
                time.sleep(0.1)  # Small delay between commands
            arduino.write(command.encode())
            # Read feedback from Arduino if available
            feedback = ""
            if arduino.in_waiting > 0:
                feedback = arduino.readline().decode('ascii').strip()
            return True, feedback or "Command sent successfully"
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

# --- Hardware Control Endpoints ---

@app.route('/api/motor/move', methods=['POST'])
def move_motor():
    """Move a motor by specific steps"""
    try:
        data = request.get_json()
        axis = data.get('axis')  # 'X' or 'Y'
        steps = data.get('steps')
        forward = data.get('forward', True)
        
        if axis not in ['X', 'Y'] or steps is None:
            return jsonify({'success': False, 'message': 'Axis (X/Y) and steps are required'}), 400
        
        # Arduino command mapping: X/x for axis X, A/a for axis Y
        if axis == 'X':
            cmd = 'X' if not forward else 'x'
        else: # axis == 'Y'
            cmd = 'a' if not forward else 'A'
            
        success, message = send_command(cmd, steps)
        return jsonify({'success': success, 'message': message})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/light/pulse', methods=['POST'])
def pulse_light():
    """Pulse the blue light for a duration"""
    try:
        data = request.get_json()
        duration = float(data.get('duration', 0.5)) # seconds
        
        print(f"Triggering blue light for {duration}s...")
        
        result = subprocess.run(
            ['python3', str(LIGHT_SCRIPT_PATH), 'automate', str(duration)],
            capture_output=True,
            text=True,
            timeout=duration + 5
        )
        
        if result.returncode == 0:
            return jsonify({'success': True, 'message': f'Light pulsed for {duration}s'})
        else:
            return jsonify({'success': False, 'message': f'Light error: {result.stderr}'}), 500
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/camera/capture', methods=['POST'])
def capture_image():
    """Capture an image to the cache folder"""
    try:
        data = request.get_json()
        filename = data.get('filename')
        exposure = data.get('exposure', 50000) # microseconds
        
        if not filename:
            return jsonify({'success': False, 'message': 'Filename is required'}), 400
        
        if not filename.endswith('.jpg'):
            filename += '.jpg'
            
        output_path = CACHE_DIR / filename
        
        command = [
            'python3', str(CAMERA_SCRIPT_PATH),
            '--mode', 'routine',
            '--exposure', str(exposure),
            '--output-path', str(output_path)
        ]
        
        print(f"Capturing image to {output_path}...")
        result = subprocess.run(command, capture_output=True, text=True, timeout=30)
        
        if result.returncode == 0:
            return jsonify({'success': True, 'message': f'Image saved as {filename}', 'path': str(output_path)})
        else:
            return jsonify({'success': False, 'message': f'Camera error: {result.stderr}'}), 500
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

# --- Cache Management ---

@app.route('/api/cache/list', methods=['GET'])
def list_cache():
    """List all files in the cache directory"""
    try:
        if not CACHE_DIR.exists():
            return jsonify({'success': True, 'files': []})
        files = [f for f in os.listdir(CACHE_DIR) if os.path.isfile(CACHE_DIR / f)]
        return jsonify({'success': True, 'files': files})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/cache/download/<filename>', methods=['GET'])
def download_from_cache(filename):
    """Download a file from the cache"""
    try:
        return send_from_directory(CACHE_DIR, filename)
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 404

@app.route('/api/cache/delete/<filename>', methods=['DELETE'])
def delete_from_cache(filename):
    """Delete a file from the cache"""
    try:
        file_path = CACHE_DIR / filename
        if file_path.exists():
            os.remove(file_path)
            return jsonify({'success': True, 'message': f'Deleted {filename}'})
        else:
            return jsonify({'success': False, 'message': 'File not found'}), 404
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

# --- Legacy/Helper Endpoints ---

@app.route('/api/motor/test', methods=['POST'])
def test_motors():
    """Test motors"""
    success, message = send_command('T')
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

@app.errorhandler(404)
def not_found(error):
    return jsonify({'success': False, 'message': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'success': False, 'message': 'Internal server error'}), 500

if __name__ == '__main__':
    print("Starting Stepper Motor Control Backend (Refactored)...")
    print("Attempting to connect to Arduino...")
    
    # Try to connect to Arduino on startup
    if initialize_arduino():
        print("Arduino connected successfully on startup")
    else:
        print("Arduino not connected on startup - you can connect later via API")
    
    print("Server starting on http://0.0.0.0:5000")
    app.run(host='0.0.0.0', port=5000, debug=True)
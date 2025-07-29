import tkinter as tk
from tkinter import messagebox
import serial
import time

# Initialize serial connection (adjust the port as necessary)
arduino = serial.Serial('COM4', 9600, timeout=1)
time.sleep(2)  # Wait for the connection to establish

# Function to send commands to the Arduino
def send_command(command, steps=None):
    if steps is not None:
        # Send steps as a string (e.g., "S500" for 500 steps)
        arduino.write(f"S{steps}".encode())
    arduino.write(command.encode())

# Function to handle step amount changes
def update_steps():
    try:
        steps = int(step_entry.get())
        if steps <= 0:
            raise ValueError("Steps must be a positive integer")
        messagebox.showinfo("Success", f"Step amount updated to {steps}")
    except ValueError as e:
        messagebox.showerror("Error", str(e))

# Create the main window
root = tk.Tk()
root.title("Stepper Motor Control")

# Step amount input
step_frame = tk.Frame(root)
step_frame.pack(pady=10)

tk.Label(step_frame, text="Step Amount:").pack(side=tk.LEFT)
step_entry = tk.Entry(step_frame)
step_entry.insert(0, "400")  # Default step amount
step_entry.pack(side=tk.LEFT, padx=5)

update_button = tk.Button(step_frame, text="Update Steps", command=update_steps)
update_button.pack(side=tk.LEFT)

# Create buttons for controlling the motors
btn_x_forward = tk.Button(root, text="X Forward", command=lambda: send_command('X'))
btn_x_forward.pack(pady=5)

btn_x_backward = tk.Button(root, text="X Backward", command=lambda: send_command('x'))
btn_x_backward.pack(pady=5)

btn_zy_forward = tk.Button(root, text="Z+Y Forward", command=lambda: send_command('A'))
btn_zy_forward.pack(pady=5)

btn_zy_backward = tk.Button(root, text="Z+Y Backward", command=lambda: send_command('a'))
btn_zy_backward.pack(pady=5)

btn_enable = tk.Button(root, text="Enable Motors", command=lambda: send_command('E'))
btn_enable.pack(pady=5)

btn_disable = tk.Button(root, text="Disable Motors", command=lambda: send_command('D'))
btn_disable.pack(pady=5)

# Add a "Test Motors" button
btn_test = tk.Button(root, text="Test Motors", command=lambda: send_command('T'))
btn_test.pack(pady=10)

# Run the application
root.mainloop()

# Close the serial connection when the program exits
arduino.close()
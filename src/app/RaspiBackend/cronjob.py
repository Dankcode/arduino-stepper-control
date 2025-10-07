import subprocess

def run_routine_executor():
    """
    Calls the routine.py script to execute all active routines.
    """
    try:
        # Assuming routine.py is in the current working directory
        result = subprocess.run(
            ['python3', 'routine.py'], 
            capture_output=True, 
            text=True, 
            check=True # Raises an exception on non-zero exit code
        )
        print("Routine execution successful.")
        print("Output:\n", result.stdout)
    except subprocess.CalledProcessError as e:
        print(f"Routine execution failed (Exit Code {e.returncode}).")
        print("Error Output:\n", e.stderr)
    except FileNotFoundError:
        print("ERROR: python3 or routine.py not found. Check your PATH and file location.")

if __name__ == "__main__":
    run_routine_executor()
import sqlite3
import subprocess
from datetime import datetime
import os
import sys
from config import DATABASE_FILE, ROUTINE_SCRIPT_PATH

# --- Configuration ---
# Configure paths through STEPPER_DATABASE_FILE and STEPPER_ROUTINE_SCRIPT.

def get_db_connection():
    """Establishes a connection to the SQLite database."""
    # This is the correct format and is consistent with backend.py
    conn = sqlite3.connect(DATABASE_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def execute_routine_script(routine_filename_base: str):
    """
    Calls the routine.py script as a subprocess to execute a single routine.
    :param routine_filename_base: The base name of the routine (e.g., 'testshort').
    """
    print(f"INFO: Triggering routine.py for: {routine_filename_base}")

    # Command: python3 routine.py --routine <base_filename>
    command = [
        sys.executable, 
        str(ROUTINE_SCRIPT_PATH),
        '--routine', routine_filename_base
    ]
    
    try:
        # Run the command and capture output.
        result = subprocess.run(
            command, 
            capture_output=True, 
            text=True, 
            check=True 
        )
        print(f"SUCCESS: Routine '{routine_filename_base}' executed successfully.")
        print("Routine Output:\n", result.stdout)
        
    except subprocess.CalledProcessError as e:
        print(f"ERROR: Routine '{routine_filename_base}' failed (Exit Code {e.returncode}).")
        print("Routine Stderr:\n", e.stderr)
        
    except FileNotFoundError:
        print(f"FATAL ERROR: Python or routine.py not found at: {ROUTINE_SCRIPT_PATH}")


def run_scheduler_check():
    """
    Checks the database for routines scheduled to run at the current minute.
    """
    now = datetime.now()
    current_time_str = now.strftime("%H:%M")
    current_weekday_int = now.weekday() + 1 # 1=Mon, 7=Sun
    
    print(f"\n--- Scheduler Check Running ({now.strftime('%Y-%m-%d %H:%M:%S')}) ---")

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Query the schedule table
        query = """
        SELECT rs.filename
        FROM routine_schedule rs
        WHERE rs.start_time = ?
          AND rs.schedule_day = ?
        """
        
        cursor.execute(query, (current_time_str, current_weekday_int))
        
        routines_to_run = [row['filename'] for row in cursor.fetchall()]

        if not routines_to_run:
            print("INFO: No routines scheduled for this minute. Exiting check.")
            return

        print(f"INFO: Found {len(routines_to_run)} routine(s) to run at {current_time_str} on Day {current_weekday_int}: {routines_to_run}")

        for routine_filename_base in routines_to_run:
            execute_routine_script(routine_filename_base)

    except sqlite3.Error as e:
        print(f"FATAL ERROR: Database error during schedule check: {e}")
        
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    run_scheduler_check()

import subprocess
import sqlite3
import os
import sys
from datetime import datetime, timedelta

# --- Configuration ---
# Path to the routine script that handles motor/camera logic
ROUTINE_SCRIPT_PATH = 'routine.py' 
# Path to the database file (must match configuration in 'backend' and 'routine.py')
DATABASE_FILE = '/home/dank/routine_data.db' 

def get_db_connection():
    """Establishes a connection to the SQLite database."""
    conn = sqlite3.connect(DATABASE_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def execute_routine_script(routine_filename: str):
    """
    Calls the routine.py script as a subprocess to execute a specific routine.
    :param routine_filename: The name of the routine's JSON file (e.g., 'TryptophanAssay.json').
    """
    print(f"INFO: Triggering routine.py for: {routine_filename}")

    # Build the command: python3 routine.py --routine TryptophanAssay.json
    command = [
        sys.executable, 
        os.path.join(os.path.dirname(os.path.abspath(__file__)), ROUTINE_SCRIPT_PATH),
        '--routine', routine_filename
    ]
    
    try:
        # Run the command and capture output. check=True raises CalledProcessError on failure.
        result = subprocess.run(
            command, 
            capture_output=True, 
            text=True, 
            check=True 
        )
        print(f"SUCCESS: Routine '{routine_filename}' executed successfully.")
        # Optionally log the full output
        # print("Routine Output:\n", result.stdout) 
        
    except subprocess.CalledProcessError as e:
        print(f"ERROR: Routine '{routine_filename}' failed (Exit Code {e.returncode}).")
        print("Routine Stderr:\n", e.stderr)
        # Log error but continue checking other routines
        
    except FileNotFoundError:
        print(f"FATAL ERROR: Python or {ROUTINE_SCRIPT_PATH} not found.")
        
    # NOTE: In a robust system, you might update a 'last_run' timestamp in the SQL here.

def run_scheduler_check():
    """
    Checks the database for routines scheduled to run at the current minute.
    """
    now = datetime.now()
    # Format current time to match common SQLite time format (HH:MM)
    current_time_str = now.strftime("%H:%M")
    current_weekday = now.strftime("%a") # e.g., 'Mon', 'Tue'
    
    print(f"\n--- Scheduler Check Running ({now.strftime('%Y-%m-%d %H:%M:%S')}) ---")

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Query the schedule table for any routines that:
        # 1. Have a matching schedule_time (HH:MM)
        # 2. Are set to run on the current weekday (e.g., 'Mon', 'Daily', 'All')
        query = """
        SELECT rs.filename
        FROM routine_schedule rs
        WHERE rs.schedule_time = ?
          AND (rs.schedule_days = 'Daily' OR rs.schedule_days LIKE ? OR rs.schedule_days = 'All')
        """
        
        # Note: LIKE checks if the current weekday is within the schedule_days string (e.g., 'Mon,Wed,Fri')
        cursor.execute(query, (current_time_str, f"%{current_weekday}%"))
        
        routines_to_run = [row['filename'] for row in cursor.fetchall()]

        if not routines_to_run:
            print("INFO: No routines scheduled for this minute.")
            return

        print(f"INFO: Found {len(routines_to_run)} routine(s) to run at {current_time_str}: {routines_to_run}")

        for routine_filename in routines_to_run:
            execute_routine_script(routine_filename)

    except sqlite3.Error as e:
        print(f"FATAL ERROR: Database error during schedule check: {e}")
        
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    run_scheduler_check()
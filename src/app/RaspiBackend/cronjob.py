import sqlite3
import json
from datetime import datetime
from urllib import error, request
from config import BACKEND_PORT, DATABASE_FILE

# --- Configuration ---
# Configure paths through STEPPER_DATABASE_FILE. Routine execution is owned by
# backend.py so the Arduino serial port has exactly one owner.

def get_db_connection():
    """Establishes a connection to the SQLite database."""
    # This is the correct format and is consistent with backend.py
    conn = sqlite3.connect(DATABASE_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def execute_routine_script(routine_filename_base: str):
    """
    Starts a routine through backend.py, which owns serial/progress/abort state.
    :param routine_filename_base: The base name of the routine (e.g., 'testshort').
    """
    print(f"INFO: Triggering backend routine runner for: {routine_filename_base}", flush=True)
    url = f"http://127.0.0.1:{BACKEND_PORT}/api/routine/run"
    payload = json.dumps({"filename": routine_filename_base}).encode("utf-8")
    api_request = request.Request(
        url,
        data=payload,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with request.urlopen(api_request, timeout=5) as response:
            body = response.read().decode("utf-8", errors="replace")
            if response.status not in {200, 202}:
                print(f"ERROR: Backend returned HTTP {response.status}: {body}", flush=True)
                return
            print(f"SUCCESS: Routine '{routine_filename_base}' accepted by backend: {body}", flush=True)
    except (error.URLError, TimeoutError) as exc:
        print(f"ERROR: Could not call backend routine runner: {exc}", flush=True)


def run_scheduler_check():
    """
    Checks the database for routines scheduled to run at the current minute.
    """
    now = datetime.now()
    current_time_str = now.strftime("%H:%M")
    current_weekday_int = now.weekday() + 1 # 1=Mon, 7=Sun
    
    print(f"\n--- Scheduler Check Running ({now.strftime('%Y-%m-%d %H:%M:%S')}) ---", flush=True)

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
            print("INFO: No routines scheduled for this minute. Exiting check.", flush=True)
            return

        print(f"INFO: Found {len(routines_to_run)} routine(s) to run at {current_time_str} on Day {current_weekday_int}: {routines_to_run}", flush=True)

        for routine_filename_base in routines_to_run:
            execute_routine_script(routine_filename_base)

    except sqlite3.Error as e:
        print(f"FATAL ERROR: Database error during schedule check: {e}", flush=True)
        
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    run_scheduler_check()

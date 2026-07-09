"""Pi Flask API for the microscope stepper dashboard.

This file is the clean backend entrypoint for the frontend routes in
src/components/*.js. It keeps the existing response shapes and adds the V2
motion/progress routes used by RoutineDesignerV2.
"""

from collections import deque
from datetime import datetime
import glob
import io
import os
import sqlite3
import subprocess
import sys
import threading
import time
from pathlib import Path
from urllib.parse import unquote
import zipfile

from flask import Flask, request, jsonify, Response, send_file
from flask_cors import CORS

from config import (
    BACKEND_DEBUG,
    BACKEND_HOST,
    BACKEND_PORT,
    BASE_DIR,
    BAUD_RATE,
    CAMERA_SCRIPT_PATH,
    DATABASE_FILE,
    DEFAULT_EXPOSURE_TIME_US,
    LIGHT_SCRIPT_PATH,
    LOG_FILE_PATH,
    PICTURES_DIR,
    ROUTINES_DIR,
    ACTIVE_ROUTINES_DIR,
    SERIAL_PORT,
    SERIAL_TIMEOUT,
)

try:
    import serial
except ImportError:  # Allows non-Pi dev machines to run DB/UI endpoints.
    serial = None

try:
    from motion import kinematics, trajectory
except ImportError:
    kinematics = None
    trajectory = None


app = Flask(__name__)
CORS(app)

serial_lock = threading.Lock()
routine_progress = {"running": False, "wells_done": 0, "wells_total": 0, "current_well": None}
_stream_active = False


# --------------------------------------------------------------------------
# DB helpers
# --------------------------------------------------------------------------
def get_db():
    DATABASE_FILE.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DATABASE_FILE)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    init_db(conn)
    return conn


def init_db(conn=None):
    should_close = conn is None
    conn = conn or sqlite3.connect(DATABASE_FILE)
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS routines (
            filename TEXT PRIMARY KEY,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS well_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            plateNumber INTEGER NOT NULL,
            wellId TEXT NOT NULL,
            stepAmount INTEGER DEFAULT 0,
            delayBetweenStep INTEGER DEFAULT 0,
            lightTime INTEGER DEFAULT 0,
            exposureTime INTEGER DEFAULT 0,
            switchPlate INTEGER DEFAULT 0,
            layout TEXT DEFAULT '96-well',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (filename) REFERENCES routines(filename) ON DELETE CASCADE,
            UNIQUE(filename, plateNumber, wellId)
        );

        CREATE TABLE IF NOT EXISTS routine_schedule (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            start_time TEXT NOT NULL,
            schedule_day INTEGER NOT NULL,
            repeat_interval TEXT DEFAULT 'daily',
            repeat_count INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (filename) REFERENCES routines(filename) ON DELETE CASCADE,
            UNIQUE(filename, schedule_day, start_time)
        );

        CREATE TABLE IF NOT EXISTS active_routines (
            filename TEXT PRIMARY KEY,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (filename) REFERENCES routines(filename) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    """)
    try:
        conn.execute("ALTER TABLE well_data ADD COLUMN layout TEXT DEFAULT '96-well'")
    except sqlite3.OperationalError:
        pass
    conn.commit()
    if should_close:
        conn.close()


def _coerce_int(value, default=0):
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _clean_filename(filename):
    if not filename:
        return ""
    return Path(str(filename).replace(".sql", "")).name.strip()


def _valid_time(value):
    try:
        hour, minute = str(value).split(":")
        hour = int(hour)
        minute = int(minute)
        return 0 <= hour <= 23 and 0 <= minute <= 59
    except Exception:
        return False


def _time_to_minutes(schedule_day, start_time):
    try:
        hour, minute = map(int, str(start_time).split(":"))
        return (int(schedule_day) - 1) * 24 * 60 + hour * 60 + minute
    except Exception:
        return None


def _minutes_to_time(total_minutes):
    total_minutes = total_minutes % (7 * 24 * 60)
    day = total_minutes // (24 * 60) + 1
    minute_of_day = total_minutes % (24 * 60)
    return int(day), f"{minute_of_day // 60:02d}:{minute_of_day % 60:02d}"


def _runtime_seconds(conn, filename):
    rows = conn.execute("""
        SELECT plateNumber, wellId, delayBetweenStep, lightTime, exposureTime, layout
        FROM well_data
        WHERE filename = ? AND COALESCE(stepAmount, 0) != 0
    """, (filename,)).fetchall()
    if trajectory and rows:
        total = 0.0
        by_plate = {}
        for row in rows:
            plate = int(row["plateNumber"] or 1)
            layout = row["layout"] or "96-well"
            by_plate.setdefault((plate, layout), {})[row["wellId"]] = {
                "delayBetweenStep": row["delayBetweenStep"],
                "lightTime": row["lightTime"],
                "exposureTime": row["exposureTime"],
            }
        for (plate, layout), wells in by_plate.items():
            try:
                total += trajectory.plan_routine(wells, layout=layout, plate_number=plate).total_time_s
            except Exception:
                pass
        if total > 0:
            return int(round(total))

    fallback = conn.execute("""
        SELECT SUM(COALESCE(delayBetweenStep, 0) + COALESCE(lightTime, 0)) AS ms,
               SUM(COALESCE(exposureTime, 0)) AS us
        FROM well_data
        WHERE filename = ? AND COALESCE(stepAmount, 0) != 0
    """, (filename,)).fetchone()
    return int(round(((fallback["ms"] or 0) / 1000.0) + ((fallback["us"] or 0) / 1_000_000.0)))


def _next_available_time(conn):
    scheduled = conn.execute("""
        SELECT s.filename, s.schedule_day, s.start_time
        FROM routine_schedule s
        JOIN active_routines a ON a.filename = s.filename
    """).fetchall()
    now = datetime.now()
    next_minutes = (now.weekday()) * 24 * 60 + now.hour * 60 + now.minute
    for row in scheduled:
        start = _time_to_minutes(row["schedule_day"], row["start_time"])
        if start is None:
            continue
        end = start + max(1, (_runtime_seconds(conn, row["filename"]) + 59) // 60)
        if end > next_minutes:
            next_minutes = end
    return _minutes_to_time(next_minutes)


def _replace_schedule(conn, filename, start_time, repeat_interval="daily", repeat_count=1, day=None):
    if not _valid_time(start_time):
        raise ValueError("startTime/time must be HH:MM.")
    repeat_interval = repeat_interval or "daily"
    repeat_count = max(1, _coerce_int(repeat_count, 1))
    conn.execute("DELETE FROM routine_schedule WHERE filename = ?", (filename,))

    if day is not None:
        days = [int(day)]
    elif repeat_interval == "daily":
        days = list(range(1, 8))
    else:
        days = [datetime.now().weekday() + 1]

    for schedule_day in days:
        if schedule_day < 1 or schedule_day > 7:
            raise ValueError("schedule_day must be between 1 and 7.")
        conn.execute("""
            INSERT OR IGNORE INTO routine_schedule
                (filename, start_time, schedule_day, repeat_interval, repeat_count)
            VALUES (?, ?, ?, ?, ?)
        """, (filename, start_time, schedule_day, repeat_interval, repeat_count))


def _safe_child(base_dir, relative_path):
    relative_path = unquote(relative_path or "")
    normalized = os.path.normpath(relative_path) if relative_path else ""
    if normalized in {".", os.curdir}:
        normalized = ""
    candidate = Path(base_dir) / normalized
    real_base = os.path.realpath(base_dir)
    real_candidate = os.path.realpath(candidate)
    if os.path.commonpath([real_base, real_candidate]) != real_base:
        raise ValueError("Access denied: path outside pictures directory.")
    return normalized, Path(real_candidate)


# --------------------------------------------------------------------------
# Serial helper
# --------------------------------------------------------------------------
class SerialLink:
    def __init__(self, port=SERIAL_PORT, baud=BAUD_RATE):
        self.configured_port = port
        self.port = port
        self.baud = baud
        self.conn = None
        self.current_steps = 400

    @property
    def connected(self):
        return self.conn is not None and getattr(self.conn, "is_open", False)

    def available_ports(self):
        ports = []
        if serial is not None:
            try:
                from serial.tools import list_ports
                ports.extend(port.device for port in list_ports.comports())
            except Exception:
                pass
        patterns = [
            "/dev/ttyUSB*",
            "/dev/ttyACM*",
            "/dev/ttyAMA*",
            "/dev/serial/by-id/*",
            "/dev/tty.usbmodem*",
            "/dev/tty.usbserial*",
            "/dev/cu.usbmodem*",
            "/dev/cu.usbserial*",
        ]
        for pattern in patterns:
            ports.extend(glob.glob(pattern))
        return sorted(dict.fromkeys(ports))

    def resolve_port(self):
        configured = str(self.configured_port)
        if configured and Path(configured).exists():
            return configured
        for candidate in self.available_ports():
            if candidate:
                return candidate
        return configured

    def connect(self):
        if serial is None:
            return False, "pyserial is not installed."
        if self.connected:
            return True, f"Already connected to {self.port}."
        self.port = self.resolve_port()
        if not self.port or not Path(self.port).exists():
            available = self.available_ports()
            detail = ", ".join(available) if available else "none"
            return False, (
                f"Serial port '{self.configured_port}' was not found. "
                f"Detected ports: {detail}. Set STEPPER_SERIAL_PORT to the Arduino device path."
            )
        self.conn = serial.Serial(self.port, self.baud, timeout=SERIAL_TIMEOUT, write_timeout=SERIAL_TIMEOUT)
        time.sleep(2)
        self.conn.reset_input_buffer()
        self.conn.reset_output_buffer()
        ok, reply = self.command("?")
        if not ok:
            self.disconnect()
            return False, f"Connected to {self.port}, but handshake failed: {reply}"
        return True, f"Connected to {self.port}: {reply}"

    def disconnect(self):
        if self.conn is not None:
            self.conn.close()
        self.conn = None

    def _readline(self):
        if not self.connected:
            return ""
        return self.conn.readline().decode("utf-8", errors="replace").strip()

    def command(self, command, expect_done=False):
        if not self.connected:
            return False, "Arduino is not connected."
        try:
            self.conn.write(f"{command}\n".encode("ascii"))
            first = self._readline()
            if not first and not expect_done:
                return False, "Serial timeout: no response."
            if first.startswith("ERR:"):
                return False, first
            if expect_done:
                # v1 firmware is silent while a blocking move runs, so an empty
                # first read just means the move is still in progress.
                # v2 firmware replies "OK:done x y z"; v1 replies "OK:move_complete".
                # Accept both so the backend works with whichever firmware is flashed.
                if first.startswith("OK:done") or first.startswith("OK:move_complete"):
                    return True, first
                deadline = time.time() + max(30.0, SERIAL_TIMEOUT)
                last = first
                while time.time() < deadline:
                    line = self._readline()
                    if not line:
                        continue
                    last = line
                    if line.startswith("ERR:"):
                        return False, line
                    if line.startswith("OK:aborted"):
                        return False, line
                    if line.startswith("OK:done") or line.startswith("OK:move_complete"):
                        return True, line
                return False, f"Timed out waiting for move completion after {last!r}."
            if first.startswith("OK:") or first.startswith("POS ") or first:
                return True, first
            return False, first
        except Exception as exc:
            self.disconnect()
            return False, f"Serial communication error: {exc}"

    def abort(self):
        if not self.connected:
            return False, "Arduino is not connected."
        try:
            self.conn.write(b"!\n")
            return True, "Abort sent."
        except Exception as exc:
            self.disconnect()
            return False, f"Serial abort error: {exc}"


serial_link = SerialLink()


class RoutineRunner:
    """In-process routine executor; the backend remains the only serial owner."""

    def __init__(self):
        self.thread = None
        self.abort_event = threading.Event()
        self.lock = threading.Lock()

    @property
    def running(self):
        return self.thread is not None and self.thread.is_alive()

    def start(self, filename, plate=1):
        filename = _clean_filename(filename)
        plate = _coerce_int(plate, 1)
        if not filename:
            return False, "Filename is required."
        with self.lock:
            if self.running:
                return False, "A routine is already running."
            if trajectory is None:
                return False, "Motion planner is unavailable."
            conn = get_db()
            try:
                exists = conn.execute("SELECT 1 FROM routines WHERE filename = ?", (filename,)).fetchone()
            finally:
                conn.close()
            if not exists:
                return False, f"Routine '{filename}' was not found."

            self.abort_event.clear()
            routine_progress.update({
                "running": True,
                "aborted": False,
                "error": None,
                "done": False,
                "filename": filename,
                "wells_done": 0,
                "wells_total": 0,
                "current_well": None,
            })
            self.thread = threading.Thread(target=self.run, args=(filename, plate), daemon=True)
            self.thread.start()
        return True, f"Routine '{filename}' started."

    def abort(self):
        self.abort_event.set()
        ok, reply = serial_link.abort()
        routine_progress.update({
            "running": False,
            "aborted": True,
            "error": None if ok else reply,
        })
        return ok, reply

    def _load_wells(self, filename, plate):
        conn = get_db()
        try:
            rows = conn.execute("""
                SELECT wellId, delayBetweenStep, lightTime, exposureTime, layout
                FROM well_data
                WHERE filename = ?
                  AND plateNumber = ?
                  AND COALESCE(stepAmount, 0) != 0
            """, (filename, plate)).fetchall()
        finally:
            conn.close()

        wells = {}
        layout = "96-well"
        for row in rows:
            layout = row["layout"] or layout
            wells[row["wellId"]] = {
                "delayBetweenStep": row["delayBetweenStep"],
                "lightTime": row["lightTime"],
                "exposureTime": row["exposureTime"],
            }
        return wells, layout

    def run(self, filename, plate):
        try:
            wells, layout = self._load_wells(filename, plate)
            if not wells:
                raise RuntimeError(f"Routine '{filename}' has no active wells on plate {plate}.")

            plan = trajectory.plan_routine(wells, layout=layout, plate_number=plate)
            routine_progress.update({
                "wells_total": plan.wells_total,
                "wells_done": 0,
                "current_well": None,
                "running": True,
            })

            if not serial_link.connected:
                ok, reply = serial_link.connect()
                if not ok:
                    raise RuntimeError(reply)

            ok, reply = serial_link.command("E")
            if not ok:
                raise RuntimeError(reply)

            wells_done = 0
            for segment in plan.segments:
                if self.abort_event.is_set():
                    raise InterruptedError("Routine aborted.")

                ok, reply = serial_link.command(
                    f"M {segment.dx_steps} {segment.dy_steps} {segment.dz_steps}",
                    expect_done=True,
                )
                if not ok:
                    raise RuntimeError(reply)

                self._capture(filename, segment)
                wells_done += 1
                routine_progress.update({
                    "wells_done": wells_done,
                    "wells_total": plan.wells_total,
                    "current_well": segment.well_id,
                })

            serial_link.command("D")
            routine_progress.update({
                "running": False,
                "done": True,
                "aborted": False,
                "error": None,
                "current_well": None,
            })
        except InterruptedError as exc:
            serial_link.abort()
            serial_link.command("D")
            routine_progress.update({
                "running": False,
                "aborted": True,
                "done": False,
                "error": str(exc),
            })
        except Exception as exc:
            serial_link.abort()
            serial_link.command("D")
            routine_progress.update({
                "running": False,
                "aborted": False,
                "done": False,
                "error": str(exc),
            })

    def _capture(self, filename, segment):
        if segment.delay_ms > 0:
            time.sleep(segment.delay_ms / 1000.0)

        if segment.light_ms > 0:
            duration_s = segment.light_ms / 1000.0
            subprocess.run(
                [sys.executable, str(LIGHT_SCRIPT_PATH), "automate", str(duration_s)],
                capture_output=True,
                text=True,
                check=False,
                timeout=duration_s + 5,
                cwd=BASE_DIR,
            )

        if segment.exposure_us > 0:
            date_today = datetime.now().strftime("%Y-%m-%d")
            output_path = PICTURES_DIR / filename / date_today / f"{segment.well_id}.jpg"
            subprocess.run(
                [
                    sys.executable,
                    str(CAMERA_SCRIPT_PATH),
                    "--mode",
                    "routine",
                    "--exposure",
                    str(segment.exposure_us),
                    "--output-path",
                    str(output_path),
                ],
                capture_output=True,
                text=True,
                check=False,
                timeout=30,
                cwd=BASE_DIR,
            )


routine_runner = RoutineRunner()


# --------------------------------------------------------------------------
# Health
# --------------------------------------------------------------------------
@app.route("/", methods=["GET"])
def health():
    return jsonify({"status": "ok", "message": "Backend is running."})


# --------------------------------------------------------------------------
# Routines
# --------------------------------------------------------------------------
@app.route("/save_routine_sql", methods=["POST"])
def save_routine_sql():
    data = request.get_json() or {}
    filename = _clean_filename(data.get("filename"))
    wells = data.get("well_data") or []
    if not filename or not wells:
        return jsonify({"error": "Filename or well data missing."}), 400

    conn = get_db()
    try:
        conn.execute("BEGIN")
        conn.execute("INSERT OR REPLACE INTO routines (filename) VALUES (?)", (filename,))
        conn.execute("DELETE FROM well_data WHERE filename = ?", (filename,))
        for item in wells:
            conn.execute("""
                INSERT INTO well_data (
                    filename, plateNumber, wellId, stepAmount, delayBetweenStep,
                    lightTime, exposureTime, switchPlate, layout
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                filename,
                _coerce_int(item.get("plateNumber"), 1),
                str(item.get("wellId", "")).upper(),
                _coerce_int(item.get("stepAmount")),
                _coerce_int(item.get("delayBetweenStep")),
                _coerce_int(item.get("lightTime")),
                _coerce_int(item.get("exposureTime")),
                1 if item.get("switchPlate") in {1, True, "1", "true", "on"} else 0,
                item.get("layout") or "96-well",
            ))
        if data.get("startTime"):
            _replace_schedule(
                conn,
                filename,
                data.get("startTime"),
                data.get("repeatInterval") or "daily",
                data.get("repeatCount") or 1,
            )
        conn.commit()
        return jsonify({"message": f"Routine '{filename}' saved successfully."})
    except (ValueError, sqlite3.Error) as exc:
        conn.rollback()
        return jsonify({"error": str(exc)}), 400
    finally:
        conn.close()


@app.route("/routines/all", methods=["GET"])
def routines_all():
    conn = get_db()
    try:
        all_rows = conn.execute("SELECT filename FROM routines ORDER BY filename").fetchall()
        active_names = {row["filename"] for row in conn.execute("SELECT filename FROM active_routines").fetchall()}
        active_routines = []
        all_routines = []

        for row in all_rows:
            filename = row["filename"]
            runtime = _runtime_seconds(conn, filename)
            if filename in active_names:
                schedule = conn.execute("""
                    SELECT schedule_day, start_time FROM routine_schedule
                    WHERE filename = ?
                    ORDER BY schedule_day, start_time
                    LIMIT 1
                """, (filename,)).fetchone()
                active_routines.append({
                    "name": filename,
                    "day": schedule["schedule_day"] if schedule else datetime.now().weekday() + 1,
                    "time": schedule["start_time"] if schedule else "09:00",
                    "totalRuntime": runtime,
                    "start_minutes": _time_to_minutes(
                        schedule["schedule_day"] if schedule else datetime.now().weekday() + 1,
                        schedule["start_time"] if schedule else "09:00",
                    ),
                })
            else:
                all_routines.append({"name": f"{filename}.sql", "totalRuntime": runtime})

        active_routines.sort(key=lambda item: item.get("start_minutes") or 0)
        for routine in active_routines:
            routine.pop("start_minutes", None)

        return jsonify({
            "all_routines": all_routines,
            "active_routines": active_routines,
            "routines": [row["filename"] for row in all_rows],
            "active": sorted(active_names),
        })
    finally:
        conn.close()


@app.route("/routines/schedule-update", methods=["POST"])
def routines_schedule_update():
    data = request.get_json() or {}
    filename = _clean_filename(data.get("filename"))
    day = data.get("day") or (data.get("schedule") or {}).get("day")
    start_time = data.get("time") or (data.get("schedule") or {}).get("time")
    if not filename or not day or not start_time:
        return jsonify({"error": "Filename, day, or time missing."}), 400
    conn = get_db()
    try:
        _replace_schedule(conn, filename, start_time, "weekly", 1, day=day)
        conn.execute("INSERT OR IGNORE INTO active_routines (filename) VALUES (?)", (filename,))
        conn.commit()
        return jsonify({"message": f"Schedule for '{filename}' updated."})
    except (ValueError, sqlite3.Error) as exc:
        conn.rollback()
        return jsonify({"error": str(exc)}), 400
    finally:
        conn.close()


@app.route("/routines/rename", methods=["POST"])
def routines_rename():
    data = request.get_json() or {}
    old_name = _clean_filename(data.get("oldName"))
    new_name = _clean_filename(data.get("newName"))
    if not old_name or not new_name:
        return jsonify({"error": "Old name or new name not provided."}), 400
    conn = get_db()
    try:
        conn.execute("BEGIN")
        exists = conn.execute("SELECT 1 FROM routines WHERE filename = ?", (old_name,)).fetchone()
        if not exists:
            conn.rollback()
            return jsonify({"error": f"Routine '{old_name}' not found."}), 404
        conn.execute("INSERT OR REPLACE INTO routines (filename) VALUES (?)", (new_name,))
        for table in ("well_data", "routine_schedule", "active_routines"):
            conn.execute(f"UPDATE {table} SET filename = ? WHERE filename = ?", (new_name, old_name))
        conn.execute("DELETE FROM routines WHERE filename = ?", (old_name,))
        conn.commit()
        return jsonify({"message": f"Routine '{old_name}' renamed to '{new_name}'."})
    except sqlite3.Error as exc:
        conn.rollback()
        return jsonify({"error": str(exc)}), 500
    finally:
        conn.close()


@app.route("/routines/delete", methods=["POST"])
def routines_delete():
    filename = _clean_filename((request.get_json() or {}).get("filename"))
    if not filename:
        return jsonify({"error": "Filename not provided."}), 400
    conn = get_db()
    try:
        cursor = conn.execute("DELETE FROM routines WHERE filename = ?", (filename,))
        conn.commit()
        if cursor.rowcount == 0:
            return jsonify({"error": f"Routine '{filename}' not found."}), 404
        return jsonify({"message": f"Routine '{filename}' deleted successfully."})
    finally:
        conn.close()


@app.route("/routines/move-to-active-sql", methods=["POST"])
def routines_activate():
    filename = _clean_filename((request.get_json() or {}).get("filename"))
    if not filename:
        return jsonify({"error": "Filename not provided."}), 400
    conn = get_db()
    try:
        if not conn.execute("SELECT 1 FROM routines WHERE filename = ?", (filename,)).fetchone():
            return jsonify({"error": f"Routine '{filename}' not found."}), 404
        day, start_time = _next_available_time(conn)
        conn.execute("INSERT OR IGNORE INTO active_routines (filename) VALUES (?)", (filename,))
        if not conn.execute("SELECT 1 FROM routine_schedule WHERE filename = ?", (filename,)).fetchone():
            _replace_schedule(conn, filename, start_time, "weekly", 1, day=day)
        conn.commit()
        return jsonify({"message": f"Routine '{filename}' activated."})
    except (ValueError, sqlite3.Error) as exc:
        conn.rollback()
        return jsonify({"error": str(exc)}), 400
    finally:
        conn.close()


@app.route("/routines/move-to-inactive-sql", methods=["POST"])
def routines_deactivate():
    filename = _clean_filename((request.get_json() or {}).get("filename"))
    if not filename:
        return jsonify({"error": "Filename not provided."}), 400
    conn = get_db()
    try:
        conn.execute("DELETE FROM active_routines WHERE filename = ?", (filename,))
        conn.commit()
        return jsonify({"message": f"Routine '{filename}' removed from active list."})
    finally:
        conn.close()


@app.route("/api/logs", methods=["GET"])
def get_logs():
    try:
        limit = min(max(_coerce_int(request.args.get("limit"), 50), 1), 500)
        if not LOG_FILE_PATH.exists():
            return jsonify({"logs": [f"Log file not found at {LOG_FILE_PATH}"], "success": False}), 404
        with LOG_FILE_PATH.open("r", encoding="utf-8", errors="replace") as handle:
            lines = deque(handle, maxlen=limit)
        return jsonify({"logs": [line.rstrip() for line in lines], "success": True})
    except Exception as exc:
        return jsonify({"logs": [f"Error reading logs: {exc}"], "success": False}), 500


# --------------------------------------------------------------------------
# Serial / motors
# --------------------------------------------------------------------------
@app.route("/api/status", methods=["GET"])
def api_status():
    with serial_lock:
        firmware = None
        if serial_link.connected and not routine_runner.running:
            ok, reply = serial_link.command("?")
            firmware = reply if ok else None
        return jsonify({
            "connected": serial_link.connected,
            "current_steps": serial_link.current_steps,
            "port": serial_link.port,
            "configured_port": serial_link.configured_port,
            "available_ports": serial_link.available_ports(),
            "routine_running": routine_runner.running,
            "firmware": firmware,
        })


@app.route("/api/connect", methods=["POST"])
def api_connect():
    with serial_lock:
        try:
            ok, message = serial_link.connect()
        except Exception as exc:
            ok, message = False, str(exc)
        return jsonify({"success": ok, "message": message, "connected": ok, "port": serial_link.port}), 200 if ok else 500


@app.route("/api/disconnect", methods=["POST"])
def api_disconnect():
    with serial_lock:
        serial_link.disconnect()
    return jsonify({"success": True, "message": "Disconnected from Arduino.", "connected": False})


@app.route("/api/steps", methods=["POST"])
def api_steps():
    if routine_runner.running:
        return jsonify({"message": "Routine is running; manual step changes are blocked."}), 409
    steps = _coerce_int((request.get_json() or {}).get("steps"))
    if steps <= 0:
        return jsonify({"message": "Error: Invalid steps value provided."}), 400
    with serial_lock:
        serial_link.current_steps = steps
        ok, reply = serial_link.command(f"S{steps}")
    return jsonify({"message": reply if ok else f"Error: {reply}"}), 200 if ok else 503


@app.route("/api/motor/<action>", methods=["POST"])
def api_motor(action):
    if routine_runner.running:
        return jsonify({"message": "Routine is running; manual motor commands are blocked."}), 409
    command_map = {
        "x-forward": "X",
        "x-backward": "x",
        "zy-forward": "A",
        "zy-backward": "a",
        "enable": "E",
        "disable": "D",
        "test": "T",
    }
    command = command_map.get(action)
    if not command:
        return jsonify({"message": f'Error: Unknown command "{action}"'}), 404
    with serial_lock:
        ok, reply = serial_link.command(command, expect_done=command in {"X", "x", "A", "a"})
    return jsonify({"message": reply if ok else f"Error: {reply}"}), 200 if ok else 503


# --------------------------------------------------------------------------
# Camera + blue light
# --------------------------------------------------------------------------
@app.route("/api/camera/take-picture", methods=["POST"])
def camera_take_picture():
    data = request.get_json() or {}
    exposure_time = _coerce_int(data.get("exposure_time"), DEFAULT_EXPOSURE_TIME_US)
    if exposure_time <= 0:
        return jsonify({"success": False, "message": "Exposure time must be positive."}), 400
    if _stream_active:
        return jsonify({
            "success": False,
            "message": "Camera stream is running. Stop the stream before taking a still picture.",
        }), 409
    result = subprocess.run(
        [sys.executable, str(CAMERA_SCRIPT_PATH), "--mode", "manual", "--exposure", str(exposure_time)],
        capture_output=True,
        text=True,
        check=False,
        cwd=BASE_DIR,
    )
    if result.returncode == 0:
        return jsonify({"success": True, "message": "Picture capture complete.", "output": result.stdout})
    return jsonify({"success": False, "message": result.stderr.strip() or "Camera script failed.", "output": result.stderr}), 500


@app.route("/api/camera/status", methods=["GET"])
def camera_status():
    missing = []
    try:
        from picamera2 import Picamera2  # noqa: F401
    except ImportError as exc:
        missing.append(f"picamera2: {exc}")

    if missing:
        return jsonify({
            "available": False,
            "message": "Camera stream dependency is unavailable on this backend.",
            "details": missing,
        }), 503

    return jsonify({
        "available": True,
        "message": "Camera stream dependency is available.",
    })


@app.route("/api/camera/stream", methods=["GET"])
def camera_stream():
    global _stream_active
    try:
        from picamera2 import Picamera2
        from picamera2.encoders import MJPEGEncoder
        from picamera2.outputs import FileOutput
    except ImportError as exc:
        return jsonify({"error": f"Missing picamera2 stream library: {exc}"}), 500

    class StreamingOutput(io.BufferedIOBase):
        def __init__(self):
            self.frame = None
            self.condition = threading.Condition()

        def write(self, buf):
            with self.condition:
                self.frame = bytes(buf)
                self.condition.notify_all()
            return len(buf)

    def frames():
        global _stream_active
        if _stream_active:
            return
        _stream_active = True
        picam2 = None
        output = StreamingOutput()
        try:
            picam2 = Picamera2()
            config = picam2.create_video_configuration(main={"size": (1280, 720)})
            picam2.configure(config)
            picam2.start_recording(MJPEGEncoder(), FileOutput(output))
            while True:
                with output.condition:
                    output.condition.wait(timeout=5)
                    frame = output.frame
                if frame:
                    yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + frame + b"\r\n"
        except GeneratorExit:
            pass
        finally:
            _stream_active = False
            if picam2 is not None:
                try:
                    picam2.stop_recording()
                    picam2.close()
                except Exception:
                    pass

    return Response(frames(), mimetype="multipart/x-mixed-replace; boundary=frame")


@app.route("/api/bluelight/manual", methods=["POST"])
def bluelight_manual():
    state = str((request.get_json() or {}).get("state", "")).lower()
    if state not in {"on", "off"}:
        return jsonify({"success": False, "message": "State must be 'on' or 'off'."}), 400
    result = subprocess.run(
        [sys.executable, str(LIGHT_SCRIPT_PATH), state],
        capture_output=True,
        text=True,
        check=False,
        cwd=BASE_DIR,
    )
    output = result.stdout.strip() or result.stderr.strip()
    if result.returncode == 0:
        return jsonify({"success": True, "message": f"Blue light turned {state}.", "output": output})
    return jsonify({"success": False, "message": output or "Blue light command failed."}), 500


# --------------------------------------------------------------------------
# Pictures
# --------------------------------------------------------------------------
@app.route("/pictures", methods=["GET"])
def pictures():
    try:
        current_path, current_dir = _safe_child(PICTURES_DIR, request.args.get("path", ""))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 403
    if not current_dir.exists():
        if current_path:
            return jsonify({"error": f"Directory not found: {current_path}"}), 404
        current_dir.mkdir(parents=True, exist_ok=True)

    contents = []
    for item in current_dir.iterdir():
        if item.name.startswith("."):
            continue
        stat = item.stat()
        contents.append({
            "name": item.name,
            "is_folder": item.is_dir(),
            "size": 0 if item.is_dir() else stat.st_size,
            "last_modified": stat.st_mtime,
        })
    contents.sort(key=lambda item: (not item["is_folder"], item["name"].lower()))
    return jsonify({"currentPath": current_path, "contents": contents})


@app.route("/pictures/download", methods=["GET"])
def pictures_download():
    try:
        relative_path, current_dir = _safe_child(PICTURES_DIR, request.args.get("path", ""))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 403
    if not relative_path:
        return jsonify({"error": "No path specified"}), 400
    if not current_dir.is_dir():
        return jsonify({"error": f"Directory not found: {relative_path}"}), 404

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for root, _dirs, files in os.walk(current_dir):
            for file_name in files:
                if file_name.startswith("."):
                    continue
                file_path = Path(root) / file_name
                archive.write(file_path, file_path.relative_to(current_dir))
    zip_buffer.seek(0)
    return send_file(
        zip_buffer,
        mimetype="application/zip",
        as_attachment=True,
        download_name=f"{current_dir.name or 'pictures'}.zip",
    )


# --------------------------------------------------------------------------
# V2 routes
# --------------------------------------------------------------------------
@app.route("/api/routine/progress", methods=["GET"])
def routine_progress_route():
    return jsonify(routine_progress)


@app.route("/api/routine/run", methods=["POST"])
def routine_run():
    data = request.get_json() or {}
    ok, message = routine_runner.start(data.get("filename"), data.get("plate", 1))
    return jsonify({"started": ok, "message": message}), 202 if ok else 409


@app.route("/api/routine/abort", methods=["POST"])
def routine_abort():
    if not routine_runner.running:
        routine_progress.update({"running": False, "aborted": False})
        return jsonify({"aborted": False, "message": "No routine is running."})
    ok, message = routine_runner.abort()
    return jsonify({"aborted": ok, "message": message}), 200 if ok else 503


@app.route("/api/motion/estimate", methods=["POST"])
def motion_estimate():
    if trajectory is None:
        return jsonify({"seconds": 0, "error": "motion planner unavailable"}), 503
    data = request.get_json() or {}
    wells = data.get("well_data") or _flatten_plate_payload(data.get("plates") or {})
    by_plate = {}
    for item in wells:
        if _coerce_int(item.get("stepAmount")) == 0:
            continue
        plate = _coerce_int(item.get("plateNumber"), 1)
        layout = item.get("layout") or "96-well"
        by_plate.setdefault((plate, layout), {})[str(item.get("wellId", "")).upper()] = item

    total = 0.0
    try:
        for (plate, layout), plate_wells in by_plate.items():
            total += trajectory.plan_routine(plate_wells, layout=layout, plate_number=plate).total_time_s
    except Exception as exc:
        return jsonify({"seconds": 0, "error": str(exc)}), 400
    return jsonify({"seconds": total})


@app.route("/api/config/calibrate", methods=["POST"])
def config_calibrate():
    if kinematics is None:
        return jsonify({"error": "kinematics unavailable"}), 503
    data = request.get_json() or {}
    try:
        axis = data.get("axis")
        value = kinematics.calibrate(axis, data.get("commanded_steps"), data.get("measured_mm"))
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400
    conn = get_db()
    try:
        key = f"steps_per_mm.{axis}"
        conn.execute("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", (key, str(value)))
        conn.commit()
        return jsonify({"axis": axis, "steps_per_mm": value})
    finally:
        conn.close()


def _flatten_plate_payload(plates):
    quadrant_to_plate = {"topLeft": 1, "topRight": 2, "bottomLeft": 3, "bottomRight": 4}
    rows = []
    for quadrant, plate in plates.items():
        if not plate:
            continue
        layout = plate.get("layout") or "96-well"
        wells = plate.get("wells") or []
        for row_index, row in enumerate(wells):
            for col_index, well in enumerate(row):
                rows.append({
                    **(well or {}),
                    "plateNumber": quadrant_to_plate.get(quadrant, 1),
                    "wellId": f"{chr(ord('A') + row_index)}{col_index + 1}",
                    "layout": layout,
                })
    return rows


if __name__ == "__main__":
    init_db()
    ROUTINES_DIR.mkdir(parents=True, exist_ok=True)
    ACTIVE_ROUTINES_DIR.mkdir(parents=True, exist_ok=True)
    PICTURES_DIR.mkdir(parents=True, exist_ok=True)
    app.run(host=BACKEND_HOST, port=BACKEND_PORT, debug=BACKEND_DEBUG)

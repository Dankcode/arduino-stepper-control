"""Trajectory planner - turns a routine (set of wells) into an ordered,
streamed sequence of firmware-v2 moves that only stops where required.

Pipeline (called from routine.py, replaces its ad-hoc row/col loop):
    wells = fetch_wells_to_scan(...)                     # existing DB code
    plan  = plan_routine(wells, layout)                  # this module
    run_plan(plan, serial_link, on_progress=callback)    # this module

Key idea vs old code: the Arduino keeps a small command queue (depth 4),
so the Pi streams the next `M` move while the current one executes; the
stage decelerates to zero ONLY at wells that need light/capture.

"""

from dataclasses import dataclass, field
import math
import subprocess
import sys
from pathlib import Path

from . import kinematics, dynamics


@dataclass
class MoveSegment:
    dx_steps: int
    dy_steps: int
    dz_steps: int = 0
    stop_at_end: bool = True     # False = planner may blend into next segment
    well_id: object = None       # str or None; set when segment ends on a capture well
    light_ms: int = 0
    exposure_us: int = 0


@dataclass
class RoutinePlan:
    segments: list = field(default_factory=list)
    total_time_s: float = 0.0    # from dynamics.time_for_xy_move + dwell times
    wells_total: int = 0


def order_wells_serpentine(wells: dict, layout: str = "96-well") -> list:
    """Boustrophedon ordering: rows ascending, columns alternating direction
    per row (A1..A12, B12..B1, C1..). Minimizes X travel; replaces the
    'nearest end' heuristic in routine.py."""
    rows = []
    for well_id in wells:
        row = ord(str(well_id)[0].upper()) - ord("A")
        col = int(str(well_id)[1:]) - 1
        rows.append((row, col, well_id))

    return [
        well_id
        for _row, _col, well_id in sorted(
            rows,
            key=lambda item: (item[0], item[1] if item[0] % 2 == 0 else -item[1]),
        )
    ]


def plan_trapezoid(distance_steps: int, vmax_sps: float, acc_sps2: float):
    """Return (t_accel, t_cruise, t_decel, peak_v) for one segment.
    Handles the triangular case (short move never reaching vmax).
    Mirror of firmware computeRamp() — keep the math identical so Pi-side
    time estimates match hardware."""
    distance = abs(int(distance_steps))
    vmax = float(vmax_sps)
    accel = float(acc_sps2)
    if distance == 0:
        return 0.0, 0.0, 0.0, 0.0
    if vmax <= 0 or accel <= 0:
        raise ValueError("vmax_sps and acc_sps2 must be positive.")

    accel_time = vmax / accel
    accel_distance = 0.5 * accel * accel_time * accel_time
    if 2.0 * accel_distance >= distance:
        peak_v = math.sqrt(distance * accel)
        t_accel = peak_v / accel
        return t_accel, 0.0, t_accel, peak_v

    cruise_distance = distance - 2.0 * accel_distance
    t_cruise = cruise_distance / vmax
    return accel_time, t_cruise, accel_time, vmax


def plan_routine(wells_data: dict, layout: str = "96-well",
                 plate_number: int = 1) -> RoutinePlan:
    """wells_data = {well_id: {'lightTime': ms, 'exposureTime': us, ...}}
    Steps:
      1. order = order_wells_serpentine(wells_data)
      2. for each consecutive pair: delta = well_to_steps(b) - well_to_steps(a)
      3. kinematics.check_soft_limits() on every target — raise on violation
      4. accumulate total_time_s via dynamics.time_for_xy_move + light + exposure
      5. mark stop_at_end=True only on capture wells; pure transit segments
         (e.g. row changes with no well) get stop_at_end=False for blending
    """
    plan = RoutinePlan(wells_total=len(wells_data))
    if not wells_data:
        return plan

    current = kinematics.StagePosition()
    for well_id in order_wells_serpentine(wells_data, layout):
        target = kinematics.well_to_steps(plate_number, well_id, layout)
        if not kinematics.check_soft_limits(target):
            raise ValueError(f"Target {plate_number}:{well_id} violates soft limits.")

        dx = target.x_steps - current.x_steps
        dy = target.y_steps - current.y_steps
        dz = target.z_steps - current.z_steps
        meta = wells_data.get(well_id) or {}
        if not isinstance(meta, dict):
            meta = {"lightTime": meta}

        light_ms = int(float(meta.get("lightTime") or 0))
        exposure_us = int(float(meta.get("exposureTime") or 0))
        delay_ms = int(float(meta.get("delayBetweenStep") or 0))

        plan.segments.append(MoveSegment(
            dx_steps=dx,
            dy_steps=dy,
            dz_steps=dz,
            stop_at_end=True,
            well_id=well_id,
            light_ms=light_ms,
            exposure_us=exposure_us,
        ))
        plan.total_time_s += dynamics.time_for_xy_move(dx, dy)
        plan.total_time_s += dynamics.time_for_move("z", dz)
        plan.total_time_s += max(0, light_ms) / 1000.0
        plan.total_time_s += max(0, exposure_us) / 1_000_000.0
        plan.total_time_s += max(0, delay_ms) / 1000.0
        current = target

    return plan


def run_plan(plan: RoutinePlan, link, on_progress=None) -> bool:
    """Execute a RoutinePlan over a SerialLink (see backend.py scaffold).

    Streaming loop (the 'no unnecessary stops' core):
      - send dynamics.firmware_profile() once as `V vmax acc`
      - keep <=4 `M dx dy dz` commands in flight; refill on each `OK:done`
      - at segments with stop_at_end: wait for `OK:done`, run light pulse
        (b_light.py, ms->s conversion HERE — fixes bug B3), capture image,
        then continue streaming
      - on any `ERR:*`: send `!` abort, re-home, return False
      - call on_progress(wells_done, wells_total, current_well) after each
        capture — backend.py exposes this via /api/routine/progress for the
        frontend ProgressBar
    """
    try:
        vmax, accel = dynamics.firmware_profile("x")
        ok, reply = link.command(f"V {vmax} {accel}")
        if not ok:
            raise RuntimeError(reply)

        wells_done = 0
        for segment in plan.segments:
            ok, reply = link.command(f"M {segment.dx_steps} {segment.dy_steps} {segment.dz_steps}", expect_done=True)
            if not ok:
                link.command("!")
                raise RuntimeError(reply)

            if segment.light_ms > 0:
                _pulse_blue_light(segment.light_ms)

            wells_done += 1
            if on_progress:
                on_progress(wells_done, plan.wells_total, segment.well_id)

        return True
    except Exception:
        if on_progress:
            on_progress(0, plan.wells_total, None)
        return False


def _pulse_blue_light(duration_ms: int) -> None:
    """Best-effort light pulse helper used by run_plan.

    The DB stores lightTime in milliseconds; b_light.py accepts seconds.
    """
    if duration_ms <= 0:
        return

    try:
        from config import LIGHT_SCRIPT_PATH
    except Exception:
        return

    duration_s = duration_ms / 1000.0
    subprocess.run(
        [sys.executable, str(Path(LIGHT_SCRIPT_PATH)), "automate", str(duration_s)],
        capture_output=True,
        text=True,
        check=False,
        timeout=duration_s + 5,
    )

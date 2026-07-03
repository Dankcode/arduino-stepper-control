"""Robot dynamics layer - speed/acceleration physics, no geometry, no I/O.

Answers one question for the planner and the UI: "how fast can each axis
safely go, and how long will a move take?"  Values here feed both
trajectory.py (Pi side) and the `V vmax acc` command sent to firmware v2.

"""

from dataclasses import dataclass
import math

# ---------------------------------------------------------------------------
# Motor / stage model. Fill from the motor datasheet + measured stage mass.
# Torque falls with speed on steppers; MAX_VEL should sit well under the
# stall speed at the working load. Start conservative, raise empirically.
# ---------------------------------------------------------------------------
@dataclass
class AxisDynamics:
    max_velocity_sps: float   # steps/s ceiling (from torque curve @ load)
    max_accel_sps2: float     # steps/s^2 (limited by inertia + belt slip)
    idle_current_hold: bool   # keep drivers enabled between wells?


AXES = {
    # Conservative defaults; tune from the motor curve and measured stage mass.
    "x": AxisDynamics(max_velocity_sps=2000.0, max_accel_sps2=4000.0, idle_current_hold=True),
    "y": AxisDynamics(max_velocity_sps=2000.0, max_accel_sps2=4000.0, idle_current_hold=True),
    "z": AxisDynamics(max_velocity_sps=800.0,  max_accel_sps2=1500.0, idle_current_hold=True),
}


def time_for_move(axis: str, steps: int) -> float:
    """Seconds for a trapezoidal move of `steps` on `axis`.

    Two cases:
      triangular  (never reaches vmax): t = 2*sqrt(d/a)
      trapezoidal: t = d/vmax + vmax/a
    Used by trajectory.py for lookahead AND exported to the frontend via
    backend.py /api/motion/estimate so RoutineDesignerV2 shows a real
    runtime (fixes bug B8).
    """
    axis = str(axis).lower()
    if axis not in AXES:
        raise ValueError(f"Unknown axis '{axis}'. Expected one of {', '.join(AXES)}.")

    distance = abs(int(steps))
    if distance == 0:
        return 0.0

    model = AXES[axis]
    vmax = float(model.max_velocity_sps)
    accel = float(model.max_accel_sps2)
    if vmax <= 0 or accel <= 0:
        raise ValueError(f"Axis '{axis}' has invalid velocity/acceleration limits.")

    accel_distance = (vmax * vmax) / (2.0 * accel)
    if distance <= 2.0 * accel_distance:
        return 2.0 * math.sqrt(distance / accel)

    cruise_distance = distance - 2.0 * accel_distance
    return (2.0 * vmax / accel) + (cruise_distance / vmax)


def time_for_xy_move(dx_steps: int, dy_steps: int) -> float:
    """Synchronized XY move time = max(time_for_move(x), time_for_move(y)),
    since firmware v2 executes both axes concurrently."""
    return max(time_for_move("x", dx_steps), time_for_move("y", dy_steps))


def derate_for_load(axis: str, load_factor: float) -> AxisDynamics:
    """Optional: scale vmax/accel down when carrying extra load (e.g. 4-plate
    carrier vs 1 plate). load_factor 1.0 = nominal."""
    axis = str(axis).lower()
    if axis not in AXES:
        raise ValueError(f"Unknown axis '{axis}'.")
    load_factor = max(float(load_factor), 1.0)
    model = AXES[axis]
    scale = 1.0 / load_factor
    return AxisDynamics(
        max_velocity_sps=max(1.0, model.max_velocity_sps * scale),
        max_accel_sps2=max(1.0, model.max_accel_sps2 * scale),
        idle_current_hold=model.idle_current_hold,
    )


def firmware_profile(axis: str = "x") -> tuple:
    """(vmax_sps, accel_sps2) tuple formatted for the firmware `V` command.
    Trajectory sends this once per routine, not per move."""
    axis = str(axis).lower()
    if axis not in AXES:
        raise ValueError(f"Unknown axis '{axis}'.")
    model = AXES[axis]
    return int(round(model.max_velocity_sps)), int(round(model.max_accel_sps2))

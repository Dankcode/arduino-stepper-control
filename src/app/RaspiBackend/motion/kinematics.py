"""Kinematics layer - pure geometry, no serial I/O.

Maps between three coordinate spaces:
  well space   (plate, row, col)          e.g. plate 1, "B7"
  stage space  (x_mm, y_mm, z_mm)         physical millimetres from home
  motor space  (x_steps, y_steps, z_steps) integer steps from home
"""

from dataclasses import dataclass
import math
import re

# ---------------------------------------------------------------------------
# Calibration constants — measured once via calibrate(), then persisted.
# backend.py persists calibration overrides in SQLite's config table.
# ---------------------------------------------------------------------------
STEPS_PER_MM = {"x": 80.0, "y": 80.0, "z": 400.0}  # placeholder values
WELL_PITCH_MM = {"96-well": 9.0, "48-well": 13.0}   # ANSI/SLAS standard pitches
PLATE_ORIGIN_MM = {                                  # A1 center per quadrant
    1: (0.0, 0.0), 2: (110.0, 0.0), 3: (0.0, 75.0), 4: (110.0, 75.0),
}
SOFT_LIMITS_MM = {"x": (0.0, 220.0), "y": (0.0, 150.0), "z": (0.0, 10.0)}


@dataclass
class StagePosition:
    """Canonical position object passed between kinematics/trajectory/routine."""
    x_steps: int = 0
    y_steps: int = 0
    z_steps: int = 0

    def as_mm(self):
        return {
            "x": steps_to_mm("x", self.x_steps),
            "y": steps_to_mm("y", self.y_steps),
            "z": steps_to_mm("z", self.z_steps),
        }


def _axis(axis: str) -> str:
    axis = str(axis).lower()
    if axis not in STEPS_PER_MM:
        raise ValueError(f"Unknown axis '{axis}'. Expected one of x, y, z.")
    return axis


def _layout_dimensions(layout: str) -> tuple[int, int]:
    if layout == "96-well":
        return 8, 12
    if layout == "48-well":
        return 6, 8
    raise ValueError("layout must be '96-well' or '48-well'")


def _parse_well_id(well_id: str, layout: str) -> tuple[int, int]:
    match = re.fullmatch(r"([A-Za-z])(\d{1,2})", str(well_id).strip())
    if not match:
        raise ValueError(f"Invalid well id '{well_id}'. Expected e.g. A1 or H12.")

    row = ord(match.group(1).upper()) - ord("A")
    col = int(match.group(2)) - 1
    rows, cols = _layout_dimensions(layout)
    if row < 0 or row >= rows or col < 0 or col >= cols:
        raise ValueError(f"Well '{well_id}' is outside a {layout} plate.")
    return row, col


def mm_to_steps(axis: str, mm: float) -> int:
    """Convert millimetres to motor steps for one axis (round to nearest int)."""
    axis = _axis(axis)
    return int(round(float(mm) * STEPS_PER_MM[axis]))


def steps_to_mm(axis: str, steps: int) -> float:
    """Inverse of mm_to_steps."""
    axis = _axis(axis)
    return float(steps) / STEPS_PER_MM[axis]


def well_to_stage_mm(plate_number: int, well_id: str, layout: str = "96-well"):
    """Well ID ('B7') -> absolute stage (x_mm, y_mm).

    row = ord(well_id[0]) - 65, col = int(well_id[1:]) - 1
    x = PLATE_ORIGIN_MM[plate][0] + col * pitch
    y = PLATE_ORIGIN_MM[plate][1] + row * pitch
    Validate against layout dimensions (96: 8x12, 48: 6x8). Raise
    ValueError outside plate bounds.
    """
    if plate_number not in PLATE_ORIGIN_MM:
        raise ValueError(f"Unknown plate number '{plate_number}'. Expected 1-4.")

    row, col = _parse_well_id(well_id, layout)
    pitch = WELL_PITCH_MM[layout]
    origin_x, origin_y = PLATE_ORIGIN_MM[plate_number]
    return origin_x + col * pitch, origin_y + row * pitch


def well_to_steps(plate_number: int, well_id: str, layout: str = "96-well") -> StagePosition:
    """Well ID -> absolute motor steps (composition of the two functions above).
    Used by trajectory.plan_routine() as the target list."""
    x_mm, y_mm = well_to_stage_mm(plate_number, well_id, layout)
    pos = StagePosition(
        x_steps=mm_to_steps("x", x_mm),
        y_steps=mm_to_steps("y", y_mm),
        z_steps=0,
    )
    if not check_soft_limits(pos):
        raise ValueError(f"Well {plate_number}:{well_id} is outside soft limits.")
    return pos


def steps_to_well(pos: StagePosition, layout: str = "96-well"):
    """Nearest (plate_number, well_id) for a stage position — for UI display
    and post-abort recovery. Return None if farther than pitch/2 from a center."""
    x_mm = steps_to_mm("x", pos.x_steps)
    y_mm = steps_to_mm("y", pos.y_steps)
    pitch = WELL_PITCH_MM[layout]
    rows, cols = _layout_dimensions(layout)

    best = None
    best_distance = math.inf
    for plate_number, (origin_x, origin_y) in PLATE_ORIGIN_MM.items():
        col = round((x_mm - origin_x) / pitch)
        row = round((y_mm - origin_y) / pitch)
        if row < 0 or row >= rows or col < 0 or col >= cols:
            continue
        center_x = origin_x + col * pitch
        center_y = origin_y + row * pitch
        distance = math.hypot(x_mm - center_x, y_mm - center_y)
        if distance < best_distance:
            best_distance = distance
            best = plate_number, f"{chr(ord('A') + row)}{col + 1}"

    return best if best_distance <= pitch / 2 else None


def check_soft_limits(pos: StagePosition) -> bool:
    """True if pos is inside SOFT_LIMITS_MM on all axes. Trajectory planner
    must refuse to emit moves that violate this."""
    mm = pos.as_mm()
    for axis, value in mm.items():
        lo, hi = SOFT_LIMITS_MM[axis]
        if value < lo or value > hi:
            return False
    return True


def calibrate(axis: str, commanded_steps: int, measured_mm: float) -> float:
    """Update STEPS_PER_MM[axis] from a measured test move and return it.
    Called by backend.py /api/config/calibrate; persistence is handled there."""
    axis = _axis(axis)
    commanded_steps = abs(int(commanded_steps))
    measured_mm = abs(float(measured_mm))
    if commanded_steps <= 0 or measured_mm <= 0:
        raise ValueError("commanded_steps and measured_mm must be positive.")
    STEPS_PER_MM[axis] = commanded_steps / measured_mm
    return STEPS_PER_MM[axis]

"""Travel-time model.

Travel time between two grid points is the Euclidean distance scaled by a
speed factor (minutes per grid unit) and a traffic multiplier. Computing this
live means the UI's "traffic penalty" slider genuinely changes the distance
matrix the solver sees, rather than reading a precomputed table.
"""

from __future__ import annotations

import math


def travel_minutes(
    ax: float,
    ay: float,
    bx: float,
    by: float,
    speed_factor: float = 1.0,
    traffic: float = 1.0,
) -> int:
    """Integer travel minutes between (ax, ay) and (bx, by).

    Integer output keeps the CP-SAT model fully integral.
    """
    distance = math.hypot(ax - bx, ay - by)
    return int(round(distance * speed_factor * traffic))


def build_matrix(
    points: list[tuple[float, float]],
    speed_factor: float = 1.0,
    traffic: float = 1.0,
) -> dict[tuple[int, int], int]:
    """Symmetric travel matrix keyed by point-index pairs."""
    matrix: dict[tuple[int, int], int] = {}
    for i, (ax, ay) in enumerate(points):
        for j, (bx, by) in enumerate(points):
            matrix[(i, j)] = travel_minutes(ax, ay, bx, by, speed_factor, traffic)
    return matrix

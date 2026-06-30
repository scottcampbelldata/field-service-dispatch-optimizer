"""Travel-time model and pluggable provider interface.

A *travel provider* is any callable ``(ax, ay, bx, by) -> int`` returning the
**base** one-way travel time in minutes between two points, where ``x`` is
longitude and ``y`` is latitude. Providers do not apply the traffic multiplier —
the optimizer layers that on top (see ``Instance.travel``), so the UI's traffic
slider scales whatever the provider returns (haversine or real road times).

* ``haversine`` — great-circle distance x a speed factor (min/km). The default:
  free, offline, deterministic. Powers the public demo.
* A matrix-backed provider (real road durations from a routing engine) is built
  in the I/O layer (``backend/app/routing.py``) and injected onto the Instance,
  so no network call ever happens inside the solver loop.
"""

from __future__ import annotations

import math
from typing import Callable, Protocol

EARTH_RADIUS_KM = 6371.0088

# A provider returns BASE one-way minutes (no traffic multiplier applied).
TravelFn = Callable[[float, float, float, float], int]


class TravelProvider(Protocol):
    def __call__(self, ax: float, ay: float, bx: float, by: float) -> int: ...


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in kilometers."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def haversine_minutes(ax: float, ay: float, bx: float, by: float, speed_factor: float = 1.5) -> int:
    """Base minutes between (lon=ax, lat=ay) and (lon=bx, lat=by).

    ``speed_factor`` is minutes-per-kilometer (e.g. 1.5 ≈ 40 km/h door-to-door).
    Integer output keeps the CP-SAT model fully integral.
    """
    return int(round(haversine_km(ay, ax, by, bx) * speed_factor))


def euclidean_minutes(ax: float, ay: float, bx: float, by: float, speed_factor: float = 1.0) -> int:
    """Grid distance in abstract units x speed factor. Used by unit tests so
    small hand-built instances have predictable, checkable travel times."""
    return int(round(math.hypot(ax - bx, ay - by) * speed_factor))


def make_haversine_provider(speed_factor: float = 1.5) -> TravelFn:
    return lambda ax, ay, bx, by: haversine_minutes(ax, ay, bx, by, speed_factor)


def make_euclidean_provider(speed_factor: float = 1.0) -> TravelFn:
    return lambda ax, ay, bx, by: euclidean_minutes(ax, ay, bx, by, speed_factor)


def make_matrix_provider(
    points: list[tuple[float, float]],
    minutes: list[list[float]],
    fallback: TravelFn,
) -> TravelFn:
    """Provider backed by a precomputed NxN duration matrix.

    ``points`` are (lon, lat) pairs aligned with ``minutes`` rows/cols. Lookups
    are by rounded coordinate; any pair missing from the matrix (or an out-of-set
    point such as a future ad-hoc location) falls back to ``fallback``.
    """
    index = {_key(lon, lat): i for i, (lon, lat) in enumerate(points)}

    def lookup(ax: float, ay: float, bx: float, by: float) -> int:
        i = index.get(_key(ax, ay))
        j = index.get(_key(bx, by))
        if i is None or j is None:
            return fallback(ax, ay, bx, by)
        return int(round(minutes[i][j]))

    return lookup


def _key(lon: float, lat: float) -> tuple[float, float]:
    return (round(lon, 6), round(lat, 6))

"""Real road-routing providers (bring your own key).

Builds a travel provider backed by real driving durations from a routing engine,
to be injected onto an Instance before solving. Two backends:

* **OpenRouteService** — set ``ROUTING_PROVIDER=openrouteservice`` and provide
  your own free key in ``ORS_API_KEY``.
* **OSRM** — set ``ROUTING_PROVIDER=osrm`` and ``OSRM_BASE_URL`` (self-hosted or
  the public demo server). No key required.

Everything degrades gracefully: if the provider is ``haversine`` (default), not
configured, over the size cap, or the call fails, this returns ``None`` (the
Instance then uses its built-in haversine travel) plus a human-readable label
describing what is actually active. No API key ever lives in the repo — it is
read from the environment only.
"""

from __future__ import annotations

import json
import urllib.request

from backend.app.config import settings
from backend.optimizer.domain import Instance
from backend.optimizer.travel import TravelFn, make_haversine_provider, make_matrix_provider

HAVERSINE_LABEL = "Haversine (great-circle)"


def build_travel_provider(instance: Instance) -> tuple[TravelFn | None, str]:
    """Return (provider_or_None, active_label).

    ``None`` means "use the Instance's built-in haversine". The label always
    describes what will actually be used so the UI can show it honestly.
    """
    provider = (settings.routing_provider or "haversine").lower()
    if provider in ("", "haversine"):
        return None, HAVERSINE_LABEL

    points = _instance_points(instance)
    fallback = make_haversine_provider(instance.params.speed_factor)

    if len(points) > settings.routing_max_points:
        return None, f"{HAVERSINE_LABEL} — {len(points)} points over the {settings.routing_max_points} cap for road routing"

    try:
        if provider == "openrouteservice":
            if not settings.ors_api_key:
                return None, f"{HAVERSINE_LABEL} — set ORS_API_KEY to enable OpenRouteService"
            matrix = _ors_matrix(points, settings.ors_api_key)
            label = "OpenRouteService (real road)"
        elif provider == "osrm":
            if not settings.osrm_base_url:
                return None, f"{HAVERSINE_LABEL} — set OSRM_BASE_URL to enable OSRM"
            matrix = _osrm_table(points, settings.osrm_base_url)
            label = "OSRM (real road)"
        else:
            return None, HAVERSINE_LABEL

        matrix = _fill_missing(matrix, points, fallback)
        return make_matrix_provider(points, matrix, fallback), label
    except Exception as exc:  # network/parse/quota — never break the demo
        return None, f"{HAVERSINE_LABEL} — {provider} unavailable ({type(exc).__name__})"


def configured_label() -> str:
    """Best-effort label of the configured provider, without making a call."""
    provider = (settings.routing_provider or "haversine").lower()
    if provider == "openrouteservice":
        return "OpenRouteService (real road)" if settings.ors_api_key else f"{HAVERSINE_LABEL} — no ORS_API_KEY"
    if provider == "osrm":
        return "OSRM (real road)" if settings.osrm_base_url else f"{HAVERSINE_LABEL} — no OSRM_BASE_URL"
    return HAVERSINE_LABEL


def _instance_points(instance: Instance) -> list[tuple[float, float]]:
    """Distinct (lon, lat) points: every technician home + every job site."""
    seen: set[tuple[float, float]] = set()
    points: list[tuple[float, float]] = []

    def add(lon: float, lat: float) -> None:
        key = (round(lon, 6), round(lat, 6))
        if key not in seen:
            seen.add(key)
            points.append((lon, lat))

    for t in instance.technicians:
        add(t.home_x, t.home_y)
    for j in instance.jobs:
        add(j.x, j.y)
    return points


def _fill_missing(matrix, points, fallback: TravelFn):
    """Replace any None (unreachable) cell with the haversine fallback."""
    for i, (ax, ay) in enumerate(points):
        for j, (bx, by) in enumerate(points):
            if matrix[i][j] is None:
                matrix[i][j] = fallback(ax, ay, bx, by)
    return matrix


# --- provider calls (seams kept small so tests can monkeypatch _post/_get) ---

def _ors_matrix(points, api_key: str):
    body = json.dumps({
        "locations": [[lon, lat] for lon, lat in points],
        "metrics": ["duration"],
    }).encode()
    headers = {"Authorization": api_key, "Content-Type": "application/json"}
    data = _post_json("https://api.openrouteservice.org/v2/matrix/driving-car", body, headers)
    # durations are seconds -> minutes
    return [[None if v is None else v / 60.0 for v in row] for row in data["durations"]]


def _osrm_table(points, base_url: str):
    coords = ";".join(f"{lon},{lat}" for lon, lat in points)
    url = f"{base_url.rstrip('/')}/table/v1/driving/{coords}?annotations=duration"
    data = _get_json(url)
    return [[None if v is None else v / 60.0 for v in row] for row in data["durations"]]


def _post_json(url: str, body: bytes, headers: dict, timeout: float = 20.0) -> dict:
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def _get_json(url: str, timeout: float = 20.0) -> dict:
    with urllib.request.urlopen(url, timeout=timeout) as resp:
        return json.loads(resp.read().decode())

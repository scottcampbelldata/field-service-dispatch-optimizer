from backend.app import routing
from backend.app.config import settings
from backend.tests.conftest import HVAC, make_instance, make_job, make_tech


def _metro_instance():
    techs = [make_tech(1, -96.80, 32.80, {HVAC})]
    jobs = [
        make_job(10, -96.70, 32.85, HVAC),
        make_job(11, -96.60, 32.90, HVAC),
    ]
    return make_instance(techs, jobs)


def test_default_is_haversine(monkeypatch):
    monkeypatch.setattr(settings, "routing_provider", "haversine")
    fn, label = routing.build_travel_provider(_metro_instance())
    assert fn is None
    assert label == routing.HAVERSINE_LABEL


def test_ors_without_key_falls_back(monkeypatch):
    monkeypatch.setattr(settings, "routing_provider", "openrouteservice")
    monkeypatch.setattr(settings, "ors_api_key", "")
    fn, label = routing.build_travel_provider(_metro_instance())
    assert fn is None
    assert "ORS_API_KEY" in label


def test_ors_with_key_builds_matrix_provider(monkeypatch):
    monkeypatch.setattr(settings, "routing_provider", "openrouteservice")
    monkeypatch.setattr(settings, "ors_api_key", "test-key")

    # 3 unique points: tech home, job 10 site, job 11 site (seconds).
    durations = [[0, 600, 900], [600, 0, 300], [900, 300, 0]]

    def fake_post(url, body, headers, timeout=20.0):
        assert headers["Authorization"] == "test-key"
        return {"durations": durations}

    monkeypatch.setattr(routing, "_post_json", fake_post)

    fn, label = routing.build_travel_provider(_metro_instance())
    assert fn is not None
    assert label == "OpenRouteService (real road)"
    # tech home -> job 10 site = 600s = 10 min
    assert fn(-96.80, 32.80, -96.70, 32.85) == 10
    # job 10 -> job 11 = 300s = 5 min
    assert fn(-96.70, 32.85, -96.60, 32.90) == 5


def test_over_point_cap_falls_back(monkeypatch):
    monkeypatch.setattr(settings, "routing_provider", "openrouteservice")
    monkeypatch.setattr(settings, "ors_api_key", "test-key")
    monkeypatch.setattr(settings, "routing_max_points", 1)
    fn, label = routing.build_travel_provider(_metro_instance())
    assert fn is None
    assert "cap" in label


def test_provider_failure_falls_back(monkeypatch):
    monkeypatch.setattr(settings, "routing_provider", "osrm")
    monkeypatch.setattr(settings, "osrm_base_url", "http://localhost:9999")

    def boom(url, timeout=20.0):
        raise OSError("connection refused")

    monkeypatch.setattr(routing, "_get_json", boom)
    fn, label = routing.build_travel_provider(_metro_instance())
    assert fn is None
    assert "unavailable" in label

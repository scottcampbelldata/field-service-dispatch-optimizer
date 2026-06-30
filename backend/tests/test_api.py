import pytest
from fastapi.testclient import TestClient

from backend.app.main import app


@pytest.fixture(scope="module")
def client():
    # Context-manager form runs the lifespan (seeds the DB).
    with TestClient(app) as c:
        yield c


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_system(client):
    r = client.get("/api/system")
    body = r.json()
    assert body["solver"] == "Google OR-Tools CP-SAT"
    assert body["technicians"] > 0 and body["jobs"] > 0
    assert len(body["skills"]) == 6


def test_workload(client):
    body = client.get("/api/workload").json()
    assert len(body["technicians"]) > 0
    assert len(body["jobs"]) > 0
    assert {"id", "name"} <= set(body["skills"][0].keys())


def test_optimize_returns_comparison(client):
    payload = {"technician_count": 6, "job_count": 30, "max_solve_seconds": 3}
    body = client.post("/api/optimize", json=payload).json()

    assert "batch_id" in body
    base = body["baseline"]["metrics"]
    opt = body["optimized"]["metrics"]
    # Optimizer never completes fewer jobs than the baseline (warm start).
    assert opt["jobs_completed"] >= base["jobs_completed"]
    assert body["optimized"]["routes"]  # at least one technician has a route

    cmp = body["comparison"]
    assert set(cmp.keys()) >= {
        "jobs_completed_delta", "sla_breaches_delta", "travel_hours_delta",
        "overtime_hours_delta", "unassigned_delta", "objective_delta",
    }


def test_get_run(client):
    body = client.post("/api/optimize", json={"job_count": 25, "technician_count": 6, "max_solve_seconds": 3}).json()
    run_id = body["optimized"]["run_id"]
    run = client.get(f"/api/runs/{run_id}").json()
    assert run["metrics"]["run_id"] == run_id
    assert len(run["assignments"]) > 0


def test_unknown_run_404(client):
    assert client.get("/api/runs/999999").status_code == 404

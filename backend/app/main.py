"""FastAPI application for the Field Service Dispatch Optimizer."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from backend.app import repository, routing, serialize, solve_service
from backend.app.config import settings
from backend.app.db import SessionLocal
from backend.app.schemas import OptimizeRequest


@asynccontextmanager
async def lifespan(app: FastAPI):
    repository.seed_if_empty()
    yield


app = FastAPI(
    title="Field Service Dispatch Optimizer",
    description="OR-Tools CP-SAT dispatch optimization vs a manual baseline.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/system")
def system() -> dict:
    inst = repository.load_base()
    return {
        "name": "Atlas Field Services — Dispatch Optimizer",
        "solver": "Google OR-Tools CP-SAT",
        "seed": settings.seed,
        "technicians": len(inst.technicians),
        "sites": len(inst.sites),
        "jobs": len(inst.jobs),
        "skills": [s.name for s in inst.skills],
        "synthetic": True,
        "routing_provider": routing.configured_label(),
    }


@app.get("/api/workload")
def workload() -> dict:
    return serialize.workload(repository.load_base())


@app.post("/api/optimize")
def optimize(req: OptimizeRequest) -> dict:
    return solve_service.optimize(req.to_transform_kwargs(), routing_override=req.routing_override())


@app.get("/api/runs/{run_id}")
def get_run(run_id: int) -> dict:
    with SessionLocal() as session:
        metrics = repository.run_metrics(session, run_id)
        if metrics is None:
            raise HTTPException(status_code=404, detail="run not found")
        utilization = repository.run_utilization(session, run_id)
        assignments = session.execute(
            text(
                "SELECT job_id, tech_id, seq_order, planned_start, planned_end, "
                "is_sla_breach, is_overtime, unassigned_reason "
                "FROM run_assignments WHERE run_id = :rid ORDER BY tech_id, seq_order"
            ),
            {"rid": run_id},
        ).mappings().all()
    return {
        "run_id": run_id,
        "metrics": metrics,
        "utilization": utilization,
        "assignments": [dict(a) for a in assignments],
    }

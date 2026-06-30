"""Orchestrates an optimize request: transform -> baseline -> optimized ->
persist both runs -> read scorecards back from the analytical views.
"""

from __future__ import annotations

import uuid
from dataclasses import replace

from backend.app import repository, routing, serialize
from backend.app.db import SessionLocal
from backend.optimizer.baseline import plan_baseline
from backend.optimizer.cp_sat_model import plan_optimized
from backend.optimizer.metrics import compare, plan_diagnostics, plan_metrics


def optimize(params: dict) -> dict:
    from backend.optimizer.transform import transform

    base = repository.load_base()
    inst = transform(base, **params)

    # Resolve the travel provider (real road routing if configured, else the
    # Instance's built-in haversine). Both baseline and optimizer then use it.
    travel_fn, routing_label = routing.build_travel_provider(inst)
    if travel_fn is not None:
        inst = replace(inst, travel_provider=travel_fn)

    baseline = plan_baseline(inst)
    optimized = plan_optimized(inst, warm_start=baseline)

    base_metrics = plan_metrics(inst, baseline)
    opt_metrics = plan_metrics(inst, optimized)

    batch_id = uuid.uuid4().hex[:12]
    with SessionLocal() as session:
        base_run_id = repository.save_run(session, batch_id, baseline, base_metrics, params)
        opt_run_id = repository.save_run(session, batch_id, optimized, opt_metrics, params)
        base_view = repository.run_metrics(session, base_run_id)
        opt_view = repository.run_metrics(session, opt_run_id)
        base_util = repository.run_utilization(session, base_run_id)
        opt_util = repository.run_utilization(session, opt_run_id)

    return {
        "batch_id": batch_id,
        "params": params,
        "baseline": {
            "run_id": base_run_id,
            "metrics": base_view,
            "utilization": base_util,
        },
        "optimized": {
            "run_id": opt_run_id,
            "metrics": opt_view,
            "utilization": opt_util,
            "routes": serialize.routes(inst, optimized),
            "unassigned": serialize.unassigned(inst, optimized),
        },
        "comparison": compare(base_metrics, opt_metrics),
        "diagnostics": plan_diagnostics(inst, optimized),
        "routing": {"provider": routing_label},
    }

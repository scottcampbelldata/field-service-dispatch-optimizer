# Architecture

```
                ┌──────────────────────────────────────────────┐
                │  Next.js frontend (App Router, TypeScript)     │
                │  /            Dispatch Board (controls + map)  │
                │  /results     Optimizer Results (routes)       │
                │  /compare     Baseline vs Optimized (money)    │
                │  /constraints Constraint Explorer (why)        │
                │  /capacity    Marginal Value of Capacity       │
                │  /scenarios   Scenario Simulator (chaos)       │
                │  /summary     Executive Summary (narrative)    │
                └───────────────┬──────────────────────────────┘
                                │  fetch JSON
                                ▼
                ┌──────────────────────────────────────────────┐
                │  FastAPI                                       │
                │  /api/workload   /api/optimize   /api/runs/:id │
                │  solve_service ─ transform ─ baseline + CP-SAT │
                └───────┬───────────────────────────┬──────────┘
                        │                           │
        pure-Python optimizer core           SQLAlchemy persistence
        (no DB imports)                      (SQLite local / Postgres prod)
        ┌────────────────────────┐          ┌──────────────────────────┐
        │ domain  travel          │          │ master data + run history │
        │ baseline  cp_sat_model  │          │ analytical SQL views      │
        │ transform  metrics      │          └──────────────────────────┘
        └────────────────────────┘
                        ▲
              seeded synthetic generator
              (build_base_instance, seed=42)
```

## Layering

The system is deliberately split so the hard part — the optimizer — is isolated
and fully testable.

- **Optimizer core** (`backend/optimizer/`) is pure Python. It imports no web
  framework and no database. Everything flows through the dataclasses in
  `domain.py` (`Instance`, `Plan`, `Assignment`). This is what makes the engine
  unit-testable without infrastructure and easy to reason about.
- **Generator** (`backend/app/generator.py`) builds one canonical, reproducible
  "day" as an `Instance`, with sites at real lat/long. Same seed ⇒ identical data.
- **Travel provider** is resolved behind one seam (`Instance.travel`). The default
  is offline haversine; `backend/app/routing.py` can inject a matrix-backed
  provider with real road durations from OpenRouteService (bring your own key) or
  OSRM, falling back to haversine on any error. The CP-SAT model uses directional
  arcs, so asymmetric road times need no model changes.
- **Persistence** (`backend/app/`) mirrors master data into the database and
  stores every solve, so SQL views can report on real runs.
- **API** (`backend/app/main.py`) is a thin orchestration layer.
- **Frontend** (`frontend/`) is a seven-page dashboard sharing one client context:
  Dispatch Board, Optimizer Results, Baseline vs Optimized, Constraint Explorer,
  Marginal Value of Capacity, Scenario Simulator, and Executive Summary.
- **Capacity analysis** (`backend/app/sweep_service.py`) sweeps crew size through
  the optimizer to chart the decision frontier — the marginal value of each added
  technician and the hire-vs-overtime trade-off. Reuses the engine; nothing persisted.

## Request flow for `POST /api/optimize`

1. The slider parameters arrive as an `OptimizeRequest`.
2. `transform()` applies them to the canonical day (subset technicians, scale
   the backlog, inject emergencies, simulate a skill shortage, resolve weights).
3. `plan_baseline()` runs the greedy manual dispatch.
4. `plan_optimized()` runs CP-SAT, **warm-started from the baseline** and with
   per-technician candidate capping so the live solve stays tractable.
5. Both plans are scored by `metrics.py` and persisted.
6. The response reads each run's scorecard back from the `v_run_metrics`
   analytical view and returns both plans plus the comparison deltas.

## Why SQLite locally and Postgres in production

The same SQLAlchemy models target both engines, and the analytical views are
written in portable SQL. Local development needs zero infrastructure (a SQLite
file); production uses Postgres via `docker-compose`. The optimizer never touches
the database either way.

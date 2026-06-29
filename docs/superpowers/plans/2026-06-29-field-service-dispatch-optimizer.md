# Field Service Dispatch Optimizer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a live operations-planning system that assigns technicians to service jobs under real constraints using OR-Tools CP-SAT, and compares the optimized plan against a naive greedy baseline to show measurable impact.

**Architecture:** Pure-Python optimizer core (CP-SAT model, greedy baseline, metrics) operating on in-memory dataclass instances — no DB dependency, fully unit-testable. A seeded generator produces the canonical "day". A SQLAlchemy persistence layer stores master data + solve runs (SQLite locally, Postgres in prod). FastAPI exposes workload/optimize/runs endpoints. Next.js renders the Dispatch Board and Baseline-vs-Optimized pages.

**Tech Stack:** Python 3.12, OR-Tools (CP-SAT), SQLAlchemy 2.0, FastAPI, Pydantic, pytest, Next.js (App Router) + TypeScript + Recharts, docker-compose (Postgres 16 for prod).

## Global Constraints

- Fully synthetic, seeded, reproducible data. No proprietary/employer data.
- DB-agnostic persistence: `DATABASE_URL` env var; default `sqlite:///./dispatch.db`, prod `postgresql+psycopg://...`.
- Optimizer core has ZERO database imports — operates on dataclasses only.
- CP-SAT bounded solve: `max_time_in_seconds` configurable (default 8).
- Travel computed live: `euclidean(a,b) * speed_factor * traffic_multiplier`.
- Baseline and optimizer share identical feasibility rules (skills, parts, shift).
- Analytical views written in portable SQL (runs on SQLite + Postgres).
- Frequent commits, one per task. TDD for the optimizer core and metrics.

---

## File Structure

```
backend/
  app/
    __init__.py
    config.py          # settings (DATABASE_URL, solve time)
    db.py              # SQLAlchemy engine/session
    models.py          # ORM: Technician, Skill, TechnicianSkill, Site, Job, OptimizationRun, RunAssignment
    schemas.py         # Pydantic request/response models
    repository.py      # load workload, persist runs, read run
    main.py            # FastAPI app + routes
  optimizer/
    __init__.py
    domain.py          # frozen dataclasses: TechnicianDC, SiteDC, JobDC, Instance, Assignment, Plan
    travel.py          # travel_time, distance_matrix
    transform.py       # apply slider params to a base Instance
    baseline.py        # greedy planner
    cp_sat_model.py    # CP-SAT optimizer
    metrics.py         # compute PlanMetrics + comparison delta
  sql/
    analytical_views.sql
  tests/
    test_travel.py
    test_domain.py
    test_baseline.py
    test_cp_sat.py
    test_transform.py
    test_metrics.py
    test_generator.py
    test_api.py
data-generator/
  generate_synthetic_data.py
frontend/
  app/(board + compare pages), components/, charts/, lib/api.ts
docker-compose.yml, pyproject.toml, Makefile, tasks.ps1, README.md
docs/, deploy/, screenshots/
```

---

## Task 1: Project scaffold + dependencies

**Files:** Create `pyproject.toml`, `backend/__init__.py`, package `__init__.py` files, `.gitignore`.

**Steps:**
- [ ] Create `pyproject.toml` declaring deps: `ortools`, `sqlalchemy>=2`, `fastapi`, `uvicorn`, `pydantic-settings`, `psycopg[binary]`, `pytest`, `httpx`.
- [ ] Create venv, install deps. Verify `python -c "from ortools.sat.python import cp_model"` succeeds.
- [ ] `.gitignore` (venv, `__pycache__`, `*.db`, `node_modules`, `.next`).
- [ ] Commit.

## Task 2: Domain dataclasses (`optimizer/domain.py`)

**Produces:** `Skill`, `TechnicianDC(id,name,home_x,home_y,shift_start,shift_end,overtime_eligible,overtime_cap,skills:set[int])`, `SiteDC(id,name,x,y,zone)`, `JobDC(id,site,required_skill,priority,sla_deadline,duration,requires_part,part_available,is_emergency)`, `Instance(technicians,sites,jobs,params)`, `Assignment(job_id,tech_id,seq,start,end,is_sla_breach,is_overtime,reason)`, `Plan(plan_type,assignments,solve_seconds,status,objective)`.

- [ ] Write `test_domain.py`: construct an Instance, assert immutability + helper `Instance.job(id)`/`tech(id)` lookups.
- [ ] Implement dataclasses (frozen where sensible) + lookups.
- [ ] Run tests, commit.

## Task 3: Travel model (`optimizer/travel.py`)

**Produces:** `travel_minutes(ax,ay,bx,by,speed_factor,traffic) -> int`, `build_matrix(points, speed_factor, traffic) -> dict[(i,j),int]`.

- [ ] `test_travel.py`: distance 0 to self; symmetry; traffic multiplier scales linearly; known triangle.
- [ ] Implement Euclidean × speed × traffic, rounded to int minutes.
- [ ] Run, commit.

## Task 4: Greedy baseline (`optimizer/baseline.py`)

**Consumes:** domain, travel. **Produces:** `plan_baseline(instance) -> Plan`.

Algorithm: sort jobs by (priority asc=1 best, then sla_deadline). For each job, among technicians with the required skill and (if requires_part) part_available, who can insert the job at the end of their current route within shift (+overtime cap if eligible & allowed), pick the nearest by travel from their last position. Mark SLA breach if planned_end > sla_deadline. Unassigned jobs get a reason code.

- [ ] `test_baseline.py`: (a) job needing absent skill → unassigned reason `unassigned_no_skill`; (b) part unavailable → `unassigned_no_part`; (c) feasible job gets assigned to nearest tech; (d) no plan violates shift bounds.
- [ ] Implement.
- [ ] Run, commit.

## Task 5: CP-SAT optimizer (`optimizer/cp_sat_model.py`)

**Consumes:** domain, travel. **Produces:** `plan_optimized(instance, max_seconds=8) -> Plan`.

Model: per technician, `AddCircuit` over nodes {home, assigned jobs} with literal arc vars; optional bool `x[t,j]` (tech t does job j); `sum_t x[t,j] <= 1`; skill/part feasibility prune (don't create x for infeasible pairs); per-job interval with start var bounded by shift (or shift+overtime cap), arc implies travel+duration sequencing; overtime bool if end>shift_end (only allowed when params.overtime_allowed); sla_breach bool if end>sla_deadline (hard for priority==1 when params.sla_strictness=="strict"). Objective: maximize Σ priority_weight*assigned − traffic_w*travel − sla_w*breaches − ot_w*overtime − unassigned_w*unassigned, with weights from params. Set `max_time_in_seconds`, `num_search_workers=8`. Extract assignments with reason `assigned`; unassigned get reasons via same feasibility check as baseline.

- [ ] `test_cp_sat.py`: (a) tiny instance (2 techs, 3 jobs) returns a feasible plan; (b) optimized objective ≥ baseline objective on same instance; (c) respects skills (no infeasible assignment); (d) overtime disabled ⇒ no `is_overtime`; (e) solver returns within time bound.
- [ ] Implement.
- [ ] Run, commit.

## Task 6: Parameter transform (`optimizer/transform.py`)

**Produces:** `transform(base:Instance, params) -> Instance` and `default_params()`.

Params: `technician_count, job_count, traffic_penalty, emergency_rate, skill_shortage (skill name|None), sla_strictness ('lenient'|'normal'|'strict'), overtime_allowed, optimization_goal`. Subsets techs, scales jobs, flips emergencies, removes a skill's certifications, sets weights/multipliers. Deterministic given base (uses index-based selection, no RNG).

- [ ] `test_transform.py`: technician_count subsets; job_count scales; skill_shortage removes certs; strict raises sla weight; output is a valid Instance.
- [ ] Implement.
- [ ] Run, commit.

## Task 7: Metrics (`optimizer/metrics.py`)

**Produces:** `plan_metrics(instance, plan) -> dict` (jobs_completed, sla_breaches, travel_hours, overtime_hours, unassigned, utilization per tech, high_priority_protected_rate, bottleneck_skill); `compare(base_m, opt_m) -> dict` (deltas).

- [ ] `test_metrics.py`: hand-built plan → exact counts; bottleneck skill = skill with most unassigned/late; compare deltas correct.
- [ ] Implement.
- [ ] Run, commit.

## Task 8: Synthetic generator (`data-generator/generate_synthetic_data.py`)

**Produces:** `build_base_instance(seed=...) -> Instance` (also a CLI that loads into the DB via repository). ~12 techs, ~30 sites, ~120 jobs, 6 skills.

- [ ] `test_generator.py`: same seed → identical instance (determinism); counts in expected ranges; every job's required_skill is held by ≥1 tech (solvable base).
- [ ] Implement seeded generator producing an `Instance`.
- [ ] Run, commit.

## Task 9: Persistence — ORM models + db (`app/models.py`, `app/db.py`, `app/config.py`)

ORM tables per design §4. `JSON` type for params. `create_all()` + apply `analytical_views.sql`.

- [ ] Implement config (pydantic-settings, DATABASE_URL default sqlite), db engine/session, models.
- [ ] Smoke test: create_all on sqlite in-memory succeeds.
- [ ] Commit.

## Task 10: Analytical views (`sql/analytical_views.sql`)

Portable SQL views over `run_assignments` joined to `optimization_runs`: `v_run_metrics` (per run: completed, breaches, travel/overtime hours, unassigned), `v_run_utilization`, `v_bottleneck_skill`.

- [ ] Write portable SQL (standard aggregates, CASE). Apply on sqlite in a test; query returns rows.
- [ ] Commit.

## Task 11: Repository (`app/repository.py`)

**Produces:** `load_base()` (seed→DB once, return Instance), `save_plan(params, plan, instance)`, `get_run(id)`, `seed_if_empty()`.

- [ ] Implement; test save+read roundtrip on sqlite.
- [ ] Commit.

## Task 12: FastAPI app (`app/main.py`, `app/schemas.py`)

Routes: `GET /health`, `GET /api/system`, `GET /api/workload`, `POST /api/optimize` (transform → baseline + optimized → persist both → return plans+metrics+delta), `GET /api/runs/{id}`. CORS for frontend.

- [ ] `test_api.py` (httpx + TestClient on sqlite): health 200; workload returns techs/jobs; optimize returns both plans with metrics and delta where optimized ≥ baseline on jobs/objective.
- [ ] Implement.
- [ ] Run, commit.

## Task 13: Frontend scaffold + API client

- [ ] `npx create-next-app` (TS, App Router, Tailwind). `lib/api.ts` typed client. Env `NEXT_PUBLIC_API_BASE`.
- [ ] Commit.

## Task 14: Dispatch Board page (`/board`)

- [ ] Grid/pseudo-map (SVG) of sites + tech home bases; unassigned-jobs table; tech availability strip; slider control panel + Optimize button (navigates/POSTs).
- [ ] Verify renders against running API. Commit.

## Task 15: Baseline vs Optimized page (`/compare`)

- [ ] Metric cards (jobs, breaches, travel hrs, overtime hrs, unassigned), before/after bar charts (Recharts), utilization view, headline deltas, bottleneck-skill callout.
- [ ] Verify against API. Commit.

## Task 16: docker-compose + Makefile/tasks.ps1 + docs + README

- [ ] `docker-compose.yml` (postgres:16 + api + web). `Makefile`/`tasks.ps1` (install, seed, test, dev). `docs/` (optimization-model, data-dictionary, architecture, case-study). README with reviewer path + live links.
- [ ] Commit.

---

## Self-Review

- Spec coverage: §3 layout→Tasks 1,13,16; §4 data→Tasks 2,9; §5 CP-SAT→Task 5; §6 baseline→Task 4; §7 API→Task 12; §8 frontend→Tasks 14–15; §9 SQL views→Task 10; §10 tests→every core task; §11 deploy→Task 16. Covered.
- Adaptation noted: SQLite for local dev/test, Postgres for prod (same SQLAlchemy models + portable views) — keeps the project runnable without Docker while preserving the Postgres BI story.
- Types consistent across tasks (Instance/Plan/Assignment used uniformly).

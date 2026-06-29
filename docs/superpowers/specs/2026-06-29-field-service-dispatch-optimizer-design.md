# Field Service Dispatch Optimizer — Design

**Date:** 2026-06-29
**Status:** Approved (design); pending implementation plan
**Author:** Scott Campbell

A live operations-planning system that assigns technicians to service jobs under
real constraints (skills, travel, shift length, SLA, priority, duration,
overtime, parts), then compares an OR-Tools optimized plan against a naive
manual baseline to show measurable operational impact.

Synthetic domain: **Atlas Field Services**, a commercial-facilities maintenance
company. No proprietary or employer data is used; the dataset is fully synthetic
and reproducible from a seeded generator.

---

## 1. Locked decisions

| Decision | Choice |
|----------|--------|
| First-build scope | Core proof: data model + optimizer + baseline + two pages (Dispatch Board, Baseline vs Optimized) |
| Optimization engine | Google OR-Tools **CP-SAT** |
| Solve mode | **Live solve**, bounded time (~6–8 s), per request |
| Geography / travel | **Coordinate grid + computed travel matrix** (Euclidean × speed × traffic multiplier) |
| Data flow | **Master pool in Postgres + parameter transform + persist runs** |
| Stack | FastAPI + PostgreSQL + Next.js + OR-Tools |
| Deployment | systemd + nginx, `dispatch.scottcampbell.io` / `dispatch-api.scottcampbell.io` (names TBD-final) |

---

## 2. Scope

### In scope (this spec)

- Seeded synthetic dataset → PostgreSQL.
- OR-Tools CP-SAT optimizer + greedy manual baseline.
- FastAPI backend (workload, optimize, runs, health/system).
- Next.js frontend with **two pages**: Dispatch Board, Baseline vs Optimized.
- SQL analytical views for run metrics.
- Tests, docs, local docker-compose, deploy runbook.

### Deferred (spec #2)

- Optimizer Results (route detail), Constraint Explorer, Scenario Simulator,
  Executive Summary.

The architecture is built so deferred pages drop in without rework: the solver
already returns per-technician routes and per-job reason codes; later pages
render data already being produced and persisted.

---

## 3. Repository layout

Follows existing portfolio conventions (`manufacturing-intelligence-platform`,
`water-system-risk-index`).

```
field-service-dispatch-optimizer/
├── README.md            # reviewer path, live links, what-it-shows
├── docker-compose.yml   # postgres + api + web for local
├── Makefile / tasks.ps1
├── pyproject.toml
├── backend/
│   ├── app/             # FastAPI: routes, schemas, db access
│   ├── optimizer/       # cp_sat_model.py, baseline.py, transform.py,
│   │                    #   solve_service.py, metrics.py
│   ├── sql/             # schema.sql, analytical_views.sql
│   └── tests/
├── data-generator/
│   └── generate_synthetic_data.py   # seeded → Postgres
├── frontend/
│   ├── app/             # Next.js: /board, /compare
│   ├── components/
│   └── charts/
├── docs/                # optimization-model.md, data-dictionary.md,
│                        #   architecture.md, case-study.md
├── deploy/              # systemd units, nginx.conf, RUNBOOK.md
└── screenshots/
```

---

## 4. Data model

PostgreSQL holds a canonical, seeded synthetic "day". Slider parameters
transform this base before solving; each solve is persisted.

### Master data

- **technicians** — `id`, `name`, `home_base_site_id`, `shift_start`,
  `shift_end`, `overtime_eligible`, `hourly_cost` (for overtime accounting).
- **skills** — `id`, `name` (HVAC, Electrical, Plumbing, Refrigeration,
  Controls, …).
- **technician_skills** — `tech_id`, `skill_id`, `certified` (bool). Models
  "technician lacks required certification".
- **sites** — `id`, `name`, `x`, `y` (grid coords on a ~100×100 region),
  `zone` label (cosmetic / business-readable).
- **jobs** — `id`, `site_id`, `required_skill_id`, `priority` (1–4),
  `sla_deadline` (minutes from day start), `est_duration` (minutes),
  `requires_part` (bool), `part_available` (bool), `is_emergency` (bool),
  `status` (`backlog` | `carryover`).

### Run history (persisted per solve)

- **optimization_runs** — `id`, `created_at`, `plan_type`
  (`baseline` | `optimized`), `params_json` (the slider config), `solve_status`,
  `solve_seconds`, `objective_value`. A paired baseline+optimized solve shares
  the same `params_json` so the compare page aligns them.
- **run_assignments** — `run_id`, `job_id`, `tech_id` (nullable = unassigned),
  `seq_order`, `planned_start`, `planned_end`, `is_sla_breach`, `is_overtime`,
  `unassigned_reason`.

### Travel

Travel is **computed**, not stored: `travel_time(a, b) = euclidean(a, b) ×
speed_factor × traffic_multiplier`. Computing live means the **traffic-penalty
slider** is real — the distance matrix reflects the current setting on every
solve.

---

## 5. Optimization model (CP-SAT) — the core

A vehicle-routing-with-time-windows + assignment problem.

### Variables

- **Optional interval** per `(technician, job)` pair, present iff that
  technician performs that job.
- Each job is performed by **at most one** technician; jobs may go unassigned.

### Hard constraints

- **Skill + certification match** — assignee must have the required skill and be
  certified.
- **Parts** — a job requiring an unavailable part cannot be assigned.
- **Shift window** — a job's interval must fall within the technician's shift
  (or shift + overtime cap when overtime is enabled).
- **Routing / travel** — per technician, consecutive jobs respect travel time
  between their sites, enforced via `AddCircuit` (routing) over the technician's
  assigned jobs starting/ending at home base.

### Soft constraints / objective

Weighted objective:

```
maximize  Σ (priority_weight × completed)
        − travel_penalty   × total_travel_time
        − sla_penalty      × sla_breaches
        − overtime_penalty × overtime_minutes
        − unassigned_penalty × unassigned_jobs
```

- **SLA is soft by default** (breach allowed, penalized). The
  **SLA-strictness slider** raises `sla_penalty`; at the "strict" setting it
  flips **high-priority** SLAs to hard constraints. *(Judgment call: makes the
  slider visibly change outcomes — demos better than always-hard.)*
- The **traffic-penalty slider** scales both the travel matrix (section 4) and
  `travel_penalty`.

### Solve control

- `max_time_in_seconds ≈ 6–8`, multi-worker. Returns best-found solution with
  status (`OPTIMAL` / `FEASIBLE` / etc.).
- Instance kept modest (~8–15 technicians, ~80–150 jobs) so a usable solution
  always returns within the time bound.

### Reason codes

Every assignment row carries a reason code: `assigned`,
`unassigned_no_skill`, `unassigned_no_part`, `unassigned_shift`,
`displaced_by_emergency`. This powers the deferred Constraint Explorer for free.

---

## 6. Baseline (the foil)

Greedy and deliberately naive:

1. Sort jobs by priority, then SLA deadline.
2. For each job, assign to the **nearest qualified available** technician who
   can still fit it in their remaining shift.
3. No lookahead, no global trade-offs.

The baseline uses the **same feasibility rules** (skills, parts, shift) as
CP-SAT, so the comparison is apples-to-apples — the only difference is planning
intelligence. This keeps the headline delta (e.g. 84 → 91 jobs, 17 → 6 SLA
breaches) honest.

---

## 7. API (FastAPI)

- `GET /health` — liveness.
- `GET /api/system` — system/proof metadata (standard portfolio endpoint).
- `GET /api/workload` — the canonical day (technicians, sites, jobs) for the
  Dispatch Board.
- `POST /api/optimize` — body = slider params (technician count, job count,
  optimization goal, traffic penalty, emergency rate, skill-shortage scenario,
  SLA strictness, overtime allowed). Transforms the base scenario, runs **both**
  baseline and optimized solves, persists both runs, returns both plans +
  metrics + the comparison delta.
- `GET /api/runs/{id}` — fetch a stored run (supports deferred pages).

### Parameter transforms

Slider params transform the canonical base before solving:

- technician count → subset the technician pool.
- job count → scale the active job backlog.
- emergency rate → inject/flag emergency jobs.
- skill-shortage scenario → reduce certified technicians for a skill.
- traffic penalty → travel multiplier + objective weight.
- SLA strictness → SLA penalty / hard-constraint flip.
- overtime allowed → enable/disable overtime cap.

---

## 8. Frontend (Next.js, 2 pages)

### `/board` — Dispatch Board

- Grid/pseudo-map of sites + technician home bases.
- Unassigned-jobs table: priority, SLA deadline, required skill, est. duration,
  distance estimate.
- Technician-availability strip.
- Control panel of sliders + **Optimize Schedule** button.

### `/compare` — Baseline vs Optimized (the money page)

- Side-by-side metric cards: jobs completed, SLA breaches, travel hours,
  overtime hours, unassigned jobs.
- Before/after bar charts.
- Technician-utilization balance view.
- Headline deltas.
- "Bottleneck skill" callout.

---

## 9. Metrics & SQL views

SQL analytical views over `run_assignments` compute, per run:

- jobs completed, SLA breaches, total travel hours, overtime hours,
  unassigned count;
- per-technician utilization;
- high-priority protection rate;
- **bottleneck skill** — the skill with the most unassigned/late demand.

The compare endpoint reads these views rather than recomputing in Python,
keeping the SQL/BI layer central to the project.

---

## 10. Testing

`backend/tests/`:

- **Generator determinism** — same seed → identical dataset.
- **Feasibility invariants** — no plan (baseline or optimized) violates skill,
  parts, or shift constraints.
- **Baseline vs optimized sanity** — on the same instance, optimized objective
  ≥ baseline objective.
- **Metric correctness** — SQL views and Python metrics match hand-computed
  small fixtures.

---

## 11. Deployment

- **Local:** `docker-compose up` (postgres + api + web). Seed via the generator.
- **Prod:** systemd units + nginx on the existing host, two subdomains, seeded
  DB load via the generator — same RUNBOOK pattern as existing projects.

---

## 12. Open items for implementation planning

- Final subdomain names.
- Exact default slider ranges and objective weight defaults that produce a
  compelling out-of-the-box delta.
- Number of skills and the canonical day's size (technician/site/job counts) in
  the seed.

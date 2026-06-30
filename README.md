# Field Service Dispatch Optimizer

A live operations-planning system that assigns technicians to service jobs under
real constraints — skills, travel, shift length, SLA deadlines, priority, job
duration, overtime, and parts — then compares an **OR-Tools CP-SAT optimized
plan** against a naive **manual dispatch baseline** to show measurable
operational impact.

This project doesn't just report on a business. **It makes a decision:** given
limited people, time, travel, skills, and SLA risk, what should we do next?

> Synthetic domain: **Atlas Field Services**, a commercial-facilities maintenance
> company. No proprietary or employer data is used — the dataset is fully
> synthetic and reproducible from a seeded generator.

<!-- Update these once deployed -->
* Live demo: https://dispatch.scottcampbell.io
* Live API: https://dispatch-api.scottcampbell.io
* API docs: https://dispatch-api.scottcampbell.io/docs

## Screenshots

### Dispatch Board — scenario controls, service region, backlog
![Dispatch Board](screenshots/dispatch-board.png)

### Baseline vs Optimized — the decision, quantified
![Baseline vs Optimized](screenshots/baseline-vs-optimized.png)

### Optimizer Results — recommended routes and timing
![Optimizer Results](screenshots/optimizer-results.png)

### Constraint Explorer — why each decision was made
![Constraint Explorer](screenshots/constraint-explorer.png)

### Scenario Simulator — inject chaos and re-solve
![Scenario Simulator](screenshots/scenario-simulator.png)

### Executive Summary — the plan in management language
![Executive Summary](screenshots/executive-summary.png)

## The killer comparison

Same technicians, same jobs, same constraints — only the planning differs
(canonical day, seed 42, default settings):

| Metric | Manual baseline | Optimized | Change |
|--------|----------------:|----------:|-------:|
| Jobs completed | 77 | **81** | +4 |
| SLA breaches | 33 | **15** | −18 |
| Travel hours | 18.4 | **17.1** | −1.3 |
| Overtime hours | 18.0 | **7.5** | −10.5 |
| Unassigned jobs | 33 | **29** | −4 |

More jobs completed **and** fewer SLA breaches **and** less overtime, with the
same crew. See [docs/case-study.md](docs/case-study.md).

## Reviewer path

If you're reviewing quickly:

1. Open the live Dispatch Board, adjust a slider, and click **Optimize Schedule**.
2. Read the **Baseline vs Optimized** page — every click is a real CP-SAT solve.
3. Skim the model: [`backend/optimizer/cp_sat_model.py`](backend/optimizer/cp_sat_model.py)
   and [docs/optimization-model.md](docs/optimization-model.md).
4. Skim the baseline foil: [`backend/optimizer/baseline.py`](backend/optimizer/baseline.py).
5. Check the SQL reporting layer: [`backend/sql/analytical_views.sql`](backend/sql/analytical_views.sql).
6. Check the test suite: [`backend/tests/`](backend/tests) (`./tasks.ps1 test`).

## What it shows

- **A real optimizer**, not a heuristic dressed up as one: a VRPTW + assignment
  model in OR-Tools CP-SAT, with a bounded live solve.
- **An honest comparison**: the baseline obeys the same feasibility rules, so the
  delta is planning quality, not different assumptions.
- **Decision support**: bottleneck-skill detection, overtime-vs-SLA trade-offs,
  and explicit, reason-coded deferrals.
- **Full stack**: seeded synthetic data → SQL reporting views → API → dashboard.

## Quickstart (local, zero infrastructure)

Local development uses a SQLite file — no database to install.

```powershell
# Windows / PowerShell
./tasks.ps1 install     # venv + backend deps, and npm install for the frontend
./tasks.ps1 seed        # build + load the canonical day
./tasks.ps1 test        # run the backend test suite
./tasks.ps1 api         # FastAPI at http://localhost:8000
./tasks.ps1 web         # Next.js at http://localhost:3000  (separate terminal)
```

```bash
# Linux / macOS
make install && make seed && make test
make api          # terminal 1
make web          # terminal 2
```

Point the frontend at the API with `NEXT_PUBLIC_API_BASE` (default
`http://localhost:8000`).

## Full stack with Postgres (docker-compose)

```bash
docker compose up --build
# web  -> http://localhost:3000
# api  -> http://localhost:8000/docs
```

The same SQLAlchemy models and portable SQL views run on both SQLite (local) and
Postgres (compose / production).

## Tech stack

Python 3.12 · OR-Tools (CP-SAT) · FastAPI · SQLAlchemy 2 · PostgreSQL / SQLite ·
Next.js (App Router) + TypeScript · pytest.

## Project structure

```
backend/
  optimizer/   pure-Python engine: domain, travel, baseline, cp_sat_model, transform, metrics
  app/         FastAPI app, config, db, models, repository, generator, solve_service
  sql/         portable analytical views
  tests/       optimizer, generator, persistence, and API tests
data-generator/  CLI to seed the database
frontend/      Next.js dashboard: / board, /results, /compare, /constraints, /scenarios, /summary
docs/          architecture, optimization-model, data-dictionary, case-study
deploy/        systemd units, nginx, runbook
```

## Testing

```bash
./tasks.ps1 test     # or: make test
```

Covers travel math, domain invariants, the greedy baseline, the CP-SAT model
(including "optimized never loses to baseline"), the parameter transforms,
metrics, generator determinism, persistence + SQL views, and the API endpoints.

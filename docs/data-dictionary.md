# Data dictionary

All data is synthetic and reproducible from a seeded generator
(`backend/app/generator.py`, default `seed=42`). Time is integer minutes from the
start of the operating day (e.g. `480` = 08:00). Coordinates are on a 100×100
grid; travel time is Euclidean distance × speed factor × traffic multiplier.

## Master data

### `skills`
| column | type | notes |
|--------|------|-------|
| id | int | PK |
| name | str | HVAC, Electrical, Plumbing, Refrigeration, Controls, General |

### `technicians`
| column | type | notes |
|--------|------|-------|
| id | int | PK |
| name | str | |
| home_x, home_y | float | grid home base |
| shift_start, shift_end | int | minutes from day start |
| overtime_eligible | bool | |
| overtime_cap | int | max overtime minutes beyond shift_end |
| skill_ids | str | comma-separated certified skill ids |

### `sites`
| column | type | notes |
|--------|------|-------|
| id | int | PK |
| name | str | |
| x, y | float | grid location |
| zone | str | cosmetic region label |

### `jobs`
| column | type | notes |
|--------|------|-------|
| id | int | PK |
| site_id | int | FK → sites |
| required_skill | int | FK → skills |
| priority | int | 1 = critical … 4 = low |
| sla_deadline | int | minute by which the job must finish |
| duration | int | service minutes |
| requires_part | bool | |
| part_available | bool | if false and requires_part, job is unassignable |
| is_emergency | bool | |
| status | str | backlog / carryover |

## Run history

### `optimization_runs`
One row per solve. A paired baseline + optimized solve shares a `batch_id`.
Per-run metrics are stored here so the analytical views need no route math.

| column | type | notes |
|--------|------|-------|
| id | int | PK |
| batch_id | str | pairs baseline + optimized |
| created_at | datetime | |
| plan_type | str | baseline / optimized |
| params_json | json | the slider configuration |
| solve_status | str | greedy / OPTIMAL / FEASIBLE / … |
| solve_seconds | float | |
| objective_value | float | |
| jobs_completed, jobs_total, unassigned | int | |
| sla_breaches | int | |
| travel_minutes, overtime_minutes | int | |
| high_priority_rate | float | % of P1 jobs completed |
| avg_utilization | float | |
| bottleneck_skill | str | skill with most unmet/late demand |

### `run_assignments`
| column | type | notes |
|--------|------|-------|
| id | int | PK |
| run_id | int | FK → optimization_runs |
| job_id | int | |
| tech_id | int? | null = unassigned |
| seq_order | int | order within the technician's route |
| planned_start, planned_end | int? | |
| is_sla_breach, is_overtime | bool | |
| unassigned_reason | str? | no_skill / no_part / shift / capacity |

## Analytical views (`backend/sql/analytical_views.sql`)

- **`v_run_metrics`** — one-row scorecard per run (the API reads this for the
  comparison page).
- **`v_run_utilization`** — busy minutes and utilization % per technician per run.
- **`v_skill_pain`** — unassigned + breached demand per skill per run; the
  highest-pain row is the run's bottleneck skill.

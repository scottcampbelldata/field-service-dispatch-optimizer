-- Portable analytical views for the dispatch optimizer.
-- Written in standard SQL so they run unchanged on SQLite (local dev) and
-- PostgreSQL (production). DROP + CREATE keeps them idempotent on both engines.

-- Run-level scorecard: one row per persisted solve.
DROP VIEW IF EXISTS v_run_metrics;
CREATE VIEW v_run_metrics AS
SELECT
    r.id                                  AS run_id,
    r.batch_id                            AS batch_id,
    r.plan_type                           AS plan_type,
    r.solve_status                        AS solve_status,
    r.jobs_completed                      AS jobs_completed,
    r.jobs_total                          AS jobs_total,
    r.unassigned                          AS unassigned,
    r.sla_breaches                        AS sla_breaches,
    ROUND(r.travel_minutes / 60.0, 1)     AS travel_hours,
    ROUND(r.overtime_minutes / 60.0, 1)   AS overtime_hours,
    r.high_priority_rate                  AS high_priority_rate,
    r.avg_utilization                     AS avg_utilization,
    r.bottleneck_skill                    AS bottleneck_skill,
    r.objective_value                     AS objective_value,
    r.solve_seconds                       AS solve_seconds
FROM optimization_runs r;

-- Per-technician utilization within a run.
DROP VIEW IF EXISTS v_run_utilization;
CREATE VIEW v_run_utilization AS
SELECT
    a.run_id                                          AS run_id,
    t.id                                              AS tech_id,
    t.name                                            AS tech_name,
    SUM(a.planned_end - a.planned_start)              AS busy_minutes,
    (t.shift_end - t.shift_start)                     AS shift_minutes,
    ROUND(100.0 * SUM(a.planned_end - a.planned_start)
          / (t.shift_end - t.shift_start), 1)         AS utilization_pct
FROM run_assignments a
JOIN technicians t ON t.id = a.tech_id
WHERE a.tech_id IS NOT NULL
GROUP BY a.run_id, t.id, t.name, t.shift_start, t.shift_end;

-- Skill "pain" per run: unassigned + breached demand, by required skill.
-- The bottleneck skill for a run is the row with the highest pain.
DROP VIEW IF EXISTS v_skill_pain;
CREATE VIEW v_skill_pain AS
SELECT
    a.run_id                                          AS run_id,
    s.id                                              AS skill_id,
    s.name                                            AS skill_name,
    SUM(CASE WHEN a.tech_id IS NULL THEN 1
             WHEN a.is_sla_breach THEN 1
             ELSE 0 END)                              AS pain
FROM run_assignments a
JOIN jobs j  ON j.id = a.job_id
JOIN skills s ON s.id = j.required_skill
GROUP BY a.run_id, s.id, s.name;

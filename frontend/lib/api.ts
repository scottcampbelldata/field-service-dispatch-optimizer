// Typed client for the dispatch optimizer API.

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export interface Skill { id: number; name: string; }
export interface Site { id: number; name: string; x: number; y: number; zone: string; }
export interface Technician {
  id: number; name: string; home_x: number; home_y: number;
  shift_start: number; shift_end: number; overtime_eligible: boolean; skills: string[];
}
export interface Job {
  id: number; site_id: number; site_name: string; x: number; y: number;
  required_skill: string; priority: number; sla_deadline: number; duration: number;
  requires_part: boolean; part_available: boolean; is_emergency: boolean;
}
export interface Region {
  name: string; center: [number, number];   // [lon, lat]
  lon_min: number; lon_max: number; lat_min: number; lat_max: number;
}
export interface Workload {
  technicians: Technician[]; sites: Site[]; jobs: Job[]; skills: Skill[]; region: Region;
}

export interface Metrics {
  run_id: number; plan_type: string; solve_status: string;
  jobs_completed: number; jobs_total: number; unassigned: number; sla_breaches: number;
  travel_hours: number; overtime_hours: number; high_priority_rate: number;
  avg_utilization: number; bottleneck_skill: string | null;
  objective_value: number; solve_seconds: number;
}
export interface Utilization {
  run_id: number; tech_id: number; tech_name: string;
  busy_minutes: number; shift_minutes: number; utilization_pct: number;
}
export interface Stop {
  job_id: number; tech_id: number; seq: number; start: number; end: number;
  is_sla_breach: boolean; is_overtime: boolean; reason: string; priority: number;
  required_skill: string; site_name: string; x: number; y: number; duration: number;
}
export interface Route {
  tech_id: number; tech_name: string; home_x: number; home_y: number; stops: Stop[];
}
export interface Comparison {
  jobs_completed_delta: number; sla_breaches_delta: number; travel_hours_delta: number;
  overtime_hours_delta: number; unassigned_delta: number; objective_delta: number;
}
export interface SkillDemand {
  skill: string; certified_techs: number; jobs: number;
  completed: number; unassigned: number; breaches: number; demand_minutes: number;
}
export interface Diagnostics {
  unassigned_by_reason: { reason: string; count: number }[];
  skill_demand: SkillDemand[];
  parts_blocked: number;
  emergency_count: number;
  bottleneck_skill: string | null;
  total_capacity_minutes: number;
  total_demand_minutes: number;
}

export interface OptimizeResult {
  batch_id: string;
  params: OptimizeParams;
  baseline: { run_id: number; metrics: Metrics; utilization: Utilization[] };
  optimized: {
    run_id: number; metrics: Metrics; utilization: Utilization[];
    routes: Route[]; unassigned: Stop[];
  };
  comparison: Comparison;
  diagnostics: Diagnostics;
  routing: { provider: string };
}

export interface OptimizeParams {
  technician_count: number | null;
  job_count: number | null;
  traffic_penalty: number;
  emergency_rate: number;
  skill_shortage: string | null;
  sla_strictness: "lenient" | "normal" | "strict";
  overtime_allowed: boolean;
  optimization_goal: "balanced" | "max_jobs" | "min_travel" | "protect_sla";
  max_solve_seconds: number;
}

export const DEFAULT_PARAMS: OptimizeParams = {
  technician_count: null,
  job_count: null,
  traffic_penalty: 1.0,
  emergency_rate: 0.0,
  skill_shortage: null,
  sla_strictness: "normal",
  overtime_allowed: true,
  optimization_goal: "balanced",
  max_solve_seconds: 12,
};

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
}

export const fetchWorkload = () => get<Workload>("/api/workload");
export const fetchSystem = () => get<Record<string, unknown>>("/api/system");

export async function optimize(params: OptimizeParams): Promise<OptimizeResult> {
  const r = await fetch(`${API_BASE}/api/optimize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!r.ok) throw new Error(`optimize -> ${r.status}`);
  return r.json();
}

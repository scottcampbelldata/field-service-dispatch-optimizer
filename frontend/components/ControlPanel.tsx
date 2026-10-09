"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDispatch } from "@/app/providers";

function Row({ label, value, children }: { label: string; value?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span style={{ color: "var(--muted)" }}>{label}</span>
        {value !== undefined && <span className="mono">{value}</span>}
      </div>
      {children}
    </div>
  );
}

const selectStyle = {
  background: "var(--panel-2)",
  border: "1px solid var(--border)",
  color: "var(--foreground)",
};

export function ControlPanel() {
  const { workload, params, setParams, runOptimize, loading } = useDispatch();
  const router = useRouter();
  const ready = workload !== null;
  // Dummy 4 / 20 keep range DOM valid while loading; Row shows "-" instead.
  const maxTechs = ready ? workload.technicians.length : 4;
  const maxJobs = ready ? workload.jobs.length : 20;
  const techs = ready ? (params.technician_count ?? maxTechs) : 4;
  const jobs = ready ? (params.job_count ?? maxJobs) : 20;

  // Initialise counts to "all" once the workload is known.
  useEffect(() => {
    if (workload && params.technician_count === null) {
      setParams({
        technician_count: workload.technicians.length,
        job_count: workload.jobs.length,
      });
    }
  }, [workload, params.technician_count, setParams]);

  async function handleOptimize() {
    const r = await runOptimize();
    if (r) router.push("/compare");
  }

  return (
    <div className="panel p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Scenario controls</h2>
        <button
          type="button"
          disabled={!ready}
          onClick={() => {
            if (!workload) return;
            setParams({
              traffic_penalty: 1, emergency_rate: 0, skill_shortage: null,
              sla_strictness: "normal", overtime_allowed: true, optimization_goal: "balanced",
              technician_count: workload.technicians.length, job_count: workload.jobs.length,
            });
          }}
          className="text-xs"
          style={{ color: "var(--muted)" }}
        >
          reset
        </button>
      </div>

      <Row label="Technicians available" value={ready ? `${techs}` : "-"}>
        <input type="range" min={4} max={maxTechs} value={techs} disabled={!ready}
          onChange={(e) => setParams({ technician_count: +e.target.value })}
          className="w-full" />
      </Row>

      <Row label="Jobs in backlog" value={ready ? `${jobs}` : "-"}>
        <input type="range" min={20} max={maxJobs} value={jobs} disabled={!ready}
          onChange={(e) => setParams({ job_count: +e.target.value })}
          className="w-full" />
      </Row>

      <Row label="Optimization goal">
        <select value={params.optimization_goal} style={selectStyle}
          onChange={(e) => setParams({ optimization_goal: e.target.value as never })}
          className="w-full rounded-md px-2 py-1.5 text-sm">
          <option value="balanced">Balanced</option>
          <option value="max_jobs">Maximize jobs completed</option>
          <option value="min_travel">Minimize travel</option>
          <option value="protect_sla">Protect SLAs</option>
        </select>
      </Row>

      <Row label="Traffic penalty" value={`${params.traffic_penalty.toFixed(1)}×`}>
        <input type="range" min={1} max={3} step={0.1} value={params.traffic_penalty}
          onChange={(e) => setParams({ traffic_penalty: +e.target.value })}
          className="w-full" />
      </Row>

      <Row label="Emergency rate" value={`${Math.round(params.emergency_rate * 100)}%`}>
        <input type="range" min={0} max={0.5} step={0.05} value={params.emergency_rate}
          onChange={(e) => setParams({ emergency_rate: +e.target.value })}
          className="w-full" />
      </Row>

      <Row label="Skill shortage">
        <select value={params.skill_shortage ?? ""} style={selectStyle}
          onChange={(e) => setParams({ skill_shortage: e.target.value || null })}
          className="w-full rounded-md px-2 py-1.5 text-sm">
          <option value="">None</option>
          {workload?.skills.map((s) => (
            <option key={s.id} value={s.name}>{s.name}</option>
          ))}
        </select>
      </Row>

      <Row label="SLA strictness">
        <div className="grid grid-cols-3 gap-1">
          {(["lenient", "normal", "strict"] as const).map((s) => (
            <button key={s} onClick={() => setParams({ sla_strictness: s })}
              className="rounded-md px-2 py-1.5 text-sm capitalize"
              style={{
                background: params.sla_strictness === s ? "var(--accent)" : "var(--panel-2)",
                color: params.sla_strictness === s ? "var(--accent-contrast)" : "var(--muted)",
                border: "1px solid var(--border)",
              }}>
              {s}
            </button>
          ))}
        </div>
      </Row>

      <Row label="Overtime allowed">
        <button onClick={() => setParams({ overtime_allowed: !params.overtime_allowed })}
          className="w-full rounded-md px-2 py-1.5 text-sm"
          style={{
            background: params.overtime_allowed ? "var(--panel-2)" : "var(--panel-2)",
            color: params.overtime_allowed ? "var(--good)" : "var(--bad)",
            border: "1px solid var(--border)",
          }}>
          {params.overtime_allowed ? "Enabled" : "Disabled"}
        </button>
      </Row>

      <Row label="Solver time budget" value={`${params.max_solve_seconds}s`}>
        <input type="range" min={3} max={15} step={1} value={params.max_solve_seconds}
          onChange={(e) => setParams({ max_solve_seconds: +e.target.value })}
          className="w-full" />
      </Row>

      <button onClick={handleOptimize} disabled={loading}
        className="w-full rounded-md py-2.5 font-semibold transition-opacity"
        style={{ background: "var(--accent)", color: "var(--accent-contrast)", opacity: loading ? 0.6 : 1 }}>
        {loading ? "Solving…" : "Optimize Schedule"}
      </button>
    </div>
  );
}

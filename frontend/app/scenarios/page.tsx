"use client";

import { useState } from "react";
import { MetricCard } from "@/components/MetricCard";
import { useDispatch } from "@/app/providers";
import { DEFAULT_PARAMS, OptimizeParams, OptimizeResult, optimize } from "@/lib/api";

interface Preset {
  key: string;
  label: string;
  blurb: string;
  apply: (maxTechs: number) => Partial<OptimizeParams>;
}

const PRESETS: Preset[] = [
  { key: "calloff", label: "Two techs call off", blurb: "Crew down by 2 for the day",
    apply: (m) => ({ technician_count: Math.max(2, m - 2) }) },
  { key: "emergency", label: "Emergency surge", blurb: "25% of jobs become P1 emergencies",
    apply: () => ({ emergency_rate: 0.25 }) },
  { key: "traffic", label: "Rush-hour traffic", blurb: "Travel times double",
    apply: () => ({ traffic_penalty: 2.0 }) },
  { key: "hvac", label: "HVAC shortage", blurb: "Only one HVAC-certified tech",
    apply: () => ({ skill_shortage: "HVAC" }) },
  { key: "sla", label: "Tighten SLAs", blurb: "Strict - P1 deadlines become hard",
    apply: () => ({ sla_strictness: "strict" }) },
  { key: "noot", label: "Overtime disabled", blurb: "No overtime allowed",
    apply: () => ({ overtime_allowed: false }) },
];

const SOLVE = 6;

export default function ScenariosPage() {
  const { workload, routing } = useDispatch();
  const maxTechs = workload?.technicians.length ?? 12;

  const [nominal, setNominal] = useState<OptimizeResult | null>(null);
  const [scenario, setScenario] = useState<OptimizeResult | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(p: Preset) {
    setBusy(true);
    setActive(p.key);
    try {
      const nominalParams: OptimizeParams = { ...DEFAULT_PARAMS, max_solve_seconds: SOLVE };
      const scenarioParams: OptimizeParams = { ...nominalParams, ...p.apply(maxTechs) };
      const [nom, scn] = await Promise.all([
        nominal ? Promise.resolve(nominal) : optimize(nominalParams, routing),
        optimize(scenarioParams, routing),
      ]);
      setNominal(nom);
      setScenario(scn);
    } finally {
      setBusy(false);
    }
  }

  const n = nominal?.optimized.metrics;
  const s = scenario?.optimized.metrics;

  return (
    <div className="mx-auto max-w-7xl p-5 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Scenario simulator</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Inject realistic disruption and re-solve. Each card compares the optimized plan
          <span className="mono"> under the scenario</span> against the optimized plan on a
          normal day - so you can see what the disruption actually costs.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {PRESETS.map((p) => (
          <button key={p.key} onClick={() => run(p)} disabled={busy}
            className="panel p-4 text-left transition-colors"
            style={{
              borderColor: active === p.key ? "var(--accent)" : "var(--border)",
              opacity: busy && active !== p.key ? 0.5 : 1,
            }}>
            <div className="font-semibold">{p.label}</div>
            <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>{p.blurb}</div>
            {active === p.key && busy && (
              <div className="text-xs mt-2 mono" style={{ color: "var(--accent)" }}>solving…</div>
            )}
          </button>
        ))}
      </div>

      {!scenario && (
        <div className="panel p-8 text-center" style={{ color: "var(--muted)" }}>
          Pick a scenario above to run it against a normal day.
        </div>
      )}

      {scenario && n && s && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">
              Impact: {PRESETS.find((p) => p.key === active)?.label}
            </h2>
            <span className="text-xs mono" style={{ color: "var(--muted)" }}>
              vs normal day · deltas show the cost of the disruption
            </span>
          </div>

          <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
            <MetricCard label="Jobs completed" value={s.jobs_completed} delta={s.jobs_completed - n.jobs_completed} />
            <MetricCard label="SLA breaches" value={s.sla_breaches} delta={s.sla_breaches - n.sla_breaches} betterWhenLower />
            <MetricCard label="Travel hours" value={s.travel_hours} delta={Math.round((s.travel_hours - n.travel_hours) * 10) / 10} betterWhenLower />
            <MetricCard label="Overtime hours" value={s.overtime_hours} delta={Math.round((s.overtime_hours - n.overtime_hours) * 10) / 10} betterWhenLower />
            <MetricCard label="Unassigned" value={s.unassigned} delta={s.unassigned - n.unassigned} betterWhenLower />
          </div>

          <div className="panel p-5">
            <h3 className="font-semibold mb-2">Optimization still helps under disruption</h3>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              In this scenario the optimizer beats manual dispatch by{" "}
              <strong style={{ color: "var(--good)" }}>
                {scenario.comparison.jobs_completed_delta >= 0 ? "+" : ""}
                {scenario.comparison.jobs_completed_delta} jobs
              </strong>{" "}
              and{" "}
              <strong style={{ color: "var(--good)" }}>
                {-scenario.comparison.sla_breaches_delta} fewer SLA breaches
              </strong>
              {scenario.diagnostics.bottleneck_skill && (
                <> · the binding constraint becomes <strong>{scenario.diagnostics.bottleneck_skill}</strong></>
              )}
              .
            </p>
          </div>
        </>
      )}
    </div>
  );
}

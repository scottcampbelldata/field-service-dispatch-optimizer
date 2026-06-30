"use client";

import { SimpleBarChart } from "@/components/Charts";
import { EmptyState } from "@/components/EmptyState";
import { useDispatch } from "@/app/providers";
import { REASON_LABEL } from "@/lib/format";

const REASON_EXPLAIN: Record<string, string> = {
  unassigned_no_skill: "No technician on shift holds the required certification for this job.",
  unassigned_no_part: "The job needs a part that is not in stock, so it cannot be performed today.",
  unassigned_shift: "Every qualified technician's shift (plus allowed overtime) was already full.",
  unassigned_capacity: "Feasible, but the optimizer dropped it: completing it would cost more in travel, overtime, or SLA risk than it returns. A capacity/priority trade-off.",
};

export default function ConstraintsPage() {
  const { result } = useDispatch();
  if (!result) return <EmptyState title="No plan to explain yet" />;

  const d = result.diagnostics;
  const capPct = Math.round((d.total_demand_minutes / Math.max(1, d.total_capacity_minutes)) * 100);

  return (
    <div className="mx-auto max-w-7xl p-5 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Constraint explorer</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Why the optimizer made the calls it did — the binding constraints behind every
          unassigned or late job.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <div className="panel p-5 space-y-4">
          <h2 className="font-semibold">Capacity vs demand</h2>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span style={{ color: "var(--muted)" }}>Total job minutes vs technician minutes</span>
              <span className="mono">{capPct}%</span>
            </div>
            <div className="h-6 rounded" style={{ background: "var(--panel-2)" }}>
              <div className="h-6 rounded flex items-center justify-end pr-2"
                style={{ width: `${Math.min(capPct, 100)}%`,
                         background: capPct > 100 ? "var(--bad)" : "var(--accent)" }}>
                <span className="text-xs mono" style={{ color: "var(--accent-contrast)" }}>
                  {Math.round(d.total_demand_minutes / 60)}h / {Math.round(d.total_capacity_minutes / 60)}h
                </span>
              </div>
            </div>
            <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
              {capPct > 100
                ? "Demand exceeds raw capacity — some jobs cannot be served without more technicians or overtime, regardless of routing."
                : "Raw capacity is sufficient; remaining gaps come from skills, parts, travel, and SLA timing, not headcount."}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 pt-2">
            <Stat label="Bottleneck skill" value={d.bottleneck_skill ?? "None"} />
            <Stat label="Parts-blocked jobs" value={`${d.parts_blocked}`} />
            <Stat label="Emergencies" value={`${d.emergency_count}`} />
          </div>
        </div>

        <div className="panel p-5">
          <h2 className="font-semibold mb-4">Unassigned jobs by cause</h2>
          {d.unassigned_by_reason.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>Every job was assigned.</p>
          ) : (
            <>
              <SimpleBarChart
                data={d.unassigned_by_reason.map((r) => ({
                  reason: REASON_LABEL[r.reason] ?? r.reason, count: r.count,
                }))}
                xKey="reason" barKey="count" color="var(--warn)" yLabel="Jobs" height={200} />
              <ul className="mt-3 space-y-2">
                {d.unassigned_by_reason.map((r) => (
                  <li key={r.reason} className="text-xs" style={{ color: "var(--muted)" }}>
                    <span style={{ color: "var(--foreground)" }}>{REASON_LABEL[r.reason] ?? r.reason}</span>
                    {" — "}{REASON_EXPLAIN[r.reason]}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      <div className="panel overflow-hidden">
        <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 className="font-semibold">Skill demand vs capacity</h2>
        </div>
        <table className="w-full text-sm">
          <thead style={{ background: "var(--panel-2)", color: "var(--muted)" }}>
            <tr>
              <Th>Skill</Th><Th>Certified techs</Th><Th>Jobs</Th>
              <Th>Completed</Th><Th>Unassigned</Th><Th>SLA breaches</Th><Th>Load</Th>
            </tr>
          </thead>
          <tbody>
            {d.skill_demand.map((s) => {
              const pain = s.unassigned + s.breaches;
              const isBottleneck = s.skill === d.bottleneck_skill;
              return (
                <tr key={s.skill} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <Td>
                    <span className="inline-flex items-center gap-2">
                      {s.skill}
                      {isBottleneck && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{ background: "var(--bad)", color: "#1a0008" }}>BOTTLENECK</span>
                      )}
                    </span>
                  </Td>
                  <Td className="mono">{s.certified_techs}</Td>
                  <Td className="mono">{s.jobs}</Td>
                  <Td className="mono" style={{ color: "var(--good)" }}>{s.completed}</Td>
                  <Td className="mono" style={{ color: s.unassigned ? "var(--warn)" : "var(--muted)" }}>{s.unassigned}</Td>
                  <Td className="mono" style={{ color: s.breaches ? "var(--bad)" : "var(--muted)" }}>{s.breaches}</Td>
                  <Td>
                    <div className="h-2 w-24 rounded" style={{ background: "var(--panel-2)" }}>
                      <div className="h-2 rounded"
                        style={{ width: `${Math.min(100, (s.completed / Math.max(1, s.jobs)) * 100)}%`,
                                 background: pain ? "var(--warn)" : "var(--good)" }} />
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel-quiet p-3">
      <div className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}
function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left font-medium px-4 py-2">{children}</th>;
}
function Td({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <td className={`px-4 py-2 ${className}`} style={style}>{children}</td>;
}

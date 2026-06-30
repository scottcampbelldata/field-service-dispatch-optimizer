"use client";

import { useMemo } from "react";
import { ControlPanel } from "@/components/ControlPanel";
import { RegionMap } from "@/components/RegionMap";
import { useDispatch } from "@/app/providers";
import { PRIORITY_LABEL, hhmm, priorityColor } from "@/lib/format";

export default function BoardPage() {
  const { workload, workloadError, params } = useDispatch();

  const visibleJobs = useMemo(() => {
    if (!workload) return [];
    const n = params.job_count ?? workload.jobs.length;
    return workload.jobs.slice(0, n);
  }, [workload, params.job_count]);

  const visibleTechs = useMemo(() => {
    if (!workload) return [];
    const n = params.technician_count ?? workload.technicians.length;
    return workload.technicians.slice(0, n);
  }, [workload, params.technician_count]);

  const sortedJobs = useMemo(
    () => [...visibleJobs].sort((a, b) => a.priority - b.priority || a.sla_deadline - b.sla_deadline),
    [visibleJobs]
  );

  if (workloadError) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <div className="panel p-6">
          <h2 className="font-semibold text-lg" style={{ color: "var(--bad)" }}>
            Cannot reach the API
          </h2>
          <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
            {workloadError}. Start the backend (default <span className="mono">http://localhost:8000</span>)
            or set <span className="mono">NEXT_PUBLIC_API_BASE</span>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-5 grid gap-5 lg:grid-cols-[330px_1fr]">
      <ControlPanel />

      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Technicians on shift" value={visibleTechs.length} />
          <Stat label="Jobs in backlog" value={visibleJobs.length} />
          <Stat label="Skill types" value={workload?.skills.length ?? 0} />
        </div>

        <div className="panel p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Service region</h2>
            <Legend />
          </div>
          <div className="aspect-[16/10] w-full">
            <RegionMap
              technicians={visibleTechs}
              jobs={visibleJobs}
              region={workload?.region ?? 100}
            />
          </div>
        </div>

        <div className="panel overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
            <h2 className="font-semibold">Unassigned backlog</h2>
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              sorted by priority, then SLA deadline
            </span>
          </div>
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0" style={{ background: "var(--panel-2)" }}>
                <tr style={{ color: "var(--muted)" }}>
                  <Th>Job</Th><Th>Site</Th><Th>Skill</Th><Th>Priority</Th>
                  <Th>SLA</Th><Th>Duration</Th><Th>Part</Th>
                </tr>
              </thead>
              <tbody>
                {sortedJobs.slice(0, 60).map((j) => (
                  <tr key={j.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <Td className="mono">#{j.id}</Td>
                    <Td>{j.site_name}</Td>
                    <Td>{j.required_skill}</Td>
                    <Td>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: priorityColor(j.priority) }} />
                        {PRIORITY_LABEL[j.priority]}
                      </span>
                    </Td>
                    <Td className="mono">{hhmm(j.sla_deadline)}</Td>
                    <Td className="mono">{j.duration}m</Td>
                    <Td>
                      {j.requires_part
                        ? <span style={{ color: j.part_available ? "var(--good)" : "var(--bad)" }}>
                            {j.part_available ? "in stock" : "missing"}
                          </span>
                        : <span style={{ color: "var(--muted)" }}>—</span>}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="panel p-4">
      <div className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>{label}</div>
      <div className="mt-1 text-3xl font-semibold mono">{value}</div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-xs" style={{ color: "var(--muted)" }}>
      <span className="inline-flex items-center gap-1">
        <span className="h-2 w-2 rotate-45 inline-block" style={{ background: "var(--accent)" }} /> tech base
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="h-2 w-2 rounded-full inline-block" style={{ background: "#f43f5e" }} /> P1
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="h-2 w-2 rounded-full inline-block" style={{ background: "#38bdf8" }} /> P3
      </span>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left font-medium px-4 py-2">{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-2 ${className}`}>{children}</td>;
}

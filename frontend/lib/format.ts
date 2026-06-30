// Small display helpers.

export function hhmm(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "--:--";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export const PRIORITY_LABEL: Record<number, string> = {
  1: "P1 · Critical",
  2: "P2 · High",
  3: "P3 · Normal",
  4: "P4 · Low",
};

export function priorityColor(p: number): string {
  return ["#f43f5e", "#f59e0b", "#38bdf8", "#94a3b8"][p - 1] ?? "#94a3b8";
}

export const REASON_LABEL: Record<string, string> = {
  unassigned_no_skill: "No certified technician",
  unassigned_no_part: "Part unavailable",
  unassigned_shift: "No room in any shift",
  unassigned_capacity: "Dropped — capacity / SLA trade-off",
};

export function signed(n: number, suffix = ""): string {
  const s = n > 0 ? `+${n}` : `${n}`;
  return `${s}${suffix}`;
}

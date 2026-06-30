"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dispatch Board" },
  { href: "/compare", label: "Baseline vs Optimized" },
];

export function Header() {
  const path = usePathname();
  return (
    <header className="border-b" style={{ borderColor: "var(--border)" }}>
      <div className="mx-auto max-w-7xl px-5 py-3 flex items-center gap-6">
        <div className="flex items-center gap-3">
          <div
            className="h-8 w-8 rounded-md grid place-items-center font-bold"
            style={{ background: "var(--accent)", color: "#06202b" }}
          >
            A
          </div>
          <div className="leading-tight">
            <div className="font-semibold">Atlas Field Services</div>
            <div className="text-xs" style={{ color: "var(--muted)" }}>
              Dispatch Optimizer
            </div>
          </div>
        </div>

        <nav className="flex items-center gap-1 ml-4">
          {LINKS.map((l) => {
            const active = path === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className="px-3 py-1.5 rounded-md text-sm transition-colors"
                style={{
                  background: active ? "var(--panel)" : "transparent",
                  color: active ? "var(--foreground)" : "var(--muted)",
                  border: `1px solid ${active ? "var(--border)" : "transparent"}`,
                }}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto text-xs flex items-center gap-2" style={{ color: "var(--muted)" }}>
          <span
            className="px-2 py-1 rounded-md mono"
            style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
          >
            OR-Tools CP-SAT
          </span>
          <span className="hidden sm:inline">synthetic data</span>
        </div>
      </div>
    </header>
  );
}

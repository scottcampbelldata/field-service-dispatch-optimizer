"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { RoutingSettings } from "@/components/RoutingSettings";

const LINKS = [
  { href: "/", label: "Board" },
  { href: "/results", label: "Results" },
  { href: "/compare", label: "Compare" },
  { href: "/constraints", label: "Constraints" },
  { href: "/capacity", label: "Capacity" },
  { href: "/scenarios", label: "Scenarios" },
  { href: "/summary", label: "Summary" },
];

export function Header() {
  const path = usePathname();
  return (
    <header className="border-b" style={{ borderColor: "var(--border)" }}>
      <div className="mx-auto max-w-7xl px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
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
          <RoutingSettings />
          <span
            className="px-2 py-1 rounded-md mono hidden md:inline"
            style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
          >
            OR-Tools CP-SAT
          </span>
        </div>
      </div>
    </header>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { RoutingSettings } from "@/components/RoutingSettings";
import { ThemeToggle } from "@/components/ThemeToggle";

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
    <header className="border-b sticky top-0 z-50" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--surface-1) 88%, transparent)", backdropFilter: "blur(8px)" }}>
      <div className="mx-auto max-w-7xl px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-3">
          <div
            className="h-8 w-8 rounded-md grid place-items-center font-bold"
            style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
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
            className="px-2 py-1 rounded-md mono hidden lg:inline"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
          >
            OR-Tools CP-SAT
          </span>
          <RoutingSettings />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

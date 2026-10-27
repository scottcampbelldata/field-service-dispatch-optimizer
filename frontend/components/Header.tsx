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
    <div className="border-b" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
      <div className="mx-auto max-w-7xl px-5 py-2 flex flex-wrap items-center gap-x-6 gap-y-1">
        <div className="text-base" style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}>
          Field Service Dispatch Optimizer
        </div>

        <nav aria-label="Main navigation" className="order-last w-full sm:order-none sm:w-auto flex items-center gap-1 overflow-x-auto">
          {LINKS.map((l) => {
            const active = path === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className="px-2.5 py-2 text-sm transition-colors whitespace-nowrap"
                style={{
                  color: active ? "var(--text)" : "var(--muted)",
                  borderBottom: `2px solid ${active ? "var(--accent)" : "transparent"}`,
                }}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto text-xs flex items-center gap-2" style={{ color: "var(--muted)" }}>
          <RoutingSettings />
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}

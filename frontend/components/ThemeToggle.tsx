"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

const OPTIONS = [
  { value: "system", label: "System", icon: MonitorIcon },
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Avoid hydration mismatch: reserve space until mounted.
  if (!mounted) {
    return <div style={{ width: 86, height: 30 }} aria-hidden />;
  }

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className="inline-flex items-center rounded-lg p-0.5"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
    >
      {OPTIONS.map((o) => {
        const active = (theme ?? "system") === o.value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            title={o.label}
            onClick={() => setTheme(o.value)}
            className="grid place-items-center rounded-md transition-colors"
            style={{
              width: 28, height: 26,
              background: active ? "var(--surface-1)" : "transparent",
              color: active ? "var(--accent)" : "var(--text-faint)",
              boxShadow: active ? "var(--shadow-sm)" : "none",
            }}
          >
            <Icon />
            <span className="sr-only">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function MonitorIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" />
    </svg>
  );
}
function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

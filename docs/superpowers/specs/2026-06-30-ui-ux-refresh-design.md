# UI/UX Refresh + Light/Dark Theming — Design

**Date:** 2026-06-30
**Status:** Approved (direction); pending implementation
**Author:** Scott Campbell

Elevate the dashboard from a generic dark console to an intentional "refined
operations console," and add a system-aware light/dark theme. Direction chosen:
**Refined operations console** (evolve the current identity — precise warm
neutrals, cyan→teal accent, subtle elevation, tight type scale).

## 1. Goals

- A semantic **design-token system** that works in light, dark, and system modes.
- `next-themes`-driven theming: no flash-of-wrong-theme, system detection,
  persisted, with a **System / Light / Dark** toggle in the header.
- Real **type scale**, **elevation**, **focus-visible** states, reduced-motion.
- A small **shared component vocabulary** (button, chip, panel, stat) replacing
  ad-hoc inline styling on high-visibility surfaces.
- Charts and the Leaflet basemap adapt to the active theme.
- **No page logic changes** — purely presentational. All 61 backend tests and the
  frontend build stay green.

## 2. Theming engine

- Add `next-themes`. Wrap the app (in `app/layout.tsx`) with `ThemeProvider`
  (`attribute="class"`, `defaultTheme="system"`, `enableSystem`,
  `disableTransitionOnChange`). Add `suppressHydrationWarning` to `<html>`.
- Tailwind v4: add `@custom-variant dark (&:where(.dark, .dark *))` so any
  `dark:` utilities resolve, though most styling is token-driven.
- `ThemeToggle` component: a 3-segment control (Monitor / Sun / Moon) bound to
  `useTheme()`; render only after mount to avoid hydration mismatch.

## 3. Token system (`globals.css`)

Light tokens on `:root` / `.light`; dark overrides on `.dark`.

**Dark** (refined): `--bg #0b0f14`, `--surface-1 #131922`, `--surface-2 #0f141b`,
`--surface-3 #1a212b`, `--border #232b36`, `--border-strong #313b48`,
`--text #e8edf3`, `--text-muted #97a4b4`, `--text-faint #6b7888`,
`--accent #2dd4bf`, `--accent-strong #14b8a6`, `--accent-contrast #04221d`,
`--good #34d399`, `--warn #f59e0b`, `--bad #fb7185`, shadows near-none.

**Light** (warm off-white): `--bg #f5f6f8`, `--surface-1 #ffffff`,
`--surface-2 #eef1f4`, `--surface-3 #e6eaef`, `--border #e3e7ec`,
`--border-strong #cdd5dd`, `--text #18212e`, `--text-muted #586575`,
`--text-faint #8893a2`, `--accent #0d9488`, `--accent-strong #0f766e`,
`--accent-contrast #ffffff`, `--good #059669`, `--warn #b45309`, `--bad #e11d48`,
real soft shadows (`--shadow-sm/md`).

Back-compat: keep `--panel`/`--panel-2`/`--foreground`/`--muted` aliased to the
new tokens so existing inline styles keep working during the transition.

## 4. Foundations

- **Type scale:** page title `text-2xl/3xl font-semibold tracking-tight`; section
  `font-semibold`; body `text-sm`; labels `text-xs uppercase tracking-wide`
  muted; metrics monospace with `font-variant-numeric: tabular-nums`.
- **Elevation:** `.panel` uses `--surface-1` + border + `--shadow-sm`; raised/
  hover uses `--surface-3`.
- **Components (base classes in `globals.css`):** `.btn`, `.btn-primary`,
  `.btn-ghost`, `.chip`, refined `.panel`/`.panel-quiet`, `.input`.
- **A11y:** global `:focus-visible` ring using `--accent`; honor
  `prefers-reduced-motion` (disable non-essential transitions).

## 5. Component updates

- **Header:** refined bar; add `ThemeToggle` beside the routing gear; active-nav
  treatment using surface + accent underline.
- **MetricCard / EmptyState / ControlPanel buttons:** adopt shared classes and
  token hierarchy.
- **Charts:** already read `var(--muted)`/`var(--border)` via `chartTheme.ts`;
  verify legibility in light (tooltip/grid/axis) and adjust tokens if needed.
- **LeafletMap:** default basemap follows theme (Dark tiles when `.dark`, else
  Voyager); switcher still available.

## 6. Out of scope

- No new pages or features; no backend changes.
- No wholesale rewrite of every page — the token swap + shared classes + polish
  of high-visibility surfaces achieves the lift.

## 7. Verification

- Build clean; 61 backend tests unaffected.
- Browser check in **both** light and dark across Board, Compare, Capacity,
  Constraints — confirm contrast, elevation, charts, and the map adapt; toggle
  persists and respects system setting.

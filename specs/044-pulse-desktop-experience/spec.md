<!--
  Frontmatter below is machine-read by .github/workflows/spec-fanout.yml when
  this spec is merged into main. The `fanout` array drives which downstream
  repos get a `[spec/<slug>] <title>` issue with the `squad` label. Fanout only
  runs when status is `ready` or `accepted` — while this is `draft` NOTHING fans
  out, so it is safe to review and iterate. Flip `status: ready` (the single
  switch) only when Pedro has reviewed and you want the squad issues opened on
  merge.

  Allowed fanout repos: rettxweb, rettxadmin, rettxapi, rettxmutation, rettxid, templates.
-->
---
spec_id: "044"
slug: "pulse-desktop-experience"
title: "rettX Pulse — desktop / wide-screen experience (web only)"
status: draft   # draft | ready | accepted | superseded
authored: "2026-07-26"
author: "perocha"
relates_to: "specs/035-pulse-tracker/"
fanout:
  - repo: rettxweb
    summary: |
      PRIMARY (and, for the MVP, ONLY required) target. Add a desktop /
      wide-screen Pulse experience that USES the horizontal space on a desktop
      browser, WITHOUT touching the existing mobile Pulse UX or the native
      Android app. Today the caregiver Pulse feature renders as a single
      ~400px mobile-width column no matter how wide the viewport is: on a ~2000px
      desktop browser the Calendar/Timeline/Metrics tab-switcher, the month
      calendar + legend, the three stat cards (Seizures / Doses / Notes) and the
      floating "+" all sit in one narrow centred column with the entire right and
      lower area left as empty whitespace.

      HARD CONSTRAINT (non-negotiable): the change MUST be COMPLETELY AGNOSTIC to
      the mobile / native experience. rettxweb is an Angular 18 standalone PWA
      wrapped with Capacitor as a native Android app (iOS planned). The EXISTING
      mobile Pulse UX — the tabbed single-column Calendar | Timeline | Metrics
      shell (`src/app/features/pulse/shell/pulse-shell.component.ts`) plus its
      calendar/timeline/metrics children and the FAB — MUST remain byte-for-byte
      UNCHANGED on mobile viewports AND inside the native app. Gating:
      (a) the native Android app ALWAYS gets the current mobile UX regardless of
      window size — use the existing `isNativeApp()` helper
      (`src/app/core/auth/native-auth.ts`, which wraps
      `Capacitor.isNativePlatform()`); native NEVER shows the desktop page even on
      a large tablet/foldable; and (b) desktop WEB only shows the new experience
      at wide viewports (>= ~1024px), reacting correctly to browser resize and
      falling back to the existing mobile view below the breakpoint.

      RECOMMENDED APPROACH — a SEPARATE, lazy-loaded desktop Pulse route/component
      reachable only on wide web viewports, leaving the mobile Pulse component
      tree entirely untouched (cleanest isolation, zero risk to mobile/native).
      Reuse the established shell-selection pattern from Feature
      012-desktop-mobile-shells (`ShellService` + CDK `BreakpointObserver`,
      `src/app/shared/shells/shell.service.ts`, breakpoint constants in
      `src/app/core/domain/shell.ts`) with a dedicated WIDE breakpoint, plus an
      `isNativeApp()` check, expressed as an Angular `CanMatch` guard so the same
      `/pulse` URL resolves to the desktop shell on wide web and to the existing
      mobile shell everywhere else, and a resize reconciler that re-navigates when
      the boundary is crossed. See the spec body for full routing/guard details.

      DATA: reuse-existing-first. Every MVP desktop panel and insight is computed
      CLIENT-SIDE from the existing `PulseDataSource` contract
      (`src/app/core/services/pulse-data-source.ts`:
      `getEligibility`, `getMetricDefinitions`, `getMonthMarkers`,
      `getEntriesForDay`, `getTimeline`, `getMetricHistory`) via the real
      `PulseHttpDataSource`. Do NOT add new endpoints for the MVP. See the
      OPTIONAL/secondary rettxapi item — pursue it only if a specific insight
      genuinely needs server-side aggregation.

      Accessibility (WCAG 2.2 AA), i18n (all labels as ngx-translate keys across
      the existing locale set — currently 19 app languages, English fallback) and
      theming MUST follow existing rettxweb conventions and match the mobile Pulse
      surfaces. See the full spec for the MVP panel/insight set, acceptance
      criteria and non-goals.

  - repo: rettxapi
    summary: |
      OPTIONAL / SECONDARY — do NOT open by default. The desktop Pulse MVP is a
      rettxweb-only, client-side-compute effort that reuses the existing Pulse
      `/v2` read contract; no backend change is required to ship it. Only if a
      specific STRETCH insight (e.g. long-range multi-month cross-metric
      correlation) proves too heavy or too chatty to compute client-side from the
      existing per-month / per-range reads should a NEW read-only aggregation
      endpoint be considered (e.g. a `GET /v2/patients/{rettxid}/pulse/insights`
      returning pre-aggregated per-metric trend / KPI series over a requested
      range). If pursued it MUST reuse the existing Pulse eligibility + access
      model (Feature 040 gate) and add no new write path or datastore. Treat this
      as a follow-up, gated on evidence from the rettxweb MVP — prefer reuse.
---

# rettX Pulse — desktop / wide-screen experience (web only)

## Problem

On a wide desktop browser (~2000px) the caregiver web app (**rettxweb**) renders
the **Pulse** page as a single ~400px mobile-width column centred in the
viewport, leaving the entire right/lower area as empty whitespace. That narrow
column contains everything Pulse offers:

- a **Calendar / Timeline / Metrics** tab switcher
  (`src/app/features/pulse/shell/pulse-shell.component.ts` — a segmented,
  URL-driven `tablist`);
- a **month calendar** (e.g. "July 2026") with colour-dot metric markers and an
  always-on legend (Medication, Seizure, Bathroom, Menstrual cycle, Side effect,
  Sleep) (`src/app/features/pulse/calendar/pulse-calendar.component.ts`);
- three small **stat cards** (SEIZURES / DOSES / NOTES);
- a floating **"+"** action button (FAB).

The app already has an app-level desktop shell (Feature `012-desktop-mobile-shells`:
`MainLayoutComponent` swaps `DesktopShellComponent` / `MobileShellComponent` off
`ShellService.shell$`), so the outer chrome adapts — but the **Pulse feature
content itself was never given a wide layout**, so it stays a mobile column
inside a desktop frame. The result is enormous wasted horizontal space and no
desktop-specific value.

## Goal

Give desktop-web caregivers a proper **wide-screen Pulse experience** that USES
the horizontal space: a **multi-panel dashboard** showing **Calendar + Timeline +
Metrics side by side** (instead of tab-switched), PLUS **desktop-only insights**
that only the extra space affords — trend charts over time, cross-metric
overlays, longer/multi-month ranges, and KPI summaries with sparklines. This is
**purely additive**: it must not change what mobile or native users see.

## Hard constraint — completely agnostic to mobile / native (NON-NEGOTIABLE)

> This desktop experience MUST be **completely agnostic to the mobile / native
> Android experience.** rettxweb is an **Angular 18 standalone PWA** wrapped with
> **Capacitor** as a native Android app (iOS planned). The desktop experience is
> **additive** and **gated** so that:
>
> - **(a) The native app ALWAYS gets the current mobile UX.** Use Capacitor
>   platform detection via the existing `isNativeApp()` helper
>   (`src/app/core/auth/native-auth.ts`, wrapping `Capacitor.isNativePlatform()`).
>   Native NEVER shows the desktop page **regardless of window size** (large
>   Android tablets, foldables, or a resized WebView still get mobile Pulse).
> - **(b) Desktop web only shows the new experience at wide viewports**
>   (breakpoint >= ~1024px), reacting correctly to browser resize.
>
> The existing mobile Pulse component tree
> (`src/app/features/pulse/shell/**`, `calendar/**`, `timeline/**`, `metrics/**`,
> `metric-detail/**`, `entry-form/**`, `quick-log/**`, the FAB) MUST remain
> **unchanged** on mobile viewports and in the native app.

This constraint is reflected directly in the acceptance criteria below and is the
primary reason the recommended approach is a **separate desktop route**.

## Recommended approach

Two approaches were evaluated:

- **(A) Separate desktop Pulse route/component** — a new, lazy-loaded desktop
  shell reachable only on **wide web** viewports and **never** in the native app,
  leaving the existing mobile Pulse component tree entirely untouched.
- **(B) Responsive enhancement within the same component** — grow the existing
  Pulse surfaces into a wide layout via CSS/`@if` breakpoints inside the current
  components.

**Recommendation: (A) the separate desktop route.** Rationale:

1. **Zero risk to mobile/native.** The mobile component tree is not edited at all,
   so there is no way for the desktop work to regress the shipping mobile UX or
   the native app — the cleanest possible expression of the hard constraint.
2. **Desktop-only insights want their own composition.** Multi-panel layout,
   trend charts, cross-metric overlays and KPI sparklines are a different
   information architecture from the mobile tab switcher; forcing both into one
   component would bloat it and entangle two very different layouts.
3. **Lazy-loading keeps the mobile/native bundle lean.** Charting and dashboard
   code load only when a wide web client actually needs them, so native and
   mobile users never pay for desktop-only weight.
4. **Precedent already exists.** Feature `012-desktop-mobile-shells` established
   `ShellService` + CDK `BreakpointObserver` shell selection; approach (A)
   reuses that established pattern rather than inventing a new one.

### Routing / guard / gating mechanism

- **Same URL, two candidate routes.** Keep the existing `/pulse` routes
  (`src/app/features/pulse/pulse.routes.ts`) exactly as they are for mobile. Add a
  **second** candidate route config for the desktop shell guarded by an Angular
  **`CanMatch`** guard, `pulseDesktopCanMatch`, declared **before** the existing
  mobile route so the router evaluates it first:
  - `pulseDesktopCanMatch` returns **true** iff `!isNativeApp()` **AND** the
    viewport is at/above the wide breakpoint; otherwise **false**, so the router
    falls through to the unchanged mobile route.
  - Because the guard covers `/pulse`, `/pulse/timeline`, `/pulse/metrics` and
    `/pulse/metric/:metricCode`, deep links resolve to the right surface on both
    form factors. The desktop shell may collapse the tab sub-paths into panels
    (see below) while still honouring an incoming deep link (e.g. focus the
    corresponding panel / open the metric drill-in).
- **Eligibility unchanged.** The desktop route sits **behind the same eligibility
  gate** as mobile — reuse `PulseGateComponent` /
  `PulseDataSource.getEligibility()` (Feature 040). Guidance states (no patient /
  diagnosis not confirmed / flag off) are shown by the gate exactly as today; only
  the eligible tracker content differs between form factors.
- **Wide breakpoint.** Reuse the `ShellService` + CDK `BreakpointObserver`
  pattern, but introduce a **dedicated wide-Pulse breakpoint constant**
  (e.g. `PULSE_DESKTOP_BREAKPOINT_PX = 1024`) rather than the app shell's 768px
  chrome breakpoint — the multi-panel dashboard needs more room than the point at
  which the app switches nav chrome. Keep the existing 300ms debounce
  (`SHELL_DEBOUNCE_MS`) to avoid thrashing during drag-resize.
- **Resize / fallback behaviour.** A small reconciler subscribes to the
  wide-breakpoint observable while on a `/pulse*` URL and, when the boundary is
  crossed, **re-navigates to the same URL** so the `CanMatch` guards are
  re-evaluated and the correct shell is mounted:
  - Desktop browser **narrowing below** the breakpoint → the desktop shell is
    torn down and the **existing mobile Pulse view** is shown (graceful fallback,
    no data loss — both read from the same `PulseDataSource`).
  - Narrow browser **widening past** the breakpoint (web only) → the desktop
    dashboard mounts.
  - Native app → the reconciler is inert (`isNativeApp()` short-circuits); nothing
    ever switches.

## Desktop layout — panels & insights

The desktop shell composes the existing Pulse surfaces into a **multi-panel
dashboard** and adds insights that only the wide layout affords. Every panel and
MVP insight is fed **client-side** from the existing `PulseDataSource`
(`src/app/core/services/pulse-data-source.ts`) — no new endpoint for the MVP.

### MVP (must ship)

1. **Multi-panel dashboard — Calendar + Timeline + Metrics side by side.**
   Replace the tab switcher with a responsive grid: the **month calendar** (reuse
   the existing marker/legend/day-cell model from
   `getMonthMarkers()` / `CalendarDay` / `DayMarker`) as the primary panel, with
   the **Timeline** (`getTimeline()` + filter chips) and **Metrics catalogue**
   (`getMetricDefinitions()` — entry counts + last-logged) as adjacent panels, all
   visible at once. Selecting a day in the calendar filters/focuses the Timeline
   panel (cross-panel linkage the tabbed mobile view cannot do).
2. **KPI summary bar with sparklines.** A top strip of KPI cards
   (Seizures / Doses / Notes, extensible to other seed + custom metrics) showing
   the period total plus a small **sparkline** trend, computed client-side from
   `getMonthMarkers()` / `getMetricHistory()`. This is the wide-screen evolution
   of the three cramped mobile stat cards.
3. **Per-metric trend chart, inline.** A charts panel that renders a metric's
   history over a selectable range **inline** on the dashboard (line/bar), reusing
   `getMetricHistory(patientId, metricCode, range)` which already returns
   `MetricHistoryPoint[]` over a `DateRange`. On mobile this requires drilling into
   the full-screen `metric/:metricCode` detail; desktop shows it without leaving
   the dashboard.
4. **Longer / adjustable date range.** A range selector (e.g. 1 / 3 / 6 months)
   driving the Timeline, KPI sparklines and trend chart — desktop can comfortably
   show multi-month spans. Multi-month data is assembled client-side from the
   existing per-month / per-range reads.

### Stretch (nice to have; explicitly out of MVP scope)

- **Cross-metric overlay / correlation.** Plot multiple metrics on a shared time
  axis (e.g. seizures vs. sleep vs. medication adherence) to surface visual
  co-occurrence. If client-side assembly over long ranges proves too heavy/chatty,
  this is the trigger for the OPTIONAL rettxapi aggregation item — not before.
- **Multi-month calendar (quarter view).** Two-to-three months side by side.
- **Printable / exportable dashboard snapshot.** Deferred; aligns with the Pulse
  media/PDF Phase 2 in spec 035, not this spec.
- **Clinician-oriented summary card** for a caregiver to screenshot/share.

## Data / backend stance

**rettxweb-first, reuse existing data.** The desktop MVP consumes the **existing**
Pulse `/v2` read contract through the current `PulseHttpDataSource`
(`src/app/core/services/pulse-http.data-source.ts`) behind the stable
`PulseDataSource` abstraction. All MVP insights (KPIs, sparklines, trend chart,
multi-month ranges) are derived **client-side** from
`getMonthMarkers`, `getTimeline`, `getMetricHistory`, `getMetricDefinitions` and
`getEntriesForDay`. **No new endpoint is required to ship the MVP.**

An **OPTIONAL, secondary** rettxapi aggregation endpoint is flagged in the fanout
**only** as a follow-up, to be pursued **only if** a specific stretch insight
(long-range cross-metric correlation) proves too expensive to compute
client-side. Prefer reuse; do not build it speculatively.

## Accessibility, i18n & theming

- **Accessibility (WCAG 2.2 AA).** The multi-panel dashboard MUST be fully
  keyboard-navigable with a sensible landmark/heading structure per panel; charts
  MUST expose an accessible text/table alternative (not colour-only); honour
  `prefers-reduced-motion` for panel and chart transitions; maintain AA contrast —
  matching the craft bar already applied to the mobile Pulse surfaces.
- **i18n.** Every caregiver-visible string is an **ngx-translate key** shipped
  across the existing locale set (currently **19 app languages**) with documented
  **English fallback**; month/weekday/number/date formatting uses registered
  Angular locale data, exactly as the mobile calendar does.
- **Theming.** Reuse existing rettxweb design tokens, Angular Material usage and
  the shared Pulse metric colour palette/legend so the desktop dashboard is
  visually consistent with the mobile surfaces.

## Non-goals

- **No change to the mobile / native Pulse experience.** The existing tabbed
  single-column shell, calendar, timeline, metrics, metric-detail, entry-form,
  quick-log and FAB are untouched on mobile viewports and in the native app.
- **No Pulse data-model redesign.** No new metric types, entry schema or write
  paths; this is a presentation/insight layer over existing data.
- **No new backend for the MVP.** Any server-side aggregation is an optional,
  evidence-gated follow-up.
- **Not an admin feature.** rettxadmin is out of scope.
- **No media/PDF export** in this spec (that is Pulse Phase 2, spec 035).

## Acceptance criteria

- [ ] On a **desktop browser** at/above the wide breakpoint (>= ~1024px), Pulse
  renders a **multi-panel dashboard** (Calendar + Timeline + Metrics visible
  simultaneously) that uses the horizontal space — no single centred mobile
  column, no large empty right/lower area.
- [ ] In the **native Android app**, Pulse ALWAYS renders the **current mobile
  UX**, at any window size (verified via `isNativeApp()` short-circuit) — the
  desktop dashboard is never reachable natively.
- [ ] On a **desktop browser below** the breakpoint, Pulse renders the **existing
  mobile view**, and **resizing across** the breakpoint switches between the
  desktop dashboard and the mobile view live, without a full reload or data loss.
- [ ] The existing mobile Pulse component tree is **unchanged** (no diffs to
  `shell/`, `calendar/`, `timeline/`, `metrics/`, `metric-detail/`, `entry-form/`,
  `quick-log/`); the desktop experience is a **separate, lazy-loaded** route/shell
  selected by a `CanMatch` guard.
- [ ] The desktop route sits behind the **same eligibility gate** as mobile
  (Feature 040) and shows the identical guidance states when not eligible.
- [ ] MVP desktop insights (KPI cards + sparklines, inline per-metric trend chart,
  adjustable multi-month range) are computed **client-side** from the existing
  `PulseDataSource` — **no new rettxapi endpoint** is introduced for the MVP.
- [ ] The dashboard meets **WCAG 2.2 AA** (keyboard nav, accessible chart
  alternatives, reduced-motion, AA contrast) and all strings are **translation
  keys** across the existing locale set with English fallback.

## Constitution Check

Aligned with the [program constitution](../../.specify/memory/constitution.md):

- **I — Patients & caregivers come first (NON-NEGOTIABLE).** The change reduces
  caregiver burden by turning wasted desktop whitespace into at-a-glance insight,
  while guaranteeing the familiar mobile/native flow is never disturbed.
- **V — Accessibility and inclusion.** WCAG 2.2 AA, accessible chart
  alternatives, reduced-motion support, and full multilingual coverage (English
  fallback) are required, not optional.
- **VI — Security baseline.** The desktop route is a **UI presentation gate only**;
  it reuses the existing server-side Pulse eligibility/authorization boundary
  (Feature 040) and adds no new data-bearing endpoint for the MVP — UI gating is a
  usability nicety, not a security control.
- **III — Transparency.** A single cross-cutting spec in the control plane; any
  future backend aggregation is captured here (optional fanout) rather than
  decided ad hoc downstream.

_Non-negotiable principles I, II and III are respected; no amendment is required._

## Patterns note (no `patterns.md` change)

This is a single-repo (rettxweb) **UX/presentation** spec. It introduces **no new
shared cross-repo vocabulary, label, route convention or delivery mechanism**, so
**no edit to `.specify/memory/patterns.md` is needed**. The desktop route reuses
the existing Feature-012 shell-selection pattern and the existing Capacitor
`isNativeApp()` convention. (Recorded here as a note rather than a `patterns.md`
edit, per the guidance that shared vocabulary changes are proposed in-spec first.)

## Fanout summary

- **rettxweb** — PRIMARY: build the separate desktop Pulse route/shell + MVP
  panels/insights (see fanout front-matter).
- **rettxapi** — OPTIONAL / SECONDARY: a read-only Pulse insights aggregation
  endpoint, pursued only if a stretch insight can't be computed client-side.
- **rettxadmin / rettxid / templates** — **none**.

## Open questions

- **Wide breakpoint value.** 1024px vs 1280px as the desktop-Pulse threshold —
  1024px is proposed so common landscape tablets/small laptops get the dashboard;
  confirm against real caregiver device analytics.
- **Deep-link behaviour on desktop.** Should `/pulse/metrics` and
  `/pulse/metric/:metricCode` deep links focus the corresponding dashboard panel,
  or still open a focused view? (Proposed: focus/scroll the matching panel and,
  for `metric/:metricCode`, open the inline trend chart pre-selected.)
- **Correlation insight placement.** Confirm whether cross-metric correlation
  stays a stretch item or is promoted once client-side feasibility is measured
  (this is the deciding factor for the optional rettxapi endpoint).

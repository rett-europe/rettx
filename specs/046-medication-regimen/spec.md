<!--
  Frontmatter below is machine-read by .github/workflows/spec-fanout.yml when
  this spec is merged into main. Fanout only runs when status is `ready` or
  `accepted` — while `draft` nothing fans out, so it is safe to review and
  iterate. Flip `status: ready` when agreed and you want the squad issues
  opened on merge.

  Allowed fanout repos: rettxweb, rettxadmin, rettxapi, rettxmutation, rettxid,
  templates.

  STACK & DELIVERY PRE-FLIGHT (patterns.md §7): fanout targets were checked
  against patterns.md §1 AND against a read-only gap analysis run in each repo
  (2026-08-01). rettxapi = Python 3.11 + FastAPI + Azure Functions v4 + Cosmos DB
  (shared-throughput `rettxdb`) + Blob Storage; owns the /v2 contract.
  rettxweb = Angular 18+ standalone PWA wrapped with Capacitor 8 as a native
  Android app (iOS planned) — treat as a NATIVE MOBILE SURFACE. That matters
  here: the desktop Pulse surface is gated `!isNativeApp()`, and browser
  printing inside the Android WebView is NOT a guaranteed delivery mechanism
  (see Risk R2). No new delivery mechanism is introduced; no push, no email, no
  rendered content → no `templates` slice. rettxadmin needs NO code change (see
  "rettxadmin: no code change").
-->
---
spec_id: "046"
slug: "medication-regimen"
title: "rettX Medication Regimen — a dated medication list, not a daily pulse event"
status: ready   # draft | ready | accepted | superseded
authored: "2026-08-01"
author: "perocha"
relates_to: "specs/035-pulse-tracker/ (amends: retires the `medication` seed preset, adds the `quantity` primitive); specs/036-pulse-metric-catalog-admin/ (retire is an admin catalog action); specs/039-pulse-admin-insights/ (PowerBI/admin aggregates); specs/044-pulse-desktop-experience/ (Insights host; unblocks the adherence denominator)"
fanout:
  - repo: rettxapi
    summary: |
      OWNER of the medication-regimen contract (/v2 conventions). Medication
      stops being a Pulse tracker entry and becomes a patient-scoped,
      effective-dated **regimen** resource. Everything below was validated
      against a read-only gap analysis of this repo (2026-08-01).

      Do:
      (1) **New `quantity` value primitive** (decimal `amount` + `unit`) added to
      `app/models/pulse/metric_primitives.py::ValuePrimitive`, with the matching
      `Measurement` value attribute + exactly-one-value validator update and viz
      history flattening. This is REQUIRED because `count` is `int, ge=0` with no
      unit and cannot express `28.4 kg`. Do NOT reuse the `dose` primitive for
      body weight — it pollutes dose analytics.
      (2) **New `weight` and `height` seed presets** (`quantity`, units `kg` and
      `cm`, sane min/max) in `app/models/pulse/seed_presets.py`.
      `bootstrap_seeds()` is insert-if-absent and iterates `get_seed_presets()`,
      so a NEW code auto-lands in `pulse_catalog_definitions` in every
      environment with no migration.
      (3) **New `medication-exception` seed preset** — composed from EXISTING
      primitives: `exception-type` (category: `missed-dose` | `extra-dose` |
      `changed-dose` | `rescue-dose`, required), `medication-ref` (short-text: the
      OPAQUE `medication_id`, never the drug name), `regimen-version` (count,
      optional), `dose` (optional, for `changed-dose` and `rescue-dose`), `note`.
      Storing exceptions as TrackerEntries is deliberate: they inherit calendar
      dots, day view,
      timeline, metric history, filters, the PowerBI daily rollup and the admin
      per-metric summary with ZERO new read-path code.
      (4) **New patient-scoped medication-regimen resource** —
      `/v2/patients/{rettxid}/pulse/medications` (contract in
      `specs/046-medication-regimen/contracts/medication-regimen-api.md`).
      Append-only, **effective-dated immutable versions** mirroring the proven
      `pulse_catalog_definitions` pattern but partitioned `/patient_id`: doc id
      `medregimen-{patient_id}-{medication_id}-v{n}`, stable `medication_id`,
      `version`, `valid_from` (required) / `valid_to` (optional), per-slot dose
      map, `is_current`/`superseded_by`. A dose change / stop / restart writes a
      NEW version; history is NEVER mutated. "As of date D" is a single-partition
      read. No composite index is required: a patient has tens of regimen rows,
      so fetch the partition and resolve latest-version-per-medication in
      application code.
      (5) **NO new container — co-locate in `pulse_entries`** behind a `type`
      discriminator (D9). `pulse_entries` is partitioned `/patient_id`, which
      makes regimen reads single-partition, and every runtime query against it
      funnels through `PulseTrackerEntryRepository`, so the blast radius is one
      file. ⚠️ **Blocking prerequisite — the type retrofit must land BEFORE the
      first regimen document is written:** add `type` to `TrackerEntry` (default
      `tracker_entry`) and to the regimen models, then filter with
      `(c.type ?? 'tracker_entry') = 'tracker_entry'` — the coalesce is required
      because existing documents predate the field. **Two queries MUST be fixed**
      (they have no WHERE clause and would silently swallow regimen documents):
      `patient_has_any_entry` and `project_entries_for_summary` (the PowerBI
      projection). **Five more** — `list_entries_for_patient`,
      `list_entries_filtered`, `list_entries_for_day`, `list_month_projection`,
      `list_metric_history` — are safe only by the accident that regimen docs
      lack `entry_date`/`measurements`; add the predicate defensively so
      correctness stops depending on document shape. Add a guard test asserting
      no read returns a non-`tracker_entry` document. See Risk R1a.
      (6) **No new config keys.** Co-location means there is no new container
      name or partition key to register, so the AST guard
      `tests/core/test_secret_loaders_completeness.py` is not engaged. (Had a
      container been added, `config.py`, `env_secret_loader.py` (UPPER_SNAKE) AND
      `keyvault_secret_loader.py` (HYPHEN-CASE) would all need it in the same PR.)
      (7) **Reuse the existing gates verbatim** —
      `require_pulse_contribute_and_confirmed_diagnosis` (write) /
      `require_pulse_read_or_existing_data` (read) from
      `app/dependencies/pulse_dependencies.py`; audit via
      `AuditServices.log_pulse_event` (identifiers only); hard-delete +
      `If-Match` etag concurrency, as the entry endpoints do.
      (8) **Retire the `medication` seed preset — LAST, and operationally.**
      ⚠️ Setting `is_retired=True` in `seed_presets.py` is a NO-OP in any
      already-bootstrapped environment because `bootstrap_seeds()` is
      insert-if-absent and never overwrites an existing code. Retirement is a
      runtime `PATCH /admin/pulse/catalog/metric-definitions/medication`
      (`is_retired: true`) per environment, which writes a new immutable version.
      Do it only AFTER the regimen surface is live in that environment. Existing
      pilot medication entries are NOT migrated and NOT deleted: retired
      definitions still resolve via `get_latest_definition()`, and calendar /
      day / history / summary reads key on `metric_code` strings, so history
      keeps rendering.
      NO PowerBI/regimen CSV in the MVP (Phase 2) — and when it comes, the
      medication NAME is free text and MUST NOT be exported raw.
  - repo: rettxweb
    summary: |
      CONSUMER + the whole caregiver experience. Medication moves out of the
      Pulse quick-log into its own section within the Pulse area, with a grid
      the caregiver can read at a glance and print. Everything below was
      validated against a read-only gap analysis of this repo (2026-08-01).

      Do:
      (1) **Medication is a full-screen route INSIDE Pulse — not a top-level nav
      destination and NOT a 4th tab.** Two constraints, both measured:
      • Do NOT add an entry to `core/constants/navigation.constants.ts`: the
      mobile bottom tab bar sits at 4 items against a documented 5-item ceiling
      with no overflow handling.
      • Do NOT add a 4th tab to `features/pulse/shell/pulse-shell.component.ts`.
      That strip is `flex: 1 1 0`, text-only, 13px, with **no ellipsis, no
      `overflow-x`, no `white-space` handling**, so an oversized single-word
      label silently overflows. French is the binding case (*Calendrier ·
      Chronologie · Médicaments · Indicateurs*, all unbreakable): ~85px needed
      against a ~78.5px budget at 360px. Breaks at 320px, marginal at 360px,
      fits only at 412px — and the active tab is `font-weight:700`, so it is
      widest exactly when Medication is selected.
      Instead: declare `medication` as a **sibling of the shell** in
      `features/pulse/pulse.routes.ts`, mirroring the shipping
      `metric/:metricCode` route (`:132-140`) — full-screen, no tab chrome, its
      own `arrow_back` header back to `/pulse` (see
      `pulse-metric-detail.component.html:2-11`), deep-linkable at
      `/pulse/medication`. Reach it from an entry point inside an existing Pulse
      view (card on Calendar, row in Metrics, or a header action) — placement and
      wording are yours to design; discoverability is the one real cost of this
      shape, so treat it as a design task, not an afterthought. On desktop
      (`pulse-desktop-shell`, ≥1024px, intrinsic-width icon+text tabs) horizontal
      room is not constrained, so a tab there is acceptable if it fits the
      desktop IA — but the same full-screen route is also fine and cheaper.
      Medication MAY carry its own `featureMatchGuard('medication')` for pilot
      rollout — route-level flags work inside Pulse exactly as at top level.
      ⚠️ Confirm what `PulseGateComponent` actually gates on
      (`PulseDataSource.getEligibility` + the zero-patients branch) before
      assuming the `pulse` flag is the only barrier; medication inherits it.
      ⚠️ The width figures above are calculated from the stylesheet, not
      rendered — sanity-check at 360px in French and German.
      (1a) **Mobile entry point — above the fold or it does not count.** The
      landing view is the Calendar. Put the entry card **between the tab strip
      and the calendar card**, inside the calendar view — NOT in the shell above
      the tab strip, which would make it persist across Timeline and Metrics with
      no precedent and duplicate the Metrics card below. The calendar grid must
      stay fully above the fold at 360×640: a two-line card carrying the
      medication names is fine (~16px slack, confirm on device), a one-line card
      is safer (~40px). Do NOT add the prototype's *"Pulse — <name>'s private
      tracker"* row: that is desktop chrome (`PULSE.DESKTOP.HEADER.*`) with no
      mobile equivalent, and its ~44px is what tips the six-week grid below the
      fold. Do NOT put the only entry point below the calendar card: the
      month-totals row is already below the fold there. Do NOT add an action to
      the shared global header
      (`shared/components/header/header.component.html` is logo + patient pill,
      app-wide — there is no mobile Pulse header). Do NOT convert `.pulse__fab`
      into a speed dial; it is bound to `openToday()` quick-log and is the
      primary daily action. ALSO add a reinforcing card in the **Metrics** list
      reusing the existing card template
      (`pulse-metrics.component.html:20-37` — tinted icon square, name, subtitle,
      `chevron_right`), which is the same launcher pattern used for
      `metric/:metricCode`.
      (1b) **Retire the stale "Doses" tile** in the calendar month-totals row
      (`pulse-calendar.component.html:103-112`). Once medication is not logged
      daily it counts nothing; remove it or repurpose the slot. Vertical-space
      figures here are calculated from the stylesheets, not rendered — confirm at
      360×640 and 360×740.
      (2) **New `MedicationDataSource` abstraction** + mock and HTTP impls,
      provided on the feature parent route — the exact `PulseDataSource` pattern
      (`core/services/pulse-data-source.ts`). CONSUME the rettxapi contract in
      `specs/046-medication-regimen/contracts/`; do not invent DTO shapes.
      (3) **The grid** — rows = medications, columns = the five fixed
      time-of-day slots, cells = per-slot dose, rendered **as of a chosen date**
      (default today). Net-new: there is no `mat-table`/`cdk-table`/`<table>` in
      the app. Build it as CSS Grid with real ARIA grid roles, mirroring
      `pulse-calendar.component.html` (`role="grid"`/`row`/`columnheader`/
      `gridcell`). On narrow Android, collapse the five columns into stacked
      per-medication cards (label: dose) — NOT horizontal scroll. As-needed
      (PRN) rows render their instructions spanning the slot columns. Header
      shows the as-of date and the latest known `weight` reading with its date.
      Keep component SCSS under the repo's size budget.
      (4) **Regimen editing writes history, never overwrites** — the edit flow
      must make "change the dose from today" vs "correct a mistake in the
      existing row" explicit, because the first creates a new version and the
      second amends one. Stopping a medication sets `valid_to`; it does not
      delete the row.
      (5) **Share sheet (A4, one page, on-device PDF)** — ONE layout, built with
      the ALREADY-PRESENT-BUT-UNUSED `jspdf` plus `jspdf-autotable`, used on
      every surface. On native, hand it to the OS share sheet via
      `@capacitor/share` (not currently installed) so the caregiver chooses the
      recipient — including Android's own print service. On desktop, open it for
      print/save. ⚠️ Do NOT build a `@media print` stylesheet as a second layout
      and do NOT rely on `window.print()` in the Android WebView: WebView printing
      is unreliable, and two layouts of the same sheet is permanent duplicate
      maintenance. Must work offline. Filename must not contain the patient's
      name. Server-generated + emailed delivery is Phase 2 (spec O1).
      (6) **Exception logging** — log missed / extra / changed dose against a
      regimen row. These are ordinary Pulse entries under the new
      `medication-exception` definition, so they appear on the existing calendar
      and timeline for free via the definition-driven `entry-form`; the client
      resolves the opaque `medication-ref` to a name via the regimen read.
      (7) **Retire `medication` in the client** — set `retired: true` on the
      preset in `core/domain/pulse/seed-presets.ts`. The retired path is already
      implemented and safe: both data sources filter `!d.retired` out of
      `getMetricDefinitions`, and timeline/calendar/metric-history fall back to
      `FALLBACK_COLOR`/`FALLBACK_ICON` + the generic label mapper, so pilot
      medication history keeps rendering. Add the new `weight` and `height`
      presets (both loggable and chartable like any other metric).
      (8) **Desktop Insights (spec 044)** — extend the pure
      `features/pulse-desktop/insights/pulse-insights.ts::computeInsights` with
      medication change markers + exposure bands over the existing hand-rolled
      CSS bar charts, and a descriptive **before/after** panel around each
      start/stop (e.g. seizures per week 28 days before vs after), reusing
      `buildSeizureSeverity` on each half. Insights currently only knows
      `PulseDataSource` — it needs the regimen read injected. All client-side:
      ~5 calls (1 regimen list + 4 metric-history) over a 6-12 month range, all
      single-partition. NO new aggregation endpoint for the MVP.
      (9) **i18n across all 19 locales** — `MEDICATION.*`, `NAV.MEDICATION`, the
      five slot labels, weight, and the exception vocabulary. The five prescribed
      slots are a NEW translatable set — do NOT overload the timestamp-derived
      `morning|afternoon|evening|night|anytime` enum in
      `features/pulse/copy-medication/`. Respect locale decimal commas in doses.
---

# rettX Medication Regimen — a dated medication list, not a daily pulse event

**Feature Branch**: `046-medication-regimen`
**Created**: 2026-08-01
**Status**: Draft
**Input**: Product owner: *"Instead of having the caregiver introduce medication daily as a pulse, add each medication with a `from` date (and optionally a `to` date). The caregiver ends up with a grid like the paper sheet they already keep. Every time a medication is added/removed/updated the grid updates. Insights can then cross medication against side effects, stool, seizures. This removes the pulse event of type medication."*

## Problem

Pulse models medication as a **daily event**: the `medication` seed preset
(short-text drug name + `dose` primitive + note) logged once per dose, per day,
like a seizure or a bathroom visit. That is the wrong shape for what medication
actually *is*.

- **It is a standing state, not an event.** A child on Lamictal is on Lamictal
  every day until they aren't. Asking a caregiver to re-type the drug name and
  dose daily is a data-entry tax that Principle I ("burden on caregivers MUST be
  minimised") does not tolerate — and it is the single most repetitive thing in
  Pulse.
- **It answers the wrong question.** Because each entry is independent free text,
  the system can tell you *"there are 47 medication entries"* but not
  *"what is this patient taking today?"* or *"what were they taking last March?"* —
  which is what every clinical conversation actually starts with.
- **It cannot support insight.** Correlating medication with seizures, stool or
  side effects needs **exposure windows** (started on X, stopped on Y, dose
  changed on Z). Daily logs of a name and a number contain that information only
  by accident, and only if the caregiver logged perfectly. Spec 044 already hit
  this wall from the other side: its medication waffle had to be framed as
  *"doses logged, NOT an adherence %"* because there was **no expected-dose
  denominator** anywhere in the model.
- **The real artefact already exists on paper.** Caregivers keep a sheet: rows of
  medications, columns of times of day, a `from` date implicit in "this is the
  current sheet", handed to school and respite carers. rettX should produce that
  sheet, not compete with it.

## What changes

|  | Today (spec 035) | This spec |
| --- | --- | --- |
| Medication is | a Pulse metric (`medication` seed preset) | a **regimen**: its own patient-scoped, effective-dated resource |
| Recorded as | one entry per dose per day | one **row per medication**, with a per-slot dose schedule, `from` date, optional `to` date |
| Changing a dose | log different numbers tomorrow | writes a **new immutable version**; the old one keeps its date range |
| "What are they on today?" | unanswerable | a single-partition **as-of-date** read |
| The caregiver sees | a calendar dot | a **grid** (mobile, desktop, printable A4) |
| Daily logging | mandatory | **gone** — replaced by optional **exception events** (missed / extra / changed dose) |
| Insight | "doses logged" density | **exposure bands + before/after** around each start/stop |
| Weight & height | not tracked | **first-class Pulse metrics** (paediatric doses are mg/kg; growth matters in Rett) |

The `medication` seed preset is **retired, not deleted**. Pilot entries already
logged stay readable and keep rendering everywhere.

## Decisions

Agreed with the product owner on 2026-08-01, then reconciled against a read-only
gap analysis in `rettxapi` and `rettxweb` (same day).

- **D1 — Regimen *and* exception logging in the MVP.** The regimen carries the
  standing state; a lightweight exception event records a missed, extra or
  changed dose on a specific day. Rejected: regimen-only (loses the "she didn't
  take her evening dose" signal that matters most next to a seizure spike).
- **D2 — Exceptions are Pulse entries, not regimen documents.** A new
  `medication-exception` seed preset composed from existing primitives.
  *Rationale (from the API gap analysis):* the calendar, timeline, day view and
  metric-history reads query `pulse_entries` **only**. An exception stored in the
  regimen container would not appear on the calendar at all — precisely where a
  caregiver expects "missed dose on the 14th" to show up. Reproducing that
  visibility means rebuilding the whole viz stack (month projection, day query,
  history query, indexes, DTOs, endpoints, tests). As a Pulse entry it inherits
  all of it for the cost of one preset. It also needs **zero** new containers.
- **D3 — Fixed, translatable time-of-day slots**: `morning` · `midday` ·
  `afternoon` · `evening` · `other`. Mirrors the paper sheet (*Matí / Dinar /
  Tarda / Vespre / Altres*), prints predictably, and keeps the grid comparable
  across patients. Rejected: free-form clock times (unprintable, incomparable,
  and not how caregivers or schools talk) and caregiver-configurable columns
  (breaks the shared artefact for marginal gain). **These are a NEW slot set** —
  they are prescribed slots, semantically distinct from the timestamp-derived
  `morning|afternoon|evening|night|anytime` enum in rettxweb's existing
  `copy-medication` utility, which must not be overloaded.
- **D4 — Retire, don't migrate.** Existing pilot medication entries stay in
  place, read-only, and keep rendering; the preset is retired; regimens start
  empty and caregivers enter their current sheet once. *Rationale:* a best-effort
  conversion (one regimen per distinct name, `from` = first logged date) would
  fabricate clinical-looking date ranges out of logging behaviour — inventing
  precision we do not have, in exactly the domain where Principle IV says wrong
  data is worse than no data. The gap analysis confirms no read path breaks when
  a definition is retired.
- **D5 — Effective-dated immutable versions.** A change writes a new version;
  history is never mutated. Mirrors the proven `MetricDefinition` versioning
  pattern, partitioned per patient so the as-of read stays single-partition.
  Rejected: mutating an "end date" on the prior row (rewrites history, which the
  codebase's versioning convention deliberately avoids).
- **D6 — The sheet is generated on-device and shared by the caregiver.** One PDF
  layout (`jspdf` + `jspdf-autotable`, both already-present or small MIT
  additions) used on **every** surface: handed to the OS share sheet on native
  via `@capacitor/share`, opened in a tab for print/save on desktop. Rationale:
  a single layout instead of a print stylesheet *and* a PDF generator; identical
  output everywhere; no dependence on the unreliable Android WebView print stack;
  works offline; and rettX never uploads, stores or transmits the file — the
  caregiver picks the recipient, which is their data to share (Principle I).
  Emailing the sheet is **Phase 2** and, if built, must send a **short-lived
  authenticated link, not an attachment** — see O1.
- **D7 — Weight and height become first-class Pulse metrics** (numeric, `kg` and
  `cm`, chartable), and the medication sheet header shows the latest known
  readings with their dates. Weight is the one the sheet needs — paediatric doses
  are mg/kg — but height is the same primitive, the same form, and the same
  chart, and growth is clinically meaningful in Rett syndrome, so tracking it
  costs one extra preset. Both require a **new `quantity` primitive** (decimal +
  unit): `count` is an integer with no unit and cannot hold `28.4 kg` or
  `132.5 cm`, and reusing `dose` for a body measurement would corrupt dose
  analytics. Adding a primitive is a change to the program-level value-primitive
  vocabulary (035 Cross-Team Coordination §2), so it is made here, once, for all
  surfaces. Derived values (BMI, centiles, growth velocity) are **out of scope** —
  those are clinical interpretations.
- **D8 — MVP insights are client-side.** Medication change markers + exposure
  bands on the existing charts, plus a descriptive before/after comparison panel.
  The gap analysis confirms this needs ~5 calls (1 regimen list + 4
  metric-history), all single-partition, all assemblable in the existing pure
  `computeInsights` function — **no new aggregation endpoint** for the MVP.
- **D9 — No new Cosmos container: regimen documents live in `pulse_entries`
  behind a `type` discriminator.** `rettxdb` runs on database-level **shared
  throughput** and sits at **23 of Azure's hard 25-container limit**, so a
  container is a scarce, and (if made dedicated to escape the cap) a recurring
  ~€9–25/month, resource. `pulse_entries` is already partitioned `/patient_id`,
  so regimen reads stay single-partition, the existing access gates and audit
  path apply unchanged, and every runtime query funnels through one repository
  file. Fewer containers with type discriminators is the Cosmos-native pattern;
  one container per entity is a relational instinct rettX has been paying for.
  **This decision is conditional on the type retrofit landing first** — see R1a,
  which is a correctness and PHI risk, not a tidiness one.
- **D10 — Medication lives inside Pulse, reached as a full-screen route — NOT a
  fourth tab.** Two sub-decisions:

  **(a) Inside Pulse, not top-level.** Medication is not a sibling destination of
  Pulse in the app navigation. Rationale: medication cannot be separated from
  Pulse conceptually — exceptions *are* Pulse entries, and the insights half of
  this spec crosses medication windows against seizures and stool, so a
  medication surface that cannot see Pulse data is half a feature. It also
  inherits Pulse's active-patient pill, data source and gate rather than
  re-providing them, and avoids spending the last slot in a mobile bottom tab bar
  that carries 4 items against a documented 5-item ceiling
  (`core/constants/navigation.constants.ts`) with **no overflow handling in
  code**. Rejected: a top-level sibling, which additionally costs the full
  nav-plumbing tax (paired route + placeholder, nav constant, the feature-flag
  field on the user features type, environment override, and a `NAV.*` key in
  **all** locale files) before any medication UI exists.

  **(b) A full-screen child route, not a fourth tab in the Pulse strip.** The
  mobile segmented control (Calendar · Timeline · Metrics) **cannot absorb a
  fourth text tab**. Measured against the real CSS
  (`features/pulse/shell/pulse-shell.component.scss`): tabs are `flex: 1 1 0`,
  text-only, `font-size: 13px`, and the strip has **no `text-overflow: ellipsis`,
  no `overflow-x`, and no `white-space` handling** — so a label that does not fit
  and cannot wrap (a single long word) silently overflows the track. The binding
  case is **French**, where all four labels are long unbreakable single words
  (*Calendrier · Chronologie · Médicaments · Indicateurs*): four tabs need
  ~85px each against a ~78.5px budget at **360px**, the most common Android
  width. It fits at 412px, is marginal-to-broken at 360px, and clearly breaks at
  320px. The active tab is `font-weight: 700` against 600, so the strip is at its
  widest precisely when Medication is selected.

  Instead, Medication is a **full-screen route pushed from within Pulse**
  (e.g. `/pulse/medication`), reached from an entry point inside an existing
  Pulse view, with its own back header. This is not a new pattern: it is exactly
  how `metric/:metricCode` already works — declared as a sibling of the shell so
  it renders without tab chrome, navigated to from cards in the Metrics view, and
  carrying its own `arrow_back` header because the shell has none. Cost to the
  tab strip: **zero**. It also suits the surface better — the grid is a dense,
  wide reference sheet you open deliberately, not a daily-glance tab — and a
  dedicated deep-linkable URL is an advantage for the share-sheet flow.
  Rejected: converting the strip to icon+label tabs to buy width (net-new
  redesign of a signed-off control) and a horizontally scrollable strip (net-new,
  and poor discoverability for primary navigation).

  ⚠️ **Two things rettxweb must verify, not assume.** First, the width figures
  above are a calculation from the stylesheet, not a rendered pixel measurement
  — confirm at 360px in French and German before locking the entry-point design;
  if the strip turns out to have more room than calculated, that does not by
  itself reopen (b), because the full-screen route is independently the better
  fit for this surface. Second, `PulseGateComponent` performs an eligibility
  check (`PulseDataSource.getEligibility` plus a zero-patients branch) in
  addition to the `pulse` feature flag; medication inherits whatever that gate
  does today, so confirm its actual conditions before assuming the flag is the
  only barrier.

  **Pilot gating is unaffected** either way: `featureMatchGuard` applies to any
  route, including one inside Pulse, so medication can carry its own flag
  independently of where it sits.

  **Entry point (resolved).** The mobile Pulse landing view is the Calendar, and
  its anatomy leaves exactly one above-the-fold slot: between the tab strip and
  the calendar card. At 360×640 the fixed chrome (~112px) plus tab strip (~56px)
  plus calendar card (~424px for a six-week month) already consumes the viewport,
  so the month-totals row below it is **already below the fold** — any entry
  point placed there would be invisible. The other candidates are ruled out by
  the codebase, not by taste: there is **no Pulse header** to hang an icon on
  (the global header is logo + patient pill and is shared app-wide), and the FAB
  is a single-action `mat-fab` bound to quick-log, so a speed dial would add a
  tap to the primary daily action in order to expose a secondary one. Decision:
  an entry card above the calendar card, sized so the calendar grid stays above
  the fold (FR-015a), inside the calendar view rather than the shell
  (FR-015a-i), plus a reinforcing card in the Metrics list (FR-015b), with the
  shared header and the FAB explicitly off limits (FR-015c). Accepted cost: the
  calendar legend falls at or below the fold on the smallest screens; the grid
  itself does not.

  **Deferred to rettxweb (design, not architecture):** the row's exact wording,
  iconography and whether it carries a summary (e.g. medication count, latest
  weight) — and the equivalent desktop placement, where horizontal and vertical
  space are not constrained and a tab in the desktop shell is acceptable.
- **D11 — Two complementary views: a day timeline in the app, a slot grid on the
  sheet.** These answer different questions and neither substitutes for the
  other.
    - **In the app — the treatment timeline.** Rows = medications, columns =
    *calendar days* across a month, cells shaded to show on-treatment periods,
    dose changes and logged exceptions. This answers *"what has actually been
    happening"* and is the natural in-app companion to the existing Pulse
    calendar.
    - **On the sheet — the slot grid.** Rows = medications, columns = the five
    fixed time-of-day slots. This answers *"what do I give, and when"* and is the
    artefact handed to a school or respite carer. A day-by-day adherence chart is
    useless to a school; the slot grid is the whole reason this spec exists.

  The regimen model feeds both, so this costs one extra rendering, not extra
  data. The slot grid does not need an in-app screen of its own — the generated
  sheet is its preview.
- **D12 — Complement the existing Pulse, do not redesign it.** The current Pulse
  look and feel stays as it is. On the existing Calendar view the only
  *deliberate* addition is the medication entry point; everything else about that
  screen is untouched. Two further changes there are unavoidable consequences of
  retiring the metric rather than design choices: the month-totals **"Doses"**
  tile stops counting anything (FR-021a), and **exception dose** joins the marker
  legend as a new definition. All other medication surfaces are new screens, so
  they carry no regression risk to shipped behaviour. Any proposal that restyles
  existing Pulse chrome — the FAB, the tab strip, the global header — is out of
  scope for this spec. This explicitly rules out one element of the hi-fi
  prototype: the visible *"Pulse — <name>'s private tracker"* row does **not**
  exist on mobile today (it is the desktop identity header,
  `PULSE.DESKTOP.HEADER.*`, and the phrase "private tracker" is nowhere in the
  codebase). Porting it down would be a second deliberate change to the Calendar
  view, and the ~44px it costs is exactly what pushes the calendar grid below the
  fold at 360×640. If that row is wanted, it belongs in its own change, judged on
  its own merits.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Caregiver enters the current medication sheet (Priority: P1)

As a caregiver, I open Medication and add each drug my child currently takes: a
name, how much at each time of day, and the date they started it. I leave the
`to` date empty because they are still taking it. When I finish, the screen shows
the same grid I keep on paper.

**Independent test**: add three medications with doses in different slots and a
`from` date → the grid renders one row per medication, doses in the right
columns, and the data persists for that patient only.

### User Story 2 — Caregiver changes a dose (Priority: P1)

The neurologist raises the evening Lamictal from 50 mg to 62.5 mg starting
Monday. I edit that row, enter the new evening dose and set the change date. The
grid shows the new dose; the old dose is still recorded as what was given until
Sunday.

**Independent test**: change a dose with an effective date → the as-of read for a
date before the change returns the old dose, and for a date on/after the change
returns the new one. The original row is not mutated.

### User Story 3 — Caregiver shares the sheet with school (Priority: P1)

I tap **Share sheet**, confirm the date, and get a one-page A4 PDF of the grid.
Android's share sheet opens and I send it on WhatsApp — or pick Print, or Drive.
It shows the date it was produced and my child's current weight and height, and
is legible without explanation. It works in the school car park with no signal.

**Independent test**: generate the sheet on a native device with networking
disabled → a one-page A4 PDF is produced on-device, with no app chrome, and the
OS share sheet opens with it attached. On desktop, the same PDF opens in a new
tab where the browser offers print and save. In both cases the sheet carries the
as-of date, latest weight and height, all rows and doses, the as-needed block,
a blank notes area and a non-clinical footer.

### User Story 4 — Caregiver records a missed dose (Priority: P2)

My daughter refused her evening dose. I record a missed dose against that
medication, and it shows up on the Pulse calendar for that day next to the
seizure I logged the following morning.

**Independent test**: log a `missed-dose` exception referencing a regimen row →
it appears as a calendar dot and a timeline row on that date, resolves to the
medication's name in the UI, and its stored reference is the opaque
`medication_id`, not the drug name.

### User Story 5 — Caregiver looks at what changed around a new drug (Priority: P2)

Three months after starting a new drug, I open Insights. The chart shows a band
where the medication started, and a panel comparing seizures per week in the 28
days before versus the 28 days after — clearly labelled as an observation, not a
conclusion.

**Independent test**: with a regimen start date inside a range that has seizure
entries either side, the Insights view renders an exposure band at the start date
and a before/after comparison with both counts, plus the non-clinical disclaimer.

### User Story 6 — Caregiver's old medication history still renders (Priority: P1)

I logged medication as a Pulse entry during the pilot. After the change, those
old entries still show on my calendar and timeline — I just can't log new ones
that way any more.

**Independent test**: after the `medication` definition is retired, historical
entries render on calendar, day view, timeline and metric history with a resolved
label; the medication metric no longer appears in the loggable metric picker.

### Edge Cases

- **Stopped then restarted** — the same medication restarted later is a **new
  version** with a new `valid_from`, not a resurrected old row. The as-of read
  for the gap between them MUST NOT return it.
- **Open-ended by default** — `valid_to` empty means "still taking"; the grid
  MUST NOT invent an end date.
- **Future-dated change** — a change effective next Monday MUST NOT alter today's
  grid, and MUST appear when the as-of date moves forward.
- **`valid_to` before `valid_from`**, or a new version starting before the
  version it supersedes — rejected with a clear message, server-enforced.
- **As-needed (PRN) medication with no scheduled dose** — a row with no slot
  doses and only instructions (the paper sheet's *"Crema Positón — for nappy
  changes when the skin is bad, max 2×/day"*) is valid and renders across the
  slot columns.
- **Dose ranges and fractions** — `12–15 drops`, `¼ tablet`, `1,5 sachets` must
  be expressible and must print legibly in locales that use a decimal comma.
- **Exception referencing a superseded version** — an exception logged against
  version 2 of a row still resolves after version 3 exists; the reference is
  `medication_id` + `version`.
- **Exception referencing a deleted medication** — the entry MUST still render
  (fall back to a neutral label), never crash the timeline.
- **Weight never recorded** — the sheet header renders cleanly with no weight,
  not "null kg".
- **Stale weight** — a weight from 14 months ago is shown **with its date**, so
  the reader can judge it. rettX MUST NOT warn, flag, or interpret.
- **Not a medical device** — no dose checking, no interaction warnings, no
  maximum-dose validation, no adherence judgement. rettX records and displays
  what the caregiver entered.

## Requirements *(mandatory)*

### Functional Requirements — Backend (rettxapi, contract owner)

- **FR-001** The system MUST provide a patient-scoped **medication regimen**
  resource under `/v2/patients/{rettxid}/pulse/medications`, gated by the
  existing Pulse access dependencies (`pulse_enabled` + confirmed diagnosis +
  caregiver access/contributor scope) — server-enforced, reusing
  `app/dependencies/pulse_dependencies.py` unchanged.
- **FR-002** A **regimen row** MUST carry: a stable `medication_id`, a `version`,
  a `name`, an optional `as_needed` flag, an optional per-slot **dose map** over
  the fixed slots `morning|midday|afternoon|evening|other`, optional free-text
  `instructions`, a **required `valid_from` date**, an **optional `valid_to`
  date**, and provenance (who/when).
- **FR-003** A per-slot dose MUST express an `amount` (decimal), an optional
  `amount_max` (for ranges such as 12–15 drops), and a `unit` **code** from the
  medication unit set (codes stored separately from translated labels, per the
  Pulse code/label convention).
- **FR-004** Regimen rows MUST be **append-only and immutably versioned**: any
  clinical change (dose change, stop, restart) writes a new version; no prior
  version is mutated or deleted. Corrections to a mis-typed row are the one
  exception and MUST be explicitly distinguishable from a clinical change.
- **FR-005** The system MUST support an **"as of date D"** read returning, per
  `medication_id`, the latest version whose `valid_from ≤ D ≤ (valid_to ?? ∞)`,
  as a **single-partition** query on `/patient_id`.
- **FR-006** The system MUST support a **full history** read for one
  `medication_id` (all versions, newest first) so a caregiver or clinician can
  see what changed and when.
- **FR-007** Validation MUST reject `valid_to < valid_from` and a version whose
  `valid_from` precedes the version it supersedes. Validation MUST NOT include
  any clinical judgement (no maximum doses, no interaction checks).
- **FR-008** The system MUST add a **`quantity` value primitive** (decimal
  `amount` + `unit`) to the program-level primitive vocabulary, with storage,
  exactly-one-value validation and history flattening consistent with the
  existing primitives.
- **FR-009** The system MUST ship a **`weight` seed preset** (`quantity`, unit
  `kg`) and a **`height` seed preset** (`quantity`, unit `cm`) so both are
  loggable and chartable like any other metric. The system MUST NOT derive or
  present BMI, centiles, or growth velocity — those are clinical
  interpretations.
- **FR-010** The system MUST ship a **`medication-exception` seed preset**
  composed of `exception-type` (category: `missed-dose` | `extra-dose` |
  `changed-dose` | `rescue-dose`, required), `medication-ref` (short-text
  carrying the **opaque `medication_id`**, never the drug name),
  `regimen-version` (count, optional), `dose` (optional) and `note`. Exceptions
  are stored as ordinary `TrackerEntry` records so they inherit all existing
  visualisation reads. `rescue-dose` covers medication given outside the plan
  (e.g. a rescue anticonvulsant) and is distinct from `extra-dose`, which is an
  additional dose of a planned medication.
- **FR-011** The `medication` seed preset MUST be **retired** — not deleted —
  once the regimen surface is live in an environment. Retirement MUST leave
  previously recorded medication entries readable and renderable. *(Implementation
  note: because catalog bootstrap is insert-if-absent, retirement is a runtime
  admin catalog `PATCH`, per environment, not a code change.)*
- **FR-012** Regimen create / update / delete MUST emit fire-and-forget audit
  events (identifiers only, no PHI) and MUST support hard delete with `If-Match`
  concurrency, consistent with Pulse entries.
- **FR-013** All new configuration symbols MUST be registered in `config.py`
  **and both** secret loaders in the same PR (completeness guard).
- **FR-014** The medication `name` and free-text `instructions` MUST be treated
  as **potential PHI**: they MUST NOT be included in any admin aggregate or
  analytics export. Any future analytics export MUST use the opaque
  `medication_id` or a coded drug identifier.

### Functional Requirements — Caregiver client (rettxweb)

- **FR-015** The client MUST provide the medication grid as a **full-screen route
  within the Pulse area** (e.g. `/pulse/medication`), lazy-loaded, inheriting the
  Pulse route tree's gate, with its own back affordance — mirroring the existing
  full-screen metric-detail route. It MUST NOT be added as a top-level navigation
  destination, and MUST NOT be added as a fourth tab to the mobile Pulse tab
  strip, which cannot fit one at 360px in the longest-labelled locales. It MAY
  carry its own feature flag for pilot rollout.
- **FR-015a** On mobile, the route MUST be reachable from an entry point that is
  **above the fold on the Pulse Calendar view at 360×640**, placed between the
  tab strip and the calendar card. The calendar grid — the primary daily-glance
  surface — MUST remain fully above the fold. Measured against the stylesheets
  for a six-week month against a ~528px budget:
    - **one-line card, no title row** → grid ends \~488px (40px slack), legend at
    the fold. Safest.
    - **two-line card carrying the medication names, no title row** → grid ends
    ~512px (16px slack), legend below the fold. **Acceptable**, and preferred if
    the names earn their space, but the slack is thin enough that it MUST be
    confirmed on a real 360×640 device.
    - **the hi-fi prototype's title row plus a two-line card** → grid ends \~556px,
    clipping the last ~1.5 weeks. **Not acceptable** (see D12).

  Placing the only entry point below the calendar card is also not acceptable:
  the month totals row is already below the fold at that viewport.
- **FR-015a-i** The entry point MUST NOT be rendered as shell chrome above the
  tab strip. Doing so would make it persist across Timeline and Metrics, which
  has no precedent in the app, costs vertical space on all three tabs, and
  duplicates the Metrics-list card required by FR-015b. It belongs to the
  Calendar view.
- **FR-015b** The route MUST **additionally** be reachable from a card in the
  Pulse **Metrics** list, reusing the existing metric-card template (tinted icon,
  name, subtitle, chevron) that already launches full-screen routes. This is a
  deliberate non-metric entry in that list, and it is reinforcing discovery — it
  MUST NOT be the only entry point, since Metrics is one tab away from the
  landing view.
- **FR-015c** The client MUST NOT add a Pulse-specific action to the shared
  global header (which is logo + patient pill only, app-wide), and MUST NOT
  convert the Pulse FAB into a menu or speed dial. The FAB is the primary daily
  logging action; adding a tap to it in order to surface a secondary surface is
  a regression to the most frequent caregiver task.
- **FR-015d** On **desktop** (≥1024px), where space is not constrained, the
  medication surface MAY be a tab in the Pulse desktop shell alongside Calendar,
  Timeline, Insights and Metrics. Adding it MUST NOT change which tab the desktop
  Pulse area lands on by default — promoting medication ahead of the existing
  landing view would be a redesign of shipped behaviour, not a complement to it
  (D12). Tab overflow at exactly 1024px in the longest-labelled locales MUST be
  checked, since the desktop strip is intrinsic-width and this adds a fifth item.
- **FR-016** The in-app medication surface MUST present, as of a selected date
  defaulting to today: the **current medication list** (name, dose, schedule,
  since-date), a list of medications **no longer taken** with their date ranges,
  a **treatment timeline** — rows = medications, columns = calendar days —
  showing on-treatment periods, dose changes and logged exceptions, a
  chronological **regimen changes** list with each change's reason, and the
  **exceptions** recorded against those medications. On desktop these may be
  laid out side by side; on mobile they stack.
- **FR-016a** The **slot grid** (rows = medications, columns = the five fixed
  time-of-day slots, cells = the per-slot dose, with an as-needed block) is the
  layout of the **shareable sheet** (FR-019). It is the artefact a school or
  respite carer receives, and it MUST NOT be dropped in favour of the treatment
  timeline, which does not answer "what do I give, and when". It needs no
  separate in-app screen — the generated sheet is its preview.
- **FR-016b** The treatment timeline MUST NOT assert that a dose was **taken**.
  rettX records what was *prescribed* and what the caregiver *reported as an
  exception*; it has no knowledge of administration. A day with no logged
  exception means "on treatment, nothing reported" — not "taken as prescribed".
  Legend and cell wording MUST reflect this. This matters most precisely where
  the surface is most useful: a sheet shared with a clinician that appears to
  show verified adherence is a clinical claim rettX cannot support, and Principle
  IV and the not-a-medical-device stance both forbid it.
- **FR-016c** The timeline MUST offer a **range selector** (e.g. 1 / 3 / 6
  months). Longer ranges MUST stay legible — a per-day column across six months
  approaches the limit of what can be rendered meaningfully, so the rendering
  MUST degrade gracefully (e.g. aggregating to weeks) rather than emitting
  unreadable slivers.
- **FR-017** Both the treatment timeline and the slot grid MUST be **semantically
  accessible** (ARIA grid roles, keyboard traversal, ≥4.5:1 text contrast, no
  colour-only meaning — every colour-coded state also carries text or a shape)
  and MUST NOT require horizontal scrolling on a narrow Android screen.
- **FR-018** Adding, changing, stopping and restarting a medication MUST be
  possible from the medication surface, and the UI MUST make **"change from this
  date"** (new version) distinct from **"fix a mistake"** (correction).
- **FR-019** The client MUST produce a **one-page A4 PDF medication sheet**
  entirely **on-device**, from a single layout implementation used on every
  surface, containing: the as-of date, the latest known weight and height with
  their measurement dates, all rows and doses, a separate **as-needed** block,
  a blank notes area, and a non-clinical provenance footer — with no app chrome.
  It MUST work with no network connection.
- **FR-019a** The client MUST offer the generated sheet to the **OS share sheet**
  on native (so the caregiver chooses the recipient, including the system print
  service), and MUST open it for print/save on desktop. rettX MUST NOT upload,
  store or transmit the file.
- **FR-019b** The sheet MUST be offered "as of" a caregiver-chosen date,
  defaulting to today, so an earlier regimen can be reproduced for an appointment.
- **FR-019c** The generated filename MUST NOT contain the patient's name; the
  name belongs inside the document. Filenames surface in cloud backups, chat
  previews and notification banners.
- **FR-019d** The share action's label MUST NOT name a single recipient type.
  The sheet is equally for schools, respite carers and clinicians, and a label
  such as "share with clinician" both narrows it and implies a send capability
  rettX does not have — the artefact is generated on-device and handed to the
  OS share sheet or opened for print. Whatever the label, the behaviour on both
  surfaces MUST be the same single on-device artefact (D6).
- **FR-020** The client MUST allow logging a **missed / extra / changed /
  rescue** dose against a medication; these render on the existing Pulse calendar
  and timeline.
- **FR-021** The client MUST retire `medication` from the loggable metric list
  while continuing to render historical medication entries (existing retired-
  definition fallback path).
- **FR-021a** The client MUST remove or repurpose the **"Doses" tile** in the
  Pulse calendar's month-totals row. Once medication is no longer logged daily
  that tile counts nothing, and leaving it in place tells caregivers the old
  model still applies.
- **FR-021b** The medication surface MUST carry a short, plain-language
  explanation of the new model for as long as the pilot cohort includes
  caregivers who logged medication daily — to the effect that medication is no
  longer logged each day, the timeline fills itself from each medication's start
  and end dates, and an entry is only logged when something differs from the
  plan. This is the single most important piece of copy in the feature: every
  pilot caregiver has a daily habit to unlearn.
- **FR-022** The client MUST add **weight** and **height** logging and their
  history views.
- **FR-023** The **Insights** view MUST render **medication exposure
  bands / change markers** on its existing charts and a **before/after
  comparison panel** around each start/stop, computed **client-side**, each
  panel labelled as descriptive and non-clinical. The comparison window is
  **28 days either side** — whole weeks, so weekday effects cancel — and the
  panel MUST state the window and carry wording to the effect of "a pattern,
  not a medical conclusion".
- **FR-023a** The **before/after comparison** MUST also be available on the
  medication surface itself, alongside the medication whose start or change it
  describes, on both mobile and desktop — this is where a caregiver asks the
  question. Consequence for rettxweb: the pure comparison computation currently
  lives under `features/pulse-desktop/insights/`; it MUST be moved to a shared
  location rather than duplicated, since mobile has no access to the desktop
  feature area.
- **FR-024** All new caregiver-visible copy MUST be internationalised across all
  supported locales, including the five slot labels; doses MUST respect locale
  decimal separators. Screen and section titles are a **localisation** matter,
  not a fixed English string: translators MUST be briefed that this surface is a
  record the caregiver keeps for their own child, so a wording that reads as a
  clinician-issued prescription should be avoided where the language offers a
  neutral alternative. The same applies to the sheet's title, which is read by
  schools and respite carers.

### rettxadmin: no code change

Retiring the `medication` definition is performed through the **existing**
metric-catalog administration UI delivered by spec 036 — an operational action,
not new code. The admin per-patient Pulse summary (spec 039) needs no change: it
aggregates by `metric_code`, so `medication` simply stops accruing new entries
while historical counts remain. An admin view of regimens and a regimen CSV in
the PowerBI snapshot are **Phase 2**, and are specified there. rettxadmin is
therefore **not** in this spec's fanout.

## Key Entities

- **MedicationRegimenRow** *(net-new)* — one medication for one patient over one
  validity interval. `medication_id` (stable across versions), `version`, `name`,
  `as_needed`, `doses` (slot → dose), `instructions`, `valid_from` (required),
  `valid_to` (optional), `is_current`, `superseded_by`, provenance. Append-only.
- **SlotDose** *(net-new)* — `amount`, optional `amount_max`, `unit` code.
- **TimeOfDaySlot** *(net-new, fixed vocabulary)* — `morning` · `midday` ·
  `afternoon` · `evening` · `other`. Codes stored, labels translated.
- **MedicationException** *(net-new, expressed as an existing `TrackerEntry`)* —
  a dated `medication-exception` entry referencing `medication_id` + `version`.
- **Value primitive `quantity`** *(net-new; extends the program-level
  vocabulary)* — decimal `amount` + `unit`.
- **Document `type` discriminator** *(net-new, on an existing container)* —
  `tracker_entry` | `medication_regimen`, persisted on every document in
  `pulse_entries`. Absent on all pre-existing documents, so reads must coalesce
  to `tracker_entry`.
- **`weight` metric definition** *(net-new seed preset)* — `quantity` in `kg`.
- **`height` metric definition** *(net-new seed preset)* — `quantity` in `cm`.
- **`medication` metric definition** *(existing — retired by this spec)*.
- **Patient / Consent / Access** *(reused, canonical)* — unchanged.

## Two views, three surfaces

One regimen model, rendered two ways for two different questions (D11).

| View | Question it answers | Where |
| --- | --- | --- |
| **Treatment timeline** — rows = medications, columns = calendar days | *What has actually been happening?* on-treatment periods, dose changes, logged exceptions | In the app, mobile and desktop |
| **Slot grid** — rows = medications, columns = the five time-of-day slots | *What do I give, and when?* | The shareable sheet |

| Surface | Rendering |
| --- | --- |
| **Mobile (native Android)** | A full-screen route pushed from within Pulse, with its own back header: the current medication list, the treatment timeline, and per-medication detail with its version history and logged exceptions. No horizontal scroll. |
| **Desktop** | A tab in the Pulse desktop shell (≥1024px): the treatment timeline with a range selector, the current-treatment and no-longer-taken lists, the chronological regimen-changes list, and the exceptions list — laid out side by side. Must not displace the existing default landing tab. |
| **Sheet (A4 PDF)** | One page, no chrome, generated on-device. Header: patient, as-of date, latest weight and height with their dates. Body: the **slot grid** including empty cells (the paper sheet's structure), then a separate **as-needed** block, then a blank notes area for school staff. Footer: generated-on date, who keeps it, and "recorded by a caregiver in rettX; not a medical record and not medical advice". |

The sheet is the artefact caregivers hand to schools and respite carers. It is
**caregiver-controlled output about their own child** — it deliberately contains
the medication names that analytics exports must never carry (FR-014) — and rettX
never uploads, stores or transmits it: the caregiver chooses the recipient
through the OS share sheet.

## Insights

Medication moves from being *a thing you count* to *a period you compare across*.

1. **Change markers & exposure bands.** Each `valid_from` / `valid_to` renders as
   a marker and each validity interval as a shaded band over the existing
   time-axis charts (seizures per week, sleep, bathroom, side effects).
2. **Before/after comparison.** Around each start or stop: the same descriptive
   measure computed for the N days before and the N days after (default 30),
   shown side by side.
3. **Framing is non-negotiable.** Every panel is **descriptive co-occurrence, not
   causation**, carries the medical-claims disclaimer already used in spec 044,
   and renders only when there is enough data either side. rettX MUST NOT rank,
   score, conclude, or recommend.

The regimen also finally supplies the **expected-dose denominator** that spec 044
lacked — which is what makes a true adherence percentage possible. That is
deliberately **Phase 2**: adherence is a judgement about a caregiver's behaviour
and needs care in framing before it is built.

## Migration & rollout

There is no data migration. There is an **ordering requirement**:

1. Ship the `quantity` primitive + `weight`, `height` and
   `medication-exception` presets (additive, harmless).
2. Ship the regimen resource + client grid + print.
3. Tell caregivers, and let them enter their current sheet.
4. **Only then** retire the `medication` definition, per environment, via the
   admin catalog — so nobody loses medication logging before the replacement
   exists.
5. Historical medication entries stay exactly where they are, for as long as the
   caregiver keeps them.

Retiring first would leave pilot caregivers with no way to record medication at
all. This ordering is a requirement, not a preference.

## Success Criteria *(mandatory)*

- **SC-001** A caregiver can enter a complete medication sheet (5+ medications
  with per-slot doses and start dates) and see it as a grid, in one sitting,
  without re-entering anything daily.
- **SC-002** "What was this patient taking on <any past date>?" is answerable
  from a single as-of read, and returns the doses that were in effect that day.
- **SC-003** Changing a dose preserves the previous dose and its date range; no
  historical version is mutated.
- **SC-004** The medication sheet generates as **one A4 page** carrying the
  **slot grid**, with the as-of date, latest weight and height, legible without
  explanation — on desktop and on native Android, **with networking disabled**,
  and reaches the OS share sheet.
- **SC-005** A missed dose logged against a medication appears on the Pulse
  calendar and timeline for that date.
- **SC-006** After retirement, no caregiver can log a new `medication` Pulse
  entry, and **every** pre-existing medication entry still renders on calendar,
  day view, timeline and metric history.
- **SC-007** Weight and height are loggable and chartable over time, and the
  latest weight surfaces on the medication sheet header with its date.
- **SC-008** The Insights view shows exposure bands and a before/after comparison
  around a medication start, computed client-side with no new backend endpoint,
  each panel carrying the non-clinical disclaimer.
- **SC-009** No medication name or free-text instruction appears in any admin
  aggregate or analytics export.
- **SC-010** A pilot caregiver who has not been told where medication lives can
  find the grid from the Pulse area unprompted, on a 360px-wide screen, in their
  own language.
- **SC-011** No surface — in-app or on the shared sheet — states or implies that
  a dose was administered. A day with no logged exception reads as "on
  treatment, nothing reported", never as "taken as prescribed".

## Phased delivery

### Phase 1 — MVP

Ordered slices; each is independently shippable, and the ordering is the rollout
requirement above.

| # | Slice | Repos | Size |
| --- | --- | --- | --- |
| 1.1 | `type` discriminator + query retrofit in `pulse_entries` (**must precede any regimen write**) | api | S |
| 1.2 | `quantity` primitive + `weight` / `height` presets + `medication-exception` preset | api, web | M |
| 1.3 | Regimen model, effective-dated versioning, repository, co-located storage | api | L |
| 1.4 | Regimen endpoints (as-of, history, CRUD) + gates + audit + tests | api | M |
| 1.5 | Medication route inside Pulse (full-screen + entry point), data source, **list + treatment timeline**, edit/stop/restart | web | L |
| 1.6 | **Medication sheet** — on-device A4 PDF (the slot grid) + OS share sheet | web | M |
| 1.7 | Exception logging against a regimen row | web | M |
| 1.8 | Retire the `medication` definition (operational, per environment) | api/ops | S |
| 1.9 | Insights: exposure bands + before/after panel | web | L |

**Pilot-usable after 1.6.** 1.7-1.9 complete the MVP as agreed.

### Phase 2

- **Adherence percentage** — now computable, because the regimen supplies the
  expected-dose denominator spec 044 lacked. Needs careful, non-judgemental
  framing before build.
- **Regimen in the PowerBI snapshot** — a `MedicationRegimen.csv` keyed on the
  hashed patient id and the **opaque `medication_id`** (never the name), plus an
  admin regimen panel.
- **Coded drug dictionary** (ATC / SNOMED CT) with strength and form, replacing
  free-text names — the prerequisite for any cross-patient medication analysis
  and for Principle IV's standardised-terminology requirement.
- **Prescriber / prescription provenance**, repeat-prescription dates.
- **Medication reminders** (would use the existing push channel).
- **Server-side insight aggregation** — only if client-side assembly proves too
  heavy over long ranges.
- **Sharing the sheet beyond the device** — a server-generated PDF delivered as a
  **short-lived authenticated download link** (reusing the existing SAS or
  tokenised-URL patterns), never as an email attachment containing a child's
  medication list. Needs two net-new capabilities in rettxapi: PDF rendering (no
  PDF library exists today) and, for the notification, the Message Center email
  path. Requires a documented lawful basis under Principle II before build.

## Risks

- **R1 — Cosmos container budget (RESOLVED for this spec — zero containers
  added).** `rettxdb` is provisioned with **database-level (shared) throughput**
  and holds **23 containers** against Azure's hard **25-container** limit.
  Confirmed empirically in the portal: **no container has its own `Scale` node**,
  so every one of them inherits the database offer.
    - ⚠️ **The `offer_throughput=400` in most repositories is inert.**
    `create_container_if_not_exists` only applies throughput (and indexing policy)
    at **CREATE** time; for a container that already exists the argument is
    silently ignored. In this environment **every container was created manually
    in the portal**, so the repository create call has always been a no-op: the
    code asserts "dedicated" while the database is entirely shared. Do not
    infer throughput mode from the source — check the portal. (ADR 0013's
    "rettxdb is already at ~24 containers" was correct.)
    - **This spec adds none.** Both regimen documents (D9) and exceptions (D2) live
    in `pulse_entries`, so the count stays at 23 and the recurring cost is €0.
    That is the whole reason both decisions were made that way.
    - **If a container were ever needed**, cheapest first: reclaim `audit_logs` and
    `principals` (free); ask Azure support to raise the 25-container limit (free,
    and worth doing regardless); dedicated throughput only as a last resort
    (~€9/month on autoscale with max 1000 RU/s, or ~€23–25/month manual at 400
    RU/s — that is ~€300/year for one feature, which is not proportionate for a
    nonprofit).
    - **The structural point:** rettX is \~2 containers from a hard wall on its main
    database, and every future feature pays this tax. ADR 0013 already moved
    admin data to a separate database for exactly this reason. The durable fix is
    **fewer containers with type discriminators**, not more containers — a
    follow-up ADR on rettxdb's container strategy is needed independently of this
    spec.
- **R1a — Query contamination from co-location (HIGH — blocking, and the price
  of D9).** `pulse_entries` has **no type discriminator today**, and its queries
  exclude foreign documents only by the accident that regimen rows lack
  `entry_date` and `measurements`. Two queries have no `WHERE` clause at all and
  would swallow regimen documents immediately:
    - `patient_has_any_entry` — `SELECT TOP 1 c.id FROM c`. A patient with a
    regimen but no tracker entries would wrongly report "has entries", corrupting
    empty-state, onboarding and gating logic.
    - `project_entries_for_summary` — the **PowerBI** daily-activity projection.
    Regimen documents would surface as phantom entry rows with a null date. This
    one also carries a **PHI edge**: regimen documents hold a free-text
    medication **name**, and that projection exists precisely to keep free text
    out of the extract.
  **Mitigation (must land in the same PR as, or before, the first regimen
  write):** add `type` to `TrackerEntry` and the regimen models, filter every
  read with `(c.type ?? 'tracker_entry') = 'tracker_entry'` — the coalesce is
  mandatory because existing documents predate the field — fix the two unsafe
  queries, defensively fix the other five, and add a guard test asserting no read
  path returns a non-`tracker_entry` document. All runtime reads funnel through
  `PulseTrackerEntryRepository`, so the blast radius is one file; any future code
  that bypasses the repository with an ad-hoc Cosmos client must apply the filter
  too. Effort S–M.
    - ⚠️ **Do NOT reclaim slots by deleting `careprofile_*` or `survey*`.** Both
    features are fully wired (v2 + admin routers; careprofile additionally has an
    **unauthenticated share-link** path), and every repository lazily calls
    `create_container_if_not_exists` on first use with no eager startup init. So
    deleting them destroys live pilot data **and** the container silently
    reappears the moment any request — including an anonymous share-link click —
    touches that feature. A permanent decommission requires unregistering the
    routers and removing the services, i.e. a code change.
    - ✅ **Dead containers, confirmed against code** (no live reader or writer, so
    they will not reappear):
        - `audit_logs`, `careprofile_audit`, `identity_lock_audit` — the three legacy
      audit sinks consolidated into `audit_events` by **Feature 022**, which
      deleted their repositories and removed their config keys. Identity-lock
      auditing is **still happening** (lock, re-lock, release and rejected
      attempts all call `AuditServices.log_identity_event` → `audit_events`);
      only the container is historical. `identity_lock_audit` has been
      **verified complete** — all 16 legacy rows hash to the 16 deterministic ids
      present in `audit_events`, with no natively-written rows in that domain —
      so it is safe to delete. ⚠️ For the other two, confirm the same before
      deleting. The util is idempotent (deterministic ids + `upsert_item`), so a
      dry run per source is non-destructive: require `Skipped == 0` and match the
      ids, not just the counts. It silently skips rows with a missing
      `patient_id` or an unparseable timestamp, so a partial migration is
      possible and would otherwise be invisible. Note `audit_logs` splits into
      the `email` and `file_processing` domains, which also carry live native
      events, so only an id-level check is meaningful there.
        - `master_data` — the reference-data container (countries, regions, genders,
      relationships). Superseded on both sides: rettxweb stopped calling
      `/master-data/*` in commit `ae35390` ("Refactor metadata to local assets",
      Mar 2025) in favour of `assets/i18n/masterdata/*.json` and i18n keys, and
      rettxapi has no remaining reader — genders and relationships are now
      enum-driven in code. ⚠️ Delete the **container** only; its config keys sit
      in the Key Vault `REQUIRED_SECRET_NAMES` set, so removing the secrets is a
      separate change that must be sequenced with the loaders.
        - `principals` — the pre-`principals_v2` remnant.
        - ✔ Already reclaimed: `identity_lock_audit` (migration verified complete —
      all 16 rows accounted for) and `master_data`.
    Note that absence from the PowerBI snapshot job proves nothing about a
    container's liveness; each of the above rests on a code-path check instead.
- **R2 — Sheet generation quality (MEDIUM — decided, validate with pilots).**
  The delivery route is settled (D6): one on-device PDF layout, shared by the
  caregiver. The residual risk is **fidelity, not mechanism** — hand-laid PDF
  tables can break on long medication names, many rows, or wide translations, and
  the one-page A4 bar is a real constraint. **Mitigation:** build the layout
  against the worst real case (≈15 rows, longest locale), define the overflow
  behaviour explicitly (shrink type to a floor, then allow a second page rather
  than truncate — never drop a medication), and put it in front of pilot
  caregivers early. Two small dependencies are added: `@capacitor/share` and
  `jspdf-autotable` (`jspdf` is already present but unused). Deliberately NOT
  used: a CSS print stylesheet as a second layout, `window.print()` in the
  WebView, and any server-side rendering.
- **R3 — Provisioning is manual, so container settings in code are advisory
  (MEDIUM — no longer specific to this spec).** Every container in `rettxdb` was
  **created by hand in the portal**, and `create_container_if_not_exists` applies
  partition key, throughput and indexing policy **only on create**. So for every
  existing container the repository's declared settings are inert, and the *real*
  configuration is whatever was clicked — including the **default
  index-everything policy**, which costs write RUs and storage on high-volume
  containers. This is why `utils/apply_pulse_entries_indexing_policy.py` exists.
    - **Consequence for this spec:** none directly, now that D9 adds no container.
    `pulse_entries` already exists with its default policy, and the as-of read is
    a single-partition fetch over tens of rows resolved in application code, so
    **no composite index and no policy change are required**. The pre-existing
    indexing gap on `pulse_entries` is unchanged by co-location — neither
    improved nor worsened.
    - **Standing lesson for any future container:** whoever creates it owns its
    partition key, throughput mode and indexing policy *at that moment*, because
    the code cannot correct it afterwards. A wrong partition key is unrecoverable
    without a data migration.
- **R4 — Retirement is not a code change (MEDIUM).** Flipping `is_retired` in the
  seed presets is a **no-op** wherever the catalog is already bootstrapped.
  Slice 1.7 is an explicit, per-environment operational task with a verification
  step, or it will silently not happen.
- **R5 — PHI in free text (MEDIUM).** Medication names and instructions are free
  text and therefore potential PHI. They belong on the caregiver's own printed
  sheet and nowhere near an analytics export. FR-014 is the guardrail; the
  Phase 2 CSV is where it will be tested.
- **R6 — i18n surface (LOW, wide).** Slot labels, exception vocabulary, weight,
  height and the whole medication section need keys in **all 19 locales**;
  missing keys are a release blocker in rettxweb. D10 avoids one class of these
  (no `NAV.*` key, since there is no new top-level entry).
- **R7 — Caregiver re-entry effort (LOW, one-off).** D4 means every pilot
  caregiver types their sheet once. Mitigate with a clear, warm explanation of
  why — and note it is the *last* time they type it, versus daily today.
- **R8 — Discoverability of the medication entry point (MEDIUM, new).** D10(b)
  puts the grid behind an entry point inside an existing Pulse view rather than
  a peer tab, which is the price of not overflowing the tab strip. A caregiver
  who cannot find it will conclude the feature does not exist. Mitigated by
  requiring an above-the-fold row on the landing view plus a reinforcing card in
  Metrics (FR-015a/b) rather than a single link, and by SC-010, which makes
  finding it unprompted an explicit success criterion. Residual risk: the
  above-the-fold calculation is derived from stylesheets rather than a rendered
  screen, so it must be confirmed on a real 360×640 device before pilot.

## Constitution Check

- **Principle I — Patients & caregivers first (NON-NEGOTIABLE)**: this is the
  clearest burden reduction Pulse has shipped — daily re-entry of a standing
  fact is replaced by entering it once, and the output is an artefact caregivers
  already need (the school sheet). The one-off re-entry cost (R7) is honestly
  disclosed and is repaid within days.
- **Principle II — Privacy by design (NON-NEGOTIABLE)**: same per-patient
  storage, same server-enforced access, same consent posture, hard delete
  retained. Data minimisation holds: the regimen replaces an unbounded stream of
  daily entries with a small number of rows. FR-014 keeps free-text drug names
  out of every aggregate and export, and exception events reference an **opaque
  id**, not a name.
- **Principle III — Transparency (NON-NEGOTIABLE)**: authored in the open;
  supersession of the 035 medication preset is explicit and recorded in an ADR;
  the printed sheet states plainly what it is and is not.
- **Principle IV — Clinical accuracy and accountability**: no dose validation, no
  interaction checking, no adherence judgement, no causal claims — insights are
  descriptive co-occurrence with an explicit disclaimer. Provenance and version
  history are preserved by construction (D5). Free-text drug names are a known
  gap against the standardised-terminology requirement; the coded dictionary is
  named as Phase 2 rather than quietly skipped, and is the prerequisite for any
  cross-patient medication analysis.
- **Principle V — Accessibility & inclusion**: the grid is the accessibility risk
  in this spec (density vs WCAG 2.2 AA). FR-017 makes semantic grid roles,
  keyboard traversal, contrast and the mobile card collapse requirements, not
  aspirations; all copy is internationalised across 19 locales.
- **Principle VI — Security baseline**: reuses the existing server-enforced
  Pulse gates, audit events with identifiers only, and etag concurrency.
- **Principle VIII — Sustainability**: reuses proven patterns (versioned
  documents, the Pulse data-source abstraction, the existing viz stack for
  exceptions) instead of new machinery; adds exactly one container, and settles
  the long-standing container-budget question (R1) rather than inheriting it.
- No NON-NEGOTIABLE principle is weakened.

## Assumptions

- Regimen shares Pulse eligibility (`pulse_enabled` + confirmed diagnosis); it is
  not a separately gated product.
- Pilot scale is small (a handful of patients), so single-partition reads and
  client-side insight assembly are comfortably sufficient.
- Caregivers know their medication names and doses well enough to enter them —
  they already maintain the paper sheet this replaces.
- The five slots cover the overwhelming majority of real schedules, with `other`
  plus free-text instructions absorbing the rest.

## Out of scope

- Dose safety checking, interaction warnings, maximum-dose validation — rettX is
  **not a medical device**.
- Prescription import, pharmacy integration, e-prescribing.
- Cross-patient medication analytics (blocked on the Phase 2 coded dictionary).
- Medication reminders / notifications.
- Backend-generated PDF and email delivery of the sheet (and therefore the
  `templates` repo) — deferred to Phase 2 as a short-lived authenticated link.
- Any change to the other Pulse metrics.

## Open decisions

- **O1 — How the sheet leaves the app (R2) — RESOLVED: the caregiver shares it.**
  One on-device PDF layout used on every surface, handed to the OS share sheet on
  native and opened for print/save on desktop (D6, FR-019…FR-019c). rettX
  uploads, stores and transmits nothing; the caregiver picks the recipient, which
  is their data ownership under Principle I. It also works offline. **To validate
  with pilot caregivers:** whether the sheet is genuinely the artefact they hand
  over — legibility, the as-needed block, the notes area, and whether one A4 page
  holds a real regimen in the longest locales.
    - **Rejected for the MVP — rettX emails an attachment.** Two net-new
    capabilities (no PDF library exists in rettxapi; SendGrid sends HTML bodies
    only), and it would make rettX the party sending special-category data into a
    mailbox where it persists indefinitely. Needs a documented lawful basis and a
    privacy review under Principle II.
    - **Deferred to Phase 2 — rettX emails a short-lived authenticated *link*.** If
    server-side delivery is ever wanted, this is the shape: the notification
    travels by email, the data does not. Reuses either SAS blob links
    (`generate_sas_token`, already used for patient files and compliance
    documents) or the revocable tokenised-URL pattern behind careprofile share
    links.
- **O2 — Container budget (R1) — CLOSED at zero cost.** `rettxdb` is on shared
  throughput with **23 of 25** slots used, and the `offer_throughput=400` in the
  repositories never applied because every container was created manually. D9
  resolves this by adding **no container at all**: regimen documents and
  exceptions both live in `pulse_entries` behind a `type` discriminator. The
  price is the query retrofit in slice 1.1 (R1a), not money. Separately,
  `rettxdb`'s container strategy deserves its own ADR — that is a follow-up, not
  this spec.
- **O3 — Correction vs clinical change in the UI.** FR-018 requires the
  distinction; the exact wording and interaction need design review, because
  getting it wrong silently corrupts history. The hi-fi prototype shows a single
  edit affordance on the medication detail screen, so this is still unresolved
  in design.
- **O5 — Named slots versus clock times in the schedule.** D3 fixes five
  translatable slots; the hi-fi prototype offers a mixed chip row (Morning ·
  08:00 · Midday · 20:00 · Bedtime) producing "Twice daily · 08:00, 20:00".
  Clock times are closer to how doses are prescribed, but the printable sheet
  needs slot columns and cross-patient comparability depends on them. Likely
  resolution: store the slot as the canonical field (so the sheet and any future
  comparison keep working) and allow an optional exact time alongside it for
  display. Needs a decision before FR-002 is implemented, because it changes
  `SlotDose`.

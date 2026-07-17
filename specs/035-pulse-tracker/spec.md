<!--
  Frontmatter below is machine-read by .github/workflows/spec-fanout.yml when
  this spec is merged into main. The `fanout` array drives which downstream
  repos get a `[spec/<slug>] <title>` issue with the `squad` label. Fanout only
  runs when `status:` is `ready` or `accepted` — while this is `draft` nothing
  fans out, so it is safe to review and iterate. Flip `status: ready` (the single
  switch) when the spec is agreed and you want the squad issues opened on merge.

  Allowed fanout repos: rettxweb, rettxadmin, rettxapi, rettxmutation, rettxid, templates.

  STACK & DELIVERY PRE-FLIGHT (patterns.md §7): the fanout targets were checked
  against patterns.md §1. rettxapi = Python 3.11 + FastAPI + Azure Functions v4 +
  Cosmos DB + Blob Storage; it owns the canonical API contract (/v2 conventions).
  rettxweb = Angular 18+ standalone PWA wrapped with Capacitor as a native Android
  app (iOS planned) — treat as a native mobile surface. rettxadmin = Angular 18+
  standalone SPA on Microsoft Entra ID (MSAL). No NEW delivery mechanism is
  introduced: this spec GENERALIZES the existing (never-launched) Pulse feature
  IN PLACE from an episode-centric log into a longitudinal, structured-measurement
  tracker, keeping the Pulse name. The v1 MVP is TEXT/STRUCTURED-DATA ONLY and does
  NOT depend on push, FCM, or the media/SAS/blob-quota paths — media attachments and
  PDF export are Phase 2 (see Phased Delivery / Out of Scope), so no `templates`
  fanout slice is required for the MVP.
-->
---
spec_id: "035"
slug: "pulse-tracker"
title: "rettX Pulse"
status: ready   # draft | ready | accepted | superseded
authored: "2026-07-15"
author: "perocha"
source_issue: "rett-europe/rettx#9 (Pulse — generalized in place; supersedes)"
relates_to: "issue rett-europe/rettx#9 (superseded-by 035); rettxweb specs/018-rettx-pulse/ (superseded-by 035); rettxapi spec 031 (Pulse backend)"
fanout:
  - repo: rettxapi
    summary: |
      Backend + OWNER of the Pulse API contract (/v2 conventions). GENERALIZE the
      existing (never-launched) Pulse backend IN PLACE — spec 031, merged PRs
      #278/#279/#282/#284/#285/#288/#289 — from an episodic media log into a
      **longitudinal, structured-measurement tracker**, keeping the Pulse name.
      Pulse never launched, has no users and no data, so there is ZERO migration or
      backward-compat risk: converge the existing models/routers in place rather than
      standing up a parallel module. The seizure "episode" becomes ONE seed preset.

      Do:
      (1) **Value-primitive metric model.** Introduce a `MetricDefinition` entity
      whose measurements compose from a small library of **value primitives**:
      `occurrence` (boolean/happened), `count` (quantity), `scale` (severity —
      a **numeric 1–5** rating; the UI MAY render labels/faces),
      `category` (**single-select** from a defined option set — e.g. bathroom type,
      stool consistency, menstrual flow, side-effect type),
      `duration`, `dose` (amount + unit — the **actual dose given** in v1; the
      prescribed-dose baseline and server-computed **deviation flag** move to
      **Phase 2**, fed by a caregiver-owned medications list), a labelled
      **short-text** value (e.g. medication name), and `note` (free text, always
      available). Reuse Pulse's category-CODE vs translated-LABEL split (issue #9
      FR-007/FR-008) so the catalog is extensible **without breaking stored records**;
      definitions are versioned and editing one MUST NOT rewrite historical entries.
      (2) **Structured entries.** Replace the episodic `PulseEpisode` shape with
      `TrackerEntry` — an entry on a **date** (+ optional time + free-text notes)
      carrying one or more typed `Measurement` values keyed by `metric_definition`.
      (3) **Seed presets.** Ship a starter catalog composed from the primitives:
      **medication** (medication-name short-text + **dose given** amount/unit + note;
      **NO prescribed baseline or deviation in v1** — that is Phase 2), **bathroom**
      (one **per-event** entry, not a daily counter: `category` type Stool/Urine +
      `category` stool consistency Hard/Normal/Loose + note; multiple/day),
      **menstrual cycle** (a **start/end span**: `category` cycle-event
      Started/Ended from which the API derives period-duration & cycle-length, +
      optional `category` flow Light/Normal/Heavy), **seizure** (composite:
      occurrence + duration + severity 1–5 + trigger text), and
      **generic side-effect** (severity 1–5 + frequency). Caregivers may also create
      **custom** metrics from the same primitives. The Rett Forum REFINES/EXTENDS the
      catalog **post-MVP** by composing the same primitives — this is not an MVP
      blocker.
      (4) **In-app-visualization data endpoints only (v1).** Provide the read
      endpoints that back the calendar, reverse-chron timeline, and per-metric history
      views. **NO PDF export endpoint in v1** (Phase 2).
      (5) **REUSE the existing Pulse substrate as-is:** caregiver↔patient access
      gating + verified-diagnosis eligibility; privacy-by-default + granular /
      versioned / withdrawable research consent + excluded-from-research-by-default;
      hard-delete + minimal audit; per-patient storage. Media/SAS/byte-quota machinery
      (PR #288) stays dormant for the text-only MVP and is reused in Phase 2 for media
      attachments.
  - repo: rettxweb
    summary: |
      Caregiver app (Capacitor native Android; iOS planned). Build the generalized
      Pulse client on top of the existing Pulse **domain / mapper layer**
      (`src/app/core/domain/pulse/`) and its access/consent/eligibility gating — reuse
      and generalize IN PLACE, don't rebuild or rename the product.

      Do:
      (1) **Calendar-based quick-log.** Make a **calendar** the primary surface: pick a
      day, quick-log a typed metric value in a few taps, with a personal `notes` field
      per entry (plus optional time).
      (2) **Metric-definition-driven entry forms.** Render inputs dynamically from the
      value primitives (`occurrence` / `count` / `scale` (1–5 faces) / `category`
      (single-select) / `duration` / `dose` / `short-text` / `note`) so
      new/custom/Forum-defined metrics appear without a frontend release.
      Reuse the Pulse code→translated-label mapper pattern for metric labels.
      (3) **In-app visualization (v1).** A **month calendar** whose day cells carry
      small **colour-dot metric markers** (one dot per metric that day, below the
      date number) with an always-on metric legend; a reverse-chronological
      **timeline** (filter chips **wrap** — no horizontal scroll); and a simple
      **per-metric history view**. Severity is entered via a **1–5 faces** control
      (a visual skin over the numeric scale); logging happens in a **bottom-sheet**.
      **Text/structured-data only — NO photo/video, NO PDF, and NO dose-deviation
      flag in v1** (all Phase 2).
      (4) **Navbar integration** (existing Pulse navbar entry) and full i18n of all
      caregiver-visible copy. CONSUME the rettxapi Pulse contract — do not invent
      endpoint shapes.
      (5) **Android-first craft & a11y.** Follow the agreed interaction design (see
      "UX & Interaction Design" in the spec): WCAG 2.2 AA contrast (body text
      ≥4.5:1 — no muted grey below that, placeholders included), a legible minimum
      type scale, destructive actions coloured distinctly from the brand pink, and a
      `prefers-reduced-motion` alternative for every animation. The reviewed
      prototype is the visual reference.
  - repo: rettxadmin
    summary: |
      Admin dashboard (Angular + MSAL). rettxadmin currently has **no Pulse code** —
      this is net-new, and it is a **Phase 2** deliverable (scheduled AFTER the MVP).
      Provide a **metric-definition catalog management** surface so the Rett Forum can
      **curate and extend** the metric catalog post-MVP: create / edit / version /
      translate `MetricDefinition` records (code, per-locale labels, composed value
      primitives, type-config) that the caregiver app renders. Enforce that edits are
      non-destructive to existing caregiver entries (versioning, never in-place
      mutation of historical data). **Not required for the MVP** — caregiver-created
      custom metrics (rettxweb) cover metric creation for Phase 1; this admin surface
      is the Forum-curation path that follows. CONSUME the rettxapi Pulse contract; no
      research/data-export surface here.
---

# Feature Specification: rettX Pulse

**Spec ID**: `035-pulse-tracker` · **Status**: Ready · **Created**: 2026-07-15
**Product name**: **Pulse** (rettX Pulse — Personal Tracker)
**Source / supersedes**: [rett-europe/rettx#9](https://github.com/rett-europe/rettx/issues/9) (Pulse — generalized in place, **superseded-by 035**), rettxweb `specs/018-rettx-pulse/` (**superseded-by 035**), rettxapi spec 031 (Pulse backend)
**Owner**: rettX control plane (this repo) — authored and coordinated here; scoped work is fanned out to the affected repos via the `spec-fanout` workflow on merge.
**Input**: The mobile app needs Pulse to grow from an episode logger into a **generic personal tracker** — flexible, caregiver-owned logging of metrics (medication, side effects, menstrual cycle, bathroom frequency, seizures, …) on a **calendar**, with quantitative **dose tracking** and simple **in-app visualization** for reviewing history. Pulse was scaffolded but **never launched**, so we can generalize it **in place** with no migration risk.

## Overview

**Pulse** is a **generic personal tracker** for the caregiver mobile app: a caregiver picks a metric they care about, logs a value against a date on a calendar, adds a personal note, and reviews their history in-app (a reverse-chronological timeline and a per-metric history view). Instead of a fixed questionnaire or a single "episode" shape, every metric **composes from a small library of value primitives**, so the catalog can grow — via caregiver-created custom metrics now, and Rett Forum curation later — **without an app release and without breaking previously recorded data**.

### This GENERALIZES the never-launched Pulse feature — in place, no rename, no migration risk

**Pulse never launched.** It has **no users, no data, never reached pilot** — it is dead code. That means there is **ZERO migration and ZERO backward-compatibility risk**. The decision is to **converge in place**: generalize the existing episode-centric Pulse model (rettxweb `specs/018-rettx-pulse/` + rettxapi spec 031) into a `MetricDefinition` + `TrackerEntry`/`Measurement` model, keeping the **Pulse** product name. The old seizure "episode" becomes **one seed preset** among several. There is **no parallel or duplicate module** and **no product rename** — "Tracker" was considered and rejected as too technical.

Accordingly, this spec **supersedes** rettxweb `specs/018-rettx-pulse/` and control-plane issue [rett-europe/rettx#9](https://github.com/rett-europe/rettx/issues/9).

### What the existing Pulse substrate already gives us (reused in place)

- **Access & eligibility gating** — caregiver↔patient access + verified-diagnosis eligibility (available only to existing RettX users with a verified patient profile and a RettX-confirmed Rett Syndrome diagnosis). No new registration/linking.
- **Category-CODE vs translated-LABEL split** (Pulse FR-007/FR-008) — codes stored separately from translated labels, evolvable **without breaking existing records**. This is exactly what makes the metric catalog extensible.
- **Privacy & consent** — privacy-by-default, granular / versioned / withdrawable research consent, excluded-from-research-by-default.
- **Review & filtering** — reverse-chronological list with date-range / category / keyword filters (kept and extended for the timeline/history views).
- **Optional structured-fields pattern**, **per-patient storage**, **/v2 API conventions**, **navbar integration**, **hard-delete + minimal audit**, and the **rettxweb domain/mapper layer** (`src/app/core/domain/pulse/`).
- **Media / SAS / per-patient byte-quota machinery** (PR #288) — dormant in the text-only v1, **reused in Phase 2** for media attachments.

### Value primitives — the compositional core (net-new)

Every metric is composed from a small, fixed library of **value primitives**; every entry also carries a **date**, an **optional time**, and **notes**:

- **occurrence** — boolean "it happened".
- **count / quantity** — a number (e.g. entries in a range).
- **scale / severity** — an ordinal rating on a **numeric 1–5 scale** (finer-grained so side-effect and severity trends are trackable over time; the UI MAY render descriptive labels or a **1–5 faces** control over the values).
- **category** *(net-new)* — a **single-select** value from a metric-defined option set (e.g. bathroom **type** Stool/Urine, stool **consistency** Hard/Normal/Loose, menstrual **flow** Light/Normal/Heavy, side-effect **type**). Codes stored separately from translated labels, like every other catalog code.
- **duration** — how long something lasted.
- **dose** — amount + unit; in v1 this records the **actual dose given** only. The **prescribed-dose baseline** and the **server-computed deviation flag** are **Phase 2**, fed by a caregiver-owned medications list (see Phased Delivery).
- **short text** *(net-new, minor)* — an optional labelled free-text value used by presets that name a thing (e.g. the **medication name**), distinct from the always-on entry `note`; in Phase 2 the medication name becomes a reference into the caregiver's own medications list.
- **note** — free text, always available on every entry.

### Seed presets (ship in the MVP)

Pulse ships with a starter catalog composed from those primitives; caregivers can also create **custom** metrics from the same primitives:

| Seed preset | Composed from | Notes |
|---|---|---|
| **Medication** | short-text (medication name) + dose (amount + unit, **actual given**) + note | v1 has **no prescribed baseline / deviation** — that is Phase 2 via a caregiver-owned med list |
| **Bathroom** | `category` type (Stool/Urine) + `category` consistency (Hard/Normal/Loose, stool only) + note | **One entry per event** (timestamped), **not** a daily count; multiple per day supported |
| **Menstrual cycle** | `category` cycle-event (Started/Ended) + optional `category` flow (Light/Normal/Heavy) + note | A **start/end span**; the app derives period-duration & cycle-length from paired events |
| **Seizure** *(the former "episode")* | composite: occurrence + duration + severity (1–5) + trigger (note) | Unchanged |
| **Generic side-effect** | severity (1–5) + frequency (count) | Optionally a `category` side-effect type |

The **Rett Forum refines/extends** this catalog **post-MVP** by composing the same primitives. Because catalog growth is additive over code/label-versioned definitions, it never breaks existing records — so **Forum input is not an MVP blocker**; the MVP ships with primitives + seed presets and the Forum curates later.

On merge (once `status: ready`), `spec-fanout` opens one scoped `[spec/pulse-tracker]` issue titled **`[spec/pulse-tracker] rettX Pulse`** (label `squad`) in each affected repo, carrying that repo's brief from the `fanout:` frontmatter above:

| Surface | Repo | Role |
|---|---|---|
| **Backend + contract owner** | `rettxapi` | Generalize the Pulse backend in place: primitive-typed `MetricDefinition` (incl. `category` single-select) + `TrackerEntry`/`Measurement` + `DoseRecord` (actual-only in v1) + seed presets; in-app-viz data endpoints; reuse access/consent/audit |
| **Caregiver native app** | `rettxweb` | Calendar quick-log (colour-dot markers, bottom-sheet, 1–5 faces) + definition-driven forms + in-app timeline/per-metric history; text-only; reuse the Pulse domain layer + navbar |
| **Admin dashboard** | `rettxadmin` | Metric-definition catalog management (Forum curation) — net-new; **Phase 2** (after the MVP); no Pulse code there today |

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Caregiver logs a daily metric from the calendar (Priority: P1)

As a caregiver of a patient with a confirmed Rett Syndrome diagnosis, I open Pulse from the app navbar, tap today on the calendar, and quick-log a value for a metric I track (e.g. a *bathroom* event — stool, loose — or a *seizure* with a duration, severity and trigger note), in a few taps and under a minute.

**Independent test**: from an eligible caregiver account, open the calendar, select a date, choose a metric, enter typed value(s), add a note, save → the entry persists against that patient + date, appears on the calendar day (as a metric colour-dot) and in the timeline, and is visible only to caregivers with access to that patient.

### User Story 2 — Caregiver tracks a new-drug debut: medication + side effects (Priority: P1)

As a caregiver whose patient is starting a new drug, I use the **Medication** preset to log **which medication** (name) and the **dose given** each day, plus a note. I also track a **side-effect** metric with quantified severity (1–5) and frequency, not just "yes/no". *(In v1 there is no prescribed-dose baseline to compare against — Rett caregivers often have no structured prescription on file; the **actual-vs-prescribed deviation** flag arrives in **Phase 2**, once a caregiver-owned medications list with an optional usual dose exists.)*

**Independent test**: log a medication entry with a name and a dose-given value → both are stored as structured, queryable values; record a side-effect with a severity (1–5) and a frequency → both are stored as structured values (not free text). No prescribed-baseline or deviation flag is expected in v1.

### User Story 3 — Caregiver reviews history in-app before a doctor visit (Priority: P1)

As a caregiver preparing for a consultation, I open Pulse and review a patient's recent history in-app — a reverse-chronological timeline and a per-metric history view — filtered by date range and metric.

**Independent test**: with entries spanning several weeks, open the timeline → entries render newest-first; open a per-metric history view for one metric → only that metric's values render across the selected date range. (PDF export is Phase 2 and not required for this test.)

### User Story 4 — A new/custom metric appears without breaking old records (Priority: P1)

As a caregiver (or, post-MVP, a Rett Forum curator via admin), I create a new metric composed from the value primitives, or edit an existing one; it becomes loggable immediately, and **no previously recorded entry is invalidated or rewritten**.

**Independent test**: create a new `MetricDefinition` from primitives → it appears as a loggable metric with the correct typed inputs and localized label, without a frontend release; edit/version an existing definition → historical entries recorded under the prior version still render correctly and are not mutated.

### Edge Cases

- **Ineligible caregiver** (no verified patient profile, or diagnosis not RettX-confirmed) MUST NOT be able to open or write to Pulse — server-enforced, not just UI-gated.
- **Retired/edited metric definition** — historical entries that reference it MUST still render (fall back to the stored code/label + version snapshot); no orphaned/crashing entries.
- **Definition version skew** — an entry recorded under definition v1 MUST NOT be re-interpreted under v2's config (e.g. a rescaled `scale` or changed options).
- **Medication with no prescribed baseline (the v1 norm)** — a medication entry records name + dose given with **no deviation logic**; nothing is flagged. (Phase 2 deviation MUST degrade gracefully when a usual dose is absent.)
- **Multiple bathroom events in one day** — each is its own timestamped entry; the calendar/day view MUST show them all, not collapse them into a single count.
- **Menstrual span without an end (or without a start)** — an open "Started" with no matching "Ended" MUST render as an in-progress span; a stray "Ended" MUST NOT crash the duration/cycle derivation.
- **Timezone / date boundaries** — a "day" on the calendar is unambiguous per patient; an entry logged near midnight lands on the intended calendar day.
- **Not a medical device** — Pulse MUST NOT present interpretations, alerts, or diagnostic conclusions; it records and displays caregiver-entered data only.

## Requirements *(mandatory)*

### Functional Requirements — Backend (rettxapi)

- **FR-001** Pulse access MUST be server-enforced to eligible caregivers only: existing RettX user, verified patient profile, and a RettX-confirmed Rett Syndrome diagnosis. Reuse the existing Pulse access/eligibility gating.
- **FR-002** The system MUST provide a **`MetricDefinition`** entity whose measurements compose from the **value primitives** `occurrence`, `count`, `scale`, `category` (single-select), `duration`, `dose`, `note`, and an optional labelled `short-text` value (e.g. medication name), with a `code`, translatable `label(s)` (code stored separately from translated label), and primitive-specific config (unit, min/max, scale points, **category option sets**, etc.).
- **FR-003** Metric definitions MUST be **versioned**; editing or retiring a definition MUST NOT mutate or invalidate previously recorded entries.
- **FR-004** The system MUST provide a **`TrackerEntry`** on a `date` (+ optional `time`) for a `patient`, carrying one or more typed **`Measurement`** values keyed by metric definition, plus an always-available free-text `notes` field.
- **FR-005** The `dose` primitive (**`DoseRecord`**) MUST capture the **actual dose given** (amount + unit). In v1 there is **no prescribed baseline and no deviation flag**; the **Medication** preset also carries a **medication-name** short-text value. The prescribed-dose baseline and the server-computed **deviation flag** are **Phase 2** (fed by a caregiver-owned medications list with an optional usual dose).
- **FR-005a** The **Bathroom** preset MUST record **one entry per event** (timestamped), supporting **multiple entries per day**, with a `category` **type** (Stool/Urine) and, for stool, a `category` **consistency** (Hard/Normal/Loose). It MUST NOT be modelled as a per-day counter.
- **FR-005b** The **Menstrual cycle** preset MUST be modelled as a **start/end span**: a `category` cycle-event (Started/Ended) plus an optional `category` flow (Light/Normal/Heavy); the backend MUST derive **period duration** and **cycle length** from paired Started/Ended events (an open span with no Ended is valid).
- **FR-006** Side effects MUST be recordable as **quantified** structured values (severity and/or frequency), not booleans alone.
- **FR-007** The system MUST ship the **seed presets** — **medication** (name + dose given; no v1 deviation), **bathroom** (per-event type + stool consistency), **menstrual cycle** (start/end span + optional flow), **seizure** (composite), **generic side-effect** (severity 1–5 + frequency) — composed from the primitives, and MUST allow **caregiver-created custom metrics** from the same primitives.
- **FR-008** The system MUST expose **in-app-visualization data endpoints** backing the calendar, reverse-chron timeline, and per-metric history views. **No PDF-export endpoint in v1** (Phase 2).
- **FR-009** Pulse MUST reuse the existing **privacy-by-default + granular/versioned/withdrawable research consent**, with tracked data **excluded from research datasets and registry analytics by default**.
- **FR-010** Pulse MUST reuse the existing **hard-delete + minimal audit** and **per-patient storage**; deletion is permanent and clearly communicated. Endpoints follow rettxapi **/v2 conventions**; rettxapi owns the contract.

### Functional Requirements — Caregiver client (rettxweb)

- **FR-011** Pulse MUST be reachable from the **mobile-app navbar** and available only to eligible caregivers (UI gating over the server enforcement of FR-001).
- **FR-012** The primary surface MUST be a **calendar with quick event logging**: select a day, log typed metric value(s) in a few taps, with an **optional time** and a **personal notes field per entry**.
- **FR-013** Entry inputs MUST be **rendered dynamically from the value primitives** of the selected `MetricDefinition` so new/custom/Forum-defined metrics appear **without a frontend release**; metric labels use the Pulse code→translated-label mapper pattern.
- **FR-014** The client MUST provide **in-app visualization**: a **month calendar** whose day cells carry **colour-dot metric markers** (below the date number) with an always-on legend; a reverse-chronological **timeline** (metric filter chips **wrap** — no horizontal scroll); and a simple **per-metric history view**, with **date-range / metric / keyword filtering** (reused/extended from the Pulse timeline). Severity is entered via a **1–5 faces** control and logging occurs in a **bottom-sheet**. (No dose-deviation flag in v1 — Phase 2.)
- **FR-015** The v1 client MUST be **text/structured-data only** — **no photo/video capture and no PDF export** (both Phase 2).
- **FR-016** All caregiver-visible copy MUST be **internationalized** per patterns.md §5; the client MUST build on the existing Pulse **domain/mapper layer**.
- **FR-016a** The caregiver client MUST meet the agreed **Android-first craft bar** (see "UX & Interaction Design"): WCAG 2.2 AA contrast (body text ≥4.5:1; no muted grey below that; placeholders included), a legible minimum type scale, destructive actions coloured distinctly from the brand pink, and a `prefers-reduced-motion` alternative for every animation.

### Functional Requirements — Admin (rettxadmin)

- **FR-017** rettxadmin MUST provide a **metric-definition catalog management** surface to create / edit / **version** / translate `MetricDefinition` records (code, per-locale labels, composed primitives, config), so the **Rett Forum can curate and extend** the catalog — this is net-new (no Pulse code exists in rettxadmin) and is a **Phase 2** deliverable (after the MVP). Caregiver-created custom metrics (FR-013) cover metric creation for the MVP.
- **FR-018** Admin edits MUST be **non-destructive** to existing caregiver entries (versioning; never in-place mutation of historical data), enforced server-side.

## UX & Interaction Design (rettxweb — Android-first)

These decisions come from an interactive Android prototype reviewed and signed off with the product owner; the prototype is the visual reference for the rettxweb slice. They are **requirements on the caregiver client**, not on the API.

- **Calendar day markers = colour dots.** Each day cell shows up to a few small **colour dots below the date number** (one per metric logged that day) with an **always-on metric legend**. Dots (not count badges) so markers never collide with the date numerals.
- **Severity = 1–5 faces.** The `scale` primitive is entered through a **five-face sentiment control** — a visual skin over the stored **numeric 1–5** value (no data-model change; fully compatible with FR-002).
- **Logging = bottom-sheet.** All quick-log and edit flows open in a **bottom-sheet**, not a full-screen route.
- **Timeline filter chips wrap.** The metric filter row **wraps onto multiple lines** rather than scrolling horizontally.
- **Metric-specific forms.** Medication = **name + dose given** (no prescribed field in v1); bathroom = **type**, then **consistency** for stool, logged **per event**; menstrual = **Started/Ended** with optional **flow**. All forms render from the metric's primitives (FR-013).
- **Accessibility & craft bar (WCAG 2.2 AA).** Body text contrast **≥4.5:1** (no muted grey below that; placeholders included); a legible **minimum type scale**; **destructive** actions coloured distinctly from the brand pink; every animation has a **`prefers-reduced-motion`** alternative.

## Key Entities *(include if feature involves data)*

- **MetricDefinition** *(net-new)* — a metric composed from value primitives: `code`, translatable `label(s)`, composed primitives (`occurrence`|`count`|`scale`|`category`|`duration`|`dose`|`note`|`short-text`), primitive-config (incl. **category option sets**), `version`. Code/label split and versioning inherited from the Pulse category pattern.
- **Value primitive** *(net-new)* — one of `occurrence`, `count`, `scale`, `category` (single-select), `duration`, `dose`, `note`, plus an optional labelled `short-text`; the building blocks every metric (seed or custom) is composed from.
- **TrackerEntry** *(generalizes Pulse `PulseEpisode`)* — a dated (+ optional time) record for a patient holding one or more `Measurement` values + an always-available free-text `notes`. Bathroom entries are **per-event** (multiple per day); menstrual Started/Ended entries form **spans** the API derives cycle metrics from.
- **Measurement** *(net-new)* — a single typed primitive value for one `MetricDefinition` within an entry.
- **DoseRecord** *(net-new; the `dose` primitive)* — `actual_dose` (amount + unit) in v1. `prescribed_dose` and computed `deviation_flag` are **Phase 2** (sourced from the caregiver-owned medications list). The **Medication** preset also stores a `medication_name` (short-text; a med-list reference in Phase 2).
- **Patient** *(reused — canonical, patterns.md §2)* — opaque `patient_id`; entries are per-patient.
- **Consent** *(reused from Pulse)* — versioned, granular, withdrawable research consent; excluded-from-research by default.
- **Access / eligibility** *(reused from Pulse)* — caregiver↔patient access + verified-diagnosis gate.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001** An eligible caregiver can log a typed metric value with a note from the calendar in **under one minute**.
- **SC-002** A new metric composed from the value primitives becomes loggable in the caregiver app **without a frontend release** and with the correct typed inputs + localized label.
- **SC-003** A **medication** entry stores a medication **name** + **dose given** as structured values, and **side effects** are stored as **quantified** values (severity 1–5 / frequency), not booleans. *(Dose actual-vs-prescribed deviation flagging is validated in Phase 2.)*
- **SC-004** A caregiver can review a patient's history **in-app** via the timeline and per-metric history views, filtered by date range and metric.
- **SC-005** Editing or retiring a metric definition **never mutates or invalidates** previously recorded entries; historical entries still render correctly under their original version.
- **SC-006** Ineligible caregivers are **blocked server-side** from reading or writing Pulse data.
- **SC-007** Two bathroom events logged on the same day are stored and displayed as **two separate entries** (not merged into a count); a Started/Ended menstrual pair yields a **derived period duration**.

## Phased Delivery

### Phase 1 (MVP)

- Value-primitive metric model (**incl. the `category` single-select primitive**) + **seed presets** + caregiver-created custom metrics.
- **Calendar quick-log** (date + optional time + notes) with **colour-dot day markers** + legend; **bottom-sheet** logging; **1–5 faces** severity control.
- **In-app visualization**: reverse-chronological **timeline** (wrapping filter chips) + simple **per-metric history view**, with date-range / metric / keyword filtering.
- **Medication** = name + dose given (no deviation); **bathroom** = per-event type + consistency; **menstrual** = start/end span (+ derived duration/cycle); quantified side effects (severity 1–5 / frequency).
- **Android-first craft bar**: WCAG 2.2 AA contrast, legible type scale, distinct destructive colour, reduced-motion support.
- **Text / structured-data only** — no media, no PDF, **no dose deviation**.

### Phase 2

- **Medication actual-vs-prescribed deviation** — a **caregiver-owned medications list** (name + optional usual/prescribed dose) that turns each dose-given entry into a comparison with a **server-computed deviation flag**.
- **PDF export** (print-friendly, time-range filtered) for doctor consultations.
- **Media attachments** (photo/video) — reuse the existing Pulse **SAS / quota** machinery (PR #288).
- **Richer charts / trends** over tracked metrics.
- **Forum-curated catalog expansion** — the **rettxadmin metric-definition catalog-management surface** (net-new) through which the Rett Forum curates/extends metrics composed from the primitives.

## Cross-Team Coordination *(mandatory for this feature)*

### Program-level cross-cutting decisions

1. **rettxapi owns the Pulse contract** (/v2). rettxweb and rettxadmin consume it; neither invents endpoint shapes (patterns.md §3).
2. **The value primitives are a program-level vocabulary** (`occurrence`|`count`|`scale`|`category`|`duration`|`dose`|`note`|`short-text`); all surfaces render/validate against the same set (incl. **category option sets**) so metrics behave identically everywhere.
3. **Code-vs-label + versioning is the compatibility contract** — the same discipline Pulse used for categories (codes stored separately from translated labels, evolvable without breaking records) is what makes the catalog safely extensible by custom metrics now and Forum curation later.
4. **Converge in place** — because Pulse is dead code with no data, generalize the existing models/routers/domain layer in place, keep the Pulse name, and mark rettxweb spec-018 and issue #9 superseded-by 035. No parallel stack.

### Sequencing

- **rettxapi first** — it defines/owns the contract, the primitive-typed metric model + entries + dose, the seed presets, and the in-app-viz data endpoints.
- **rettxweb second** — calendar quick-log + definition-driven forms + in-app timeline/history, on the reused Pulse domain layer.
- **rettxadmin (Phase 2)** — the metric-definition catalog management surface for Forum curation, delivered after the MVP.

## Assumptions

- Pulse is confirmed **dead** (never launched, no users, no data, never piloted), so there is **no migration/backward-compat obligation** anywhere in the ecosystem; generalization happens **in place**.
- The rettxapi Pulse backend (spec 031; PRs #278/#279/#282/#284/#285/#288/#289) is largely built and its access/consent/audit machinery is reusable; downstream tracking issues api#268 and admin#43 remain `go:needs-research` but do not block generalization.
- rettxadmin has **no** Pulse code today; the metric-definition catalog is net-new there.
- The MVP ships with **value primitives + seed presets**; the Rett Forum **curates/extends** the catalog **post-MVP** by composing the same primitives — Forum input does **not** gate the MVP.
- rettxweb is treated as a **native mobile surface** (Capacitor Android; iOS planned) per patterns.md §1.

## Out of Scope (v1)

- **PDF export** — Phase 2.
- **Media / photo / video capture** (Pulse's SAS + per-patient byte-quota machinery) — Phase 2.
- **Cross-patient analytics / registry dashboards** over tracked data.
- **Research-dataset export** of tracked data (tracked data stays excluded-from-research by default; any research use requires the separate governed consent flow).
- **AI/derived interpretation, alerting, or seizure/dose safety detection** — Pulse records and displays; it does not interpret or advise.
- **Wearable / device integration** and continuous monitoring.

## Constitution Check

- **Principle I — Patients & caregivers first (NON-NEGOTIABLE)**: Pulse is **caregiver-owned documentation**; quick-log + in-app review minimise burden; caregivers can hard-delete their data. No dark patterns; the field set is minimal (primitives + a few presets), not an over-collecting questionnaire.
- **Principle II — Privacy by design (NON-NEGOTIABLE)**: privacy-by-default, excluded-from-research by default, granular/versioned/withdrawable consent (all reused from Pulse); per-patient storage; server-enforced access. Data minimization: metrics are composed deliberately, not collected speculatively.
- **Principle III — Transparency (NON-NEGOTIABLE)**: authored in the open as a cross-cutting spec; supersession of #9 and spec-018 is explicit; deletion is clearly explained.
- **Principle IV — Clinical accuracy**: Pulse is **not a medical device and does not diagnose**; it MUST avoid medical claims and MUST NOT suggest it detects or interprets clinical events. Standardised terminology SHOULD be used where a metric maps to an existing vocabulary.
- **Principle V — Accessibility & i18n**: calendar and forms target WCAG 2.2 AA; all caregiver-visible copy is internationalized (patterns.md §5).
- **Principle VI — Security baseline**: authorization enforced server-side on every Pulse endpoint; audit for create/update/delete; no PII in logs.
- No NON-NEGOTIABLE principle is weakened by this spec.

## Open Decisions *(all RESOLVED — no blocking open items)*

- **D1 — User-facing name — RESOLVED.** Product name is **Pulse** ("Tracker" rejected as too technical). Slug `pulse-tracker`, title *rettX Pulse* (descriptive subtitle *Personal Tracker* permitted).
- **D2 — MVP metric set — RESOLVED.** MVP ships with **value primitives + seed presets** + caregiver custom metrics; the **Rett Forum curates/extends post-MVP**. Forum input is **not** an MVP blocker. Catalog stays extensible without breaking records via the code/label + versioning pattern.
- **D3 — Repurpose vs add-alongside — RESOLVED.** **Converge in place**: generalize the existing Pulse models/routers/domain layer, keep the Pulse name, seizure "episode" becomes one seed preset, and mark rettxweb spec-018 + issue #9 **superseded-by 035**. No parallel module.
- **D4 — Visualization / export — RESOLVED.** MVP = **basic in-app visualization** (calendar quick-log + reverse-chron timeline + per-metric history). **PDF export → Phase 2.**
- **M1 — Severity scale — RESOLVED.** Severity uses a **numeric 1–5 scale** (finer-grained for trend tracking; the UI may render labels).
- **M2 — Seed-preset list — RESOLVED.** The **five seed presets are confirmed** (compositions later refined by M4–M6): medication (name + dose given; deviation is Phase 2), bathroom (per-event type + stool consistency), menstrual cycle (start/end span + optional flow), seizure (composite), generic side-effect (severity 1–5 + frequency). Custom metrics cover the rest.
- **M3 — Admin catalog phasing — RESOLVED.** The **rettxadmin metric-definition catalog-management surface is Phase 2**; caregiver-created custom metrics cover the MVP.
- **M4 — Menstrual model — RESOLVED.** Menstrual is a **start/end span** (Started/Ended cycle-events + optional flow), from which the app derives period-duration and cycle-length — **not** a daily "Ongoing" phase. Rationale: catamenial-seizure correlation needs the actual days; daily ticks measure nothing.
- **M5 — Bathroom model — RESOLVED.** Bathroom is **one timestamped entry per event** (multiple per day) with a **type** (Stool/Urine) and stool **consistency** (Hard/Normal/Loose) — **not** a per-day counter. Adds the **`category` single-select primitive** to the library.
- **M6 — Medication baseline — RESOLVED.** MVP logs **medication name + dose given** with **no prescription baseline** (none exists on file today). The **actual-vs-prescribed deviation** moves to **Phase 2**, sourced from a caregiver-owned medications list with an optional usual dose.
- **D5 — Android UX design — RESOLVED.** Interaction design signed off from a reviewed prototype: **colour-dot** calendar markers, **1–5 faces** severity control, **bottom-sheet** logging, **wrapping** timeline filter chips, and a **WCAG 2.2 AA** craft bar (see "UX & Interaction Design").

**Non-blocking note**: the Rett Forum will **curate and extend the metric catalog over time** (composing the same value primitives). This is expected, additive, and does not gate delivery — the code/label + versioning pattern guarantees new/edited definitions never break previously recorded entries.

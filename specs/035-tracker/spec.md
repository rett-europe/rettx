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
  introduced: Tracker is a longitudinal, calendar-based, quantitative extension of
  the existing (never-launched) Pulse substrate. Tracker MVP does NOT depend on the
  push, FCM, or media/SAS/blob-quota paths — media capture is out of scope for v1
  (see Out of Scope), so no `templates` fanout slice is required for the MVP.
-->
---
spec_id: "035"
slug: "tracker"
title: "rettX Tracker"
status: draft   # draft | ready | accepted | superseded
authored: "2026-07-15"
author: "perocha"
source_issue: "rett-europe/rettx#NNN (new Tracker intake — TBD; repurposes Pulse)"
relates_to: "issue rett-europe/rettx#9 (Pulse — repurposed); rettxweb specs/018-rettx-pulse/; rettxapi spec 031 (Pulse backend)"
fanout:
  - repo: rettxapi
    summary: |
      Backend + OWNER of the Tracker API contract (/v2 conventions). GENERALIZE the
      existing (never-launched) Pulse backend — spec 031, merged PRs #278/#279/#282/
      #284/#285/#288/#289 — from an episodic media log into a **longitudinal,
      structured-measurement tracker**. Pulse never launched, has no users and no
      data, so there is ZERO migration or backward-compat risk: you have a free hand
      to rename/repurpose the Pulse models and routers rather than adding a parallel
      stack (see Open Decision D3).

      Do:
      (1) **Metric-definition schema engine.** Introduce a `MetricDefinition` entity:
      a caregiver- or Forum-defined metric with a code, a translatable label
      (reuse Pulse's category-CODE vs translated-LABEL split — FR-007/FR-008 of
      issue #9 — so definitions evolve without breaking stored records), a data
      **type** (`numeric` | `boolean` | `scale` | `dose` | `enum`), and type-specific
      config (unit, min/max, scale points, enum options). Definitions are versioned;
      editing a definition MUST NOT rewrite or invalidate historical entries.
      (2) **Structured measurement entries.** Replace the episodic `PulseEpisode`
      shape with `TrackerEntry` — an entry on a **date** carrying one or more typed
      `Measurement` values keyed by `metric_definition` + a per-entry free-text
      `notes` field. Entries are structured measurements, not free-text episodes.
      (3) **Dose tracking.** A `DoseRecord` measurement type captures **actual dose
      given vs prescribed dose** (compute a deviation flag server-side), plus
      concomitant medications & dosages, and quantified side effects with
      severity/frequency (not just yes/no booleans).
      (4) **PDF-export data endpoint.** Expose a time-range-filtered, print-ready
      aggregation endpoint (e.g. `GET /v2/tracker/export?from=&to=`) that returns the
      data a doctor-consultation PDF is rendered from. (Rendering location — client
      vs backend — is Open Decision D4; if backend, this repo owns the renderer.)
      (5) **REUSE the Pulse substrate as-is:** caregiver↔patient access gating +
      verified-diagnosis eligibility; privacy-by-default + granular / versioned /
      withdrawable research consent + excluded-from-research-by-default; hard-delete
      + minimal audit; per-patient storage. Do NOT re-derive these — extend them.
      Media/SAS/byte-quota machinery (PR #288) is largely irrelevant to Tracker MVP;
      leave it dormant behind the media out-of-scope decision.
  - repo: rettxweb
    summary: |
      Caregiver app (Capacitor native Android; iOS planned). Build the Tracker client
      on top of the existing Pulse **domain / mapper layer** (`src/app/core/domain/
      pulse/`) and its access/consent/eligibility gating — reuse, don't rebuild.

      Do:
      (1) **Calendar-based UI with quick event logging.** Replace Pulse's
      reverse-chronological media timeline with a **calendar** as the primary
      surface: pick a day, quick-log a metric value in a few taps, with a personal
      `notes` field per entry. Keep date-range / metric / keyword filtering from the
      Pulse timeline as a secondary list/review view.
      (2) **Metric-definition-driven forms.** Render entry inputs dynamically from the
      backend `MetricDefinition` type (numeric / boolean / scale / dose / enum) so new
      Forum-defined fields appear without a frontend release. Reuse the Pulse
      category-code→translated-label mapper pattern for metric labels.
      (3) **Dose-debut logging.** A guided flow for a new-drug debut: prescribed vs
      actual dose (visually flag deviation), concomitant meds, and quantified side
      effects with severity/frequency.
      (4) **PDF export.** A caregiver-initiated export of a time-range (e.g. "last 6
      months") to a clean, **print-friendly PDF** for doctor consultations
      (client-side vs backend generation is Open Decision D4).
      (5) **Navbar integration** (mobile-app navbar entry, as Pulse had) and full i18n
      of all caregiver-visible copy. CONSUME the rettxapi Tracker contract — do not
      invent endpoint shapes.
  - repo: rettxadmin
    summary: |
      Admin dashboard (Angular + MSAL). rettxadmin currently has **no Pulse code** —
      this is net-new. Provide a **metric-definition catalog management** surface so
      the Rett Forum's field definitions can be administered centrally: create / edit
      / version / translate `MetricDefinition` records (code, label per locale, type,
      type-config) that the caregiver app then renders. Enforce that edits are
      non-destructive to existing caregiver entries (versioning, never in-place
      mutation of historical data). Smallest slice; MAY follow the rettxapi /
      rettxweb slices. CONSUME the rettxapi Tracker contract; no research/data-export
      surface here (that stays out of scope for v1).
---

# Feature Specification: rettX Tracker

**Spec ID**: `035-tracker` · **Status**: Draft · **Created**: 2026-07-15
**Source issue**: new Tracker intake (TBD) · **Relates to**: [rett-europe/rettx#9](https://github.com/rett-europe/rettx/issues/9) (Pulse — repurposed), rettxweb `specs/018-rettx-pulse/`, rettxapi spec 031 (Pulse backend)
**Owner**: rettX control plane (this repo) — authored and coordinated here; scoped work is fanned out to the affected repos via the `spec-fanout` workflow on merge.
**Input**: The mobile app needs a generic **Tracker** — flexible, caregiver-owned logging of user-defined metrics (medication, side effects, menstrual cycle, bathroom frequency, seizures, …) on a calendar, with quantitative dose tracking and a print-friendly PDF export for doctor consultations. We already have a dead, never-launched feature — **Pulse** — whose scaffolding covers roughly half of this. Tracker repurposes it.

## Overview

Tracker is a **generic longitudinal tracker** for the caregiver mobile app: a caregiver picks a metric they care about, logs a value against a date on a calendar, adds a personal note, and — when it is time for a medical appointment — exports a clean, time-range-filtered PDF to bring to the doctor. Unlike a fixed questionnaire, the **set of metrics is defined by data, not hard-coded**, so the Rett Forum can introduce meaningful fields over time without an app release and without breaking previously recorded data.

### This repurposes the dead Pulse module — no migration risk

**Pulse never launched.** It has **no users, no data, never reached pilot** — it is dead code. That means there is **ZERO migration and ZERO backward-compatibility risk**, and a completely free hand: the team is happy to repurpose Pulse (including reusing the *Pulse* name if desired — see Open Decision D1) into Tracker rather than build a second parallel stack. Where Pulse already built something Tracker needs, Tracker **extends it**; where Pulse's shape is wrong for a longitudinal quantitative tracker, Tracker **replaces it** freely.

### What Pulse already built that Tracker reuses (the substrate)

The following Pulse substrate is directly reusable and Tracker MUST build on it rather than re-derive it:

- **Access & eligibility gating** — caregiver↔patient access checks + verified-diagnosis eligibility (available only to existing RettX users with a verified patient profile and a RettX-confirmed Rett Syndrome diagnosis). No new registration/linking.
- **Category-CODE vs translated-LABEL split** (Pulse FR-007/FR-008) — codes stored separately from translated labels, evolvable **without breaking existing records**. This maps *perfectly* onto Tracker's design principle of deferring field definitions to the Rett Forum.
- **Privacy & consent** — privacy-by-default, granular / versioned / withdrawable research consent, excluded-from-research-by-default.
- **Review & filtering** — reverse-chronological list with date-range / category / keyword filters (kept as Tracker's secondary review view alongside the new calendar).
- **Optional structured-fields pattern**, **per-patient storage**, **/v2 API conventions**, **navbar integration**, **hard-delete + minimal audit**, and the **rettxweb domain/mapper layer** (`src/app/core/domain/pulse/`).

### What is net-new (Tracker ≠ Pulse)

Pulse is **episodic + media (video/photo) + qualitative + timeline UI**. Tracker is **longitudinal + quantitative + calendar UI + PDF export + user-DEFINED metrics**. The net-new work is:

1. A **metric-DEFINITION schema engine** — metrics with types `numeric | boolean | scale | dose | enum`, so entries are **structured measurements**, not free-text episodes.
2. A **calendar UI with quick-log**.
3. **Dose tracking** with actual-vs-prescribed **deviation flagging**.
4. **Quantified side effects** + severity/frequency.
5. **PDF export** (print-friendly, time-range filtered).

Pulse's media / SAS / per-patient-byte-quota machinery is **largely irrelevant to the Tracker MVP** and media is treated as optional / out-of-scope for v1 (see Out of Scope).

On merge (once `status: ready`), `spec-fanout` opens one scoped `[spec/tracker]` issue (label `squad`) in each affected repo, carrying that repo's brief from the `fanout:` frontmatter above:

| Surface | Repo | Role |
|---|---|---|
| **Backend + contract owner** | `rettxapi` | Generalize the Pulse backend: metric-definition model + measurement entries + dose records + PDF-export data endpoint; reuse access/consent/audit |
| **Caregiver native app** | `rettxweb` | Calendar UI + quick-log + definition-driven forms + PDF export; reuse the Pulse domain layer + navbar |
| **Admin dashboard** | `rettxadmin` | Metric-definition catalog management (Forum-defined field administration) — net-new; no Pulse code there today |

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Caregiver logs a daily metric from the calendar (Priority: P1)

As a caregiver of a patient with a confirmed Rett Syndrome diagnosis, I open Tracker from the app navbar, tap today on the calendar, and quick-log a value for a metric I track (e.g. *bathroom frequency = 3*, or *seizures = 1* with a personal note), in a few taps and under a minute.

**Independent test**: from an eligible caregiver account, open the calendar, select a date, choose a defined metric, enter a typed value, add a note, save → the entry persists against that patient + date, appears on the calendar day and in the review list, and is visible only to caregivers with access to that patient.

### User Story 2 — Caregiver tracks a new-drug debut with dose deviation + side effects (Priority: P1)

As a caregiver whose patient is starting a new drug, I log the **prescribed** dose and the **actual** dose given each day; when what I gave deviates from what was prescribed, Tracker visibly flags it. I also record concomitant medications and quantify side effects (severity and frequency), not just "yes/no".

**Independent test**: define/select a `dose` metric with a prescribed value; log an actual dose that differs → the entry is stored with a computed deviation flag and the UI shows the deviation; record a side effect with a severity and frequency → both are stored as structured, queryable values (not free text).

### User Story 3 — Caregiver exports a 6-month PDF for a doctor visit (Priority: P1)

As a caregiver preparing for a consultation, I export the last 6 months of tracked data to a clean, print-friendly PDF I can hand to the doctor.

**Independent test**: with entries spanning >6 months, choose a time range ("last 6 months"), export → a print-friendly PDF is produced containing exactly the entries in range, grouped legibly by metric/date, caregiver-initiated, with no research/analytics data leakage.

### User Story 4 — The Forum/admin defines a new metric field without breaking old records (Priority: P1)

As a Rett Forum stakeholder (via an admin), I define a new metric (code, translated labels, type, type-config) or edit an existing one; caregivers can start using it immediately, and **no previously recorded entry is invalidated or rewritten**.

**Independent test**: create a new `MetricDefinition` in the admin catalog → it appears as a loggable metric in the caregiver app with the correct typed input and localized label, without a frontend release; edit/version an existing definition → historical entries recorded under the prior version still render correctly and are not mutated.

### Edge Cases

- **Ineligible caregiver** (no verified patient profile, or diagnosis not RettX-confirmed) MUST NOT be able to open or write to Tracker — server-enforced, not just UI-gated.
- **Deleted or retired metric definition** — historical entries that reference it MUST still render (fall back to stored code/label snapshot); no orphaned/crashing entries.
- **Definition version skew** — an entry recorded under definition v1 MUST NOT be re-interpreted under v2's config (e.g. a rescaled `scale` or changed `enum` options).
- **Empty range export** — exporting a range with no entries produces a valid (empty-state) PDF, not an error.
- **Dose with no prescribed value** — deviation flagging degrades gracefully (no false "deviation" when there is nothing to compare against).
- **Timezone / date boundaries** — a "day" on the calendar is unambiguous per patient; an entry logged near midnight lands on the intended calendar day.
- **Not a medical device** — Tracker MUST NOT present interpretations, alerts, or diagnostic conclusions; it records and reports caregiver-entered data only.

## Requirements *(mandatory)*

### Functional Requirements — Backend (rettxapi)

- **FR-001** Tracker access MUST be server-enforced to eligible caregivers only: existing RettX user, verified patient profile, and a RettX-confirmed Rett Syndrome diagnosis. Reuse the Pulse access/eligibility gating.
- **FR-002** The system MUST provide a **`MetricDefinition`** entity with: `code`, translatable `label(s)` (code stored separately from translated label), `type` ∈ {`numeric`, `boolean`, `scale`, `dose`, `enum`}, and type-specific config (unit, min/max, scale points, enum options).
- **FR-003** Metric definitions MUST be **versioned**; editing or retiring a definition MUST NOT mutate or invalidate previously recorded entries.
- **FR-004** The system MUST provide a **`TrackerEntry`** on a `date` for a `patient`, carrying one or more typed **`Measurement`** values keyed by metric definition, plus an optional per-entry free-text `notes` field.
- **FR-005** The system MUST support a **`DoseRecord`** measurement capturing **actual dose vs prescribed dose**, computing a **deviation flag** server-side, plus concomitant medications & dosages.
- **FR-006** Side effects MUST be recordable as **quantified** structured values (severity and/or frequency), not booleans alone.
- **FR-007** The system MUST expose a **time-range-filtered export data endpoint** (e.g. `GET /v2/tracker/export?from=&to=`) returning the print-ready aggregation for a PDF.
- **FR-008** Tracker MUST reuse Pulse's **privacy-by-default + granular/versioned/withdrawable research consent**, with tracked data **excluded from research datasets and registry analytics by default**.
- **FR-009** Tracker MUST reuse Pulse's **hard-delete + minimal audit** and **per-patient storage**; deletion is permanent and clearly communicated.
- **FR-010** Endpoints MUST follow the rettxapi **/v2 API conventions**; rettxapi owns the Tracker contract and frontends consume it.

### Functional Requirements — Caregiver client (rettxweb)

- **FR-011** Tracker MUST be reachable from the **mobile-app navbar** and available only to eligible caregivers (UI gating over the server enforcement of FR-001).
- **FR-012** The primary surface MUST be a **calendar with quick event logging**: select a day, log a typed metric value in a few taps, with a **personal notes field per entry**.
- **FR-013** Entry inputs MUST be **rendered dynamically from `MetricDefinition.type`** (numeric/boolean/scale/dose/enum) so new Forum-defined metrics appear **without a frontend release**; metric labels use the Pulse code→translated-label mapper pattern.
- **FR-014** A **new-drug-debut flow** MUST let the caregiver record prescribed vs actual dose (with a **visual deviation flag**), concomitant medications, and quantified side effects (severity/frequency).
- **FR-015** The client MUST provide a caregiver-initiated **PDF export** of a chosen **time range** (e.g. "last 6 months") in a **clean, print-friendly format** suitable for doctor consultations.
- **FR-016** The client MUST retain a **review list view** with **date-range / metric / keyword filtering** (reused from the Pulse timeline) alongside the calendar.
- **FR-017** All caregiver-visible copy MUST be **internationalized** per patterns.md §5; the client MUST build on the existing Pulse **domain/mapper layer**.

### Functional Requirements — Admin (rettxadmin)

- **FR-018** rettxadmin MUST provide a **metric-definition catalog management** surface to create / edit / **version** / translate `MetricDefinition` records (code, per-locale labels, type, type-config) — this is net-new (no Pulse code exists in rettxadmin).
- **FR-019** Admin edits MUST be **non-destructive** to existing caregiver entries (versioning; never in-place mutation of historical data), enforced server-side.

## Key Entities *(include if feature involves data)*

- **MetricDefinition** *(net-new)* — a caregiver- or Forum-defined metric: `code`, translatable `label(s)`, `type` (`numeric`|`boolean`|`scale`|`dose`|`enum`), type-config, `version`. Code/label split and versioning inherited from the Pulse category pattern.
- **TrackerEntry** *(generalizes Pulse `PulseEpisode`)* — a dated record for a patient holding one or more `Measurement` values + optional free-text `notes`.
- **Measurement** *(net-new)* — a single typed value for one `MetricDefinition` within an entry.
- **DoseRecord** *(net-new)* — a specialized measurement: `prescribed_dose`, `actual_dose`, computed `deviation_flag`, concomitant medications & dosages, and quantified side effects (severity/frequency).
- **Patient** *(reused — canonical, patterns.md §2)* — opaque `patient_id`; entries are per-patient.
- **Consent** *(reused from Pulse)* — versioned, granular, withdrawable research consent; excluded-from-research by default.
- **Access / eligibility** *(reused from Pulse)* — caregiver↔patient access + verified-diagnosis gate.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001** An eligible caregiver can log a typed metric value with a note from the calendar in **under one minute**.
- **SC-002** A new metric defined in the admin catalog becomes loggable in the caregiver app **without a frontend release** and with the correct typed input + localized label.
- **SC-003** A dose entry whose actual value differs from the prescribed value is **visibly flagged** as a deviation, and side effects are stored as **quantified** values (severity/frequency), not booleans.
- **SC-004** A caregiver can export a chosen time range (e.g. last 6 months) to a **print-friendly PDF** containing exactly the in-range entries, with **no research/analytics data leakage**.
- **SC-005** Editing or retiring a metric definition **never mutates or invalidates** previously recorded entries; historical entries still render correctly under their original version.
- **SC-006** Ineligible caregivers are **blocked server-side** from reading or writing Tracker data.

## Cross-Team Coordination *(mandatory for this feature)*

### Program-level cross-cutting decisions

1. **rettxapi owns the Tracker contract** (/v2). rettxweb and rettxadmin consume it; neither invents endpoint shapes (patterns.md §3).
2. **`MetricDefinition.type` is a program-level vocabulary** (`numeric`|`boolean`|`scale`|`dose`|`enum`); all surfaces render/validate against the same enum so definitions behave identically everywhere.
3. **Code-vs-label + versioning is the compatibility contract** — the same discipline Pulse used for categories (codes stored separately from translated labels, evolvable without breaking records) is what makes deferring the field set to the Rett Forum safe.
4. **Repurpose, don't parallel-build** — because Pulse is dead code with no data, the program's default is to generalize the Pulse models/routers/domain layer in place rather than stand up a second stack (subject to Open Decision D3).

### Sequencing

- **rettxapi first** — it defines/owns the contract and the metric-definition + entry + dose model and the export endpoint.
- **rettxweb second** — calendar UI + definition-driven forms + PDF export, on the reused Pulse domain layer.
- **rettxadmin last** — the metric-definition catalog management surface (may follow the other two).

## Assumptions

- Pulse is confirmed **dead** (never launched, no users, no data, never piloted), so there is **no migration/backward-compat obligation** anywhere in the ecosystem.
- The rettxapi Pulse backend (spec 031; PRs #278/#279/#282/#284/#285/#288/#289) is largely built and its access/consent/audit machinery is reusable; downstream tracking issues api#268 and admin#43 remain `go:needs-research` but do not block repurposing.
- rettxadmin has **no** Pulse code today; the metric-definition catalog is net-new there.
- The **exact MVP metric field set is deferred to the Rett Forum** — the data model must let the Forum define meaningful fields later without breaking records (this is an explicit dependency, see Open Decision D2).
- rettxweb is treated as a **native mobile surface** (Capacitor Android; iOS planned) per patterns.md §1.

## Out of Scope (v1)

- **Media / video / photo capture** (Pulse's SAS + per-patient byte-quota machinery) — dormant for the Tracker MVP; may be reintroduced later.
- **Cross-patient analytics / registry dashboards** over tracked data.
- **Research-dataset export** of tracked data (tracked data stays excluded-from-research by default; any research use requires the separate governed consent flow).
- **AI/derived interpretation, alerting, or seizure/dose safety detection** — Tracker records and reports; it does not interpret or advise.
- **Wearable / device integration** and continuous monitoring.

## Constitution Check

- **Principle I — Patients & caregivers first (NON-NEGOTIABLE)**: Tracker is **caregiver-owned documentation** for medical consultations; quick-log + PDF export minimise burden; caregivers can hard-delete their data. No dark patterns, no unnecessary fields (the field set is deliberately minimal and Forum-defined).
- **Principle II — Privacy by design (NON-NEGOTIABLE)**: privacy-by-default, excluded-from-research by default, granular/versioned/withdrawable consent (all reused from Pulse); per-patient storage; server-enforced access. Data minimization: metrics are defined deliberately, not collected speculatively.
- **Principle III — Transparency (NON-NEGOTIABLE)**: authored in the open as a cross-cutting spec; fan-out and coordination are public; deletion is clearly explained.
- **Principle IV — Clinical accuracy**: Tracker is **not a medical device and does not diagnose**; it MUST avoid medical claims and MUST NOT suggest it detects or interprets clinical events. Standardised terminology SHOULD be used where the Forum's field definitions map to an existing vocabulary.
- **Principle V — Accessibility & i18n**: calendar and forms target WCAG 2.2 AA; all caregiver-visible copy is internationalized (patterns.md §5).
- **Principle VI — Security baseline**: authorization enforced server-side on every Tracker endpoint; audit for create/update/delete/export; no PII in logs.
- No NON-NEGOTIABLE principle is weakened by this spec.

## Open Decisions *(to confirm before flipping status: ready — Pedro's call)*

- **D1 — User-facing NAME.** Keep **"Pulse"**, rename to **"Tracker"**, or **"Pulse Tracker"**? (Pulse never launched, so the name is free to reuse or retire.) This drives navbar copy, i18n keys, route names, and whether spec-018 is renamed.
- **D2 — MVP metric field set is deferred to the Rett Forum (explicit dependency / blocker).** The data model is designed to defer field definitions, but a **minimum viable metric set** for launch is a **Forum decision** and is a prerequisite before this spec can go `ready`. Flagged as a dependency/blocker.
- **D3 — Repurpose vs. add-alongside.** Do we **hard-rename** the existing Pulse code / routes / spec-018 into Tracker, or add Tracker **alongside** and retire Pulse? (Zero data means either is safe; hard-rename is the recommended default to avoid a dead parallel stack.)
- **D4 — PDF generation location.** **Client-side** (in the Capacitor app) vs a **backend rendering service** in rettxapi. Affects which repo owns the renderer and the shape of the export endpoint (data-only vs rendered document).

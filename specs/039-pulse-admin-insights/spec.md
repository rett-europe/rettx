<!--
  Frontmatter below is machine-read by .github/workflows/spec-fanout.yml when
  this spec is merged into main. Fanout only runs when status is `ready` or
  `accepted` — while `draft` nothing fans out, so it is safe to review and
  iterate. Flip `status: ready` when agreed and you want squad issues opened
  on merge.
-->
---
spec_id: "039"
slug: "pulse-admin-insights"
title: "rettX Pulse — Admin patient overview & pilot insights"
status: ready   # draft | ready | accepted | superseded
authored: "2026-07-24"
author: "perocha"
source_issue: "rett-europe/rettx#41"
relates_to: "specs/035-pulse-tracker/"
fanout:
  - repo: rettxapi
    summary: |
      OWNER of the Pulse read/aggregation and snapshot contracts. Two phases;
      Phase 1 ships for the pilot, Phase 2 is a fast-follow.

      PHASE 1 — Admin per-patient Pulse summary (live, cheap).
      Add an admin-authed, patient-scoped read that returns the high-level
      "main numbers" for one patient's Pulse activity, for rettxadmin to render
      on the patient detail page.
      Do:
      (1) New endpoint `GET /admin/patients/{rettxid}/pulse/summary` on the
      admin surface, gated by `require_admin` (admin token; NO caregiver
      patient-access gating, NO `pulse_enabled` gate — admins can view any
      patient's aggregate numbers). Reuse the existing single-partition Pulse
      entry read (`pulse_tracker_entry_repository`) — do not add a new
      container or a fan-out query.
      (2) Response is aggregate-only (counts, dates, metric CODES) — it MUST NOT
      include any free-text (`note` / `short-text`) values, so no PHI is exposed
      to the admin surface. Suggested shape:
        {
          "rettxid": "...",
          "pulse_enabled": true,
          "total_entries": 128,
          "distinct_active_days": 42,
          "first_entry_date": "2026-06-01",
          "last_entry_date": "2026-07-23",
          "days_since_last_activity": 1,
          "entries_last_7_days": 9,
          "entries_last_30_days": 51,
          "per_metric": [
            { "metric_code": "seizure", "entry_count": 30, "last_entry_date": "2026-07-23" },
            ...
          ]
        }
      per_metric sorted by entry_count desc then metric_code; dates ISO; empty
      patient → zeros/nulls with `total_entries: 0` (not a 404). Consider
      reviving the summary shape that was designed-but-trimmed in the spec-035
      viz PR ("summary / me-activity were unwired in PR-TRIM").
      (3) Fire-and-forget admin audit event (identifiers only) on read is
      OPTIONAL — follow whatever the other `/admin/patients/...` reads do.

      PHASE 2 — Pulse in the PowerBI snapshot (batch, reuse; FAST-FOLLOW).
      Extend the existing admin snapshot job `DataExtractor.extract_snapshot()`
      (`app/services/admin/data_extractor_services.py`, triggered by
      `POST /admin/datasnapshots`) to also emit anonymised Pulse CSV(s) into the
      same timestamped blob folder the other CSVs go to, so existing PowerBI
      dashboards gain Pulse insight with NO new infrastructure.
      Do:
      (1) Add at least `PulseDailyActivity.csv` — one row per
      (hashed_patient_id, entry_date, metric_code) with `entry_count`. Small,
      safe, and enough for activity/adherence trends.
      (2) OPTIONAL richer `PulseMeasurements.csv` — one row per measurement:
      hashed_patient_id, entry_date, metric_code, field_key, primitive, and the
      matching typed value (occurrence/count/scale/duration/category-CODE/
      dose amount+unit), plus `definition_version`. EXCLUDE `note_value` and
      `short_text_value` entirely (free text = potential PHI).
      (3) Hash the patient id with the SAME `hash_uuid` + salt approach the
      existing extract uses so Pulse rows join to the other snapshot tables.
      Register the new blob names in the returned `blob_metadata` like the
      existing CSVs.

  - repo: rettxadmin
    summary: |
      CONSUMER (Phase 1 only). Add a read-only "Pulse" panel to the patient
      detail page that calls the new `GET /admin/patients/{rettxid}/pulse/summary`
      and renders the high-level numbers: total entries, active days, first/last
      entry, days-since-last, entries in the last 7 / 30 days, and a per-metric
      breakdown (metric code + count + last date). Admin auth via the existing
      admin token; no rettxid patient-access flow, no caregiver gating. Keep it
      behind a small feature flag if that matches existing admin conventions.
      Follow the existing patient-detail data-source pattern (a typed
      DataSource + provider, like the Pulse catalog work in spec 036) rather
      than calling HTTP inline. Empty/zero state must render cleanly (patient
      with Pulse off or no entries). No charts required for the pilot — numbers
      + a simple per-metric list is enough; PowerBI covers deep visuals.
---

# rettX Pulse — Admin patient overview & pilot insights

## Problem

Pulse is entering pilot. The team running the pilot has **no view into Pulse
activity from rettxadmin** — you cannot currently answer, for a given patient,
"are they logging?", "how much?", "when did they last log?", "which metrics do
they actually use?". That per-patient pulse-check is what pilot operators need
day to day.

Separately, we want **deeper, cross-patient insights** (activity trends,
adherence, metric-mix) for analysis — but the pilot must stay **cost-aware**:
no new analytics infrastructure just for this.

Two capabilities already exist and should be reused rather than rebuilt:

- **rettxapi** already runs an admin-triggered **PowerBI data snapshot**
  (`POST /admin/datasnapshots` → `DataExtractor.extract_snapshot()`) that writes
  anonymised CSVs (hashed ids + salt) to blob storage for PowerBI. It does not
  yet include Pulse.
- **rettxapi** already exposes per-patient Pulse **viz reads** (`/v2/pulse`
  calendar / day / metric-history); a per-patient **`summary`** was designed but
  trimmed ("unwired in PR-TRIM"). The raw entry data and single-partition read
  pattern are in place.

## Goals

1. Give rettxadmin a **per-patient Pulse overview** ("main numbers") for the
   pilot — live, cheap, aggregate-only.
2. Give analysts **Pulse insights** by extending the **existing** PowerBI
   snapshot — no new infrastructure.
3. Keep it **PHI-safe**: aggregate numbers and coded values only; never surface
   or export free-text notes.

## Non-goals

- No new analytics database, warehouse, Synapse, or real-time/streaming
  pipeline.
- No admin ability to read or edit individual caregivers' free-text entries.
- No caregiver-facing changes (the caregiver viz surface from spec 035 is
  unchanged).
- No bespoke charting in rettxadmin for the pilot — PowerBI owns deep visuals.

## Phasing

- **Phase 1 (pilot):** admin per-patient Pulse summary endpoint (rettxapi) +
  patient-detail Pulse panel (rettxadmin). Live, on-demand, negligible cost.
- **Phase 2 (fast-follow):** add anonymised Pulse CSV(s) to the existing
  snapshot job (rettxapi) so PowerBI dashboards gain Pulse insight.

The two phases are independent; Phase 2 can be scheduled after the pilot starts
without blocking Phase 1.

## Phase 1 — Admin per-patient Pulse overview

### API (rettxapi owns)

`GET /admin/patients/{rettxid}/pulse/summary` — `require_admin`, single-partition
read over the patient's Pulse entries. Aggregate-only response (see the rettxapi
fanout block for the field shape). No free text. Empty patient → zeros/nulls,
`total_entries: 0`, HTTP 200 (not 404).

Rationale for reusing the existing single-partition entry read: at pilot scale
this is a handful of patients and a cheap per-partition query — no new container,
no cross-partition scan, no materialised view.

### UI (rettxadmin consumes)

A read-only **Pulse** panel on the patient detail page: total entries, active
days, first/last entry, days-since-last, entries last 7 / 30 days, and a
per-metric breakdown (code + count + last date). Clean empty/zero state for
patients with Pulse off or no entries.

## Phase 2 — Pulse insights via the existing PowerBI snapshot

Extend `DataExtractor.extract_snapshot()` to write anonymised Pulse CSV(s) into
the same timestamped blob folder as the existing tables:

- `PulseDailyActivity.csv` — `hashed_patient_id, entry_date, metric_code,
  entry_count` (per patient-day-metric rollup). Minimal and safe.
- Optional `PulseMeasurements.csv` — one row per measurement with coded/numeric
  values and `definition_version`, **excluding** `note` / `short-text`.

Patient id hashed with the same `hash_uuid` + salt as the existing extract so
Pulse rows join to `Patients.csv` et al. New blob names registered in
`blob_metadata`.

## Cost considerations

- **Phase 1:** on-demand, single-partition Cosmos read per patient view.
  Negligible RU at pilot scale. No always-on component.
- **Phase 2:** piggybacks the admin-triggered snapshot → blob → PowerBI pipeline
  that is already funded and running. Adds only a few CSVs per snapshot run.
- **Explicitly avoided:** new datastore, warehouse, Synapse, streaming, or any
  new always-on service.

## Privacy & PHI guardrails

- The admin summary and all snapshot exports are **aggregate / coded only**.
- **Free-text `note` and `short-text` values are never** returned by the admin
  summary nor written to any snapshot CSV.
- Snapshot Pulse rows use the same hashing/salting as the existing anonymised
  tables. Aligns with the program constitution (no PHI / personal data leaves
  the boundary in analytics exports).

## Acceptance criteria

**Phase 1**
- [ ] `GET /admin/patients/{rettxid}/pulse/summary` returns the documented
  aggregate shape for a patient with entries; correct totals, active-day count,
  first/last dates, 7/30-day windows, and per-metric breakdown.
- [ ] Patient with Pulse disabled or zero entries → HTTP 200 with zeros/nulls,
  not an error.
- [ ] Endpoint is admin-gated (`require_admin`); no caregiver-access path.
- [ ] Response contains no free-text values.
- [ ] rettxadmin patient-detail page shows the Pulse panel with the numbers and
  a clean empty state; wired through a typed DataSource/provider.

**Phase 2**
- [ ] A snapshot run writes `PulseDailyActivity.csv` (and, if built,
  `PulseMeasurements.csv`) to the timestamped blob folder, registered in
  `blob_metadata`.
- [ ] Patient ids are hashed consistently with the other snapshot tables (join
  works in PowerBI).
- [ ] No `note` / `short-text` values appear in any exported CSV.

## Open questions

- Do we want the optional richer `PulseMeasurements.csv` for the pilot, or is
  the daily-activity rollup enough to start? (Recommend: start with the rollup;
  add measurements later if PowerBI needs it.)
- Should the rettxadmin Pulse panel sit behind a feature flag, matching the
  `pulseCatalog` pattern, or ship un-flagged for admins? (Recommend: match
  existing admin conventions.)

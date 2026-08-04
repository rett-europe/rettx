<!--
  Frontmatter below is machine-read by .github/workflows/spec-fanout.yml when
  this spec is merged into main. The `fanout` array drives which downstream
  repos get a `[spec/<slug>] <title>` issue with the `squad` label. Set
  `status: ready` when this spec should fan out on merge — drafts will not.

  Allowed fanout repos: rettxweb, rettxadmin, rettxapi, rettxmutation, rettxid, templates.

  STACK & DELIVERY PRE-FLIGHT (patterns.md §1 / §7): both fanout repos were
  verified against patterns.md §1. `rettxapi` is Python 3.11 / FastAPI on Azure
  Functions v4 and owns every admin read endpoint plus the audit store, so the
  emission slice belongs there. `rettxadmin` is Angular 18+ standalone with
  Angular Material and MSAL, and owns the patient-detail Audit Trail panel, so
  the presentation slice belongs there. No `rettxweb` slice: caregiver reads of
  their own patient are out of scope (see Explicitly out of scope). No
  `rettxmutation`, `rettxid` or `templates` slice: they hold no admin read
  surface.

  NO NEW PHI. Access events carry identifiers, a surface name and an outcome —
  never free text, never clinical values. This spec must not widen what the
  audit store holds about a patient.
-->
---
spec_id: "048"
slug: "admin-access-audit"
title: "Admin access auditing (who read a patient's record)"
status: draft   # draft | ready | accepted | superseded  -- KEEP as draft so it does NOT fan out until a maintainer flips it to ready
authored: "2026-08-02"
author: "perocha"
source_issue: ""
relates_to: "specs/039-pulse-admin-insights/, specs/043-admin-rbac-mvp/, specs/001-security-deep-dive/"
fanout:
  - repo: rettxapi
    summary: |
      Own the **emission** half. Today exactly one admin read in the whole API
      writes an access audit event (`pulse_admin_summary_read`), and it happens
      to be the only admin read that returns **no PHI at all**. Every genuinely
      sensitive admin read — care profile, main diagnosis, mutations, identity
      status, patient record, files — writes nothing.

      Concretely:
      (1) Introduce a single **access-event contract** (`<domain>_admin_read`,
      `AuditOutcome.SUCCESS` / `REJECTED`, actor + patient identifiers + surface
      + outcome, no PHI) and apply it to every **patient-scoped** admin GET
      listed in the *rettxapi slice* section.
      (2) Audit **export** explicitly: `/admin/files/history/export` currently
      writes to the application log only, and export is named verbatim in
      Constitution VI.
      (3) Fix the **durability** of the emission. The existing Pulse call uses
      `asyncio.create_task(...)` inside a request that may return before the
      task is scheduled, and swallows every exception. A compliance record that
      can silently disappear is not a compliance record — see FR-005.
      (4) Do **not** throttle, coalesce or sample. See FR-007 and its rationale.
  - repo: rettxadmin
    summary: |
      Own the **presentation** half. The patient-detail Audit Trail panel is
      titled *"Chronological history of changes"* and then lists access events
      in the same feed, so reads read as noise and changes get buried.

      Concretely:
      (1) Separate **Access** from **Changes** in the panel — access events must
      be reachable, filterable and clearly labelled, but must not pad the change
      history by default.
      (2) Register the access event types in `AUDIT_DOMAIN_CONFIG` so they stop
      falling through to the unknown-event fallback humanizer (which is why the
      panel currently renders the raw key as *"Pulse Admin Summary Read"*).
      (3) Always show **who** performed the access, not only that it happened.
      (4) Surface denied access (`REJECTED`) distinctly from successful access —
      a refused read is the most security-relevant row in the panel.
---

# Spec 048 — Admin access auditing (who read a patient's record)

## Why this exists

Constitution VI (*Security baseline*) is explicit, and names reads first:

> Critical operations on patient data (**read**, create, update, delete,
> **export**) MUST be auditable with timestamp, actor, and outcome.

The registry does not do this. It does something worse than plainly not doing
it: it does a fraction of it, in a way that is easy to mistake for coverage. A
partial access log answers *"who looked at this patient's data?"* with a
confident, incomplete answer.

This spec was prompted by a maintainer noticing that opening the Pulse section
of a patient in `rettxadmin` writes an audit event on every view, and asking
whether that was excessive. It is not excessive. It is the only one of its kind,
and it covers the least sensitive read in the product.

### Baseline measured on 2026-08-02

Measured directly against `rettxapi@main` and `rettxadmin@main`:

- **47** distinct `event_type` values exist across the API. **One** is an admin
  access event: `pulse_admin_summary_read`. Every other event records a create,
  update, delete, lifecycle transition or delivery outcome.
  (`event_type="read"` in `message_services` is unrelated — it records a
  *caregiver* reading their *own* message: a domain event, not an access log.)
- The single audited read, `GET /admin/patients/{rettxid}/pulse/summary`, is
  **PHI-free by construction** — spec 039 Phase 1 returns counts, dates and
  metric *codes* only. Meanwhile these patient-scoped admin reads emit nothing:
  `GET /admin/patients/{id}`, `/patients/rettxid/{rettxid}`,
  `/patients/{patient_id}/care-profile/audit`,
  `/patients/{patient_id}/identity/status`,
  `/patients/{patient_id}/identity/audit`,
  `/patients/{patient_id}/files/{file_id}`, main diagnosis, mutations,
  notifications, and survey assignments.
- `GET /admin/files/history/export` writes an informational line to the
  application log (`"CSV audit report exported: ..."`) and **no audit event**,
  though export is named in Constitution VI.
- Emission is best-effort in a way that can lose records: it is dispatched with
  `asyncio.create_task(...)` and wrapped in a bare `except` that logs a warning
  and continues (`_emit_admin_summary_audit`). On Azure Functions the request
  can complete before the task runs.
- `RetentionTier.STANDARD` (used by the existing access event) is *minimum 12
  months, target purge 12–24 months*. `LONG` is 7 years and is reserved for
  consent records and permission changes.
- In `rettxadmin`, `AUDIT_DOMAIN_CONFIG.pulse.eventTypes` maps only
  `CREATE_ENTRY`, `UPDATE_ENTRY` and `DELETE_ENTRY`. `pulse_admin_summary_read`
  is absent, so it renders through the unknown-event fallback and has **no
  filter chip** — it cannot be filtered out of the feed it is padding.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — A caregiver asks who has seen their child's record (P1)

A caregiver exercises their right of access and asks which administrators have
viewed their child's data. Today the honest answer is *"we can tell you who
changed something, and who opened the Pulse summary, and nothing else."*

**Acceptance:**
1. **Given** an administrator opened a patient's care profile, main diagnosis
   and identity status, **when** the patient's access history is queried,
   **then** three access events are returned, each with a timestamp, the acting
   administrator, the surface read, and an outcome.
2. **Given** an administrator was refused a read, **when** the access history is
   queried, **then** the refusal appears with outcome `REJECTED`.
3. **Given** any access event, **when** its payload is inspected, **then** it
   contains identifiers, a surface name and an outcome, and **no** clinical
   value, name, date of birth or free text.

### User Story 2 — An administrator reads a record without wading through views (P1)

An administrator opens the Audit Trail panel to understand what happened to a
record. Access events must not drown the changes — but must remain one click
away, not hidden.

**Acceptance:**
1. **Given** a patient with many access events and few changes, **when** the
   Audit Trail panel loads, **then** the default view shows changes, and the
   panel heading does not describe its contents as a history of changes while
   access events are listed in it.
2. **Given** the panel, **when** the administrator switches to access events,
   **then** each row names the administrator who performed the read.
3. **Given** an access event type, **when** it is rendered, **then** it uses a
   registered label and has its own filter control — no event type reaches the
   unknown-event fallback.

### User Story 3 — Export accountability (P2)

Exports leave the system boundary and are the highest-consequence read.

**Acceptance:**
1. **Given** an administrator exports the file-history compliance report,
   **when** the export completes, **then** an access event records the actor,
   the date range requested, the row count and the format.
2. **Given** the export fails, **then** an event is still recorded with outcome
   `FAILURE`.

### User Story 4 — Auditing never breaks or slows what it audits (P2)

**Acceptance:**
1. **Given** the audit store is unavailable, **when** an administrator reads a
   patient, **then** the read still succeeds.
2. **Given** an audit write could not be persisted, **when** the failure occurs,
   **then** it is logged at `WARNING` with the correlation identifier so the gap
   is discoverable, and **not** swallowed silently.
3. **Given** normal operation, **when** a patient-scoped admin read is served,
   **then** added latency stays within the budget in FR-005.

### Edge cases

- **Same admin, same patient, repeatedly.** Every read is recorded. See FR-007.
- **A read that returns nothing** (patient exists, no data) is still an access
  and is still recorded — attempting to look is the auditable act.
- **A read of a non-existent patient** records `REJECTED` or `FAILURE` and must
  not create a record implying that patient exists.
- **Collection and search endpoints** are deferred to Phase 2 — see *Explicitly
  out of scope* for why that deferral is stated rather than left silent.
- **Backfill is impossible.** Reads before this ships were never recorded and
  cannot be reconstructed. The access history must not imply completeness for
  periods before its own start date.

## Requirements *(mandatory)*

### Shared access-event contract (both repos MUST agree)

- **FR-001** An **access event** MUST carry: UTC timestamp, actor identifier,
  patient identifier, the surface read, and outcome (`SUCCESS` / `REJECTED` /
  `FAILURE`). It MUST NOT contain clinical values, names, dates of birth, or
  free text. Aggregate counts (for example `total_entries`) are permitted.
- **FR-002** Access events MUST be distinguishable from change events by type,
  without string-matching a message. A consumer MUST be able to ask *"show me
  reads"* and *"show me changes"* as separate queries.
- **FR-003** Access events MUST use `RetentionTier.STANDARD` (minimum 12
  months). They are operational access records, not consent or permission
  records.
- **FR-004** A denied or failed read MUST be auditable, not only a successful
  one. Where RBAC already emits `rbac_capability_denied`, that event satisfies
  this requirement and MUST NOT be duplicated.

### rettxapi slice

- **FR-005** Emission MUST be durable enough to constitute a record. The current
  `asyncio.create_task(...)` + bare-`except` pattern MAY drop events silently and
  MUST be replaced by either (a) an awaited write, or (b) a durable queue
  hand-off. Either way: a write that cannot be persisted MUST be logged at
  `WARNING` with the correlation identifier, and MUST NOT fail the caller's read.
  Added p95 latency for a patient-scoped admin read MUST stay under **50 ms**; if
  an awaited write cannot meet that, use the queue.
- **FR-006** Every **patient-scoped** admin GET MUST emit an access event. At
  minimum: patient record by id and by rettX ID, care profile, main diagnosis,
  mutations, identity status and identity audit, patient files, notifications,
  survey assignments, and the existing Pulse summary.
- **FR-007** Access events MUST NOT be throttled, coalesced, sampled or
  de-duplicated. *Rationale: the forensic value is per-access granularity. "An
  administrator viewed this patient at some point this hour" answers no question
  a data-protection enquiry actually asks, and the storage saved is negligible
  against a Cosmos write of a few hundred bytes.*
- **FR-008** `GET /admin/files/history/export` MUST emit an access event
  recording actor, requested date range, row count and format — on success and
  on failure.
- **FR-009** The existing `pulse_admin_summary_read` event MUST be brought onto
  the shared contract without losing continuity: existing rows MUST remain
  queryable and MUST NOT be rewritten.

### rettxadmin slice

- **FR-010** The patient-detail Audit Trail panel MUST present **Access** and
  **Changes** as distinct groupings. Changes are the default view. The panel
  heading MUST NOT describe its contents as a history of changes while access
  events are listed in it.
- **FR-011** Every access event type MUST be registered in `AUDIT_DOMAIN_CONFIG`
  with a human label and a filter control. No access event may render through
  the unknown-event fallback.
- **FR-012** Each access row MUST name the acting administrator, not only the
  action and the time.
- **FR-013** `REJECTED` access MUST be visually distinct from `SUCCESS` access.
- **FR-014** The access view MUST state the date from which access recording
  began, so a short or empty history is not mistaken for "nobody looked".

### Explicitly out of scope

- **Caregiver reads of their own patient.** A caregiver reading their own
  child's record is the product working, not an access to account for. Auditing
  it would generate volume without answering any question.
- **Collection, list and search endpoints** (Phase 2). A list read exposes many
  patients at once and *does* deserve accounting, but one event per listed
  patient would flood every patient's history with rows describing a bulk browse
  rather than an intentional look. Phase 2 should record **one** event per
  collection read, capturing the filter and the result count, and must not
  attribute it to each patient individually.
- **Query-level auditing inside the data layer.** The boundary being audited is
  the admin API surface, not Cosmos.
- **Alerting on access patterns** (unusual volume, out-of-hours). Worth doing;
  needs a baseline that only exists once this ships.
- **Retro-active reconstruction** of reads from before this ships.

## Success Criteria *(mandatory)*

- **SC-001** For every patient-scoped admin GET in the API, a read produces
  exactly one access event — verified by a test that enumerates the routes and
  asserts coverage, so a newly added endpoint fails the suite until it is
  audited.
- **SC-002** Zero access events contain PHI, verified by an automated assertion
  over the emitted payload shape rather than by review.
- **SC-003** With the audit store forced to fail, every audited admin read still
  returns its normal response, and each failure appears once in the log with a
  correlation identifier.
- **SC-004** p95 latency of an audited admin read increases by less than 50 ms
  against the pre-change baseline.
- **SC-005** In `rettxadmin`, the default Audit Trail view of a patient with
  access events shows no access rows, and the access view shows them all with an
  actor named on every row.
- **SC-006** No audit row in the panel renders via the unknown-event fallback.
- **SC-007** A data-protection enquiry for a given patient can be answered from
  the audit store alone: who read what, when, and whether they were allowed to.

## Assumptions

- The audit store's existing partitioning by patient absorbs one additional
  write per admin patient view without a schema change. If measurement says
  otherwise, the queue option in FR-005 is the escape hatch.
- 12-month minimum retention (`STANDARD`) is sufficient for access records. If
  legal advice later requires longer, the tier changes; the contract does not.
- Admin volume is low (a handful of staff), so per-access granularity is
  affordable. Re-test this assumption if administrator headcount or automated
  admin traffic grows materially.
- `rbac_capability_denied` already covers denied-by-capability reads, so FR-004
  is largely satisfied for RBAC refusals once enforcement is on (`RBAC_ENABLED`,
  spec 043).

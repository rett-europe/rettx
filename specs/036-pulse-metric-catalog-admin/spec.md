<!--
  Frontmatter below is machine-read by .github/workflows/spec-fanout.yml when
  this spec is merged into main. Fanout only runs when status is `ready` or
  `accepted` — while `draft` nothing fans out, so it is safe to review and
  iterate. Flip `status: ready` when agreed and you want squad issues opened
  on merge.
-->
---
spec_id: "036"
slug: "pulse-metric-catalog-admin"
title: "rettX Pulse — Global Metric-Catalog Administration"
status: ready   # draft | ready | accepted | superseded
authored: "2026-07-17"
author: "perocha"
source_issue: "rett-europe/rettx#10"
relates_to: "specs/035-pulse-tracker/"
fanout:
  - repo: rettxapi
    summary: |
      OWNER of the global metric-catalog contract. Add an admin-authed,
      globally-scoped metric-definition surface under the existing
      `/admin/pulse` router (`app/routers/admin/pulse_admin.py`, gated by
      `require_admin`) and make the patient-facing read path resolve the global
      catalog from storage instead of the in-code seed presets.

      Do:
      (1) New Cosmos container `pulse_catalog_definitions` (partition `/code`),
      created at runtime via `create_container_if_not_exists`. Register
      `RETTX_PULSE_CATALOG_DEFINITIONS_CONTAINER_NAME` (default
      `pulse_catalog_definitions`) and `RETTX_PULSE_CATALOG_DEFINITIONS_PARTITION_KEY`
      (default `/code`) in config.py AND BOTH secret loaders (env_secret_loader.py
      underscored + keyvault_secret_loader.py hyphenated) in the same PR — the
      `test_secret_loaders_completeness.py` guard enforces this.
      (2) Admin catalog CRUD on `/admin/pulse` (all `require_admin`, no rettxid):
      list (incl. retired), get-with-version-history, create, edit→new immutable
      version, retire. Reuse the spec-035 value-primitive models + immutable
      per-version document pattern already shipped for patient customs.
      (3) One-time idempotent bootstrap that writes the in-code seed presets (iterated from `get_seed_presets()` — six today, incl. sleep; no hardcoded count)
      into the catalog container as v1 catalog-scope definitions if absent, so
      nothing is lost and the catalog is never empty on a cold environment.
      (4) Repoint the patient read path: the definitions the caregiver client
      sees become (global catalog from `pulse_catalog_definitions`) + (that
      patient's customs) instead of (in-code seeds) + (customs). Keep the
      patient custom write path (spec 035) unchanged.
      (5) Fire-and-forget admin audit events (identifiers only) on catalog
      create/edit/retire.
  - repo: rettxadmin
    summary: |
      CONSUMER. Swap the mock `PulseCatalogDataSource` for a real client bound to
      the new admin catalog contract (`/admin/pulse/...`), behind the existing
      `pulseCatalog` flag. The already-built catalog UI (list, primitive-driven
      create/edit form, version history, translation editor) maps 1:1 onto the
      new endpoints — no UX rework, only the data layer. Admin auth via the
      existing admin token; no rettxid / no patient scope.
---

# rettX Pulse — Global Metric-Catalog Administration

## Problem

Spec 035 (pulse-tracker) shipped the value-primitive metric model with two
sources of definitions:

- **Seed presets, in-code** — read-only; editing via API returns `409`.
- **Per-patient custom definitions** — stored in `pulse_metric_definitions`
  (partition `/patient_id`), created/edited by caregivers through the
  patient-scoped endpoints `/{rettxid}/pulse/metric-definitions`
  (gated by caregiver patient-access + `pulse_enabled`).

rettxadmin has built a **global metric-catalog administration UI** (list,
primitive-driven create/edit, immutable version history, per-locale translation
editor). But there is **no backend for it**: the only metric-definition write
API is patient-scoped and requires a `rettxid` + caregiver access, and the seed
presets it would curate are in-code and not editable through any endpoint. The
admin UI therefore has nothing correct to bind to.

This spec closes that gap: a **DB-backed global catalog** that admins fully own,
plus the read-path change that makes patient clients resolve the catalog from
storage.

## Decisions (for review)

1. **Source of truth = DB-backed catalog (Option B, agreed).** The global
   catalog lives in storage and is fully admin-owned: creatable, editable,
   versionable, translatable, retirable. The in-code presets (whatever `get_seed_presets()` returns at bootstrap — six today, incl. sleep, menstrual at v2) become a
   one-time **bootstrap seed** of that store, not a parallel runtime source.

2. **Storage = a new, separate container `pulse_catalog_definitions`,
   partitioned by `/code`** (AGREED).
   - *Why a separate container (not the patient one):* `pulse_metric_definitions`
     is partitioned `/patient_id`; global catalog documents have no patient.
     Keeping global catalog data physically separate from patient data is
     cleaner for isolation, residency, and backup posture, and avoids sentinel
     `patient_id` values polluting the patient-partitioned container.
   - *Why `/code`:* all immutable versions of one metric code co-locate in a
     single logical partition → efficient version-history reads and point
     writes. The catalog list is a small cross-partition query (dozens of
     metrics), which is fine.
   - *Alternative considered:* reuse `pulse_metric_definitions` with a sentinel
     partition (e.g. `patient_id = "__catalog__"`). Rejected: mixes global and
     patient data in one partitioned container. (Flag if you prefer it.)

3. **Auth = the existing `require_admin` gate**, on the existing `/admin/pulse`
   router stub (`app/routers/admin/pulse_admin.py`). No `rettxid`, no patient
   scope, no `pulse_enabled` (that flag gates caregiver eligibility, not admin
   curation).

4. **Model reuse.** Catalog definitions reuse the spec-035 value-primitive
   vocabulary (`MetricField` + `PrimitiveConfig`), the immutable
   per-version document pattern, and the `code`-vs-`labels` i18n split. No new
   primitive types.

5. **Read-path convergence.** The patient-facing read
   (`GET /{rettxid}/pulse/metric-definitions`, spec 035) changes its "global"
   source from the in-code seeds to `pulse_catalog_definitions`. Result set
   becomes: latest non-retired catalog definitions + that patient's latest
   non-retired customs. The patient **custom write** path is unchanged.

## Functional requirements

- **FR-001** Admins can list all global catalog definitions, including retired
  ones, with their active version marked.
- **FR-002** Admins can fetch a single catalog definition by `code` together
  with its full immutable version history (newest→oldest).
- **FR-003** Admins can create a global catalog definition composed from the
  value primitives. `code` is unique across the catalog; kebab-case enforced.
- **FR-004** Any edit publishes a **new immutable version**; prior versions stay
  readable so historical entries resolve unchanged (mirrors 035 FR-018).
- **FR-005** Admins can retire a catalog definition: it stays resolvable for
  history but is no longer offered for new entries (not returned to caregiver
  clients as selectable).
- **FR-006** Per-locale label management across the supported locales; an
  English label is required as the fallback.
- **FR-007** The in-code seed presets — all of them, iterated from `get_seed_presets()` (six today, incl. sleep; menstrual v2), never a hardcoded count — are bootstrapped into the catalog store
  once, idempotently, as v1 catalog definitions when absent. After bootstrap
  they are ordinary catalog definitions (fully editable/versionable) — the
  `409 not-editable` seed rule from 035 no longer applies at catalog scope.
- **FR-008** Patient-facing reads resolve the global catalog from storage
  (catalog defs + patient customs). No caregiver-visible behavioural change
  when the catalog store simply mirrors today's in-code seeds.
- **FR-009** Catalog create/edit/retire emit fire-and-forget admin audit events
  (identifiers only, no PHI).
- **FR-010** All new config symbols are registered in config.py + both secret
  loaders (completeness-guard compliant).

## Proposed API contract (rettxapi — owner)

All under `require_admin`; base prefix `/admin/pulse`. No `rettxid`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/pulse/catalog/metric-definitions` | List catalog (incl. retired), latest version each |
| GET | `/admin/pulse/catalog/metric-definitions/{code}` | Get one + version history |
| POST | `/admin/pulse/catalog/metric-definitions` | Create catalog definition (v1) |
| PATCH | `/admin/pulse/catalog/metric-definitions/{code}` | Edit → new version, or retire |

Request/response shapes reuse the spec-035 wire models
(`MetricField`, `PrimitiveConfig`, per-locale `labels`, `code`,
`definition_version`, `is_retired`). The catalog list may include retired defs
(admin view) whereas the patient read continues to omit them.

## Storage & config

- Container: `pulse_catalog_definitions`, partition `/code`, runtime
  `create_container_if_not_exists`.
- Config: `RETTX_PULSE_CATALOG_DEFINITIONS_CONTAINER_NAME`
  (default `pulse_catalog_definitions`),
  `RETTX_PULSE_CATALOG_DEFINITIONS_PARTITION_KEY` (default `/code`) — in
  config.py + env_secret_loader.py (underscored) + keyvault_secret_loader.py
  (hyphenated `RETTX-PULSE-CATALOG-DEFINITIONS-*`).
- Ops: safe code defaults, so nothing is strictly required in prod; add the
  KeyVault secrets for explicitness. Container auto-creates on first use.

## Consumption (rettxadmin — consumer)

- Real `PulseCatalogDataSource` bound to `/admin/pulse/catalog/...`, behind the
  existing `pulseCatalog` flag; admin token auth; no rettxid.
- The shipped catalog UI (list, create/edit form, version history, translation
  editor) maps 1:1 — data-layer swap only, no UX rework.

## Out of scope

- Pulse **entry** logging/visualisation (spec 035, caregiver client).
- Patient **custom** definition write path (spec 035, unchanged).
- Media/blob (Phase 2, dormant).
- No new value primitives.

## Delivery notes

- Two fanout targets: rettxapi (owner, ships first — the contract), rettxadmin
  (consumer, binds once the contract is live). rettxadmin work stays parked
  until the rettxapi endpoints merge.
- rettxapi PR must add the two config symbols to both secret loaders in the same
  PR (the completeness guard will fail otherwise — as it did on #325).

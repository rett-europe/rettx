<!--
  Frontmatter below is machine-read by .github/workflows/spec-fanout.yml when
  this spec is merged into main. Fanout only runs when status is `ready` or
  `accepted` — while `draft` nothing fans out, so it is safe to review and
  iterate. Flip `status: ready` when agreed and you want squad issues opened
  on merge.
-->
---
spec_id: "040"
slug: "pulse-diagnosis-gate"
title: "rettX Pulse — confirmed-diagnosis eligibility gate"
status: ready   # draft | ready | accepted | superseded
authored: "2026-07-24"
author: "perocha"
source_issue: "rett-europe/rettx#44"
relates_to: "specs/035-pulse-tracker/"
fanout:
  - repo: rettxapi
    summary: |
      OWNER of enforcement — this is the security boundary. Pulse must be
      usable only when BOTH (1) the caregiver's `app_metadata.features.pulse`
      flag is enabled AND (2) the patient has a CONFIRMED diagnosis. Today the
      Pulse endpoints check the flag only; add the diagnosis gate.

      REUSE the existing survey guardrail — do NOT invent a new check.
      `SurveyServices._has_confirmed_rett_diagnosis(patient)` (Feature 020,
      app/services/patient_services/survey_services.py) already encodes the
      exact rule: a patient is confirmed iff `patient.main_diagnoses[]` has an
      entry with `is_current=True`, `is_deleted=False`, and
      `diagnosis_name.value in {rett_syndrome, rett_like_syndrome,
      mecp2_duplication}` (VALID_RETT_DIAGNOSES).

      Do:
      (1) EXTRACT that check into a shared, stateless eligibility helper (e.g.
      `app/services/patient_services/diagnosis_eligibility.py`:
      `has_confirmed_rett_diagnosis(patient) -> bool`) and have BOTH surveys and
      Pulse call it, so the rule lives in one place. Keep survey behaviour
      byte-for-byte identical (delegate the existing static method to the new
      helper).
      (2) Gate the Pulse WRITE endpoints in `app/routers/v2/pulse.py`
      (`create_entry` POST, `update_entry` PATCH, `delete_entry` DELETE) on
      confirmed diagnosis, AFTER the existing flag gate. Order MUST be
      flag-check first (403 `feature-not-enabled` from `require_pulse_enabled`),
      THEN diagnosis-check. On a patient without a confirmed diagnosis, raise
      HTTP 400 with a body consistent with surveys, e.g.
      `{"code": "diagnosis-not-confirmed", "message": "Patient lacks a
      confirmed Rett diagnosis and is not eligible for Pulse."}`, and log
      `validation_failure=no_confirmed_rett_diagnosis` (identifiers only, no
      PHI) exactly like the survey path.
      (3) READ endpoints (`list_patient_entries`, `get_entry`): do NOT hard-block
      reads of already-collected data — leave the existing
      `require_pulse_enabled_or_has_existing_data` behaviour UNCHANGED so a
      patient whose diagnosis changes later can still read historical entries.
      (Rationale: mirrors how surveys gate assignment/creation, not read-back of
      existing responses. See Open questions — flip to also gate reads only if
      product decides.)
      (4) The check needs the patient document. `create_entry` already resolves
      patient access via `require_patient_write_access_v2`
      (`ResolvedPatientAccessContext` carries the patient id / patient); load the
      patient via the existing patient service and pass it to the helper. Do NOT
      add a new container read pattern — reuse the existing patient fetch.
      (5) EXPOSE eligibility to the caregiver client so the UI can render the
      guidance state WITHOUT trial-and-error 400s. Preferred: include a boolean
      like `diagnosis_confirmed` (and `pulse_enabled`) on whatever patient/
      context payload rettxweb already loads for a patient, OR add a tiny
      `GET /v2/patients/{rettxid}/pulse/eligibility` returning
      `{ pulse_enabled: bool, diagnosis_confirmed: bool, eligible: bool }`.
      Check whether surveys already expose an eligibility signal the client uses
      and match that approach rather than adding a parallel one.

      Tests: write path returns 400 (not 403) when flag ON but diagnosis not
      confirmed; returns 403 when flag OFF (flag takes precedence); succeeds when
      both hold; read path unchanged; the shared helper covers is_current/
      is_deleted/diagnosis_name permutations; survey behaviour regression-safe.

  - repo: rettxweb
    summary: |
      CONSUMER (caregiver UX). When a caregiver opens Pulse but is NOT eligible,
      show a GUIDANCE state instead of a hard error or an empty tracker:
      - No patient at all → prompt "Add a patient to start using Pulse" with the
        add-patient CTA.
      - Patient exists but diagnosis is NOT confirmed → prompt "Confirm this
        patient's diagnosis to use Pulse" with the CTA that leads to the
        diagnosis flow.
      - Flag not enabled → keep the existing "feature not enabled" treatment
        (unchanged).
      Determine eligibility from the signal rettxapi exposes (see the rettxapi
      fanout item — a `diagnosis_confirmed`/`pulse_enabled`/`eligible` flag on
      the patient/context payload, or a small `/pulse/eligibility` read). REUSE
      whatever mechanism the SURVEY feature already uses on the client to decide
      eligibility — do not invent a new one. Do not attempt Pulse reads/writes
      until eligible; the 400 from the API is a safety net, not the UX path.
      Keep copy calm and non-clinical (no medical claims); this is an
      availability/onboarding state, not a diagnostic message.

  - repo: rettxadmin
    summary: |
      CONSUMER (optional, low priority). Where an admin toggles the Pulse
      feature flag for a principal, make clear that enabling the flag ALONE does
      not make Pulse usable — the patient must also have a confirmed diagnosis.
      A short helper/tooltip near the Pulse toggle is enough; no enforcement
      logic changes here (the API is the boundary). Only do this if it fits
      existing admin conventions; otherwise skip.
---

# rettX Pulse — confirmed-diagnosis eligibility gate

## Problem

rettX **Pulse** is currently gated on the caregiver feature flag alone
(`app_metadata.features.pulse`). That means Pulse can be switched on for an
account whose patient has **no confirmed diagnosis**, letting a user log Pulse
data for a patient who is not (yet) a confirmed member of the Rett-spectrum
cohort. Pulse must only be available when the patient is a confirmed case.

This is the same eligibility rule the **Surveys** feature already enforces, so
the fix is to extend that established guardrail to Pulse rather than invent a new
mechanism.

## What "confirmed diagnosis" means

A patient has a confirmed diagnosis when `patient.main_diagnoses[]` contains an
entry that is:

- `is_current = true`, and
- `is_deleted = false`, and
- `diagnosis_name ∈ { rett_syndrome, rett_like_syndrome, mecp2_duplication }`
  (`VALID_RETT_DIAGNOSES`).

A `rettxid` is issued at patient **creation** and is **not** a confirmation
signal — presence of a rettxid must not be treated as a confirmed diagnosis.

## Goals

1. Pulse is usable only when **flag enabled AND patient diagnosis confirmed**.
2. Reuse the existing survey eligibility rule (single source of truth), so the
   two features can never drift.
3. In the caregiver app, guide the user toward eligibility ("add a patient /
   confirm diagnosis") rather than showing an error or an empty tracker.
4. Keep the backend as the enforcement boundary; the UI gate is UX only.

## Non-goals

- No change to the definition of a confirmed diagnosis, or to how diagnoses are
  created/confirmed.
- No hard-blocking of **reading** already-collected Pulse data for a patient
  whose diagnosis later changes (see Open questions).
- No new datastore, container, or cross-partition query — reuse existing patient
  reads.
- No clinical/diagnostic messaging in the UI — this is an availability gate.

## Enforcement (rettxapi — owner)

- **Single source of truth:** extract the survey check into a shared stateless
  helper (`has_confirmed_rett_diagnosis(patient) -> bool`); surveys and Pulse
  both call it. Existing survey behaviour must remain identical.
- **Write endpoints** (`create_entry`, `update_entry`, `delete_entry` in
  `app/routers/v2/pulse.py`): enforce **flag first (403), then diagnosis (400)**.
  Diagnosis failure → HTTP 400 with a survey-consistent body
  (`code: diagnosis-not-confirmed`) and audit
  `validation_failure=no_confirmed_rett_diagnosis` (identifiers only).
- **Read endpoints**: unchanged (`require_pulse_enabled_or_has_existing_data`),
  so historical data remains readable.
- **Eligibility signal:** expose `pulse_enabled` + `diagnosis_confirmed`
  (+ derived `eligible`) to the caregiver client, reusing whatever the survey
  feature already surfaces if such a signal exists.

## Caregiver experience (rettxweb — consumer)

When a caregiver opens Pulse and is not eligible, render a **guidance state**:

- **No patient** → "Add a patient to start using Pulse" + add-patient CTA.
- **Patient, diagnosis not confirmed** → "Confirm this patient's diagnosis to
  use Pulse" + CTA into the diagnosis flow.
- **Flag off** → existing "feature not enabled" treatment (unchanged).

Eligibility is read from the API signal; the client never relies on catching a
400. Copy stays calm and non-clinical.

## Admin (rettxadmin — optional)

Near the Pulse feature toggle, clarify that enabling the flag alone does not make
Pulse usable without a confirmed diagnosis. Tooltip/helper only; no enforcement
logic. Skip if it does not fit existing conventions.

## Acceptance criteria

- [ ] Pulse **write** (create/update/delete) on a patient **without** a
  confirmed diagnosis, with the flag **on**, returns **HTTP 400**
  (`diagnosis-not-confirmed`) and is audited
  (`validation_failure=no_confirmed_rett_diagnosis`), no PHI in logs.
- [ ] With the flag **off**, the response is still **403** `feature-not-enabled`
  (flag takes precedence over diagnosis).
- [ ] Pulse write **succeeds** when the flag is on **and** the patient has a
  confirmed diagnosis.
- [ ] The confirmed-diagnosis rule is implemented **once** in a shared helper
  used by both surveys and Pulse; survey behaviour is unchanged (regression
  tests green).
- [ ] Pulse **read** of existing entries is unaffected by the diagnosis gate.
- [ ] rettxapi exposes an eligibility signal (`diagnosis_confirmed` /
  `pulse_enabled` / `eligible`) the caregiver client can consume.
- [ ] rettxweb shows the correct guidance state for: no patient; patient with
  unconfirmed diagnosis; flag off — and shows Pulse normally when eligible.
- [ ] No new container/query pattern introduced; existing patient read reused.

## Open questions

- **Read enforcement:** should reads of existing Pulse data ALSO require a
  confirmed diagnosis, or stay open for data continuity? (Recommend: keep reads
  open — mirrors surveys, avoids hiding already-collected data. Flip only if
  product wants a hard block.)
- **Eligibility transport:** add a dedicated `GET /pulse/eligibility`, or piggy-
  back existing patient/context payloads the caregiver app already loads?
  (Recommend: match whatever surveys already do so the client has one
  eligibility pattern.)
- **rettxadmin cue:** worth the tooltip for the pilot, or defer? (Recommend:
  defer unless trivial.)

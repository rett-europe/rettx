<!--
  Frontmatter below is machine-read by .github/workflows/spec-fanout.yml when
  this spec is merged into main. Fanout only runs when status is `ready` or
  `accepted`. While `draft`, nothing fans out, so it is safe to review and
  iterate.

  Allowed fanout repos: rettxweb, rettxadmin, rettxapi, rettxmutation, rettxid,
  templates, rettxinfra.

  STACK & DELIVERY PRE-FLIGHT (patterns.md §7): this spec changes the patient
  diagnosis contract, the lifecycle rule derived from it, and how both are
  presented. rettxweb = Angular PWA wrapped with Capacitor as a native app.
  Nothing here depends on the delivery mechanism, push, or offline behaviour.
  No new cloud resource, identity or permission, so there is NO rettxinfra slice.
  No rendered template (email, push, consent, survey) changes, so there is NO
  templates slice. Variant extraction is unchanged, so there is NO
  rettxmutation slice. rettxid encodes no
  patient attributes and is unaffected.
-->
---
spec_id: "053"
slug: "gene-confirmed-variant-unspecified"
title: "A confirmed gene without an identified variant is a complete diagnosis"
status: ready   # draft | ready | accepted | superseded
authored: "2026-11-14"
author: "perocha"
relates_to: "specs/040-pulse-diagnosis-gate/ (defines 'confirmed diagnosis' for feature gating; unaffected, see Assumptions)"
fanout:
  - repo: rettxapi
    summary: |
      PRIMARY IMPLEMENTER AND CONTRACT OWNER. Today a patient whose genetic
      report states a mutation in a known gene (typically MECP2), but never
      names the specific variant, cannot be registered faithfully. Recording
      the gene is rejected because no validated variant exists. The only
      accepted alternative, "unknown mutation / clinical", throws away the
      fact that the gene IS known. Even that alternative leaves the patient in
      DRAFT unless their identity is locked.

      Do:
      (1) Add the "variant unspecified" marker to the main diagnosis
          (Contract C1). Enforce its invariants (FR-001..FR-004, FR-007).
      (2) Recompute lifecycle CONFIRMED (FR-010, FR-011). This includes
          clinical-only diagnoses, which today never reach CONFIRMED unless
          locked. The lifecycle precedence order is unchanged.
      (3) Expose the new state in the mutation summary (Contract C2), so no
          client has to infer it (FR-012).
      (4) Close the diagnosis-model gene gap: every gene diagnosis type the
          API accepts must be treated as a gene type by the diagnosis rules
          (FR-006).
      (5) Let rettxadmin filter and count these patients (FR-054, FR-057).
      Do NOT infer a variant from the gene, set the marker automatically, or
      migrate existing diagnoses automatically (FR-024, FR-040). The report
      pipeline, rejected reports and identity locking are unchanged.
  - repo: rettxadmin
    summary: |
      The admin is the ONLY place this state is established. Today the
      diagnosis dialog cannot express it. Choosing a gene type is rejected,
      and the rejection reaches the admin as a raw error message.

      Do:
      (1) Let an admin record "gene confirmed, variant unspecified" for any
          gene diagnosis type, both when creating and when editing
          (FR-050, FR-051).
      (2) Let an admin accept a report under review as this state, from the
          report review flow (FR-052).
      (3) Show the state wherever the diagnosis is shown: the patient detail,
          the list label and the filter. Never show it as "Clinical" or
          "Unknown" (FR-053, FR-054).
      (4) Explain a rejected diagnosis in words, not as a raw error
          (FR-056).
      (5) Make these patients countable in the overview, and say so where the
          MECP2 distribution cannot plot them (FR-057).
  - repo: rettxweb
    summary: |
      Caregiver presentation. Today a confirmed patient with no variant shows
      "Diagnosis confirmed", then a mutation card that says "Mutation details
      are not available." The care profile says "No diagnosis data", because
      it decides "MECP2 confirmed" by counting mutations, not by reading the
      diagnosis. Four of the seven diagnosis badges reference images that do
      not exist, and three gene types are unknown to the app.

      Do:
      (1) For a confirmed patient whose variant is unspecified, show the gene
          and a localized "specific variant not identified" explanation in
          place of the empty mutation card. Add no new image asset (FR-060,
          FR-061, FR-062).
      (2) Never ask the caregiver to upload a "complete" report for this
          state, and never call it "unknown mutation" (FR-063).
      (3) Derive the care-profile diagnosis statement from the diagnosis
          itself, not from the number of mutations (FR-064).
      (4) Recognise all seven gene diagnosis types (FR-065).
      (5) Never render a broken badge image (FR-066).
      (6) Ship every new string in every supported caregiver locale
          (FR-067).
      (7) Add a demo/mock scenario for this state (FR-068).
---

## Problem

Some patients have a Rett syndrome diagnosis and a genetic report confirming a
mutation in the MECP2 gene, but the report never names the specific variant.
This is most common with older patients, whose testing predates methods that
report the exact change.

rettX cannot register these patients faithfully. The data model treats "the
gene is known" and "the variant is known" as the same fact, so a patient must
either have both or be recorded as having neither.

### What is true today

Verified against the main branch of each affected repository on 2026-11-14:

| Step | What happens |
|---|---|
| Caregiver uploads the report | Extraction finds no variant, so no mutation is created. The report goes to admin review like every analysed report. |
| Admin records the gene as the diagnosis type | **Rejected.** A gene diagnosis type requires a validated variant in that gene. The admin sees the raw error text. |
| Admin uses the only accepted alternative, "unknown mutation / clinical" | Accepted, but the confirmed gene is lost. The patient still **does not reach CONFIRMED**, because CONFIRMED requires a validated variant. They stay in DRAFT unless their identity is locked. |
| Admin asks the caregiver for more information instead | The caregiver is told "Mutation not found in report. Please upload a complete report." **No such report exists.** |

What the caregiver sees, in the best case reachable today (workaround plus
identity lock):

- A "Diagnosis confirmed" banner at 100%, followed by a mutation card that
  reads "Mutation details are not available."
- A care profile that says "Clinical Rett", not "MECP2 confirmed".
- The Rett syndrome badge only. The gene badge is deliberately hidden for
  "unknown mutation".

If the gene type were simply allowed without a variant, the caregiver app would
show the MECP2 badge. The care profile, though, would say **"No diagnosis
data"**, because it decides "MECP2 confirmed" by whether any mutation exists. It
ignores the diagnosis, and it doesn't check which gene the mutation is in.

### Defects found in the same audit

These are tightly coupled to this case and are fixed by this spec:

- **Clinical-only diagnoses never reach CONFIRMED** unless the identity is
  locked. This is the same rule that blocks the new case.
- **The caregiver app recognises only three of the seven gene diagnosis types.**
  It is missing SLC6A1, EIF2B2 and MEF2C.
- **Four diagnosis badges reference images that do not exist**: Rett-like
  syndrome, MECP2 duplication, CDKL5 and unknown. They render as broken images.
- **The care profile's "MECP2 confirmed" statement is derived from mutation
  count**, not from the diagnosis or the gene. A patient with a validated FOXG1
  variant would be described as MECP2 confirmed.
- **One accepted gene diagnosis type (MEF2C) is not treated as a gene type** by
  the diagnosis model's consistency rule, although the identity and validation
  rules do treat it as one.

These were also found but are **out of scope**. They are tracked separately
(see Out of scope):

- Some gene types skip the validated-variant requirement.
- A legacy status endpoint fails with a server error in some states.
- The "confirmed diagnosis" statistics count diagnoses rather than lifecycle
  state.
- A clinical patient with no uploaded report shows "no file" instead of the
  clinical diagnosis.

## What changes

- A gene diagnosis can be marked **variant unspecified**. The diagnosis still
  says *which gene* is affected. It no longer pretends the variant is known or
  that the gene is unknown.
- Only an admin can set the marker, after reviewing the report.
- A patient with a current, admin-established diagnosis reaches **CONFIRMED**,
  whether the variant is validated, unspecified, or the diagnosis is clinical.
- The caregiver sees the gene and a plain explanation that the specific variant
  was not identified. They are never told something is missing or asked for a
  report that does not exist.
- Every report goes to an admin for review, always. The admin establishes the
  diagnosis and the mutation information. Extraction only assists them.

## Decisions

- **D1 A marker, not a new diagnosis type.** The diagnosis type keeps naming the
  gene, for example `mecp2_mutation`, and is not clinical. An additional
  marker records that the variant is unspecified. A new type per gene would
  double the type list and break every consumer that switches on the type. It
  would also make "MECP2 patients" a two-type query forever.
- **D2 The marker applies to every gene diagnosis type,** not only MECP2. The
  same reporting limitation applies to the other genes, and a MECP2-only rule
  would be special-cased in every repo.
- **D3 Admin-established only.** Caregivers upload reports. They do not declare
  diagnoses, and this spec does not change that. Nothing automated sets the
  marker.
- **D4 It is a complete diagnosis.** The patient reaches CONFIRMED without an
  identity lock, exactly as a patient with a validated variant does.
- **D5 No new visual asset.** The caregiver sees the existing gene badge, plus a
  localized line explaining that the specific variant was not identified.
- **D6 Every report is reviewed by an admin, always.** This is the intended
  process. The admin checks each report and manually records the diagnosis and
  the mutation information. Extraction pre-fills; it never decides an outcome.
  This already holds today: every analysed report, including one where no
  variant was found, lands in admin review. This spec does not change the
  report pipeline.
- **D7 No caregiver upload after confirmation.** Once a patient is CONFIRMED,
  the caregiver cannot upload another report. This is today's behaviour and is
  unchanged. A variant identified later is recorded by an admin, who also
  clears the marker.

## Contract

The control plane owns these shapes. rettxapi implements and versions them;
the frontends consume them and do not redefine them.

- **C1 Main diagnosis.** Adds `variant_unspecified: boolean`, which defaults to
  `false` and is always present in responses.
  - It may be `true` only when `diagnosis_type` is a gene type (any value other
    than `unknown_mutation`) and `clinical_diagnosis` is `false`.
  - Existing fields and values are unchanged.
- **C2 Mutation summary.** Adds the state `VARIANT_UNSPECIFIED`. It is reported
  when the current diagnosis has `variant_unspecified = true` and the patient
  has no validated variant.
  - Its priority is the same as `VALID_MUTATION`: below in-progress and
    more-information states, and above `CLINICAL_DIAGNOSIS`.
  - The summary also carries the gene, so a client never has to look it up
    from the diagnosis type.
- **C3 Lifecycle.** No new lifecycle state or reason code. The patient is
  `CONFIRMED` with reason `DIAGNOSIS_CONFIRMED`, or `LOCKED` once locked.

Clients MUST tolerate C1 being absent (treat it as `false`) and C2 being unknown
(fall back to their existing confirmed display), so the API can ship first.

## User Scenarios & Testing *(mandatory)*

1. **Older patient, gene known, variant never reported.** A caregiver uploads a
   report stating an MECP2 mutation with no variant. It goes to admin review as
   today. An admin reviews it and
   accepts it as "MECP2, variant unspecified". The patient becomes CONFIRMED.
   The caregiver sees the confirmed banner, the MECP2 badge, and "The specific
   MECP2 variant was not identified in the genetic report", in their language.
   The caregiver is not asked to upload anything.
2. **The variant is identified later.** The caregiver cannot upload once the
   patient is CONFIRMED (D7). The family shares the newer report with the
   association, and an admin records the validated variant and clears the
   marker. The patient remains CONFIRMED throughout.
3. **An existing workaround patient.** A patient previously recorded as
   "unknown mutation / clinical" has an MECP2 report on file. An admin edits the
   diagnosis to MECP2 with variant unspecified. Nothing changes until the admin
   does this.
4. **An existing clinical-only patient** with a current diagnosis now shows as
   CONFIRMED instead of DRAFT.
5. **Every badge in the caregiver app** renders either a real image or no
   image, for every diagnosis name and type.

## Requirements *(mandatory)*

### Diagnosis model (rettxapi)

- **FR-001** A main diagnosis MUST be able to record that its gene is confirmed
  and its variant is unspecified (C1).
- **FR-002** The API MUST reject `variant_unspecified = true` together with
  `unknown_mutation` or `clinical_diagnosis = true`, with an explanation a
  person can act on.
- **FR-003** A gene diagnosis with `variant_unspecified = true` MUST NOT require
  a validated variant. A gene diagnosis with `variant_unspecified = false`
  keeps today's requirement unchanged.
- **FR-004** The API MUST reject `variant_unspecified = true` when the patient
  already has a validated variant in that gene.
- **FR-005** Clearing the marker when a validated variant is later recorded is
  an admin edit (D7, Scenario 2). The API does not clear it automatically.
- **FR-006** Every gene diagnosis type the API accepts MUST be treated as a gene
  type by all diagnosis consistency rules.
- **FR-007** Setting, changing or clearing the marker MUST be recorded in the
  same audit trail as other diagnosis changes.

### Lifecycle (rettxapi)

- **FR-010** A patient MUST be CONFIRMED when they have a current,
  admin-established main diagnosis that is any one of:
  - a gene diagnosis with a validated variant in that gene,
  - a gene diagnosis with `variant_unspecified = true`, or
  - a clinical diagnosis.
- **FR-011** The lifecycle precedence order is unchanged (LOCKED, then
  CONFIRMED, then the in-progress states). FR-010 only broadens what counts as
  CONFIRMED.
- **FR-012** The mutation summary MUST report `VARIANT_UNSPECIFIED` for this
  case (C2).

### Report review (rettxapi)

- **FR-020** The report pipeline is unchanged. Every analysed report already
  reaches admin review (D6).
- **FR-023** Rejecting a report is an admin decision. Rejected reports are
  unchanged from today.
- **FR-024** No automated step may set `variant_unspecified`, or infer a
  variant from a gene.

### Identity

- **FR-030** Identity locking is unchanged. A gene-confirmed,
  variant-unspecified patient already meets today's lock conditions.

### Migration (rettxapi, rettxadmin)

- **FR-040** Existing diagnoses MUST NOT be changed automatically. Converting a
  "unknown mutation / clinical" patient to a gene with the variant unspecified
  is an admin edit (Scenario 3).
- **FR-041** Existing clinical-only patients become CONFIRMED by FR-010. No data
  change is needed, and this is an intended, visible change for caregivers.

### Admin (rettxadmin)

- **FR-050** When creating or editing a diagnosis with a gene type, an admin
  MUST be able to mark the variant as unspecified. The control MUST NOT be
  offered for `unknown_mutation`.
- **FR-051** The existing derivation of `clinical_diagnosis` from
  `unknown_mutation` is unchanged.
- **FR-052** From the report review flow, an admin MUST be able to accept a
  report as "gene confirmed, variant unspecified" for a chosen gene.
- **FR-053** Wherever a diagnosis is displayed (patient detail, patient list,
  bulk views), this state MUST read as the gene plus "variant unspecified". It
  MUST NOT read as "Clinical" or "Unknown".
- **FR-054** The patient list MUST be filterable to this state.
- **FR-056** A diagnosis the API rejects MUST be explained to the admin in
  words, not as a raw error string.
- **FR-057** The overview MUST be able to count confirmed patients whose variant
  is unspecified, per gene. Any variant-level distribution MUST state how many
  confirmed patients of that gene it cannot plot.

### Caregiver app (rettxweb)

- **FR-060** For a CONFIRMED or LOCKED patient in this state, the mutation area
  MUST show the gene and a localized statement that the specific variant was
  not identified in the genetic report. It MUST NOT show "Mutation details are
  not available."
- **FR-061** The gene badge MUST be shown for this state. No new image asset is
  added.
- **FR-062** Copy MUST be factual and non-alarming, and MUST NOT make a medical
  claim, for example about prognosis or severity. The statement MUST name the
  diagnosed gene in the sentence itself, so it is understandable without the
  badge. Suggested English: "The genetic report confirms a change in the MECP2
  gene but does not name the specific variant. This can happen with reports
  from older testing methods."
- **FR-063** The caregiver MUST NOT be asked to upload another or a "complete"
  report because of this state. The state MUST NOT be described as "unknown
  mutation" or "missing mutation".
- **FR-064** The care-profile diagnosis statement MUST be derived from the
  diagnosis: its gene, and whether it is clinical. It MUST NOT be derived from
  the number of mutations, and MUST name the correct gene.
- **FR-065** The caregiver app MUST recognise every gene diagnosis type the API
  can return.
- **FR-066** No diagnosis badge may render a broken image. Every name and type
  either has an existing image or shows a text-only badge.
- **FR-067** Every new caregiver string MUST ship in every supported caregiver
  locale, with English fallback (patterns.md §5).
- **FR-068** The demo/mock tooling MUST include a scenario for this state, so it
  can be shown without real data.

## Success Criteria *(mandatory)*

- **SC-1** An admin can register a patient whose report states an MECP2
  mutation without a variant. The patient reaches CONFIRMED with no error and no
  identity lock.
- **SC-2** In every supported locale, that patient's caregiver sees the gene,
  the "variant not identified" statement and the gene badge. They never see
  "Mutation details are not available", "No diagnosis data", "unknown mutation"
  or a request for another report.
- **SC-3** No diagnosis badge renders a broken image in the caregiver app.
- **SC-4** The admin overview can say how many confirmed patients have an
  unspecified variant, per gene.
- **SC-5** No existing patient's diagnosis is changed by deployment. The only
  lifecycle changes are clinical-only patients becoming CONFIRMED (FR-041).

## Phased delivery

1. **rettxapi:** contract C1–C3, lifecycle, and the admin filter and count.
   Backwards-compatible: the marker defaults to `false`.
2. **rettxadmin and rettxweb, in parallel.** Both tolerate the API not yet
   exposing C1/C2.

Before release, an admin should review existing "unknown mutation / clinical"
patients with a report on file, and convert those whose report confirms a gene
(FR-040).

## Risks

- **R1** *Clinical-only patients suddenly appear confirmed.* This is intended,
  but caregivers will see a new banner. Mitigation: confirm the count before
  release, and brief support.
- **R2** *The marker outlives the evidence.* If an admin records a variant
  later but forgets to clear the marker, the patient shows both "variant not
  identified" and a variant. Mitigation: FR-004 stops the marker being set when
  a validated variant in that gene exists, and the admin clears it as part of
  recording the variant (FR-005).
- **R3** *Copy reads as a medical statement.* FR-062 constrains it. Translations
  should be reviewed by a native speaker.

## Constitution Check

- **Principle I, caregiver first.** Removes a dead end: being asked for a
  report that does not exist. It also stops describing a confirmed diagnosis as
  missing data.
- **Principle II, privacy.** No new personal data is collected. The marker is a
  property of an existing diagnosis.
- **Principle III, evidence.** The state is set only by an admin reviewing the
  report. Nothing is inferred (FR-024).

## Assumptions

- Feature gating on "confirmed diagnosis" (spec 040) depends on a current
  diagnosis with a valid Rett diagnosis name, not on a variant. It already
  admits these patients once a diagnosis exists and needs no change.
- rettxid encodes no patient attributes and is unaffected.

## Out of scope

Each item below is a pre-existing defect found during the audit, to be raised
separately:

- Some gene diagnosis types do not require a validated variant today. Making
  that consistent changes existing patients and needs its own decision.
- A legacy mutation-status endpoint fails with a server error in some states.
  Its removal is already planned in rettxapi.
- The "confirmed diagnosis" statistics count current diagnoses, not lifecycle
  state.
- A clinical patient with no uploaded report shows "no file" instead of the
  clinical diagnosis.

Also out of scope:

- Caregiver-declared diagnoses (D3).
- Any change to how variants are extracted, or to the report pipeline (D6).
- Caregiver uploads after confirmation (D7).
- How rejected reports appear in the mutation summary.
- An admin overview list of files that need attention: empty uploads marked
  invalid, and files stuck in a processing error. To be raised separately.

## Open decisions

- ~~**OD-1**~~ Resolved 2026-11-14 as D6: every report goes to review, always.
- ~~**OD-2**~~ Resolved 2026-11-14 in FR-062: the caregiver statement names the
  gene in the sentence.

## Amendments

- **2026-11-14, after fan-out.** Aligned with the scope agreed while planning
  the rettxapi slice. The report pipeline already sends every analysed report
  to review, so FR-021 and FR-022 are dropped, FR-020 records that the pipeline
  is unchanged, and the AS IS is corrected. A
  confirmed patient cannot upload again (D7), so a later variant is an admin
  edit and the automatic clearing and conflict flag (old FR-005, old Scenario 3)
  are dropped. Identity locking needs no change (old FR-030, FR-031, FR-055).
  Rejected reports are unchanged (old FR-012 second clause). Lifecycle
  precedence is unchanged (FR-011).

<!--
  Frontmatter below is machine-read by .github/workflows/spec-fanout.yml when
  this spec is merged into main. Fanout only runs when status is `ready` or
  `accepted`. Merging a `draft` is safe and fans out nothing.

  Allowed fanout repos: rettxweb, rettxadmin, rettxapi, rettxmutation, rettxid, templates, rettxinfra.

  IMPORTANT: OUTCOMES ONLY. `rettx` is a PUBLIC repo. Endpoint names, code
  locations, credential names and project identifiers stay in the private repos.
-->
---
spec_id: "061"
slug: "patient-profile-collection"
title: "Caregivers complete the patient profile of the rettX dataset"
status: draft   # draft | ready | accepted | superseded
authored: "2026-11-22"
author: "perocha"
source_issue: ""
relates_to: "docs/adr/0018-registry-data-store-and-dataset-driven-forms.md (where registry data lives, dataset-driven forms, SurveyJS); docs/adr/0013-admin-data-dedicated-cosmos-database.md (container ceiling)"
fanout:
  - repo: rettxapi
    summary: |
      PRIMARY IMPLEMENTER. Hold the patient-profile part of the rettX dataset
      for each patient, apart from identity data, as ADR 0018 decides.

      Outcomes:
      (1) SEPARATE AND PSEUDONYMOUS. Profile answers live in the registry
      database, keyed by rettX ID only, with no direct identifiers. They are
      linked to a person only inside the API, under the existing
      patient-access rules.
      (2) STORED IN DATASET TERMS. Each answer is stored against its dataset
      field identifier and answer code. It records the dataset version, its
      source (caregiver, extracted from a document, clinician), who gave it
      and when.
      (3) VALIDATED AGAINST THE DEFINITION. Answers are accepted only if they
      are valid under the current form definition and its live-field
      selection. No dataset field is hard-coded.
      (4) SAVE AS YOU GO, CORRECT WITHOUT LOSS. A caregiver can save one
      answer at a time and return later. "Not known" is a valid answer and
      differs from unanswered. A correction keeps the previous value.
      (5) PROPOSED VS CONFIRMED. An answer pre-filled from a document stays
      proposed until a person confirms it. It never counts as confirmed on
      its own.
      (6) DATASET-FORMAT EXPORT. A profile can be exported in the dataset's
      format, pseudonymised, with field versions and sources.
      (7) COMPLETENESS. The API can report how complete each profile is, per
      section.
  - repo: rettxweb
    summary: |
      Caregivers can complete their patient's profile in the app.

      Outcomes:
      (1) A CLEAR PLACE AND PROGRESS. The patient has a "profile" section
      showing progress per section (diagnosis, first signs, pregnancy and
      birth, family history). It invites completion without blocking
      anything else in the app.
      (2) RENDERED FROM THE DEFINITION. Questions, answers, units, show-when
      rules and wording come from the form definition, in the caregiver's
      language. A new definition version needs no app release.
      (3) EASY TO ANSWER HONESTLY. Every question accepts "not known".
      Answers save as they are given, and the caregiver can stop at any point
      and resume. Questions whose answer is usually in the birth record or
      health booklet say so.
      (4) CONFIRM, DON'T TRUST. Pre-filled answers are shown as proposed, with
      their source, until the caregiver confirms or corrects them.
      (5) ONE SURVEYJS VERSION. The app uses the same SurveyJS major version
      as the admin app.
  - repo: rettxadmin
    summary: |
      Staff can see the patient profile and its quality.

      Outcomes:
      (1) READ THE PROFILE. Staff with the right role see a patient's profile
      answers. Each answer shows its source, when it was given, and its
      dataset version. Previous values of corrected answers are visible.
      (2) COMPLETENESS AT A GLANCE. Staff can see completion per section,
      across patients and for one patient.
      (3) PSEUDONYMISED EXPORT. Staff with the right role can export profiles
      in the dataset's format, pseudonymised. The export is audited.
      (4) ONE SURVEYJS VERSION. The admin app uses the same SurveyJS major
      version as the caregiver app.
  - repo: rettxinfra
    summary: |
      Provision the registry database decided in ADR 0018 in every
      environment. It gets its own throughput and container budget, separate
      from the domain and admin databases. Access is scoped so that a reader
      of registry data can be granted it without access to identity data.
      Backups and retention follow the same policy as patient data.
---

# Caregivers complete the patient profile of the rettX dataset

## Why

Rett Syndrome Europe is agreeing a common rettX dataset with clinicians across
Europe. It defines what a Rett syndrome registry should hold. Its first part,
the **patient profile**, is collected once per patient. It covers diagnosis,
first signs and regression, pregnancy and birth, and family history.

rettX already holds the identity basics, the diagnosis name and the genetics
for each patient. For genetics it holds more than the dataset asks for. It does
not hold the rest of the profile, including the date and place of diagnosis.
Caregivers are the people who know most of these answers. Without them,
patient profiles in rettX stay incomplete for research, and families get
nothing in return for the data they already shared.

The dataset is a draft (version 0.2). The patient profile is the part expected
to change least, which makes it the right first collection.

## Goals

- A caregiver can complete the patient profile in the app at their own pace,
  in their language, answering "not known" where they do not know.
- Answers are held apart from identity, in dataset terms, ready for
  pseudonymised export in the dataset's format.
- A change to the dataset reaches the apps by publishing a new form definition,
  not by coordinated rework in each repo.

## Non-goals

- The other parts of the dataset (clinical areas, treatments, scales). They
  follow under the same ADR in later specs.
- Questions only a clinician or a site can answer, such as diagnostic criteria
  checklists, reference centre or cause of death.
- Collection by clinicians, or federation with other registries' sites.
- Moving existing data (Pulse, variants, care profiles) out of the domain
  database.
- Replacing the genetics that rettX already holds with the dataset's flatter
  genetic fields. Those are derived at export.
- Choosing tools, storage layouts or interfaces beyond what ADR 0018 decides.

## Requirements

- **FR-001 Live-field selection.** Exactly the fields in the reviewed
  selection are collected. Before 1.0 that means named fields from the
  patient-profile part that a caregiver can reasonably answer; afterwards,
  agreed fields. Nothing is collected just because it appears in the dataset.
- **FR-002 Versioned meaning.** Every answer is pinned to the dataset version
  it was given under. If a later version changes a field's meaning or codes,
  existing answers are kept and marked, never silently reinterpreted.
- **FR-003 Source and confirmation.** Every answer records whether it came from
  a caregiver, a document or a clinician. Answers drawn from documents are
  proposals until a person confirms them.
- **FR-004 Not known vs unanswered.** "Not known" is a recorded answer.
  Completion counts it as answered.
- **FR-005 Derived, not asked.** Values that can be derived from data rettX
  already holds are derived, not asked again. Examples are age at genetic
  diagnosis and the dataset's genetic fields.
- **FR-006 Minimal identifiers.** Registry records carry no direct identifiers.
  Exports are pseudonymised by default (constitution II).

## Decision record

[ADR 0018](../../docs/adr/0018-registry-data-store-and-dataset-driven-forms.md)
decides the separate registry database, answers stored in dataset terms, the
form definition generated from the dataset, and SurveyJS as the renderer.

## Constitution check

- **I. Caregivers come first.** The profile is optional and resumable,
  "not known" is always accepted, and nothing in the app is blocked behind it.
- **II. Privacy by design.**
  - A documented lawful basis and consent coverage for this data category are
    required before collection starts.
  - Only the fields in the live selection are collected (minimisation).
  - Registry data is kept apart from identity data.
  - Exports are pseudonymised.
- **III. Transparency.** Families see what is asked and why, and can see and
  correct their answers.
- **IV. Clinical accuracy.**
  - Question wording follows the dataset agreed with clinicians.
  - AI-pre-filled answers need human confirmation.
  - No question implies a diagnosis.
- **V. Inclusion.** Every supported locale is covered.

## Responsibilities

| Concern | Owner |
| --- | --- |
| Profile storage, validation, history, completeness, export | rettxapi |
| Caregiver collection experience | rettxweb |
| Staff view, completeness, audited export | rettxadmin |
| Registry database and scoped access | rettxinfra |
| Form definition generated from the dataset; field selection; caregiver wording | rettX dataset maintainers (RSE) |
| Cross-cutting outcomes; ADR 0018 | this spec |

## Acceptance

- A caregiver answers some profile questions, closes the app and later resumes
  where they stopped. Their answers are kept.
- Answering "not known" counts the question as answered.
- A follow-up question (for example "at what age?") appears only after the
  answer that triggers it.
- A corrected answer shows its new value. The previous value remains visible to
  staff.
- A new form definition that changes a question's wording reaches the app
  without an app release. Answers given under the previous version keep that
  version.
- A pre-filled answer is shown as proposed until confirmed. It does not count
  as confirmed before then.
- The registry data holds no names, contact details or user identifiers.
- A staff export produces pseudonymised profiles in the dataset's format, and
  the export is audited.

## Open questions

- **Live fields before 1.0.** Which patient-profile fields are collected before
  the dataset reaches 1.0, and who signs off the selection: RSE maintainers or
  WG6?
- **Wording and translations.** Where caregiver wording and translations live:
  with the dataset or with the other templates. Who reviews them clinically in
  each locale?
- **Consent.** Whether existing consent covers this data category, or caregivers
  must give renewed consent first.
- **Date or age.** Whether the date of diagnosis is asked as a date or, like
  the other milestones, as an age. Age is easier for families to recall.
- **"Other" answers.** Several dataset questions allow "Other" without a
  free-text "please specify". Whether to ask WG6 to add one.
- **Visibility to contributors.** Whether contributors with patient access see
  the profile, or only the caregiver who owns it.

# ADR 0018 — Registry data lives in its own pseudonymous store, and the rettX dataset drives how it is collected

- **Status**: Accepted (2026-11-23)
- **Date**: 2026-11-22
- **Decision-makers**: rettX maintainers (Pedro)
- **Relates to**: [spec 061 — caregiver patient profile](../../specs/061-patient-profile-collection/spec.md)
  (the first collection under this decision),
  [ADR 0013](0013-admin-data-dedicated-cosmos-database.md) (the container
  ceiling in `rettxdb` and the precedent of a dedicated database),
  [ADR 0016](0016-infrastructure-as-code-private-repo.md) (where provisioning
  and access are defined), [ADR 0015](0015-medication-regimen-not-pulse-event.md)
  (another case of "not everything is a Pulse event").

## Context

Rett Syndrome Europe is agreeing a **common rettX dataset** with clinicians and
institutions across Europe (Working Group 6). It defines what a Rett syndrome
registry should collect in four parts: a **patient profile** collected once,
**clinical areas** and **scales** collected at each visit, and **treatments**.
Each field has a stable identifier, a type, coded answers, the expected
reporter (caregiver, clinician, site or test result) and an agreement status.
The dataset is at version 0.2, a draft. Version 1.0 will be the first agreed
set.

A gap analysis of the rettX patient record against the patient-profile part
found:

- **Covered:** identity basics (rettX ID, date of birth, country of birth),
  deceased status and date, and the diagnosis name.
- **A superset, not a gap:** genetics. rettX holds validated variants with
  richer detail than the dataset asks for. The dataset's genetic fields are a
  flattened view of what rettX already holds.
- **Missing:** the date and place of diagnosis, clinical presentation, first
  signs and regression, pregnancy and birth, and family history. That is about
  27 fields a caregiver can answer.

Three questions follow: where this data lives, how its questions are defined,
and what renders them.

**Where it lives.** These answers are history, not observations over time. They
are not longitudinal, so they are not Pulse data. They are also not identity:
they are filled in gradually and corrected, while the identity record is
verified and then locked. Putting them into the patient record would mix health
history with names and identity state. A new container in `rettxdb` is not
available either: ADR 0013 records that `rettxdb` is at its container ceiling.

**How the questions are defined.** The dataset will keep changing until 1.0, and
after that through WG6 decisions. If each app re-types fields, answer codes and
rules by hand, every WG6 change becomes coordinated work across the API, the
caregiver app and the admin app. They drift, and exports need a mapping layer
that drifts too.

**What renders them.** SurveyJS was chosen early for surveys and is used in
both apps. Generative AI has changed what is possible since then, so the choice
was re-examined.

## Decision

1. **A dedicated registry database, `rettxregistrydb`.** Registry data from the
   rettX dataset lives in a new database in the existing account. The patient
   profile comes first; the later parts of the dataset (clinical areas,
   treatments, scales) follow. The database is named for the registry, not the
   profile.

2. **Pseudonymous by structure.** Registry records are keyed by the rettX ID
   only. They hold no direct identifiers: no names, user identifiers, contact
   details or other identity data. Linking a registry record to a person happens
   only inside the API, under the existing patient-access rules. Read access
   can be granted to this database without granting the identity data.

3. **Answers are stored in dataset terms.** Each answer is stored against its
   dataset field identifier, using the dataset's answer codes, and records:
   - the dataset version it was given under;
   - its source (caregiver, extracted from a document, clinician);
   - who gave it and when.

   A correction replaces the current value and keeps the previous one. Export
   to the dataset format needs no mapping.

4. **The dataset generates the form definition.** The dataset's build produces
   a versioned form definition next to the review workbook. It holds questions,
   answer codes, units, show-when rules, caregiver wording and translations.
   - The caregiver app renders it.
   - The API validates answers against it.
   - The admin app displays answers through it.

   Nobody re-types dataset fields in an app.

   The dataset is self-contained in three layers: clinical meaning agreed by
   WG6, caregiver wording approved by a clinician, and a translation per
   language approved by a native speaker. Approvals are recorded per field and
   tied to the exact text approved, so a release that touches a few fields
   re-opens review for those fields only. A language is published only when
   every live field is approved in it.

5. **Live fields are an explicit selection.** Until 1.0 nearly every field is
   `proposed`. Which fields are collected in production is an explicit,
   reviewed selection, signed off by RSE maintainers and shared with WG6. It
   is not inferred from status.

6. **Dataset changes are published as data.** Each release carries a
   machine-readable record of field changes (added, renamed, merged, split,
   meaning changed, rejected) next to its changelog. Stored answers are moved
   forward by applying these records, never by comparing versions.

7. **Keep SurveyJS as the renderer.** The free form library is already in both
   apps. It handles conditional questions, multiple languages and
   save-and-resume. Because the definition is generated, lock-in is low: the
   same source could later produce other formats, for example FHIR
   Questionnaire or REDCap.

8. **Generative AI proposes; people confirm.** AI may pre-fill answers from
   uploaded documents, offer conversational entry and draft translations. A
   pre-filled answer is marked as proposed until a caregiver or clinician
   confirms it. Its source stays visible.

## Consequences

- **WG6 changes are cheap.** A renamed option or a new field means a new
  definition version, not an API redesign. Because answers carry their dataset
  version, a meaning change between versions is never silently reinterpreted.
- **The direction is set.** Health data lives apart from identity. This does
  not make today's system segregated: Pulse, variants and care profiles still
  sit next to identity data in `rettxdb`. Moving them is a separate decision.
- **There is a new build output to maintain:** the form definition and its
  caregiver wording in each supported language.
- **The API stops hard-coding these fields.** It validates against a
  definition, and shows the definition version on every answer.
- **The two apps need one SurveyJS major version.** They are on different ones
  today.
- **Collection needs a lawful basis.** For the patient profile, the existing
  registry consent covers it: health data, medical history and genetic
  information, Article 9(2)(a). Each later part of the dataset must confirm
  its own coverage before collection starts (constitution II).
- **The dataset repo grows.** It now owns caregiver wording, translations,
  their approvals and change records, not only clinical meaning.

## Alternatives considered

- **Extend the patient record.** Rejected. It mixes health history with
  identity, conflicts with the identity lock, and widens what anyone with
  patient access sees.
- **A new container in `rettxdb`.** Not available because of the container
  ceiling (ADR 0013). It would also put registry data next to identity data.
- **A separate database account.** It gives stronger isolation: separate keys,
  network rules and backups. It is not needed while one API is the only reader.
  Revisit it if research or federated access needs a hard boundary.
- **Model the profile as Pulse entries.** Rejected. These are one-off facts,
  not repeated observations.
- **Model the profile as a survey campaign.** Rejected. Campaigns have dates
  and assignments and store untyped answers. The profile is permanent,
  resumable and coded.
- **Hand-coded forms in each app.** Rejected. They drift from the dataset and
  from each other with every WG6 change.
- **Other renderers.**
  - Form libraries driven by JSON Schema are weaker on questionnaire flow and
    multilingual wording.
  - FHIR Questionnaire renderers are the clinical interoperability standard,
    but heavier, with a smaller Angular ecosystem.
  - Custom forms would rebuild what SurveyJS already does.

  None justifies switching. A generated definition keeps FHIR open as an extra
  output.
- **AI-only conversational capture.** Rejected as the primary path. A registry
  needs coded, confirmed answers. AI assists the form; it does not replace it.

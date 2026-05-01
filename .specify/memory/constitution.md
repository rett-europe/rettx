<!--
═══════════════════════════════════════════════════════════════════════════════
SYNC IMPACT REPORT
═══════════════════════════════════════════════════════════════════════════════
Version Change: Initial → 1.0.0
Action: Establish program-level constitution for the rettX patient registry,
        sitting above the per-repo technical constitutions in rettxweb,
        rettxadmin, and rettxapi.
New principles added: 8 program principles
New sections added:
  - Cross-Repository Conventions
  - Spec & Issue Flow
  - Governance
Templates Status:
  ⚠️ specs/template/* - Authored alongside this constitution
Follow-up TODOs:
  - Link back from each downstream repo's constitution to this document
  - Reconcile any conflicts surfaced as downstream repos cite this version
═══════════════════════════════════════════════════════════════════════════════
-->

# rettX Program Constitution

This is the **program-level** constitution for the rettX patient registry.
It sits above — and is referenced by — the technical constitutions of each
ecosystem repository:

- **Surfaces**: `rettxweb`, `rettxadmin`
- **Backend**: `rettxapi`
- **Libraries**: `rettxmutation`, `rettxid`

The same principles bind all of them. Lifecycle and deployment model
differ — see [`patterns.md`](./patterns.md) for the per-category
conventions.

When a downstream technical constitution conflicts with this document, the
program constitution prevails for matters of **mission, ethics, privacy,
transparency, accessibility, and cross-repository conventions**. Downstream
constitutions remain authoritative for their stack-specific technical
choices.

## Mission

rettX exists to support people living with Rett Syndrome and their families
across Europe by providing a trustworthy, patient-centred registry that:

- empowers caregivers and patients to maintain a longitudinal medical record
  they understand and control;
- gives clinicians and authorised researchers structured, consented access
  to data that can advance care and research;
- operates as a non-profit, transparent initiative aligned with the goals of
  Rett Syndrome Europe.

Every feature, decision, and trade-off MUST be evaluated against this
mission first.

## Core Principles

### I. Patients & caregivers come first (NON-NEGOTIABLE)

The primary user of rettX is the family living with Rett Syndrome. Every
design decision MUST be evaluated by what it does for them:

- Caregivers OWN their data; the registry is custodian, not owner.
- Burden on caregivers MUST be minimised — short, clear flows, no
  unnecessary fields, no dark patterns.
- Withdrawal and data export MUST be possible at any time, without
  retaliation or degradation of service.
- Communications and UI MUST be available in the patient's language
  whenever feasible.

**Rationale**: The registry only earns its mandate by serving the
community. Anything that degrades caregiver experience for institutional
convenience is a violation of this principle.

### II. Privacy by design (NON-NEGOTIABLE)

rettX handles special-category personal data under GDPR. Privacy is not a
feature; it is a foundation.

- Data minimization: collect only what is justified by a documented
  registry purpose.
- Lawful basis: every data category MUST have a documented lawful basis,
  reviewed before collection begins.
- Explicit, informed consent for clinical and research use; consent MUST be
  withdrawable.
- Purpose limitation: data collected for one purpose MUST NOT be reused for
  another without renewed consent or a re-evaluated lawful basis.
- Pseudonymisation by default for any export, analytics, or research view;
  re-identification MUST require explicit authorisation and audit trail.
- Storage residency in the EU/EEA unless an equivalent safeguard is
  documented.
- Right to access, rectification, erasure, restriction, portability, and
  objection MUST be operationally supported, not just legally claimed.

**Rationale**: Trust, once broken in a patient registry, cannot be rebuilt.
GDPR compliance is a floor, not a ceiling.

### III. Transparency above all (NON-NEGOTIABLE)

rettX is built in the open. The community we serve MUST be able to inspect
how it works.

- Source code, specs, ADRs, and the public documentation site are public.
- Architectural decisions are documented as ADRs in `docs/adr/`.
- Data flows, retention policies, and processor relationships are
  published on the docs site and kept current.
- Changes that affect patient data handling MUST be summarised in
  patient-readable language on the public docs site, not only in commit
  history.
- Automated agents (e.g. **Iris**) act under named GitHub identities so
  every action is publicly attributable.

**Rationale**: Transparency is the operational manifestation of trust. A
patient registry that cannot show its work has not earned its position.

### IV. Clinical accuracy and accountability

rettX is not a medical device, and it does not diagnose. But the data it
records and presents directly informs clinical decisions.

- Clinical content (questionnaires, scales, terminology) MUST be reviewed
  by the appropriate clinical advisors before release.
- Standardised terminologies (HPO, ICD-10, SNOMED CT, LOINC) MUST be used
  for medical concepts wherever an equivalent exists.
- Genetic data presentation MUST follow the conventions of the relevant
  clinical communities (HGVS for variants, etc.).
- Data provenance — who entered, who validated, when, against what version
  of the schema — MUST be preserved.
- Where rettX presents derived or inferred information, the inference MUST
  be visibly labelled as such and the source of the inference recorded.

**Rationale**: Wrong data is worse than no data when clinicians act on it.

### V. Accessibility and inclusion

rettX serves a community that includes people with significant motor and
communication differences, and caregivers under heavy load.

- Target compliance: **WCAG 2.2 AA** for all caregiver- and patient-facing
  surfaces.
- Designs MUST be tested with assistive technologies (screen readers,
  keyboard-only, high-contrast, reduced motion).
- Cognitive accessibility (plain language, predictable navigation, error
  forgiveness) is a first-class requirement, not an afterthought.
- Multilingual support is mandatory for caregiver-facing flows; the catalog
  of supported languages is defined in
  [`patterns.md`](./patterns.md).
- New caregiver-facing features MUST ship with translations for the
  supported language set, with documented fallback to English when a
  translation is missing.

**Rationale**: A registry inaccessible to a portion of the Rett community
fails the community.

### VI. Security baseline

Security failures in a patient registry are existential. The baseline is
not optional.

- Authentication: Identity is established via federated providers
  (currently Auth0 for caregivers; Microsoft Entra ID / MSAL for
  administrative and clinical surfaces). Bearer tokens MUST be short-lived
  with refresh.
- Authorization: Every data-bearing endpoint MUST enforce permission checks
  server-side; UI gating is a usability nicety, not a security control.
- Secrets MUST live in Azure Key Vault (or equivalent managed secret
  store) — never in source, environment files, or build artifacts.
- All inter-service traffic and all client traffic MUST be TLS-encrypted.
- Logs MUST NOT contain PII; correlation MUST use opaque identifiers.
- Critical operations on patient data (read, create, update, delete,
  export) MUST be auditable with timestamp, actor, and outcome.
- A documented incident response process MUST exist before public launch
  and be reviewed at least annually.

**Rationale**: The threat model for a patient registry includes targeted
attackers, not just opportunistic ones.

### VII. Open by default, private only when justified

rettX prefers transparency, but recognises that some artefacts cannot be
public.

- Public by default: code, specs, ADRs, public docs, and operational
  workflow definitions.
- Private when justified: detailed threat models, infrastructure
  credentials, partner contracts, sensitive personal data, security
  incident details prior to remediation.
- The decision to keep something private MUST be documented (rationale,
  reviewer, expected revisit date) — privacy is not a default; it is a
  considered exception.

**Current state**: this control-plane repo and the reusable libraries
(`rettxmutation`, `rettxid`) are public. The surface and backend
repositories (`rettxweb`, `rettxadmin`, `rettxapi`) are currently
private — a deliberate position reflecting the registry's risk posture
for code that directly handles patient data. This position is intended
to be revisited as the project matures, in line with this principle.

**Rationale**: The bias toward openness is what makes the project credible.
Each closed door requires a reason that holds up to scrutiny.

### VIII. Sustainability and stewardship

rettX is a long-lived community asset. Decisions today MUST not impose
unsustainable cost on future maintainers.

- Prefer boring, well-supported technology over novelty.
- Minimise vendor lock-in for data: any patient data export MUST be in an
  open, documented format.
- Costs of operation (cloud, third-party services) MUST be tracked and
  reviewed; a runaway-cost change MUST trigger a review.
- Knowledge MUST live in the repos, not in the heads of individuals;
  AGENTS.md, ADRs, and the public docs site are the durable medium.

**Rationale**: A registry is only useful if it still works in ten years.

## Cross-Repository Conventions

These conventions bind all four repositories together. They are
elaborated and kept current in [`patterns.md`](./patterns.md).

- **Shared vocabulary**: domain concepts (Patient, Caregiver, Mutation,
  ConsentDocument, etc.) have a single canonical definition. Renames are
  coordinated across repos via a cross-cutting spec.
- **API contract ownership**: the canonical API contract is owned by
  `rettxapi` and published at https://rettx.azurewebsites.net/docs.
  Frontends consume; they do not invent endpoints. Breaking contract
  changes MUST be coordinated through a cross-cutting spec.
- **Breaking-change policy**: a change is "breaking" if it forces a
  coordinated release across repos. Breaking changes require a
  cross-cutting spec, an ADR, and a migration plan documented on the
  public docs site.
- **Issue routing labels** (set by Iris): `route:web`, `route:admin`,
  `route:api`, `route:mutation`, `route:id`, `cross-cutting`, plus state
  labels `needs-triage`, `triaged`, `routed`. Downstream issues created
  by the fanout carry the label `squad` so each repo's automation can
  pick them up.
- **Identity attribution**: automated actions across the ecosystem repos
  run under the `rettx-iris[bot]` GitHub App identity. Human actions run
  as the human's own account.

## Spec & Issue Flow

Cross-cutting specifications are authored in this repository under
`/specs/`, following the spec-kit workflow:

```
specify (here)  →  plan (here)  →  tasks (here)
                                       │
                                       ▼
                          fanout to downstream repos
                                       │
                                       ▼
                  plan / tasks / implement (downstream)
```

Single-repo work that does not require coordinated change MAY originate as
an issue in this repo (gets routed) or in the affected downstream repo
directly. The downstream repo's own constitution governs its execution.

**Iris** (the intake bot) classifies new issues here, applies routing
labels, and proposes a routing recommendation. Routing is committed only
when a maintainer (with `write` permission or higher) comments
`/route confirm` on the issue.

## Governance

### Authority

This program constitution supersedes downstream technical constitutions on
matters of mission, ethics, privacy, transparency, accessibility, and
cross-repository conventions. Downstream constitutions are authoritative
for stack-specific technical principles within their own scope.

### Amendment process

1. Amendments are proposed via PR to this file with a clear rationale and
   an impact analysis on downstream constitutions.
2. Amendments touching the NON-NEGOTIABLE principles (I, II, III) require
   explicit ratification by the project maintainers and a public note on
   the docs site.
3. Version is bumped per semantic versioning:
   - **MAJOR**: removal or material weakening of a NON-NEGOTIABLE
     principle, or a structural redefinition.
   - **MINOR**: new principle added, material expansion of an existing
     principle, or new cross-repo convention.
   - **PATCH**: clarifications, wording, non-semantic edits.
4. The Sync Impact Report at the top of this document MUST be updated.
5. Downstream constitutions SHOULD be reviewed for re-alignment within a
   reasonable window after a MAJOR or MINOR change.

### Compliance

- Cross-cutting specs MUST include a Constitution Check against the
  applicable principles in this document.
- Pull requests in any of the four repos that introduce a new pattern at
  the boundary between repos (API contract, identity, data export, etc.)
  MUST cite the relevant principle here.
- Violations MUST be either justified and documented in the relevant
  spec/ADR, or corrected.

### Living document

This constitution evolves with the project. Maintainers SHOULD review it
at least annually and after any major incident or scope change.

**Version**: 1.0.0 | **Ratified**: 2026-05-01 | **Last Amended**: 2026-05-01

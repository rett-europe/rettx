<!--
  Frontmatter below is machine-read by .github/workflows/spec-fanout.yml
  when this spec is merged into main. The `fanout` array drives which
  downstream repos get a `[spec/<slug>] <title>` issue with the `squad`
  label. Set `status: ready` when this spec should fan out on merge —
  drafts will not.

  Allowed fanout repos: rettxweb, rettxadmin, rettxapi, rettxmutation,
  rettxid.
-->
---
spec_id: "001"
slug: "security-deep-dive"
title: "Security & privacy posture review"
status: ready   # draft | ready | accepted | superseded
authored: "2026-05-01"
author: "perocha"
fanout:
  - repo: rettxweb
    summary: |
      Publish `SECURITY.md` at the repo root answering the canonical
      questionnaire (see "Canonical questionnaire" in the spec) as it
      applies to the caregiver-facing web app: session handling,
      authN/authZ flows, what is rendered client-side vs fetched, what
      lands in the browser (storage, cookies, telemetry), CSP and
      security headers, transport posture, dependency / SCA posture,
      and how a vulnerability report should reach the maintainers.
      Where a section does not apply, mark it "Not applicable" with a
      one-line reason. Link the resulting `SECURITY.md` from this issue
      when merged so the rettx aggregate can cite it.
  - repo: rettxadmin
    summary: |
      Publish `SECURITY.md` at the repo root answering the canonical
      questionnaire as it applies to the admin web app: who can sign in
      and how, what privileged actions are gated, what audit trail is
      written and where, blast radius of a compromised admin session,
      transport posture, dependency / SCA posture, and the
      vulnerability disclosure path. Mark inapplicable sections with a
      one-line reason. Link the resulting `SECURITY.md` from this issue
      when merged.
  - repo: rettxapi
    summary: |
      Publish `SECURITY.md` at the repo root answering the canonical
      questionnaire as it applies to the API + data-store tier — this
      is expected to be the most detailed answer in the program because
      the API holds patient data. Cover: authN/authZ surfaces,
      pseudonymisation / encryption at rest, encryption in transit,
      key & secret management, audit-log destination + retention, the
      lawful basis under GDPR for each category of stored data, the
      data-subject-rights workflow (access, rectification, erasure,
      portability), dependency / SCA posture, backup posture, and the
      incident-response runbook. Mark inapplicable sections with a
      one-line reason. Link the resulting `SECURITY.md` from this issue
      when merged.
  - repo: rettxmutation
    summary: |
      Publish `SECURITY.md` at the repo root answering the canonical
      questionnaire as it applies to the mutation / data-pipeline
      service: which inputs it ingests, which outputs it writes,
      whether any patient-identifying data crosses its boundary, how
      it authenticates upstream and downstream, secret-handling for
      any external clinical-knowledge sources, dependency posture, and
      the incident-response path. Mark inapplicable sections with a
      one-line reason. Link the resulting `SECURITY.md` from this issue
      when merged.
  - repo: rettxid
    summary: |
      Publish `SECURITY.md` at the repo root answering the canonical
      questionnaire as it applies to the identity component: which
      authN protocols it implements, token / session shape and
      lifetime, how identifiers map (or do not map) to natural
      persons, key & secret handling, account-recovery and abuse
      paths, audit posture, dependency posture, and the
      incident-response path. Mark inapplicable sections with a
      one-line reason. Link the resulting `SECURITY.md` from this
      issue when merged.
---

# Feature Specification: Security & privacy posture review

**Feature Branch**: `001-security-deep-dive`  
**Created**: 2026-05-01  
**Status**: Draft  
**Input**: User description: "Security & privacy posture review across all repos: collect each repo's stance on authN/Z, data at rest & in transit, secrets handling, audit logging, GDPR, dependency / SCA, and incident response. Each repo should answer the same questionnaire so we can aggregate into architecture/security.md with mermaid trust-boundary, data-flow, and secret-flow diagrams."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A reader can find the program's full security posture in one place (Priority: P1)

A first-time visitor to the public docs site — a partner clinician,
a prospective patient family, an auditor, a security-conscious
contributor — wants to understand "how is patient data protected
across this system?" in a single read, without having to browse five
separate repositories.

**Why this priority**: This is the central deliverable of the spec
and the primary mechanism by which the program honours
constitution principles II (Privacy by design), III (Transparency
above all), and VI (Security baseline). Without it, the rest of the
work has no shop window.

**Independent Test**: Open `docs.rettx.eu/architecture/security` in
a fresh browser. The page loads and contains: (a) a one-paragraph
summary of the program's security model, (b) three mermaid diagrams
(trust boundaries, data flow, secret flow), (c) a per-repo section
linking to that repo's `SECURITY.md`, and (d) a section restating
the constitution principles this page answers to. Reading the page
end to end takes a knowledgeable visitor under ten minutes.

**Acceptance Scenarios**:

1. **Given** a public, unauthenticated visitor, **When** they open
   the security page on the docs site, **Then** they can read every
   relevant detail without hitting an authentication wall, a broken
   link, or a "TODO".
2. **Given** an auditor verifying GDPR compliance, **When** they
   read the page, **Then** they can determine for each category of
   personal data: where it is stored, the lawful basis, the
   retention rule, and the data-subject-rights workflow.
3. **Given** a maintainer answering a security question on social
   media or email, **When** they want to point the asker at an
   authoritative source, **Then** a single URL on `docs.rettx.eu`
   covers it.

---

### User Story 2 - Each repo declares its own posture in a place its squad can keep current (Priority: P1)

Each downstream repo squad — rettxweb, rettxadmin, rettxapi,
rettxmutation, rettxid — owns a `SECURITY.md` at the root of their
own repository. The aggregate page on `docs.rettx.eu` cites that
file. When a squad changes anything that materially affects their
security posture, they update their own `SECURITY.md` in the same PR
that introduces the change, and an aggregate-side review picks it
up.

**Why this priority**: Centralising the answers in a single
hand-edited document on rettx would rot fast — the people closest
to the change are in the downstream repos. Putting the source of
truth next to the code is the only way the answers stay accurate.

**Independent Test**: Open each downstream repo on GitHub. Each one
displays a `SECURITY.md` link in the repository sidebar. Each file
follows the same canonical questionnaire structure (same eight
sections, same headings) and answers each question, marking
inapplicable sections explicitly with a one-line reason rather than
leaving them blank. The aggregate page on rettx links to each of
those files at a stable URL.

**Acceptance Scenarios**:

1. **Given** a contributor opens any of the five downstream repos,
   **When** they look for the security policy, **Then** GitHub's
   built-in "Security" tab surfaces the `SECURITY.md` and renders
   it.
2. **Given** a squad lands a change that alters a previously
   declared security property (e.g., adds a new third-party
   dependency that processes personal data), **When** the PR is
   reviewed, **Then** the reviewer can verify the matching section
   of `SECURITY.md` was updated in the same PR.
3. **Given** the program adds a new repo later, **When** the
   maintainers run this same questionnaire on it, **Then** the
   structure (eight sections, same headings, same questions) is
   reusable verbatim.

---

### User Story 3 - The questionnaire becomes the template for future cross-cutting governance reviews (Priority: P2)

Future cross-cutting reviews — accessibility audit, clinical
accuracy audit, sustainability review — should follow the same
shape as this one: a single rettx spec defines the questionnaire,
each downstream repo answers it in a structured file, and the
aggregate lives on the docs site with diagrams where useful.

**Why this priority**: Establishing the pattern correctly here
saves repeated debate later. It is genuinely valuable but only
materialises on the second use.

**Independent Test**: A second cross-cutting governance spec
authored later (e.g., `accessibility-deep-dive`) reuses the same
mechanics: spec authored on rettx with `fanout:` frontmatter, Iris
fans out a `squad` issue per affected repo, each repo publishes a
canonical answer file at a known root path, rettx aggregates into
a docs page. No new infrastructure is invented.

**Acceptance Scenarios**:

1. **Given** the maintainers want to start a second cross-cutting
   review, **When** they look for a precedent, **Then** this spec
   and its aggregate page serve as the template.
2. **Given** a future contributor is unsure where a cross-cutting
   topic should live, **When** they read the docs site, **Then**
   the answer is "in a sibling page next to security".

---

### Edge Cases

- A repo legitimately has nothing to say in a section (e.g.,
  rettxmutation never touches PII): the section MUST be present,
  with a one-line "Not applicable — <reason>" answer, never
  silently omitted.
- Two repos give contradictory answers to the same question (e.g.,
  different lawful-basis claims for the same category of data):
  the aggregate page MUST surface the contradiction, and a
  follow-up issue MUST be opened on rettx to resolve it before the
  aggregate is marked complete.
- A repo's `SECURITY.md` link rots after a refactor: the aggregate
  links MUST point at a stable path (`<repo>/blob/main/SECURITY.md`),
  not a commit-pinned URL, so the aggregate doesn't need to be
  re-rendered when the file is amended.
- A maintainer wants to publish a redacted version of an internal
  security detail (e.g., the on-call rotation): redaction MUST be
  applied at the source `SECURITY.md`, not by selectively quoting
  it on the aggregate page, so the public and internal pictures
  cannot drift.
- The aggregate page is consulted before any repo has published
  its file: the page MUST ship even partially populated, with
  explicit "pending squad answer" placeholders linking to the
  fan-out issue, rather than 404-ing.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Each of the five downstream repos (rettxweb,
  rettxadmin, rettxapi, rettxmutation, rettxid) MUST publish a
  `SECURITY.md` at its repository root.
- **FR-002**: Every published `SECURITY.md` MUST follow the
  canonical questionnaire defined below — the same eight section
  headings, in the same order, even when a section reduces to "Not
  applicable" with a one-line reason.
- **FR-003**: The control-plane repo (rettx) MUST publish an
  aggregate page at `site/src/content/docs/architecture/security.md`
  that renders publicly at `docs.rettx.eu/architecture/security`.
- **FR-004**: The aggregate page MUST contain three mermaid
  diagrams: a trust-boundary diagram, a data-flow diagram showing
  where personal data lives and crosses boundaries, and a secret-flow
  diagram showing where credentials and signing material originate
  and travel.
- **FR-005**: The aggregate page MUST link to each downstream
  `SECURITY.md` at a stable, branch-tracking URL (not a commit-pinned
  URL).
- **FR-006**: The aggregate page MUST cross-reference each
  constitution principle that bears on security (II Privacy by
  design, III Transparency above all, VI Security baseline) to the
  paragraph(s) that satisfy it.
- **FR-007**: The aggregate page MUST publish a single
  vulnerability-disclosure contact path that applies to the whole
  program, and each downstream `SECURITY.md` MUST defer to it
  rather than inventing its own per repo.
- **FR-008**: When any downstream `SECURITY.md` materially
  changes, the squad responsible MUST flag the change in the PR
  description so the rettx aggregate page is reviewed in the same
  iteration.
- **FR-009**: Each `SECURITY.md` MUST identify which sections of
  itself are reviewed during incident response and which during
  routine periodic review, so a maintainer reading it knows which
  parts are "load-bearing" in an incident.
- **FR-010**: **Public / internal split.** The aggregate page on
  the public rettx repo (and its rendering on `docs.rettx.eu`) MUST
  describe **controls in place** only — what the program does to
  protect the data. Improvement areas, unmitigated risks, scanner
  findings, threat-model details that hand an attacker a roadmap, and
  remediation backlog MUST NOT appear there. Each downstream repo is
  currently private and MAY (and SHOULD) record its own gap analysis
  in its `SECURITY.md` or an adjacent file; the rettx aggregate
  references those repos but does not inline the gap content.
  Constitution Principle VII (Open by default, private only when
  justified) is the governing rule.
- **FR-010**: All inapplicable answers MUST carry a one-line
  rationale ("Not applicable — this service handles no
  patient-identifying data") rather than being blank or omitted.

#### Canonical questionnaire

Each downstream `SECURITY.md` MUST answer the following sections,
in this order, with these exact headings:

1. **Authentication & authorisation** — who can do what, how is it
   verified, where is the source of truth, what happens on failure,
   what is the blast radius of a compromised credential.
2. **Data at rest** — what categories of data are stored, where,
   under what protection (encryption, pseudonymisation,
   tokenisation), with what retention rule.
3. **Data in transit** — what flows between this component and any
   other, under what transport protection, with what authentication
   on each end.
4. **Secrets & key management** — what credentials does this
   component hold, where do they originate, how are they rotated,
   who has access, where do they appear in logs (and how is that
   prevented).
5. **Audit logging** — what security-relevant events are recorded,
   where they are stored, with what retention, who can read them,
   how integrity is preserved.
6. **GDPR & lawful basis** — for each category of personal data
   the component touches: lawful basis (Art. 6), special-category
   basis (Art. 9) if applicable, retention period, the
   data-subject-rights workflow (access, rectification, erasure,
   portability, objection), and the data-controller / processor
   relationship.
7. **Dependencies & supply chain (SCA)** — how third-party
   dependencies are tracked, how vulnerabilities are surfaced
   (e.g., Dependabot), how upgrades are decided, and the policy on
   pinning vs. ranges.
8. **Incident response** — who is on point, how an incident is
   reported (program-wide channel), the immediate-response runbook,
   the breach-notification path, and the post-incident review
   policy.

### Key Entities *(include if feature involves data)*

- **Repo Security Posture** — one per downstream repo, expressed
  as a `SECURITY.md` file at the repo root, structured by the
  eight canonical questionnaire sections. Owned by that repo's
  squad. Living document; changes alongside the code.
- **Aggregate Security View** — a single page on the public docs
  site at `architecture/security`. Owned by rettx maintainers.
  Cites each repo's posture; renders the three mermaid diagrams;
  cross-references the constitution.
- **Vulnerability disclosure contact** — single program-wide path
  for security reports, declared once on the aggregate page and
  referenced (not duplicated) from each `SECURITY.md`.
- **Trust boundary** — a labelled edge in the diagrams between two
  components or actors with different security postures. The
  enumeration of these boundaries is itself part of the spec
  output, since it is what allows the data-flow and secret-flow
  diagrams to be coloured consistently.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All five downstream repos have a `SECURITY.md` at
  the repo root answering the eight canonical sections, with no
  blank or omitted sections, before this spec is closed.
- **SC-002**: A reader who has never seen the project before can
  answer "where does patient-identifying data live, and under
  which lawful basis?" in under two minutes from the aggregate
  page alone.
- **SC-003**: 100% of constitution principles II, III, and VI
  have a numbered cross-reference to a section of the aggregate
  page that addresses them.
- **SC-004**: Every link in the aggregate page resolves (no 404,
  no rotted anchor) when checked at the time of merge and at any
  later weekly link-check.
- **SC-005**: The next cross-cutting governance spec authored on
  rettx reuses the structure of this one (single program
  questionnaire, per-repo answer file, aggregate page with
  diagrams) without inventing new mechanics.
- **SC-006**: When a downstream squad changes a security-relevant
  property and updates their `SECURITY.md` in the same PR, the
  aggregate page can be brought back into agreement with a single
  follow-up edit on rettx — no structural rework required.

## Assumptions

- Each downstream repo will host its security policy at the
  repository root as `SECURITY.md` (rather than under `.github/`),
  to maximise discoverability for unauthenticated readers — this
  matches the program's transparency-above-all principle and is
  also where GitHub's built-in security UI surfaces the file most
  prominently.
- The aggregate page is published openly on `docs.rettx.eu`. No
  redactions are applied at the aggregate layer; if a fact is too
  sensitive to publish, the corresponding `SECURITY.md` omits it
  with an explicit "withheld for operational security" note rather
  than the aggregate selectively quoting around it.
- The questionnaire is authored once in this spec and treated as
  immutable for the duration of this fanout. If a future round
  adds or removes sections, that change is itself a new spec.
- Personal data within scope of GDPR is held primarily by the API
  tier; other repos are expected to mark most of section 6 as
  "Not applicable" with a one-line reason, rather than silently
  omitting it.
- The program already operates a vulnerability-disclosure path
  (e.g., a security email alias). This spec consolidates and
  publishes it; it does not invent it.
- The aggregate page lives next to `architecture/overview` on the
  docs site, in the same information-architecture slot, so a
  reader who has found one will find the other.
- This spec deliberately fans out to all five downstream repos,
  including ones where many sections will be "Not applicable",
  because the value of having a uniform shape across the program
  outweighs the small cost of writing those one-line rationales.

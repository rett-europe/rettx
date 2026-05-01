<!--
  Frontmatter below is machine-read by .github/workflows/spec-fanout.yml
  when this spec is merged. The `fanout` array drives which downstream
  repos get an issue, and what each one owns. Delete entries that don't
  apply.
-->
---
spec_id: NNNN
slug: short-slug
title: <Concise feature name>
status: draft   # draft | ready | accepted | superseded
authored: YYYY-MM-DD
author: <github-handle>
fanout:
  - repo: rettxweb
    summary: |
      One-paragraph description of what rettxweb owns for this spec.
  - repo: rettxadmin
    summary: |
      One-paragraph description of what rettxadmin owns for this spec.
  - repo: rettxapi
    summary: |
      One-paragraph description of what rettxapi owns for this spec.
  - repo: rettxmutation
    summary: |
      Drop this entry if rettxmutation is not affected.
  - repo: rettxid
    summary: |
      Drop this entry if rettxid is not affected.
---

# Spec: <Concise feature name>

> **Spec ID**: NNNN  ·  **Status**: draft / accepted / superseded
> **Authored**: YYYY-MM-DD  ·  **Author**: <github handle>
> **Affects repos**: `rettxweb` / `rettxadmin` / `rettxapi` (delete those that don't apply)

## 1. Problem

What user / caregiver / clinician problem does this address? Avoid
prescribing a solution here. State the *why* in plain language.

## 2. Who benefits

Caregivers? Patients? Clinicians? Admins? The registry as a whole?
Be specific.

## 3. Proposal

A high-level description of the change. Keep it surface-agnostic where
possible — the technical plan goes in `plan.md`.

### In scope
- ...

### Out of scope
- ...

## 4. User stories / acceptance criteria

Independently deliverable user stories, prioritized.

- **P1** — As a <role>, I want <capability>, so that <outcome>.
  - [ ] Acceptance criterion 1
  - [ ] Acceptance criterion 2
- **P2** — ...

## 5. Privacy & data impact

- New data collected? If so, what, why, and under which lawful basis?
- Changes to retention, export, or pseudonymisation?
- Caregiver-visible privacy implications (must be reflected on the public
  docs site if non-trivial).

## 6. Accessibility & i18n impact

- New caregiver-facing strings? They must be translated to the supported
  language set.
- Any change to keyboard / screen-reader / cognitive accessibility?

## 7. Constitution check

Cite which program-level principles in
[`.specify/memory/constitution.md`](../../.specify/memory/constitution.md)
this spec touches. Note any tension with NON-NEGOTIABLE principles
(I, II, III) and how it is resolved.

- [ ] I. Patients & caregivers come first
- [ ] II. Privacy by design
- [ ] III. Transparency above all
- [ ] IV. Clinical accuracy
- [ ] V. Accessibility and inclusion
- [ ] VI. Security baseline
- [ ] VII. Open by default
- [ ] VIII. Sustainability

## 8. Open questions

- ...

---
title: Development specifications
description: Cross-cutting specifications that drive new work in the rettX ecosystem.
sidebar:
  order: 1
---

A **specification** describes a change that affects more than one
repository in the rettX ecosystem. Specs are the unit of planning
above any single repository.

## Where specs live

Specifications live in this repository, one folder per spec, named
`NNNN-slug/`. Each spec folder contains:

- `spec.md` — the **what** and the **why**, including a
  constitution check.
- `plan.md` — the **how**, broken down by repository.
- `tasks.md` — the **work**, grouped by target repository so it can
  be fanned out into tracked issues on merge.

## How a spec gets written

1. Someone opens a **Spec proposal** issue in `rettx` describing the
   problem.
2. A maintainer triages it and decides whether it needs a full spec
   or a smaller fix in a single downstream repo.
3. If a full spec is needed, a draft PR is opened adding a new folder
   under `specs/`.
4. The draft is iterated on until it passes the constitution check.
   Stakeholders for each affected repository review their slice.
5. When a spec marked **ready** or **accepted** is merged, the
   **spec-fanout** automation creates linked issues in each
   target repository with the `squad` label, where the work is
   actually executed.

## Templates

The specification template is at
[`.specify/templates/spec-template.md`](https://github.com/rett-europe/rettx/blob/main/.specify/templates/spec-template.md).
Copy them, don't symlink them.

## Specifications are not a feature catalogue

Specifications include drafts and planned work as well as accepted
requirements.
A merged specification does not mean that its feature is publicly
available. For current and planned access, see [who rettX is for](/product/personas/).

---
title: Development principles
description: The program constitution that guides rettX's software development.
sidebar:
  order: 1
---

rettX's software development is guided by a **program constitution**
that applies to every repository in the ecosystem. This is development
governance, not the registry's patient data governance framework. It does
not define approval of research access or replace consent and data-sharing
policies.

The full versioned text lives in
the source tree at
[`.specify/memory/constitution.md`](https://github.com/rett-europe/rettx/blob/main/.specify/memory/constitution.md);
this page summarises the principles for readers who want a quick
orientation.

The constitution exists because rettX is a **distributed system
operated by volunteers and small teams**, and we cannot rely on
shared tribal knowledge to keep things consistent or safe. The
constitution is the source of shared knowledge.

## Why a constitution?

Three reasons:

1. **Patient safety and dignity** are not a feature; they are the
   floor. Codifying that in writing makes it harder to compromise
   them under deadline pressure.
2. **Multiple repositories, one program.** Seven repositories that
   evolve independently still need to behave like one product to the
   people we serve.
3. **Continuity.** Volunteers and contributors come and go. A written
   constitution is how the project's values survive contributor
   turnover.

## The principles

The constitution defines **eight principles**. Three are flagged
NON-NEGOTIABLE — they cannot be relaxed by any individual change:

| # | Principle | Status |
|---|---|---|
| I | Patients & caregivers come first | NON-NEGOTIABLE |
| II | Privacy by design | NON-NEGOTIABLE |
| III | Transparency above all | NON-NEGOTIABLE |
| IV | Clinical accuracy and accountability | Required |
| V | Accessibility and inclusion | Required |
| VI | Security baseline | Required |
| VII | Open by default, private only when justified | Required |
| VIII | Sustainability and stewardship | Required |

These are development commitments, not a claim that every planned
registry capability is already available. Read the full text for each principle in the
[constitution itself](https://github.com/rett-europe/rettx/blob/main/.specify/memory/constitution.md).

## Constitution checks

Every cross-cutting specification includes a **Constitution check**
section. If a proposal cannot pass the check, it is rewritten or
abandoned — not approved with caveats. This is what makes the
constitution operational rather than aspirational.

## Versioning

The constitution is **semver-versioned**. A change is:

- **Major** if it removes a principle, weakens a NON-NEGOTIABLE one,
  or otherwise breaks compatibility with existing specs.
- **Minor** if it adds a new principle or strengthens an existing one
  in a way that requires changes to in-flight specs.
- **Patch** for clarifications, typos, and editorial fixes.

The current version is recorded at the top of the constitution file.

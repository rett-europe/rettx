---
title: Program constitution
description: The principles that govern every rettX repository.
sidebar:
  order: 1
---

The rettX program is governed by a **constitution** that applies to
every repository in the ecosystem. The full versioned text lives in
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
2. **Multiple repositories, one program.** Six repositories that
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
| I | Patient-first by design | NON-NEGOTIABLE |
| II | Consent and lawful basis | NON-NEGOTIABLE |
| III | Privacy and minimal data | NON-NEGOTIABLE |
| IV | Specification-driven development | Strong |
| V | Test and verification discipline | Strong |
| VI | Observable in production | Strong |
| VII | Open by default for governance, closed by default for application code | Strong |
| VIII | Internationalisation as a first-class concern | Strong |

Read the full text for each principle in the
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

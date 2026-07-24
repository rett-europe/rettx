---
title: "ADR 0007 — AI code-review custom instructions across the ecosystem"
description: "AI code-review custom instructions across the ecosystem"
sidebar:
  order: 8
---

- **Status**: Accepted (2026-07-11)
- **Date**: 2026-07-11
- **Decision-makers**: rettX maintainers
- **Relates to**: [ADR 0001](https://github.com/rett-europe/rettx/blob/main/docs/adr/0001-control-plane-repo.md) (control plane &
  per-repo ownership), [`patterns.md` §10](https://github.com/rett-europe/rettx/blob/main/.specify/memory/patterns.md),
  [program constitution](https://github.com/rett-europe/rettx/blob/main/.specify/memory/constitution.md) (PHI / privacy
  non-negotiables), GitHub docs:
  [Adding repository custom instructions](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions)

## Context

We use **GitHub Copilot code review** on pull requests across the ecosystem
repos (recent examples: `rettxapi#311`, `rettxweb#181`). Copilot code review
consumes a repo's **custom instructions** when generating a review, so those
files are the lever for making automated review enforce *our* conventions
rather than only generic best practice.

GitHub supports three instruction types (per the docs above):

- **Repository-wide** — `.github/copilot-instructions.md`. Applies to every
  request in the repo, including code review.
- **Path-specific** — one or more `NAME.instructions.md` files under
  `.github/instructions/`, each with YAML frontmatter `applyTo: "<glob>"`.
  Applied when the reviewed file matches the glob; combined with the
  repo-wide file when both exist.
- **Agent** — `AGENTS.md` (or a single `CLAUDE.md` / `GEMINI.md`), used by AI
  coding agents rather than by code review.

For Copilot code review, the "use custom instructions" preference must be
enabled — it is **on by default**.

An audit of the seven ecosystem repos (`rettx`, `rettxweb`, `rettxadmin`,
`rettxapi`, `rettxmutation`, `rettxid`, `templates`) on 2026-07-11 found:

- **All seven already have** `.github/copilot-instructions.md` **and**
  `AGENTS.md`. The plumbing exists everywhere.
- **Content is uneven and mostly agent-/onboarding-oriented, not
  review-oriented.** Example: `rettxweb`'s file is Spec Kit auto-generated (a
  technology inventory, "Code Style: follow standard conventions", a recent-
  changes log) plus a large spec-drafting-mode block — almost nothing that
  tells a *reviewer* what to flag.
- **Where good review rules exist, they can be mis-encoded.** `rettxapi`'s file
  carries genuinely useful, enforceable rules (repository-layer exceptions,
  "do not modify source to make a test pass"), but it opens with
  `applyTo: "*.py"` frontmatter — which is only meaningful in a
  `.github/instructions/*.instructions.md` file and is inert in the repo-wide
  file.
- **No repo uses path-specific `.github/instructions/` files at all**, so the
  mechanism designed for "apply these rules when reviewing files of this kind"
  is unused.

Net: automated review quality varies per repo, and our house non-negotiables
(PHI/privacy, auth boundaries, i18n completeness, API-contract ownership, test
integrity) are not reliably enforced by the reviewer.

## Decision

Adopt an ecosystem-wide standard: **every repo maintains review-focused Copilot
custom instructions**, structured as follows.

1. **Repo-wide file is mandatory and must be review-oriented.**
   `.github/copilot-instructions.md` MUST contain a clearly-marked section of
   **enforceable review conventions** — statements a reviewer can check a diff
   against ("repository methods raise domain exceptions from `app.exceptions`,
   never `HTTPException`"), not a technology inventory or a changelog. The Spec
   Kit auto-generated block MAY remain, but the review conventions live in an
   explicit, human-owned section.

2. **Path-specific rules go in `.github/instructions/`, not the repo-wide
   file.** Language/area-scoped rules use
   `.github/instructions/<area>.instructions.md` with `applyTo:` frontmatter
   (e.g. `applyTo: "**/*.py"`). `applyTo:` MUST NOT appear in
   `copilot-instructions.md` (it is inert there) — fixing `rettxapi`'s current
   mis-placement is part of rollout.

3. **Content rules.** Keep files **concise** (long instructions get truncated
   and diluted). Prefer imperative, checkable rules. Cover the repo's own
   non-negotiables **plus** the cross-cutting constants every repo shares:
   **no PHI in code, logs, tests, or examples** (constitution); auth/trust
   boundaries; full supported-language set for user-facing strings
   (`patterns.md` §5); API-contract ownership (contracts live in `rettxapi`,
   consumers don't fork them — `patterns.md` §3); and test integrity (don't
   change source just to make a test pass). **Reference** the repo constitution
   and control-plane `patterns.md` rather than duplicating them, so there is a
   single source of truth.

4. **No divergence between instruction files.** Review conventions have one
   canonical home per repo (the repo-wide file and/or `.github/instructions/`).
   `AGENTS.md`/`CLAUDE.md` may point at it, but the same rule must not be
   maintained in two places with drift.

5. **Keep the setting on.** The "use custom instructions for Copilot code
   review" preference stays enabled (default). Rollout verifies this per repo/
   org.

This ADR sets the **standard and the control-plane template**; it does not by
itself rewrite the six downstream files — that is a fan-out (see Follow-ups),
executed per repo since each repo owns its own conventions and Copilot reads
each repo's files independently.

## Options considered

- **Option A — repo-wide file only (baseline).** A single strong
  `copilot-instructions.md` per repo. Simplest; sufficient for small/uniform
  repos.
- **Option B — repo-wide + path-specific (recommended target).** Repo-wide file
  for cross-file rules, plus `.github/instructions/*.instructions.md` where a
  repo has clear language/area splits (e.g. `rettxapi` Python rules, a web
  repo's `*.spec.ts` test rules). Best signal-to-noise for review.
- **Option C — centralize all conventions in the control plane.** Rejected:
  Copilot code review reads the **target repo's** files only; it cannot read
  another repo. Per-repo files are structurally required, so the control plane
  can define the standard and cross-cutting text but cannot host the operative
  files for other repos.

## Recommendation

Adopt **Option A as the floor everywhere** and **Option B where a repo has a
natural area split**. Concretely:

- Control plane publishes a short **skeleton** (`copilot-instructions.md`
  section headings + a starter set of cross-cutting rules) and records the
  standard in `patterns.md` §10.
- Each repo's file gains a **"Conventions Copilot must enforce in review"**
  section seeded from its constitution + `patterns.md`.
- `rettxapi` moves its `*.py` rules into
  `.github/instructions/python.instructions.md` (correct `applyTo:` home) and
  keeps cross-file rules in the repo-wide file.
- `rettxweb` gains real review conventions beyond the auto-generated tech list.

## Consequences

### Positive
- Automated review enforces house conventions (PHI, layering, contracts, i18n,
  test integrity), not just generic advice — consistently across repos.
- The `applyTo:` mechanism is used correctly, so path-scoped rules actually fire.
- One canonical home per rule reduces drift between agent and review guidance.

### Negative / cost
- Six downstream files to author/upgrade and then keep current as conventions
  evolve (bounded; each is small).
- Over-long or stale instructions can *hurt* review quality, so files must stay
  concise and be maintained.

### Neutral
- No change to runtime code or CI. Existing `AGENTS.md`/`CLAUDE.md` files stay;
  they are only cross-referenced, not deleted.

## Follow-ups (on acceptance)

- **Control plane (this PR)** — record the standard in `patterns.md` §10 and
  link this ADR. Optionally add a starter skeleton under `.specify/templates/`.
- **Fan-out (gated on maintainer go-ahead)** — a slice per downstream repo
  (`rettxweb`, `rettxapi`, `rettxadmin`, `rettxmutation`, `rettxid`,
  `templates`) to add/upgrade the review-focused section, and to introduce
  `.github/instructions/*.instructions.md` where Option B applies. Track under
  the cross-cutting routing process (`route:*` / `squad`).
- **`rettxapi`** — move the stray `applyTo: "*.py"` block from
  `copilot-instructions.md` into `.github/instructions/python.instructions.md`.
- **Settings** — confirm the Copilot code-review custom-instructions preference
  is enabled at the org/repo level.

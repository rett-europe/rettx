# Contributing to rettX

Thank you for your interest in helping the rettX patient registry.
This repository is the **engineering and governance hub** for rettX —
it is intentionally a small, prose-heavy repo. Most application code
lives in other repositories of the [`rett-europe`][org] organisation.

Before contributing, please read the
[Code of Conduct](./CODE_OF_CONDUCT.md). All participation in the
rettX community is bound by it.

[org]: https://github.com/rett-europe

## What this repository is for

`rett-europe/rettx` holds:

- The **program constitution** at `.specify/memory/constitution.md`
  (versioned, governs all six repositories).
- **Cross-cutting specifications** at `specs/` (anything that touches
  more than one repository in the ecosystem).
- **Architecture decision records** at `docs/adr/`.
- The **public engineering docs site** sources at `site/` (Astro
  Starlight, published to <https://docs.rettx.eu>).
- **Issue intake and routing** for the whole ecosystem (handled by the
  Iris bot — see [`docs/adr/0001-control-plane-repo.md`](./docs/adr/0001-control-plane-repo.md)).
- **Brand assets** at `assets/brand/`.

It does **not** hold application code. Caregiver app, admin app, API,
and library code each live in their own repository.

## How to contribute

### 1. Reporting a bug or asking a question

Open an issue using one of the [issue templates][templates]:

- **Bug** — something is wrong with rettX (any surface, any repo).
- **Spec proposal** — you'd like a new feature, change, or clarification.
- **Public question** — you have a question about rettX as a project
  (architecture, governance, scope).

All new issues are landed here first with the `needs-triage` label.
Iris (and a human gatekeeper with `write` permission or above) will
classify each issue and, when appropriate, route it to the right
downstream repository as a tracked sub-issue.

[templates]: https://github.com/rett-europe/rettx/issues/new/choose

### 2. Contributing to a specification

Cross-cutting specifications live under `specs/<NNNN>-<slug>/` and
follow the templates in `specs/template/`. The flow is:

1. Open a **Spec proposal** issue describing the problem and the
   intended outcome.
2. After triage and a constitution check, a maintainer (or you, with
   guidance) opens a draft PR adding `specs/<NNNN>-<slug>/spec.md`.
3. The spec is iterated on until it is "Ready". `plan.md` and
   `tasks.md` follow.
4. On merge, Iris fans the tasks out as issues in the relevant
   downstream repositories with the `squad` label, where the work is
   actually executed.

Please do not start writing code in a downstream repository for a
cross-cutting change before the spec here is at least at "Draft —
ready for review". This avoids wasted work.

### 3. Contributing to documentation or ADRs

- **Prose changes** (README, ADRs, the docs site, the constitution
  preamble) — open a PR directly. Constitution principle changes
  require a version bump and a sync impact note (see the constitution
  itself for the rules).
- **New ADRs** follow `docs/adr/0001-control-plane-repo.md` as a
  template. Use the next sequential number.
- **Docs site content** lives under `site/src/content/docs/` and is
  written in Markdown / MDX.

### 4. Contributing to the Iris bot or workflows

Workflow and script changes go in `.github/workflows/` and
`scripts/iris/`. Please open a PR with a short description of the
behaviour change. Test runs against a fork or a dry-run mode are
encouraged before requesting a review.

## Pull request expectations

- **Branching** — work on a feature branch, open a PR against `main`.
- **Commit messages** — short imperative subject, optional body. We
  do not enforce Conventional Commits in this repo, but readable
  history is appreciated.
- **PR description** — say what changed and why. Link the relevant
  issue or spec.
- **Sign-off** — none required.
- **Reviews** — a maintainer will review. Constitution and spec
  changes need an explicit `LGTM` from a maintainer.
- **CI** — once present, all checks must be green.

## Licensing and contribution terms

This repository uses **split licensing** (see [`NOTICE`](./NOTICE)):

- Code, workflows, scripts → **Apache-2.0** (`LICENSE`)
- Documentation, specs, ADRs, prose → **CC-BY-4.0** (`LICENSE-docs`)
- `rettX` name and brand assets → © Rett Syndrome Europe, not open-licensed

By submitting a contribution, you agree that your contribution is
licensed under the license that applies to the relevant part of the
repository, as described in [`NOTICE`](./NOTICE).

## Scope guard — please don't open issues here for…

To keep this repository focused, please **don't** open issues here
about:

- A bug in a single downstream repository when you can pinpoint it
  there. Open it directly in the relevant repository (`rettxweb`,
  `rettxadmin`, `rettxapi`, `rettxmutation`, `rettxid`).
- Patient-facing concerns about the WordPress site at
  <https://www.rettx.eu> — those go through the Rett Syndrome Europe
  contact channels.
- Questions about Rett Syndrome itself (medical, support, family
  resources). The maintainers of this repo are engineers and
  governance contributors, not clinicians.

When in doubt, open the issue here and we'll route it.

## Reporting a security issue

**Do not open a public issue for a suspected security vulnerability.**
See [`SECURITY.md`](./SECURITY.md) for the disclosure process.

## Maintainers

Day-to-day maintenance is led by Pedro Rocha (@perocha) on behalf of
Rett Syndrome Europe. Routing and merge decisions for cross-cutting
specs are made by maintainers with `write` permission or above on this
repository.

Thank you for helping rettX. 💜

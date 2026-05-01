# ADR 0001 — `rettx` is the rettX control-plane repo

- **Status**: Accepted
- **Date**: 2026-05-01
- **Decision-makers**: rettX maintainers

## Context

The rettX ecosystem comprises:

- **Surfaces (deployed user-facing apps)**
  - [`rettxweb`](https://github.com/rett-europe/rettxweb) — caregiver PWA
  - [`rettxadmin`](https://github.com/rett-europe/rettxadmin) — admin dashboard
- **Backend (deployed service)**
  - [`rettxapi`](https://github.com/rett-europe/rettxapi)
- **Libraries (Python packages consumed by the backend, released to PyPI)**
  - [`rettxmutation`](https://github.com/rett-europe/rettxmutation) — agentic mutation extraction & HGVS validation
  - [`rettxid`](https://github.com/rett-europe/rettxid) — pseudonymous rettX ID format

The surfaces and backend each have their own technical constitution
(`.specify/memory/constitution.md`) and Squad / spec-kit setup.
The libraries follow stricter semantic versioning, are released
independently to PyPI, and are pinned by `rettxapi` via `requirements.in`.

Until now there was no shared place for:

- the program-level constitution (mission, GDPR posture, transparency,
  accessibility, cross-repo conventions);
- cross-cutting specifications that touch more than one ecosystem repo;
- a public-facing documentation site explaining the registry to families,
  clinicians, and partners;
- a single intake point for issues, with consistent triage and routing
  to the right execution repo.

The result was that high-level decisions risked being lost in commit
history, public visibility relied on individual repo READMEs, and
coordinating a change across repos required manual copy-paste of issues
and specs.

## Decision

The `rettx` repository becomes the **public control plane** for the rettX
solution. It contains:

- `.specify/memory/constitution.md` — program-level constitution.
- `.specify/memory/patterns.md` — cross-repository conventions.
- `specs/` — cross-cutting specifications authored using the spec-kit
  workflow.
- `docs/adr/` — program-level ADRs (this is one of them).
- `site/` — source for the public documentation site.
- `.github/ISSUE_TEMPLATE/` — public intake forms.
- `.github/workflows/` — Iris (intake/triage), spec fanout, and docs
  deployment automation.

The repository is **public**, consistent with the program constitution's
transparency principle.

The surface, backend, and library repos retain full ownership of their
technical constitutions, code, tests, and CI. They link back to the
program constitution but are not subordinated technically. Library
releases continue to flow through PyPI and are pinned by `rettxapi`.

### Spec & issue flow

```
issue opened here
        │
        ▼
   Iris classifies → labels (route:*) → posts recommendation
        │
        ▼
   maintainer comments /route confirm
        │
        ▼
   Iris opens linked issues in target repos (label: squad)
        │
        ▼
   per-repo Squad / Copilot picks up, runs spec-kit plan/tasks/implement
```

For cross-cutting specifications:

```
spec authored in rettx/specs/NNNN-slug/  (spec.md, plan.md, tasks.md)
        │
        ▼
   spec PR merges to main
        │
        ▼
   spec-fanout workflow opens one issue per target repo (label: squad)
        │
        ▼
   per-repo execution as above
```

### Cross-repo automation identity

All cross-repo automation runs under a dedicated GitHub App,
**`rettx-iris`**, installed on the `rett-europe` org with `Issues: R/W`,
`Pull requests: R/W`, `Contents: R`, `Metadata: R`. Tokens are minted
per-run via `actions/create-github-app-token`, so no long-lived
credentials are stored. All bot actions are publicly attributable to
`rettx-iris[bot]`.

### Permission model

- Anyone with a GitHub account can open issues using the templates.
- Iris (bot) classifies and comments only; it does not open downstream
  issues unilaterally.
- Routing is committed only when a user with `write` permission or
  higher on `rettx` comments `/route confirm`. The Action verifies this
  via `getCollaboratorPermissionLevel` before acting.

### Public documentation site

The site lives in `site/` and is built with **Astro Starlight**, deployed
to **GitHub Pages** via Actions from the `main` branch (no `gh-pages`
branch). A custom domain (e.g. `docs.rettx.eu`) may be wired later.

## Alternatives considered

### A. Adopt Squad in the control plane

Rejected. Squad is optimised for repos that contain code being executed
on. The control plane is markdown + automation; a persistent
multi-agent team would produce ceremony without commensurate value.
Squad continues to be used in each downstream execution repo.

### B. Use a hosted issue-tracker (Linear, Jira) as the control plane

Rejected. The transparency principle requires the planning surface to be
public. Hosted issue trackers add friction for community contribution
and obscure the audit trail.

### C. Keep specs in each repo and only host docs here

Rejected for cross-cutting specs. When a single change spans repos, a
single source of truth simplifies coordination and review. Single-repo
work continues to be specced in its home repo.

### D. Skip Iris; rely on manual triage

Rejected as the long-term answer. Manual triage does not scale and
loses the holistic view across repos that is the central value of this
control plane. A lean automated triage with a human gate gives both
scalability and accountability.

## Consequences

### Positive

- Single, public source of truth for program-level decisions.
- One place for the community to ask questions and propose changes.
- Cross-repo work has a coherent home.
- Public docs site backed by the same review/PR workflow as everything
  else.
- All automated cross-repo actions are publicly attributable.

### Negative

- Additional repository to maintain.
- Contributors must understand the two-layer constitution model
  (program-level here, technical per-repo).
- Cross-cutting specs require fanout discipline; if `tasks.md` is not
  cleanly grouped per-repo, fanout cannot work correctly.

### Neutral

- The execution repos continue to function autonomously; they receive
  scoped work via labelled issues and otherwise operate as today.

## Follow-ups

- Add a back-link from each downstream repo's
  `.specify/memory/constitution.md` to this program constitution.
- Reconcile the i18n language-code divergence noted in `patterns.md`.
- Decide on a custom domain for the docs site.
- Evaluate whether to publish a weekly cross-repo digest as an issue
  here.

# rettX

> The Rett Syndrome Europe patient registry — control plane.

[**rettx.eu**](https://www.rettx.eu) · Public docs site (coming soon)

rettX is a multi-repo solution. **This repository is the control plane**: it
holds the program-level constitution, all cross-cutting specifications, the
public documentation site, and the intake/triage workflow that routes new
issues to the right execution repository.

This repo does **not** contain application code.

## The rettX solution

**Control plane**

| Repository | Role |
|---|---|
| [`rettx`](https://github.com/rett-europe/rettx) (this repo) | Specs, docs, issue intake, public site |

**Surfaces** (user-facing applications)

| Repository | Role |
|---|---|
| [`rettxweb`](https://github.com/rett-europe/rettxweb) | Caregiver-facing web app (Angular PWA) |
| [`rettxadmin`](https://github.com/rett-europe/rettxadmin) | Admin / clinical dashboard (Angular) |

**Backend**

| Repository | Role |
|---|---|
| [`rettxapi`](https://github.com/rett-europe/rettxapi) | Backend API (Python / FastAPI on Azure Functions) |

**Libraries** (Python packages consumed by the backend)

| Repository | Role |
|---|---|
| [`rettxmutation`](https://github.com/rett-europe/rettxmutation) | Agentic extraction & validation of genetic mutations (HGVS) from clinical reports |
| [`rettxid`](https://github.com/rett-europe/rettxid) | Generation & validation of pseudonymous **rettX IDs** |

## How work flows here

1. **Anyone** with a GitHub account can open an issue using a template
   (bug report, spec proposal, or public question).
2. **Iris**, our intake bot, classifies the issue, applies routing labels,
   and posts a triage recommendation as a comment.
3. A **maintainer** confirms routing with `/route confirm`. Iris then opens
   linked issues in the affected execution repos.
4. **Cross-cutting specs** are authored here as markdown PRs in
   [`/specs`](./specs/). When a spec PR merges, scoped implementation issues
   are opened in each affected downstream repo automatically.
5. Downstream repos pick up the work, ship PRs, and link back here for the
   holistic view.

The full delivery model is documented in
[`docs/adr/0001-control-plane-repo.md`](./docs/adr/0001-control-plane-repo.md).

## Project principles

The program-level constitution lives at
[`.specify/memory/constitution.md`](./.specify/memory/constitution.md). It
covers our mission, GDPR / data-minimization posture, transparency
commitment, clinical accuracy, accessibility targets, and the conventions
that bind all four repos together.

Each execution repo has its **own** technical constitution (stack,
testing, deployment) which inherits the principles defined here.

## Getting involved

- 🐛 **Found a bug?** Open a [Bug report](../../issues/new?template=bug.yml).
- 💡 **Have an idea?** Open a [Spec proposal](../../issues/new?template=spec-proposal.yml).
- ❓ **Just curious?** Ask via [Public question](../../issues/new?template=public-question.yml).
- 🔒 **Security disclosure?** See [`SECURITY.md`](./SECURITY.md) (or open a
  GitHub Security Advisory privately).

## License

The contents of this repository are licensed under the terms of the
[LICENSE](./LICENSE) file.

# rettX

> The Rett Syndrome Europe patient registry — engineering & governance hub.

This repository is the **public engineering and governance hub** for the
rettX patient registry. It holds the program-level constitution, all
cross-cutting specifications, the (forthcoming) public engineering docs
site, and the intake/triage workflow that routes new issues to the right
ecosystem repository.

The patient-facing public landing for rettX is the WordPress site at
[**rettx.eu**](https://www.rettx.eu) — that is *not* what this
repository serves. The forthcoming docs site here will live on a
separate subdomain (e.g. `docs.rettx.eu`) and is aimed at engineering
contributors, clinical partners, and the wider community who want to
inspect *how* rettX is built and operated.

This repo does **not** contain application code.

## The rettX ecosystem

The ecosystem has four kinds of repository. **Repositories that hold
patient-data-handling code are private** — a deliberate choice for the
current security posture of the registry. The libraries used by the
backend are open and published to PyPI.

### Control plane

| Repository | Visibility | Role |
|---|---|---|
| [`rettx`](https://github.com/rett-europe/rettx) (this repo) | 🌍 Public | Specs, governance docs, issue intake, public engineering site |

### Surfaces (deployed user-facing applications)

| Repository | Visibility | Role |
|---|---|---|
| `rettxweb` | 🔒 Private | Caregiver-facing web app (Angular PWA) — served at `app.rettx.eu` |
| `rettxadmin` | 🔒 Private | Admin / clinical dashboard (Angular) |

### Backend

| Repository | Visibility | Role |
|---|---|---|
| `rettxapi` | 🔒 Private | Backend API (Python / FastAPI on Azure Functions) |

### Libraries (Python packages consumed by the backend)

| Repository | Visibility | Purpose |
|---|---|---|
| [`rettxmutation`](https://github.com/rett-europe/rettxmutation) | 🌍 Public · [PyPI](https://pypi.org/project/rettxmutation/) | Agentic extraction & HGVS validation of genetic mutations from clinical reports |
| [`rettxid`](https://github.com/rett-europe/rettxid) | 🌍 Public · [PyPI](https://pypi.org/project/rettxid/) | Reference implementation of the pseudonymous **rettX ID** format |

> **On visibility.** Our program constitution sets a default of
> "open by default, private only when justified". The current private
> status of the surfaces and backend reflects the registry's risk posture
> for code that directly handles patient data; this position is intended
> to be revisited as the project matures. The governance, specs, and
> reusable libraries are public.

## How work flows here

1. **Anyone** with a GitHub account can open an issue in this repo using
   a template (bug report, spec proposal, or public question).
2. **Iris**, our intake bot, classifies the issue, applies routing
   labels, and posts a triage recommendation as a comment.
3. A **maintainer** confirms routing with `/route confirm`. Iris then
   opens linked issues in the affected ecosystem repos (private repos
   included — only the routing event is visible publicly).
4. **Cross-cutting specs** are authored here as markdown PRs in
   [`/specs`](./specs/). When a spec PR merges, scoped implementation
   issues are opened in each affected repo automatically.
5. The downstream repos pick up the work. Public repos do so visibly;
   private repos do so privately, with the parent issue here remaining
   the public reference point.

The full delivery model is documented in
[`docs/adr/0001-control-plane-repo.md`](./docs/adr/0001-control-plane-repo.md).

## Project principles

The program-level constitution lives at
[`.specify/memory/constitution.md`](./.specify/memory/constitution.md). It
covers our mission, GDPR / data-minimization posture, transparency
commitment, clinical accuracy, accessibility targets, and the conventions
that bind all repositories together.

Each ecosystem repo has its **own** technical constitution (stack,
testing, deployment, library API rules) which inherits the principles
defined here.

## Getting involved

- 🐛 **Found a bug?** Open a [Bug report](../../issues/new?template=bug.yml).
- 💡 **Have an idea?** Open a [Spec proposal](../../issues/new?template=spec-proposal.yml).
- ❓ **Just curious?** Ask via [Public question](../../issues/new?template=public-question.yml).
- 🔒 **Security disclosure?** Use a
  [private GitHub Security Advisory](https://github.com/rett-europe/rettx/security/advisories/new).

## License

The contents of this repository are licensed under the terms of the
[LICENSE](./LICENSE) file. Linked libraries are individually licensed
(currently MIT) — see each library repository for details.


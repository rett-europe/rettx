# rettX Cross-Repository Patterns

This document captures the conventions and patterns that bind the four
rettX repositories together. It is the operational complement to the
[program constitution](./constitution.md): where the constitution defines
*principles*, this document defines the *concrete shapes* we have agreed
upon.

It is a living document. Update it whenever a new cross-repo convention is
adopted, and reference it from cross-cutting specs.

## 1. Repositories and roles

The ecosystem has **four kinds** of repository. They are governed by the same
program constitution but differ in lifecycle and deployment model.

### Control plane

| Repo | Stack |
|---|---|
| [`rettx`](https://github.com/rett-europe/rettx) | Markdown, Astro Starlight, GitHub Actions |

### Surfaces (deployed user-facing applications)

| Repo | Stack |
|---|---|
| [`rettxweb`](https://github.com/rett-europe/rettxweb) | Angular 18+ standalone PWA, ngx-translate, Auth0, Firebase Cloud Messaging |
| [`rettxadmin`](https://github.com/rett-europe/rettxadmin) | Angular 18+ standalone, Angular Material, Microsoft Entra ID (MSAL) |

### Backend (deployed service)

| Repo | Stack |
|---|---|
| [`rettxapi`](https://github.com/rett-europe/rettxapi) | Python 3.11+, FastAPI, Azure Functions v4, Cosmos DB, Blob Storage |

### Libraries (Python packages consumed by the backend)

These are **stateless reusable libraries** released to PyPI. They contain
no deployment, no persistence, and no API endpoints of their own — those
responsibilities belong to `rettxapi`.

| Repo | Purpose | PyPI |
|---|---|---|
| [`rettxmutation`](https://github.com/rett-europe/rettxmutation) | Agentic extraction & HGVS validation of genetic mutations from clinical reports (multi-language, dual-assembly GRCh37/GRCh38) | `rettxmutation` |
| [`rettxid`](https://github.com/rett-europe/rettxid) | Reference implementation of the pseudonymous rettX ID format (`rettx-XXXX-XXXX-XXXX`) | `rettxid` |

Library lifecycle differs from the surfaces and backend:

- Libraries follow strict semantic versioning; `rettxapi` pins them via
  `requirements.in`.
- A library change cannot reach production without a corresponding
  `rettxapi` version bump that consumes the new release.
- Library issues are accepted directly in their own repos for
  library-internal concerns; cross-cutting work is still authored here.

## 2. Shared vocabulary

These domain terms have a single canonical meaning across all repos. Renames
are coordinated through a cross-cutting spec.

- **Patient** — the person living with Rett Syndrome. Identified internally
  by an opaque `patient_id`. Caregiver-visible names are stored separately
  from clinical data wherever feasible.
- **Caregiver** — primary contact, typically a parent or guardian. Owns the
  patient record from a stewardship perspective.
- **Clinician** — authorised medical professional with access scoped by
  permissions.
- **Admin** — registry operator with administrative access via the admin
  surface.
- **Mutation** — a genetic variant recorded against a patient, expressed in
  HGVS where applicable. Extraction and validation are delegated to the
  [`rettxmutation`](https://github.com/rett-europe/rettxmutation) library.
- **GeneticReport** — the source document for one or more mutations.
- **rettX ID** — the pseudonymous patient identifier in the format
  `rettx-XXXX-XXXX-XXXX`. Generation and format validation are delegated
  to the [`rettxid`](https://github.com/rett-europe/rettxid) library;
  persistence and uniqueness enforcement live in `rettxapi`.
- **ConsentDocument** — a versioned legal artefact that the caregiver has
  accepted; acceptance is recorded with timestamp and actor.
- **File** — uploaded artefact (e.g. genetic report, medical document)
  living in segregated blob containers.
- **Permission level** — `owner`, `edit`, `read`. Server-enforced.

If a term means different things in different repos, that is a defect to
be reconciled, not a feature.

## 3. API contract ownership

- The canonical API contract is owned by **`rettxapi`** and published at
  https://rettx.azurewebsites.net/docs (OpenAPI / Swagger).
- Frontends (`rettxweb`, `rettxadmin`) consume this contract. They do not
  invent endpoints, do not assume undocumented behaviour, and do not
  hardcode URLs.
- Both frontends configure the API base URL via their environment files
  (`environment.apiConfig.uri`) — no hardcoded hostnames in services.
- A breaking contract change requires:
  1. A cross-cutting spec authored in `rettx/specs/`.
  2. An ADR in `rettx/docs/adr/`.
  3. A migration plan visible on the public docs site.
  4. Coordinated PRs across affected repos before deprecation of the old
     contract.

## 4. Authentication & authorization

| Surface | Identity provider | Token format | Notes |
|---|---|---|---|
| Caregiver PWA (`rettxweb`) | Auth0 | OIDC JWT | Short-lived access token; refresh via Auth0 SDK |
| Admin dashboard (`rettxadmin`) | Microsoft Entra ID (MSAL) | OIDC JWT | MsalGuard on routes; MsalInterceptor on HTTP |
| Backend API (`rettxapi`) | Auth0 + Entra ID (dual provider) | Validates either | Permission checks via FastAPI dependencies |

Authorization is **always** enforced server-side. UI gating is a usability
courtesy, not a security control.

## 5. Internationalization

- Caregiver-facing surfaces (`rettxweb`) and admin dashboard
  (`rettxadmin`) MUST be internationalized. Backend log/internal messages
  remain in English.
- Translation files live in `src/assets/i18n/` in each frontend.
- Supported language set (target):
  `en, es, de, fr, it, pt, nl, pl, ro, gr, lt, hu, se, dk, fi, lv, no, cz,
  et, tr, ua, ru, ge, rs`.
- Note: `rettxadmin` uses ISO 3166-1 country codes (e.g. `se`, `dk`, `cz`,
  `ua`, `gr`, `rs`) for translation file naming. This is a known
  divergence from ISO 639-1 language codes; reconciliation is tracked as a
  cross-cutting concern.
- Fallback: when a translation is missing, English is used. Missing
  translations MUST be flagged as bugs, not silently accepted.
- New caregiver-facing features ship with the full supported language set,
  even if some translations are placeholder pending review.

## 6. Issue routing labels

These labels are managed (largely) by **Iris** in the `rettx` repo. They
form the contract between intake and execution.

| Label | Meaning | Set by |
|---|---|---|
| `needs-triage` | Newly opened, awaiting Iris classification | Issue templates |
| `route:web` | Should land in `rettxweb` | Iris |
| `route:admin` | Should land in `rettxadmin` | Iris |
| `route:api` | Should land in `rettxapi` | Iris |
| `route:mutation` | Should land in `rettxmutation` | Iris |
| `route:id` | Should land in `rettxid` | Iris |
| `cross-cutting` | Affects more than one repo | Iris |
| `triaged` | Iris has classified; awaiting maintainer routing | Iris |
| `routed` | Maintainer confirmed `/route`; downstream issues opened | Iris |
| `bug` | Defect report | Issue template |
| `spec-proposal` | New idea / feature proposal | Issue template |
| `question` | Public question | Issue template |
| `squad` | (downstream repos) Pick this up via the local Squad team | Iris fanout |

In downstream repos, the `squad` label is the trigger for that repo's
local Squad/Copilot agent to begin work.

## 7. Spec authoring

- Cross-cutting specs live in `rettx/specs/NNNN-slug/` and follow the
  spec-kit structure: `spec.md`, `plan.md`, `tasks.md`.
- `tasks.md` MUST group tasks by target repo (front-matter or section per
  repo) so the fanout action can scope downstream issues correctly.
- Single-repo work does not require a cross-cutting spec; it can flow
  directly through the downstream repo's local spec-kit workflow.
- The line between "single-repo" and "cross-cutting" is whether the change
  requires *coordinated* releases or schema changes across repos. When in
  doubt, treat as cross-cutting.

## 8. Documentation surfaces

| Where | What lives there |
|---|---|
| `rettx/.specify/memory/` | Program constitution, this patterns doc |
| `rettx/specs/` | Cross-cutting specifications |
| `rettx/docs/adr/` | Architectural Decision Records (program-level) |
| `rettx/site/` | Source for the public docs site (Astro Starlight) |
| `rettxapi/docs` (Swagger) | API contract |
| `rettx{web,admin,api}/.specify/memory/` | Per-repo technical constitution (surfaces & backend) |
| `rettx{web,admin,api}/specs/` | Per-repo specs (typically derived from a cross-cutting spec) |
| `rettx{web,admin,api}/docs/` | Per-repo internal docs |
| `rettx{mutation,id}/README.md` | Library reference & API documentation |
| PyPI: `rettxmutation`, `rettxid` | Released library distributions |

## 9. Branching, commits, releases

- Default branch in every repo: `main`.
- Feature branches in downstream repos: `NNN-feature-slug` (number aligned
  with the originating spec ID where applicable).
- Atomic commits with descriptive messages; reference the originating
  issue in `rettx/` for cross-cutting work (e.g. `Refs rett-europe/rettx#42`).
- Releases follow semantic versioning per repo. Cross-repo coordinated
  releases are documented in an ADR or release note here.

## 10. Change log of this document

| Date | Change |
|---|---|
| 2026-05-01 | Initial version (1.0.0). |

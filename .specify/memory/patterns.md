# rettX Cross-Repository Patterns

This document captures the conventions and patterns that bind the four
rettX repositories together. It is the operational complement to the
[program constitution](./constitution.md): where the constitution defines
*principles*, this document defines the *concrete shapes* we have agreed
upon.

It is a living document. Update it whenever a new cross-repo convention is
adopted, and reference it from cross-cutting specs.

## 1. Repositories and roles

The ecosystem has **five kinds** of repository. They are governed by the same
program constitution but differ in lifecycle and deployment model.

### Control plane

| Repo | Visibility | Stack |
|---|---|---|
| [`rettx`](https://github.com/rett-europe/rettx) | 🌍 Public | Markdown, Astro Starlight, GitHub Actions |

### Surfaces (deployed user-facing applications)

| Repo | Visibility | Stack |
|---|---|---|
| `rettxweb` | 🔒 Private | Angular 18+ standalone PWA **wrapped with Capacitor as a native app (Android published as a pilot; iOS planned)**, ngx-translate, Auth0, Firebase Cloud Messaging (**native FCM device tokens via the Capacitor Push Notifications plugin on Android; Web Push/VAPID on the browser PWA**) |
| `rettxadmin` | 🔒 Private | Angular 18+ standalone, Angular Material, Microsoft Entra ID (MSAL) |

> **Delivery targets (read before any device-dependent spec).** `rettxweb`
> ships as **both** a browser PWA **and** a **Capacitor-wrapped native app**
> (Android live as a pilot; iOS planned). Treat it as a **native mobile surface**,
> not only a PWA, whenever a spec touches **push notifications, deep links, secure
> storage, background execution, or OS permissions**. Concretely for push:
> Android delivery uses **native FCM device tokens acquired through the Capacitor
> Push Notifications plugin**, not the browser Web Push/VAPID service-worker path —
> so a "send a push" feature needs device-token registration + storage and an
> FCM server-side send, not just a VAPID subscription.

### Backend (deployed service)

| Repo | Visibility | Stack |
|---|---|---|
| `rettxapi` | 🔒 Private | Python 3.11+, FastAPI, Azure Functions v4, Cosmos DB, Blob Storage |

### Libraries (Python packages consumed by the backend)

These are **stateless reusable libraries** released to PyPI. They contain
no deployment, no persistence, and no API endpoints of their own — those
responsibilities belong to `rettxapi`.

| Repo | Visibility | Purpose | PyPI |
|---|---|---|---|
| [`rettxmutation`](https://github.com/rett-europe/rettxmutation) | 🌍 Public | Agentic extraction & HGVS validation of genetic mutations from clinical reports (multi-language, dual-assembly GRCh37/GRCh38) | `rettxmutation` |
| [`rettxid`](https://github.com/rett-europe/rettxid) | 🌍 Public | Reference implementation of the pseudonymous rettX ID format (`rettx-XXXX-XXXX-XXXX`) | `rettxid` |

Library lifecycle differs from the surfaces and backend:

- Libraries follow strict semantic versioning; `rettxapi` pins them via
  `requirements.in`.
- A library change cannot reach production without a corresponding
  `rettxapi` version bump that consumes the new release.
- Library issues are accepted directly in their own repos for
  library-internal concerns; cross-cutting work is still authored here.

### Content (deployed template & document assets)

`templates` holds **no application code** — it is the source of truth for the
per-locale transactional **content** the surfaces and backend render.

| Repo | Visibility | Purpose | Deploys to |
|---|---|---|---|
| [`templates`](https://github.com/rett-europe/templates) | 🔒 Private | Per-locale Message Center message templates (`messages/<type>/<locale>.<suffix>`), plus consent forms, privacy policies, surveys, and Auth0 email templates | Azure Blob `email-templates` container, via its own GitHub Actions deploy (`deploy-email-templates.yml`, `az storage blob sync` on merge to `main`) |

Content lifecycle differs from the code repos:

- Templates are **rendered, not imported.** `rettxapi` reads them from the blob
  container at send time by path (`<type>/<locale>.<suffix>`). A **missing file
  for a channel means that channel is silently skipped** at render — so shipping
  a new channel (e.g. push) requires authoring its template files **here**, not
  only the rendering code in `rettxapi`. A spec that adds a channel MUST fan a
  slice out to `templates`.
- Deploy is a **full sync with delete** (`--delete-destination true`): the blob
  container mirrors the source folder exactly. Manual blob edits are transient
  and are wiped on the next deploy — every template change MUST land in this repo.
- The Message Center message templates live under **`messages/`** (renamed from
  `emails/` per [ADR 0006](../../docs/adr/0006-message-center-template-store-layout.md),
  since they now carry email **and** in-app **and** push content). The deploy
  strips the folder prefix, so the blob container is still named `email-templates`
  and `rettxapi` (which reads by `<type>/<locale>.<suffix>`) is unaffected by the
  rename. Per-channel file suffixes: `<locale>.html` + `<locale>.subject.txt`
  (email), `<locale>.inapp.txt` (optional dedicated in-app body),
  `<locale>.push.subject.txt` + `<locale>.push.txt` (push).

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
  surface. Admins authenticate via **Microsoft Entra ID (MSAL)**, not Auth0.
- **Entra App Role** — the **source of truth for admin role _membership_**.
  Admin roles are provisioned as App Roles in the Entra app registration and
  delivered in the verified access-token **`roles` claim**; `rettxapi` reads that
  claim to know *who* is `super_admin` / `admin` / `read_only`. This is
  deliberately **not** a DB-driven `Principal.role` — admins are Entra principals
  that may have no `Principal` record. What each role can *do* is separate config
  (see *Capability catalog* below and
  [ADR 0012](../../docs/adr/0012-admin-rbac-entra-app-roles.md)).
- **Admin role set (MVP)** — the thin admin RBAC vocabulary
  (specs 042/043, ADR 0012): `super_admin` (owner / break-glass; implicitly holds
  **all** capabilities; fixed — cannot be edited, diminished, or locked out; the
  only role that may edit the capability config), `admin` (standard operator), and
  `read_only` (viewer). Role membership is coarse and Entra-owned; the granular
  capabilities `admin`/`read_only` grant are super_admin-configurable config (see
  below). These are **admin authorization** roles, distinct from the caregiver
  **Permission level** (`owner`/`edit`/`read`) below and from the
  account-lifecycle `Principal.status` (`PROVISIONAL`/`ACTIVE`/`LOCKED`).
- **Capability / capability catalog** — the granular, enumerated admin
  permissions named `area.action` (e.g. `patients.view`, `patients.manage`,
  `campaigns.send`, `pulse_catalog.manage`, super-only `rbac.manage`), grouped by
  admin area and grounded in the `rettxapi` admin routers. The catalog is the
  server-owned source of truth imported by enforcement; `.view` gates reads,
  `.manage`/`.send`/`.manage_access` gate mutations.
- **role→capability config** — a small, rettX-managed document (e.g. an
  `admin_role_capabilities` store) mapping the `admin` and `read_only` roles to
  their capability sets. It is **role-level** (one set per role, no per-user
  tuning, no custom roles in the MVP), editable at runtime **only by
  `super_admin`**, seeded with safe defaults (`admin` = all capabilities except
  super-only; `read_only` = all `.view` only; `super_admin` = all, implicit and
  not stored). It is **product config, not identity** — role membership stays in
  Entra, `Principal.role` stays unused. Changes are audited. **Data topology:**
  the `admin_role_capabilities` store and all other admin-domain Cosmos
  containers live in the **dedicated `rettxadmindb` database** (same Cosmos
  account, not `rettxdb`) per
  [ADR 0013](../../docs/adr/0013-admin-data-dedicated-cosmos-database.md).
- **`RBAC_ENABLED`** — the rollout flag convention for admin RBAC. Admin
  capability enforcement in `rettxapi` is gated behind `RBAC_ENABLED`
  (**default OFF**) so it cannot lock admins out before Entra App Roles are
  provisioned and the capability defaults are seeded. Enable sequence: provision
  App Roles → seed capability defaults → assign roles → verify the `roles` claim
  appears in tokens → flip the flag on.
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
  - **Pulse Contribution Consent** — a ConsentDocument *subtype*, distinct from
    the patient-creation consent and scoped to **contributing Pulse
    observations** to an existing patient. Accepted by a Pulse contributor at
    invite acceptance; its `consent_document_id` + `version` + `accepted_at` are
    recorded on the `patient_access` grant. Introduced by
    [spec 041](../../specs/041-multi-caregiver-sharing/spec.md).
- **File** — uploaded artefact (e.g. genetic report, medical document)
  living in segregated blob containers.
- **Permission level** — `owner`, `edit`, `read`. Server-enforced.
  - **`pulse`** — a **narrow contributor scope** (not a rung on the
    read/edit ladder): it permits **creating Pulse entries** and a **minimal
    read** (patient display name/nickname + the Pulse tracker & history) and
    **nothing else** — no genetic data, documents, medical profile, or
    patient-info edit, and it does **not** imply general `read`. Enforced
    server-side by its own dependency (e.g. `require_patient_pulse_write`). See
    [ADR 0011](../../docs/adr/0011-pulse-contributor-access-scope.md) and
    [spec 041](../../specs/041-multi-caregiver-sharing/spec.md).
- **Pulse contributor** — a principal holding the `pulse` scope on a patient:
  a person the **owner** invited to help log Pulse. Not a co-owner/steward —
  the patient **owner** (creator) remains the sole administrator (v1).
- **Invite** — a pending, consent-gated offer to grant access to a patient by
  email, with a single-use token (hashed at rest) and expiry. Lifecycle states:
  `pending → accepted | declined | expired | cancelled`; the resulting
  `patient_access` grant is then `active` until `revoked`. Privacy-first: nothing
  identifying is revealed before acceptance and the accepting identity's verified
  email must match the invited address. Introduced by
  [spec 041](../../specs/041-multi-caregiver-sharing/spec.md).

If a term means different things in different repos, that is a defect to
be reconciled, not a feature.

### Operational shorthand

Team shorthand that is **not** a domain entity but carries a single precise
meaning in conversation, bug reports and telemetry. Captured here because these
are the terms a newcomer — or an AI assistant — will otherwise misread.

- **Unicorn** — the generic client error page at the **`/global-error`** route
  ("Uppsss… I don't exist… you're not seeing this", illustrated with a unicorn).
  "I saw a unicorn" means *the web/desktop app hit an unhandled client error and
  `GlobalErrorHandler` bounced me to `/global-error`* — it is a **crash report**,
  not a whimsical remark. Reaching it always means an exception escaped to
  `ErrorHandler`; it is never a designed destination. Instrumented as a
  `pageViews` row with `url` containing `/global-error`, plus an `exceptions` row
  carrying `source: GlobalErrorHandler` and the per-install `correlationId`
  (spec 034). Counting unicorns per hour is the standard health check after a
  deploy. Used as established vocabulary in
  [spec 034](../../specs/034-auth-observability/spec.md).

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

**Admin authorization (RBAC).** Admin authorization is a **hybrid**: **Entra App
Roles** own role *membership* (who is `super_admin` / `admin` / `read_only`, via
the verified token **`roles` claim**), while the granular **capabilities**
(`area.action`) that `admin`/`read_only` grant are **rettX-managed config** that
`super_admin` tunes at runtime (see §2). `rettxapi` enforces server-side via a
`require_capability("area.action")` dependency layered on `get_admin_id`: resolve
the caller's Entra role → `super_admin` is allowed anything; otherwise allow iff
the **configured** capability set for that role contains the capability. A thin
`require_role(*roles)` backs the `super_admin`-only config endpoints
(`GET/PUT /admin/rbac/roles...`). Neither role membership nor capabilities live on
`Principal` (`Principal.role` stays unused); the persisted role→capability map is
product config, not identity. Admin is **not** migrated to Auth0 — the backend
trusts Entra tokens only for admin. Enforcement rolls out behind the
`RBAC_ENABLED` flag (default OFF) and capability changes are audited. `rettxadmin`
reflects the `roles` claim to gate nav items/routes and hosts the `super_admin`
capability editor, but that is **UX only**; the API is the boundary. See
[spec 043](../../specs/043-admin-rbac-mvp/spec.md),
[spec 042](../../specs/042-admin-app-shell/spec.md), and
[ADR 0012](../../docs/adr/0012-admin-rbac-entra-app-roles.md).

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

### Message templates & channel content

- Transactional content (e.g. the Message Center) is authored as per-locale
  templates in the **`templates`** content repo, one folder per message type
  (e.g. `messages/welcome/<locale>.html` + `<locale>.subject.txt`). The folder is
  `messages/` (not `emails/`) because a message renders to email, in-app and push
  — see [ADR 0006](../../docs/adr/0006-message-center-template-store-layout.md).
- A single message renders to **per-channel** content captured in an immutable
  snapshot at send time: a rich **email** HTML body and a plaintext **in-app**
  body (plus a derived preview). Email and in-app content MAY intentionally
  diverge.
- In-app body resolution precedence: `<locale>.inapp.txt` →
  `<locale>.text.txt` → cleaned `html_to_text(<locale>.html)`. Author a
  dedicated `<locale>.inapp.txt` **only** where the email is a poor in-app fit
  (heavy chrome / CTA buttons); otherwise the clean auto-derived text is used.
  HTML→text derivation MUST strip `<style>`/`<script>` blocks. See
  [ADR 0003](../../docs/adr/0003-message-channel-content-model.md).
- **Push channel** (spec 033) renders from `<locale>.push.subject.txt` (title)
  and `<locale>.push.txt` (body), resolved by the recipient's profile language
  with **English fallback** (`<locale>` → `en`). Push text is intentionally
  **generic and free of PHI** — it is a nudge, never the message body (which
  lives in the in-app record and email). A template with **no** `push.*` files
  renders empty `push_title`/`push_body` and the push channel is **skipped** for
  that message (email + in-app unaffected). Author `push.*` files in the
  **`templates`** repo for every Message Center template that should notify.

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
| `route:templates` | Should land in `templates` (content assets) | Iris |
| `cross-cutting` | Affects more than one repo | Iris |
| `triaged` | Iris has classified; awaiting maintainer routing | Iris |
| `routed` | Maintainer confirmed `/route`; downstream issues opened | Iris |
| `bug` | Defect report | Issue template |
| `spec-proposal` | New idea / feature proposal | Issue template |
| `question` | Public question | Issue template |
| `squad` | (downstream repos) Fan-out inbox — a maintainer picks this up by spawning an orchestrated working session | Iris fanout |
| `incident` | (downstream repos) Production is broken for caregivers; may ship without a spec, must be reconciled within 7 days (§11) | Maintainer |
| `credentials` | (downstream repos) Rolling credential-expiry report — one issue per repo, updated in place, never duplicated | `credential-expiry.yml` |

In downstream repos, the `squad` label marks a fan-out **inbox** issue: a
maintainer picks it up by spawning an orchestrated working session
(one session → one branch → one PR). It no longer triggers any
automated local agent or "squad" team — the autonomous Squad/Ralph
toolkit was retired (see [ADR 0008](../../docs/adr/0008-retire-autonomous-squad-agent-system.md)).

The `credentials` label is **not** an intake label and is never set by Iris. It
is owned by each repo's own `credential-expiry.yml` workflow, which maintains a
single rolling issue titled `[creds] Credential expiry report — <repo>`: opened
on the first WARN-or-worse finding, edited in place on every later run, closed
when everything is OK again, and reopened rather than duplicated. Do not use it
for hand-filed issues — the workflow owns that issue's body. See
[spec 047](../../specs/047-credential-expiry-monitor/spec.md).

**Cross-cutting issues do not use the raw `/route confirm` fan-out.** The
`route:*` + `/route confirm` path (`iris-route`) copies the issue text into a
single downstream repo and is reserved for **single-repo, no-spec** work. When an
issue is `cross-cutting`, it goes through gap analysis → umbrella spec →
`spec-fanout` instead (see §7 and [ADR 0002](../../docs/adr/0002-cross-cutting-gap-analysis-pipeline.md)).
`iris-route` refuses to run on a `cross-cutting` issue.

## 7. Spec authoring

- Cross-cutting specs live in `rettx/specs/NNNN-slug/` and follow the
  spec-kit structure: `spec.md`, `plan.md`, plus supporting docs
  (`research.md`, `contracts/`) as needed.
- **Gap analysis first.** Before authoring a cross-cutting spec, run a
  gap analysis from the control plane: one **read-only orchestrated session per
  affected repo**, each reporting file-grounded findings (what exists, what's
  missing, where new code lands, effort, and any cross-repo conflicts). The
  umbrella spec is written from those findings, not from the issue text alone.
  See [ADR 0002](../../docs/adr/0002-cross-cutting-gap-analysis-pipeline.md).
  - *Precondition*: every target repo must be registered as a **main-checkout**
    project. Spawning a session against a worktree-backed project fails
    (`os error 267`).
  - **Consult the stack registry (§1) for every fanout repo before authoring.**
    Each affected repo's runtime/platform facts — framework, auth, and especially
    **delivery mechanism** (native vs. web, FCM vs. Web Push, TWA vs. Capacitor,
    queue vs. synchronous) — are recorded in §1 and its *Delivery targets* note.
    A spec must not assume a mechanism the registry contradicts. If a delivery or
    platform fact is **missing, stale, or uncertain**, the gap analysis must
    confirm it against the repo's code and **§1 must be updated in the same spec
    PR** before the spec is marked `status: ready`. (This rule exists because a
    push spec was nearly written for Web Push/VAPID when `rettxweb` had already
    become a Capacitor native Android app — the registry, not the issue text, is
    the source of truth for platform facts.)
  - **A clause that names a standard prices differently in each repo.** "Use
    the standard X" reads as one obligation but is not one: the same words can
    be a single stdlib call in one repo and a generated table or a new
    dependency — chargeable against the bundle budget — in another. The author
    is usually fluent in one of the affected stacks and prices the clause from
    there. So state the **outcome that must hold** and let each repo choose how
    to reach it, including by restricting its input range and failing loudly
    outside it. Name a specific mechanism only where the mechanism itself is
    the cross-repo requirement. (This rule exists because a fixture-ordering
    clause was written naming full Unicode case folding — one call in the
    backend's language, absent from the frontend's.)
    - *Why it is hard to catch*: a clause naming a standard **reads as
      neutral**. "Conform to X" looks like it imposes no cost on anyone,
      because on the author's side it genuinely doesn't — the cost is invisible
      from the only vantage point the author has. The tell is always the same:
      nobody has run it on the other side. Treat "surely that's cheap
      everywhere" as the same unverified assertion as "that case can't occur",
      and get the affected repo to price it before the spec is `ready`.
- **The umbrella spec hosts the shared API contract** under
  `specs/NNNN-slug/contracts/`. The control plane owns the contract's location
  as the single source of truth; `rettxapi` **implements and versions** it.
  Frontends consume it and never redefine endpoint shapes.
- **Fan-out is driven by the spec's YAML frontmatter, not `tasks.md`.** The
  `spec-fanout` workflow reads the `fanout:` array in `spec.md` frontmatter —
  each entry is `{ repo, summary }` — and opens one `[spec/<slug>]` squad issue
  per listed repo on merge. Fan-out runs **only** when the spec's `status` is
  `ready` or `accepted`; a `draft` spec never fans out. Allowed repos:
  `rettxweb, rettxadmin, rettxapi, rettxmutation, rettxid, templates`.
  A spec that adds or changes **rendered content** (email/in-app/push templates,
  consent forms, surveys) MUST include a `templates` fan-out slice — the
  rendering repo (`rettxapi`) consumes template files but does not author them.
- Single-repo work does not require a cross-cutting spec; it can flow
  directly through the downstream repo's local spec-kit workflow (reached via
  the `/route confirm` path — see §6).
- The line between "single-repo" and "cross-cutting" is whether the change
  requires *coordinated* releases or schema changes across repos, or hosts a
  shared contract. When in doubt, treat as cross-cutting.
- **Delivery is accounted for after fan-out** — every downstream pull request
  declares the spec it serves, or declares that it serves none. See §11.

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

## 10. AI-assisted code review & custom instructions

We run **GitHub Copilot code review** on pull requests across the ecosystem.
Copilot code review consumes a repo's **custom instructions**, so those files
are how automated review is made to enforce *our* conventions. See
[ADR 0007](../../docs/adr/0007-ai-code-review-custom-instructions.md) and the
GitHub docs on
[repository custom instructions](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions).

- **Every repo maintains review-focused custom instructions.** The repo-wide
  file `.github/copilot-instructions.md` is **mandatory** and MUST contain a
  clearly-marked section of **enforceable review conventions** (checkable
  statements a reviewer applies to a diff) — not a technology inventory or a
  changelog.
- **Two file kinds, distinct homes:**
  - `.github/copilot-instructions.md` — repo-wide rules (applies to all files).
  - `.github/instructions/<area>.instructions.md` — path-specific rules, each
    with `applyTo: "<glob>"` frontmatter. **`applyTo:` is only valid in these
    files** and is inert in the repo-wide file — never put it there.
  - `AGENTS.md` / `CLAUDE.md` are for AI *agents*, not code review; they may
    reference the review conventions but must not duplicate them with drift.
- **Content rules:** keep files **concise** (long instructions get truncated);
  prefer imperative, checkable rules; cover the repo's own non-negotiables plus
  the cross-cutting constants every repo shares — **no PHI in code, logs, tests
  or examples** (constitution); auth/trust boundaries (§4); full supported-
  language set for user-facing strings (§5); API-contract ownership (§3, contracts
  live in `rettxapi`, consumers don't fork them); and test integrity (don't
  change source just to make a test pass). **Reference** the constitution and
  this document rather than duplicating them.
- **Ownership:** each repo owns its own instruction files (Copilot code review
  reads only the target repo's files — it cannot read another repo). The control
  plane defines the standard/skeleton and the cross-cutting text here; the
  operative files live in each repo.
- **Setting:** the Copilot code-review "use custom instructions" preference must
  stay enabled (on by default).

## 11. Delivery accounting

Fan-out is one-way. `spec-fanout` pushes intent outward — a spec merges, a
`[spec/<slug>]` squad issue opens in each listed repo — and then stops. Nothing
returns. Without a return signal the control plane can state what it *asked
for* but never what it *got*, and three failures become invisible: a spec that
is authored, correct and stalled looks identical to a healthy one; a spec whose
downstream slices are half-delivered reads as shipped; and work that arrives
with no spec behind it does not register at all.

This section is the return path.

### Every downstream pull request declares its origin

Each pull request in a downstream repo carries exactly one `Spec:` line in its
body:

| Declaration | Means |
|---|---|
| `Spec: 046` or `Spec: medication-regimen` | Implements a slice of that cross-cutting spec |
| `Spec: none — <reason>` | Genuine maintenance: flaky-test fix, tooling, chore |
| `Spec: incident — <link>` | Shipped under the incident lane below; reconciliation still owed |

A `[spec/<slug>]` title prefix, or a closing keyword (`Closes #NNN`) aimed at a
fan-out issue, counts as a declaration on its own — the fan-out issue already
carries the slug.

**Use a closing keyword only when the pull request completes the whole spec for
that repo.** A fan-out issue is an umbrella: most specs land as several slices,
and `Closes` on the first one to merge shuts the umbrella while the rest are
still outstanding. The remaining slices then have nothing open to attach to, so
the return path goes dark exactly when there is most left to deliver — and a
half-delivered spec reads as shipped, which is one of the three failures this
section exists to prevent.

A slice therefore declares:

```
Spec: 049

Part of #NNN — does not close it; further slices remain.
```

The `Spec:` line is the declaration; the bare issue reference supplies the link
without closing. The last slice may use `Closes #NNN`, or the fan-out issue is
closed by hand once the spec is delivered.

`Spec: none` is a first-class answer, not a failure. The point is not that all
work descends from a spec; it is that **unaccounted work is visible as such**.

**Machine-generated dependency pull requests are outside this convention.**
Dependabot and similar bots open pull requests per repo on their own schedule;
they express no programme intent, and no one will add a `Spec:` line to them.
Dependency hygiene is a **per-repo** responsibility with its own cadence and
its own security escalation path — it is deliberately not routed through spec
accounting, and the status report excludes these pull requests rather than
reporting them as unaccounted work.

### The incident lane

Production breakage does not wait for a spec. Before this lane existed, urgent
fixes either stalled or entered through the side door and were retro-fitted to
a spec written afterwards — which reads, misleadingly, as if the spec had
driven the work.

- Label the pull request `incident`. It may ship **without** a spec.
- It declares `Spec: incident — <link to the issue or incident note>`.
- Scope stays at the fix. An incident is not a vehicle for adjacent
  improvements.
- **Within 7 days** it is reconciled: either folded into a spec (new or
  existing) that covers the behaviour properly, or closed as a deliberate
  one-off with the reason recorded.
- Unreconciled incidents surface in the status report until resolved.

The lane is for *"caregivers are affected now"*, never for feature work in a
hurry.

### The status report

`scripts/status.mjs` reconciles intent against delivery on demand: specs and
their frontmatter here, against open squad issues and open pull requests in the
five downstream repos. It reports shipped specs whose delivery is still open,
specs awaiting a maintainer decision, work with no spec declared, unreconciled
incidents, and anything that has gone quiet.

It attributes work **only by explicit declaration** — the `Spec:` line, a
`[spec/<slug>]` title, or a closing keyword. Nothing is inferred from prose. An
earlier draft guessed from surrounding text and mis-filed a spec-036 pull
request under spec 042 on the strength of an incidental mention; a ledger that
guesses is worse than one that admits what it cannot account for.

Drafts are listed **oldest-edited first**, with their age in days, and flagged
once untouched for 21+ days. A draft being argued over is healthy; a draft
nobody has touched in weeks is the real failure mode, and only age separates
them. Spec 034 sat in `draft` for three weeks while the problem it described
recurred, and nothing in the programme noticed. The age comes from git rather
than from a date the author has to remember to write down, so it cannot itself
go stale. It is a prompt, never a gate.

**It is a local script and must never become a workflow in this repo.** `rettx`
is public; the five downstream repos are private, and the report carries their
issue and pull-request titles, which describe unfixed weaknesses in a codebase
handling caregiver data. Two consequences: the output (`status.local.md`) is
gitignored and never committed, and the script refuses to run under `CI` /
`GITHUB_ACTIONS`, because Actions logs and job summaries on a public repo are
world-readable — a scheduled run would publish the report even while committing
nothing. The script itself is safe to publish: it holds query logic and public
spec slugs, so anyone without access to the private repos who runs it gets
nothing back. If scheduled runs are ever wanted, the workflow must live in a
private repo.

## 12. Change log of this document

| Date | Change |
|---|---|
| 2026-05-01 | Initial version (1.0.0). |
| 2026-06-22 | §6/§7: cross-cutting work goes via gap-analysis → umbrella spec → `spec-fanout` (frontmatter `fanout:`, not `tasks.md`); `/route confirm` reserved for single-repo work (ADR 0002). |
| 2026-06-23 | §5: added message templates & channel content (in-app vs email, `inapp.*` precedence) per ADR 0003. |
| 2026-07-07 | §1: recorded that `rettxweb` is a **Capacitor native app** (Android pilot; native FCM device tokens) in addition to the PWA, plus a *Delivery targets* note. §7: added the rule that specs must verify each fanout repo's delivery/platform mechanism against the §1 registry (and update §1 in the same PR) before `status: ready`. Prompted by spec 033 (Message Center push). |
| 2026-07-11 | §1: registered the **`templates`** content repo as a first-class ecosystem repo (fifth kind — *Content*; deploys to the `email-templates` blob via its own CI, full sync with delete). §5: documented the **push** channel template files (`<locale>.push.subject.txt`/`.push.txt`, English fallback, generic/no-PHI) and the "missing template ⇒ channel skipped" rule. §6/§7: added the `route:templates` label, put `templates` in the fan-out allow-list, and required content-adding specs to fan a slice out to `templates`. Prompted by spec 033 push templates never being authored because `templates` was not a routable/fan-out repo — rendering shipped in `rettxapi` but the `push.*` files never existed, so push was silently skipped. |
| 2026-07-11 | §1/§5: renamed the Message Center template folder `emails/` → **`messages/`** ([ADR 0006](../../docs/adr/0006-message-center-template-store-layout.md), Accepted) since it now carries email + in-app + push content; documented the per-channel file-suffix convention. Deploy strips the folder prefix, so the blob container stays `email-templates` and `rettxapi` is unaffected. |
| 2026-07-11 | Added §10 **AI-assisted code review & custom instructions** ([ADR 0007](../../docs/adr/0007-ai-code-review-custom-instructions.md)): every repo must maintain a review-focused `.github/copilot-instructions.md`; path-specific rules go in `.github/instructions/*.instructions.md` with `applyTo:` frontmatter (never in the repo-wide file); files stay concise and enforce the cross-cutting non-negotiables (PHI, auth, i18n, contract ownership, test integrity). Renumbered the change log to §11. Prompted by an audit showing all repos have the file but content was uneven/agent-oriented (e.g. `rettxweb` thin, `rettxapi` with a stray `applyTo:` in the repo-wide file). |
| 2026-07-11 | §6: retired the autonomous **Squad/Ralph** toolkit (the `squad-*.yml` workflows and `.squad/` directories) across the downstream repos. The `squad` label is **retained** as the fan-out inbox marker, now picked up by a human/orchestrated working session rather than an automated agent. See [ADR 0008](../../docs/adr/0008-retire-autonomous-squad-agent-system.md). |
| 2026-07-26 | §2: added the narrow **`pulse`** contributor permission scope (create Pulse + minimal read only; server-enforced; does not imply general `read`), the **Pulse contributor** and **Invite** (with lifecycle states) vocabulary, and the **Pulse Contribution Consent** ConsentDocument subtype. Prompted by [spec 041](../../specs/041-multi-caregiver-sharing/spec.md) and [ADR 0011](../../docs/adr/0011-pulse-contributor-access-scope.md) (multi-caregiver Pulse contribution: single owner + narrow `pulse` scope). |
| 2026-07-26 | §2/§4: added the **admin RBAC** vocabulary and conventions — **Entra App Role** as the admin-authorization source of truth (the token `roles` claim), the MVP role set (`super_admin`/`admin`/`read_only`), and the **`RBAC_ENABLED`** flag-gated rollout convention (default OFF). Reinforced §4 that admin authorization is enforced **server-side** in `rettxapi` via a `require_role`/`require_permission` dependency, admin stays on **Entra** (not Auth0, not a DB `Principal.role`), and client gating is UX only. Prompted by the admin app maturity program — see [spec 042](../../specs/042-admin-app-shell/spec.md) (gated login + config-driven left nav with a `requiredRoles` extension point), [spec 043](../../specs/043-admin-rbac-mvp/spec.md) (RBAC MVP), and [ADR 0012](../../docs/adr/0012-admin-rbac-entra-app-roles.md). |
| 2026-07-26 | §2/§4: **refined** the admin RBAC model from the fixed-capability framing in the prior 2026-07-26 entry to a **hybrid, super_admin-configurable** one. Entra App Roles now own only role **membership**; the granular **capabilities** (`area.action`) that `admin`/`read_only` grant are a **rettX-managed role→capability config** that `super_admin` edits at runtime (persisted, seeded with defaults: `admin` = all-but-super, `read_only` = views only; `super_admin` = all/implicit/fixed). Added *capability* / *capability catalog* / *role→capability config* vocabulary to §2 and switched §4 enforcement to `require_capability("area.action")` (resolve Entra role → configured capabilities, server-side; `super_admin` bypasses; changes audited). This **supersedes** the "finer permissions extend the same claim later / `require_role` only" wording above. Membership still does **not** live on `Principal`. See [spec 043](../../specs/043-admin-rbac-mvp/spec.md) (now `status: ready`), [spec 042](../../specs/042-admin-app-shell/spec.md) (`status: ready`), and [ADR 0012](../../docs/adr/0012-admin-rbac-entra-app-roles.md). |
| 2026-07-26 | §2: recorded the **admin data topology** — admin-domain Cosmos containers (starting with `admin_role_capabilities` from spec 043, and the admin audit trail + admin data-model containers from the upcoming spec 044) live in a **dedicated `rettxadmindb` database in the same Cosmos account**, NOT in `rettxdb`. Prompted by `rettxdb` sitting at/near the **25-container shared-throughput ceiling** (~24 containers today) plus admin/patient data segregation. Needs a new `RETTX_ADMIN_DATABASE_NAME` config + a separate admin database handle. See [ADR 0013](../../docs/adr/0013-admin-data-dedicated-cosmos-database.md). |
| 2026-08-02 | §6: registered the **`credentials`** label — a per-repo rolling credential-expiry report issue owned by each repo's own `credential-expiry.yml` workflow (not Iris, not hand-filed). Prompted by [spec 047](../../specs/047-credential-expiry-monitor/spec.md): a manual pre-holiday sweep found already-expired directory credentials still in place, and no expiry set on any vault secret, so nothing in the estate was being watched. Monitoring is split per repo (`rettxapi` = cloud identity / vault / TLS, `rettxweb` = mobile store and signing) because the checkers reference infrastructure identifiers that must not land in the public control plane — which is also why the findings are summarised by class rather than enumerated. |
| 2026-08-04 | Added §11 **Delivery accounting** — the return path for fan-out. `spec-fanout` pushes intent outward and stops, so the control plane could state what it had asked for but never what it got: a stalled spec looked like a healthy one, a half-delivered spec read as shipped, and work with no spec behind it did not register at all. Three conventions close the loop: every downstream PR declares `Spec: <id>` / `Spec: none — <reason>` / `Spec: incident — <link>`; a new **`incident`** label (§6) gives production breakage a legitimate route that ships without a spec but must be reconciled within 7 days; and `scripts/status.mjs` reconciles specs against downstream issues/PRs on demand, attributing work by explicit declaration only. Machine-generated dependency PRs (Dependabot et al.) are explicitly **outside** this convention — they are opened per repo on their own schedule and express no programme intent, so dependency hygiene stays a per-repo responsibility with its own escalation path and the report excludes them rather than reporting them as unaccounted work. The report stays **local** — `rettx` is public, the downstream repos are private, and Actions logs on a public repo are world-readable, so it is gitignored and refuses to run in CI. Renumbered the change log to §12. Prompted by three urgent fixes shipping with no spec and being retro-fitted to one written afterwards, and by spec 001's fan-out issue sitting open for 94 days unnoticed. |
| 2026-08-04 | §2: added an **Operational shorthand** subsection and defined **unicorn** — the `/global-error` page reached when an unhandled client error escapes to `GlobalErrorHandler`. Already used as vocabulary in [spec 034](../../specs/034-auth-observability/spec.md) but undiscoverable outside it, so newcomers and AI assistants misread "I saw a unicorn" as whimsy rather than a crash report. Includes how a unicorn appears in telemetry (`pageViews` on `/global-error`; `exceptions` with `source: GlobalErrorHandler` + `correlationId`) so unicorns-per-hour is usable as a post-deploy health check. |
| 2026-08-05 | §7: added the rule that a spec clause naming a standard prices differently in each repo — state the outcome and let each repo choose the mechanism, including restricting its input range and failing loudly outside it. Prompted by spec 050, where a fixture-ordering clause named full Unicode case folding: one call in the backend's language, absent from the frontend's and reachable only via a generated table or a dependency. |

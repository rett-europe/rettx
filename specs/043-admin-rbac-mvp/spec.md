<!--
  Frontmatter below is machine-read by .github/workflows/spec-fanout.yml when
  this spec is merged into main. Fanout only runs when status is `ready` or
  `accepted` — while `draft` nothing fans out, so it is safe to review and
  iterate. Flip `status: ready` when agreed and you want squad issues opened
  on merge.
-->
---
spec_id: "043"
slug: "admin-rbac-mvp"
title: "rettX Admin — RBAC MVP: Entra roles + super_admin-configurable capabilities"
status: ready   # draft | ready | accepted | superseded
authored: "2026-07-26"
author: "perocha"
source_issue: ""
relates_to: "specs/042-admin-app-shell/"
fanout:
  - repo: rettxapi
    summary: |
      OWNER of enforcement — this is the security boundary (Constitution
      Principle VI / patterns.md §4). Introduce ADMIN role-based access control
      with a HYBRID model: **role MEMBERSHIP** comes from **Microsoft Entra App
      Roles** (the verified token `roles` claim), while the **granular
      CAPABILITIES** each role grants are **rettX-managed config** that a
      `super_admin` tunes at runtime and that is **persisted in rettX**. Admins
      authenticate via **Entra only** — do NOT introduce Auth0, and do NOT put
      role membership on `Principal` (`Principal.role` stays unused). See
      [ADR 0012](../../docs/adr/0012-admin-rbac-entra-app-roles.md).

      (1) STOP HARDCODING ADMIN. In `app/authentication/entra_client.py`,
      `get_user_info()` currently HARDCODES `is_admin=True` and the real
      roles-claim check is COMMENTED OUT. Replace the hardcode: extract the
      `roles` claim from the ALREADY-VERIFIED Entra token and surface
      `UserInfo.roles: list[str]` (keep the derived `is_admin: bool` for
      back-compat, computed as "holds the base admin role"). Do not change token
      *validation* — only read the claim verification already trusts. Absent
      claim ⇒ empty roles (NOT admin).

      (2) THREE FIXED ROLES, ONE SUPER. The role SET stays `super_admin` /
      `admin` / `read_only` (see spec body). `super_admin` is FIXED and
      break-glass: it implicitly holds **ALL** capabilities, cannot be edited,
      diminished, or locked out, and is the ONLY role that may edit the
      capability config. `admin` and `read_only` grant whatever capabilities the
      config says (below). No per-user tuning and no custom roles in the MVP —
      granularity is ROLE-LEVEL (one capability set for all `admin`s, one for all
      `read_only`s).

      (3) CAPABILITY CATALOG. Define an enumerated set of granular capabilities
      named `area.action`, grouped by admin area, derived from the EXISTING admin
      routers (`app/routers/admin/*`, tags `Admin - <Area>`). Intended shape
      (refine at implementation against the live routers):
        - patients.view / patients.manage        (Admin - Patients, Files, File
          History, Main diagnosis, Care Profile, Identity Locking, Duplicate
          detection — patient-centric data)
        - users.view / users.manage_access        (Admin - Principals, Patient
          Access)
        - surveys.view / surveys.manage           (Admin - Surveys, Survey
          Assignments)
        - campaigns.view / campaigns.manage / campaigns.send   (Admin -
          Campaigns, Communications, Communications bulk, Messages)
        - genetics.view / genetics.manage         (Admin - MECP2 Distribution,
          Mutations, Mutation Embeddings)
        - pulse_catalog.view / pulse_catalog.manage   (the Pulse metric-definition
          catalog; Admin - Pulse)
        - audit.view                              (Admin - Audit; RESERVE — full
          audit surface is spec 044; catalogue it now, leave inert/optional)
        - rbac.manage                             (SUPER-ONLY: edit the capability
          config; NOT assignable to `admin` or `read_only`)
      Ground the exact list against the real router tags at implementation; this
      is the intended shape, not a frozen contract. Provide the catalog as a
      single server-owned source of truth (e.g. `app/models/rbac/capabilities.py`)
      that both enforcement and the config endpoints import.

      (4) PERSISTED ROLE→CAPABILITY STORE. Add a small Cosmos container / config
      document (e.g. `admin_role_capabilities`) keyed by role, holding the
      capability list for `admin` and for `read_only`. `super_admin` is NOT
      stored (implicitly all). SEED sensible DEFAULTS on first run / migration so
      enabling enforcement never locks anyone out:
        - `admin` = ALL capabilities EXCEPT super-only (`rbac.manage`) — i.e.
          every `.view` + `.manage` + `campaigns.send` + `genetics.manage`, etc.
          (This reproduces today's "admin can do everything" as data.)
        - `read_only` = all `.view` capabilities only (no `.manage`, no `.send`,
          no `.manage_access`).
        - `super_admin` = all (implicit; not persisted, not editable).
      Keep the document tiny and versioned; store `updated_by` + `updated_at`.

      (5) SUPER_ADMIN-ONLY CONFIG ENDPOINTS. Add endpoints to read and update the
      config, guarded by `require_role("super_admin")`:
        - `GET /admin/rbac/roles` → the catalog + current per-role capability
          sets (and super_admin shown as fixed/all).
        - `PUT /admin/rbac/roles/{role}/capabilities` → replace the capability set
          for `admin` or `read_only`. REJECT edits to `super_admin`, REJECT
          assigning `rbac.manage` (or any super-only capability) to a non-super
          role, and REJECT unknown capability names.
      Every config CHANGE MUST be AUDITED now: emit an audit event with actor
      (super_admin id), role edited, and before/after capability sets (identifiers
      only, no PHI). (The full audit trail is spec 044; at minimum emit the event
      here.)

      (6) CAPABILITY-BASED ENFORCEMENT. Add
      `app/dependencies/admin_permissions.py` with `require_capability(
      "area.action")` layered on `get_admin_id`: resolve the caller's Entra
      role(s) from the token; if `super_admin` → allow; else load the configured
      capability set for the caller's role and allow IFF it contains the required
      capability. Provide a thin `require_role(*roles)` too (used by the config
      endpoints for the super-only gate). APPLY `require_capability` to every
      existing admin router with an area-appropriate capability: read/GET
      endpoints require `<area>.view`; mutating endpoints require
      `<area>.manage` (or `.manage_access` / `.send` where enumerated). Failures
      return 403 with a stable code (e.g. `insufficient-capability`) and are
      audited (actor, capability, decision — identifiers only).

      (7) SAFE ROLLOUT BEHIND A FLAG. Keep `RBAC_ENABLED` (default **OFF**). OFF
      ⇒ behaviour exactly as today (any authenticated Entra admin allowed) so
      nobody is locked out before Azure AD App Roles are provisioned. ON ⇒
      `require_capability` enforces against the configured sets. Document the
      enable sequence: provision Entra App Roles → seed capability defaults →
      assign roles to users/groups → verify the `roles` claim in tokens → flip
      `RBAC_ENABLED=on`. Both `AUTH0_*` and `RETTX_ENTRA_*` remain REQUIRED; add
      `RBAC_ENABLED`.

      Tests: `require_capability` allows/denies against the configured set;
      `super_admin` bypasses (all); with `RBAC_ENABLED` off all authenticated
      admins pass (parity with today); missing `roles` claim ⇒ not admin;
      defaults seed correctly (admin = all-but-super; read_only = views only);
      config `PUT` rejects super-only capability assignment, editing super_admin,
      and unknown capabilities; every config change emits an audit event;
      `get_user_info()` no longer hardcodes `is_admin=True`.

  - repo: rettxadmin
    summary: |
      CONSUMER (UX only — the API is the security boundary; never rely on the
      client for authorization). Build on the config-driven shell from
      [spec 042](../042-admin-app-shell/spec.md). Keep the identity plane on
      **Microsoft Entra / MSAL**; Auth0 is out of scope.

      (1) EXPOSE ROLES INTO AUTH STATE. Read the Entra `roles` claim from the
      MSAL account/token and surface it in auth state (e.g. a `roles: string[]`
      signal on an identity service). Empty/absent claim ⇒ "no roles".

      (2) ROLE-BASED ROUTE + MENU GATING (MVP UX). Add a `roleGuard` (layered on
      `MsalGuard`) and gate the sidenav by consuming the `requiredRoles` slot
      defined on `AdminNavItem` (spec 042): hide/disable items the current role
      cannot use. For the MVP the CLIENT gate stays coarse (role-based); finer,
      capability-aware nav gating MAY be added later by reading the configured
      capabilities, but the API remains the true boundary either way.

      (3) SUPER_ADMIN CAPABILITY EDITOR. Add a `super_admin`-only screen (a
      gated route, hidden from `admin`/`read_only`) that:
        - Loads the capability catalog + current per-role sets from
          `GET /admin/rbac/roles`.
        - Renders the catalog grouped by area with per-role toggles for `admin`
          and `read_only`.
        - Shows `super_admin` as FIXED / all capabilities (non-editable), and
          does not offer `rbac.manage` (or any super-only capability) as an
          assignable toggle for `admin`/`read_only`.
        - Saves via `PUT /admin/rbac/roles/{role}/capabilities`, surfacing API
          validation errors (e.g. rejecting a super-only assignment) clearly.
      This screen is UX; the server enforces and validates every change.

      (4) UX-ONLY, RESTATED. Hiding a menu item, blocking a route, or the editor
      itself are conveniences, not controls: the API enforces server-side and
      returns 403 regardless. Surface 403s (insufficient role/capability) with a
      clear message rather than a silent failure.

      Tests: only `super_admin` can reach the editor route and see its nav item;
      the editor loads/saves via the endpoints; super-only capabilities are not
      offered to `admin`/`read_only`; a `read_only` identity cannot reach write
      routes/menu items; role state derives from the MSAL `roles` claim; the
      guard composes with `MsalGuard`.
---

# rettX Admin — RBAC MVP: Entra roles + super_admin-configurable capabilities

## Problem

`rettxadmin` has **authentication but no authorization**: every route is guarded
by `MsalGuard` (are you signed in via Entra?) and nothing more. On the backend,
`rettxapi` has **no RBAC**: `app/authentication/entra_client.py`
`get_user_info()` **hardcodes `is_admin=True`** and the real roles-claim check
(`is_admin = payload.get('roles', []) == ["admin"]`) is **commented out**. The
`Principal` model carries only account-lifecycle `status`
(`PROVISIONAL`/`ACTIVE`/`LOCKED`) — no role — and admins are Entra principals
who may have no `Principal` record at all.

So any authenticated Entra admin has full, undifferentiated access, and there is
no way to distinguish an owner, an operator, and a read-only auditor — nor to
adjust what each can do without a code change. This spec introduces a **thin
RBAC MVP** whose **capabilities are tunable at runtime by the product owner**.

## The model (hybrid: Entra role membership + rettX-managed capabilities)

- **Role membership** (who is `super_admin` / `admin` / `read_only`) is owned by
  **Microsoft Entra App Roles** and delivered in the verified token **`roles`
  claim**. This is IT/ops-managed and deliberately coarse.
- **Granular capabilities** (what `admin` and `read_only` may actually do) are
  **rettX-managed configuration**: a small role→capability document that a
  `super_admin` edits at runtime, persisted in rettX. No Azure AD round-trip is
  needed to tune product behaviour.
- **Granularity is role-level.** `super_admin` configures ONE capability set for
  `admin` and ONE for `read_only`; all admins share the admin set. No per-user
  tuning, no custom roles in the MVP.
- **`super_admin` is fixed / break-glass.** It implicitly holds **all**
  capabilities, cannot be edited or diminished, cannot be locked out, and is the
  only role permitted to edit the capability config.

Admin **stays on Entra** (`rettxapi` admin endpoints trust Entra tokens only);
we do **not** migrate admin to Auth0, and we do **not** move role membership onto
`Principal` (`Principal.role` stays unused). Rationale and the "why this isn't a
contradiction of the earlier no-DB-role stance" are in
**[ADR 0012](../../docs/adr/0012-admin-rbac-entra-app-roles.md)**.

## MVP role set

| Role | Capabilities | Persona |
|---|---|---|
| `super_admin` | **All**, implicitly; fixed, break-glass, only editor of the config | Owner |
| `admin` | Whatever the config grants (default: all except super-only) | Standard operator |
| `read_only` | Whatever the config grants (default: all `.view` only) | Auditor / support |

## Capability catalog

Enumerated `area.action` capabilities, grouped by admin area and grounded in the
existing `app/routers/admin/*` routers (`Admin - <Area>` tags). Intended shape,
refined at implementation against the live routers:

| Area | Capabilities | Backing admin routers (tags) |
|---|---|---|
| Patients | `patients.view`, `patients.manage` | Patients, Files, File History, Main diagnosis, Care Profile, Identity Locking, Duplicate detection |
| Users & Access | `users.view`, `users.manage_access` | Principals, Patient Access |
| Surveys | `surveys.view`, `surveys.manage` | Surveys, Survey Assignments |
| Campaigns / Messaging | `campaigns.view`, `campaigns.manage`, `campaigns.send` | Campaigns, Communications, Communications bulk, Messages |
| Genetics | `genetics.view`, `genetics.manage` | MECP2 Distribution, Mutations, Mutation Embeddings |
| Pulse catalog | `pulse_catalog.view`, `pulse_catalog.manage` | Pulse (metric-definition catalog) |
| Audit | `audit.view` | Audit — **reserved**: catalogued now, full surface is spec 044; inert/optional until then |
| RBAC config | `rbac.manage` | **super-only** — edit the capability config; **not assignable** to `admin`/`read_only` |

The catalog is a single server-owned source of truth imported by both
enforcement and the config endpoints. `.view` gates read/GET endpoints;
`.manage` / `.manage_access` / `.send` gate the corresponding mutations.

## Persisted role→capability store + seeded defaults

A small Cosmos container / config document (e.g. `admin_role_capabilities`),
keyed by role, holds the capability list for `admin` and for `read_only`
(`super_admin` is not stored — implicitly all). Seeded on first run / migration
so enabling enforcement never locks anyone out:

- **`admin`** = all capabilities **except** super-only (`rbac.manage`) — i.e.
  every view + manage + `campaigns.send` + `genetics.manage`, etc. (reproduces
  today's "admin can do everything" as data).
- **`read_only`** = all `.view` capabilities only (no `.manage`, `.send`, or
  `.manage_access`).
- **`super_admin`** = all (implicit; not persisted, not editable).

The document is versioned and records `updated_by` + `updated_at`.

## Enforcement (rettxapi — owner, the security boundary)

- `get_user_info()` stops hardcoding `is_admin=True`; it reads the Entra `roles`
  claim and exposes `UserInfo.roles: list[str]` (`is_admin` = holds base admin
  role).
- `require_capability("area.action")` (in `app/dependencies/admin_permissions.py`,
  layered on `get_admin_id`): resolve Entra role(s) → `super_admin` allows
  anything; otherwise allow iff the configured set for the caller's role contains
  the capability. A thin `require_role(*roles)` backs the super-only config
  endpoints.
- Every admin endpoint gets an area-appropriate capability; failures return `403`
  (`insufficient-capability`) and are **audited** (actor, capability, decision —
  identifiers only, no PHI).

## super_admin config endpoints

- `GET /admin/rbac/roles` — catalog + current per-role sets (super_admin shown
  fixed/all). Guarded by `require_role("super_admin")`.
- `PUT /admin/rbac/roles/{role}/capabilities` — replace the set for `admin` or
  `read_only`. Rejects: editing `super_admin`; assigning `rbac.manage` (or any
  super-only capability) to a non-super role; unknown capability names. Guarded
  by `require_role("super_admin")`.
- **Every change is audited now** (actor + role + before/after sets); the full
  audit trail is [spec 044] but the event is emitted here at minimum.

## super_admin editor UI (rettxadmin — consumer, UX only)

A `super_admin`-only gated screen (hidden from `admin`/`read_only`) that loads
the catalog + per-role sets from `GET /admin/rbac/roles`, renders it grouped by
area with per-role toggles for `admin` and `read_only`, shows `super_admin` as
fixed/all (non-editable), never offers super-only capabilities as assignable
toggles, and saves via `PUT`, surfacing API validation errors. This is UX; the
API enforces and validates every change.

## Safe rollout — `RBAC_ENABLED`

Enforcement is gated behind `RBAC_ENABLED` (**default OFF**). Enable sequence:

1. Provision the App Roles in the Entra app registration.
2. Seed the capability defaults (admin = all-but-super; read_only = views).
3. Assign roles to admin users / groups.
4. Verify issued tokens carry the expected `roles` claim.
5. Flip `RBAC_ENABLED=on`.

Off ⇒ today's behaviour (any authenticated Entra admin allowed); on ⇒
`require_capability` enforces against the configured sets. `AUTH0_*` and
`RETTX_ENTRA_*` remain required; `RBAC_ENABLED` is added alongside.

## Client (rettxadmin — consumer, UX only)

- Expose the Entra `roles` claim from MSAL into auth state (`roles: string[]`).
- Add a `roleGuard` (layered on `MsalGuard`) and gate the sidenav via the
  spec 042 `requiredRoles` slot. MVP client gating is coarse (role-based); finer
  capability-aware nav gating may be added later.
- Ship the super_admin editor (above).
- **UX only.** The API enforces server-side and returns 403 regardless; surface
  403s clearly.

## Non-goals

- No per-user capability tuning and no custom roles (role-level only, MVP).
- No migration of admin to Auth0; no change to Entra-only admin trust.
- No DB-driven `Principal.role`; no change to `Principal.status` semantics. The
  persisted store is a small role→capability **config document**, not identity.
- No full audit trail here (that is spec 044) — but capability-config changes
  emit an audit event now.
- No client-side authorization as a control — the client only reflects access.

## Constitution Check

- **Principle VI (Security baseline):** authorization is enforced **server-side**
  on every admin endpoint via `require_capability`; UI gating and the editor are
  usability niceties, never controls. Config changes and authz decisions are
  auditable (actor, capability/role, outcome) with no PII in logs. Identity stays
  on federated Entra with short-lived tokens.
- **Least privilege:** default posture is "no roles ⇒ no admin"; `read_only`
  defaults to views only; `admin` gets everything-but-super; `super_admin` is the
  only capability-config editor. The flagged rollout prevents accidental
  lock-out.
- **Principle III (Transparency) / Governance:** the model is recorded in
  [ADR 0012](../../docs/adr/0012-admin-rbac-entra-app-roles.md) and
  [patterns.md §4](../../.specify/memory/patterns.md), not left implicit in code.
- **Patterns §4 (Authentication & authorization):** admin stays on Entra;
  enforcement resolves Entra role → configured capabilities server-side.

## Acceptance criteria

- [ ] `get_user_info()` no longer hardcodes `is_admin=True`; it reads the Entra
      `roles` claim and exposes `UserInfo.roles: list[str]`.
- [ ] A server-owned **capability catalog** (`area.action`) exists, grouped by
      admin area and grounded in the real `app/routers/admin/*` routers, incl.
      super-only `rbac.manage` and reserved `audit.view`.
- [ ] A persisted **role→capability store** (`admin_role_capabilities`) exists,
      keyed by role, **seeded** with defaults: `admin` = all-but-super,
      `read_only` = views only; `super_admin` implicit/all/not stored.
- [ ] `require_capability("area.action")` enforces server-side (super_admin
      bypasses; others checked against the configured set); every admin endpoint
      carries an area-appropriate capability; failures are 403 + audited.
- [ ] `GET /admin/rbac/roles` and `PUT /admin/rbac/roles/{role}/capabilities`
      exist, are `super_admin`-only, reject editing `super_admin` / assigning
      super-only capabilities / unknown capabilities, and **audit every change**.
- [ ] Enforcement is gated by `RBAC_ENABLED` (default OFF); OFF = parity with
      today (no lock-out); ON = capabilities enforced.
- [ ] rettxadmin exposes the `roles` claim, adds a `roleGuard` + menu gating via
      spec 042's `requiredRoles`, and ships a `super_admin`-only capability
      editor (load via GET, save via PUT, super-only not assignable).
- [ ] Client gating and the editor are UX only; 403s are surfaced clearly; no
      client logic assumes it is the security control.
- [ ] No Auth0 in admin; no `Principal.role`; `Principal.status` unchanged.

## Open questions

- **Capability granularity vs. router reality:** a couple of admin routers span
  more than one conceptual area (e.g. identity locking, duplicate detection under
  Patients). Confirm the final area mapping against the routers at implementation;
  the table above is the intended shape.
- **Config change concurrency:** last-writer-wins on the config document, or
  optimistic concurrency (ETag / version check)? (Recommend a version check to
  avoid two super_admins clobbering each other.)
- **`read_only` breadth:** does `read_only` default include `audit.view`, or
  stay strictly on operational `.view`s until spec 044 lands? (Recommend: exclude
  `audit.view` from defaults until the audit surface exists.)
- **Group vs. user role assignment** in Entra: capture in the rollout runbook
  (groups scale better).

## Relationships

- Pairs with **[spec 042 — Admin app shell](../042-admin-app-shell/spec.md)**,
  which defines the `requiredRoles` nav extension point this spec consumes.
- Decision record: **[ADR 0012 — Admin RBAC via Entra App Roles](../../docs/adr/0012-admin-rbac-entra-app-roles.md)**.
- Conventions: **[patterns.md §4](../../.specify/memory/patterns.md)** (auth/authz,
  server-side enforcement) and §2 (role + capability vocabulary).
- A dedicated admin **audit trail** is deferred to a future spec 044 (referenced
  by `audit.view` and the config-change audit event here).

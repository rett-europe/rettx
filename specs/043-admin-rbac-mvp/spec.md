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
title: "rettX Admin — RBAC MVP with Entra App Roles as the source of truth"
status: draft   # draft | ready | accepted | superseded
authored: "2026-07-26"
author: "perocha"
source_issue: ""
relates_to: "specs/042-admin-app-shell/"
fanout:
  - repo: rettxapi
    summary: |
      OWNER of enforcement — this is the security boundary (Constitution
      Principle VI / patterns.md §4). Introduce ADMIN role-based access control
      using **Microsoft Entra App Roles** as the source of truth: roles arrive in
      the verified Entra access token `roles` claim. Admins authenticate via
      **Entra only** — do NOT introduce Auth0 or a DB-driven role here (see
      [ADR 0012](../../docs/adr/0012-admin-rbac-entra-app-roles.md) for why:
      admins are Entra principals that may have NO rettX `Principal` record).

      (1) STOP HARDCODING ADMIN. In `app/authentication/entra_client.py`,
      `get_user_info()` currently HARDCODES `is_admin=True` and the real
      roles-claim check is COMMENTED OUT. Replace the hardcode: extract the
      `roles` claim from the ALREADY-VERIFIED Entra token and surface it. Add
      `roles: list[str]` to `UserInfo` (keep the derived `is_admin: bool` for
      backwards compatibility, computed as "has the base admin role"). Do not
      change token *validation* (signature/issuer/audience) — only read the
      claim that verification already trusts. If the claim is absent, roles is an
      empty list (no roles), NOT admin.

      (2) MINIMAL ROLE SET (keep it thin, justify each). Define exactly three
      MVP roles:
        - `super_admin` — full access incl. sensitive/destructive operations and
          (future) role/config management. The break-glass / owner role.
        - `admin` — the standard operator role. Grants access to all existing
          admin endpoints (the current behaviour, now explicit instead of
          hardcoded). This is the BASE admin role every admin endpoint requires.
        - `read_only` — can view admin data but cannot mutate; for auditors /
          support who need visibility without change rights.
      Rationale for thinness: these three cover the real personas today (owner,
      operator, viewer) without over-modelling permissions before we have
      concrete separation-of-duty requirements. Finer-grained permissions can be
      added later on the SAME claim without re-architecture.

      (3) REUSABLE AUTHORIZATION DEPENDENCY. Add
      `app/dependencies/admin_permissions.py` with a dependency factory layered
      ON TOP of the existing `get_admin_id` (which resolves the authenticated
      Entra admin). Provide:
        - `require_role(*roles)` → FastAPI dependency that 403s unless the
          caller's `roles` claim intersects the allowed set (super_admin
          implicitly satisfies any role check — treat it as a superset).
        - Optionally `require_permission(perm)` mapping a coarse permission to
          the role set, so call sites read int/`require_permission('patients:write')`
          rather than enumerating roles. Keep the permission→role map tiny and
          data-driven for the MVP.
      APPLY IT: every existing admin router requires AT LEAST the base `admin`
      role (i.e. `require_role('admin')`, satisfied by `admin` and `super_admin`;
      `read_only` passes only on read/GET endpoints). Reserve `require_role(
      'super_admin')` for a couple of SENSITIVE operations as a worked example
      (e.g. destructive deletes / bulk exports) — do not gate everything finely
      yet; start COARSE.

      (4) SAFE ROLLOUT BEHIND A FLAG. Gate enforcement behind a config flag
      `RBAC_ENABLED` (default **OFF**). When OFF, behaviour is exactly as today
      (any authenticated Entra admin is allowed) so nobody is locked out before
      Azure AD App Roles are provisioned and assigned. When ON, `require_role`
      enforces. Document and follow the enable sequence:
        (a) provision the App Roles in the Entra app registration →
        (b) assign roles to admin users/groups →
        (c) verify tokens now carry the expected `roles` claim →
        (d) flip `RBAC_ENABLED=on`.
      Both `AUTH0_*` and `RETTX_ENTRA_*` remain REQUIRED config; add
      `RBAC_ENABLED` alongside the existing settings.

      (5) ENFORCEMENT IS SERVER-SIDE AND AUDITABLE. Authorization failures return
      403 with a stable machine code (e.g. `code: insufficient-role`) and are
      audited (actor = admin id, attempted operation, decision) with NO PHI /
      identifiers only, consistent with Principle VI. Client gating (spec 042 /
      rettxadmin) is UX only and is NEVER the control.

      Tests: `require_role` 403s when `RBAC_ENABLED` on and the claim lacks the
      role; allows when the claim has it; `super_admin` satisfies any check;
      `read_only` blocked on writes, allowed on reads; with `RBAC_ENABLED` off
      all authenticated admins pass (parity with today); missing `roles` claim ⇒
      no roles (not admin); `get_user_info()` no longer returns a hardcoded
      `is_admin=True`.

  - repo: rettxadmin
    summary: |
      CONSUMER (UX only — the API is the security boundary; never rely on the
      client for authorization). Build on the config-driven shell from
      [spec 042](../042-admin-app-shell/spec.md). Keep the identity plane on
      **Microsoft Entra / MSAL**; Auth0 is out of scope.

      (1) EXPOSE ROLES INTO AUTH STATE. Read the Entra `roles` claim from the
      MSAL account/ID-or-access token and surface it in the app's auth state
      (e.g. a `roles: string[]` signal/observable on an auth/identity service).
      Handle the empty/absent claim as "no roles".

      (2) ROLE-BASED ROUTE GUARD. Add a `roleGuard` (canActivate) that blocks
      routes the current roles cannot access, redirecting to a safe landing
      (Overview) or a friendly "not authorised" state. This LAYERS ON TOP of the
      existing `MsalGuard` (authentication) — auth first, then role.

      (3) MENU GATING VIA THE 042 EXTENSION POINT. Consume the `requiredRoles`
      slot already defined on `AdminNavItem` (spec 042): hide or disable sidenav
      items the current roles cannot use, so the menu reflects the user's access.
      Map the MVP roles (`super_admin`, `admin`, `read_only`) to items; e.g.
      sensitive/destructive actions surface only for `super_admin`, `read_only`
      sees view-oriented items, `admin` sees the standard set.

      (4) UX-ONLY, RESTATED. Hiding a menu item or blocking a route is a
      convenience, not a control: the API enforces every decision server-side
      and returns 403 regardless of the client. Do NOT implement any logic that
      assumes the client is the gate. Surface a clear message when the API
      returns 403 (role insufficient) so the user understands, rather than a
      silent failure.

      Tests: a `read_only` identity cannot navigate to a write route and does not
      see write-only menu items; an `admin` sees the standard set; `super_admin`
      sees sensitive items; role state derives from the MSAL `roles` claim; the
      guard composes correctly with `MsalGuard`.
---

# rettX Admin — RBAC MVP with Entra App Roles as the source of truth

## Problem

`rettxadmin` has **authentication but no authorization**. Every route is guarded
by `MsalGuard` (are you signed in via Entra?) and nothing more. On the backend,
`rettxapi` has **no RBAC at all**: `app/authentication/entra_client.py`
`get_user_info()` **hardcodes `is_admin=True`** and the real roles-claim check
(`is_admin = payload.get('roles', []) == ["admin"]`) is **commented out**. The
`Principal` model carries only account-lifecycle `status`
(`PROVISIONAL`/`ACTIVE`/`LOCKED`) — no role field — and admins are Entra
principals who may not have a `Principal` record at all.

The result: any authenticated Entra admin has full, undifferentiated access, and
there is no way to distinguish an owner, an operator, and a read-only auditor.
This spec introduces a **thin RBAC MVP** with a clear, single source of truth and
a safe rollout.

## Identity plane & source of truth

- Admin/staff authenticate via **Microsoft Entra ID (MSAL)**. `rettxapi` admin
  endpoints trust **Entra tokens only** (`require_admin` → `get_admin_id` →
  `EntraClient`, `auth_provider="entra"`). Admin **stays on Entra** — we do not
  migrate admin to Auth0 (that would break backend admin trust).
- **Entra App Roles are the source of truth for admin authorization.** Roles are
  delivered in the verified token **`roles` claim**. This is decided and
  justified in
  **[ADR 0012 — Admin RBAC via Entra App Roles](../../docs/adr/0012-admin-rbac-entra-app-roles.md)**
  (a DB-driven `Principal.role` is rejected because admins may have no
  `Principal` record and it splits the identity source of truth).

## MVP role set (thin, and why)

| Role | Grants | Persona |
|---|---|---|
| `super_admin` | Everything, including sensitive/destructive ops and future role/config management; superset of all checks | Owner / break-glass |
| `admin` | The base admin role: all existing admin endpoints (today's behaviour, made explicit) | Standard operator |
| `read_only` | View admin data; no mutations | Auditor / support |

Three roles cover the real personas (owner, operator, viewer) without
over-modelling permissions before concrete separation-of-duty needs exist. Finer
permissions extend the **same** `roles` claim later — no re-architecture.

## Enforcement (rettxapi — owner, the security boundary)

- **Read the claim, don't fake it.** `get_user_info()` stops returning a
  hardcoded `is_admin=True`; it extracts the `roles` claim from the
  already-verified Entra token and surfaces `UserInfo.roles: list[str]`
  (`is_admin` kept as a derived "has base admin role").
- **Reusable dependency** in `app/dependencies/admin_permissions.py`, layered on
  `get_admin_id`: `require_role(*roles)` (and optionally
  `require_permission(perm)`), with `super_admin` implicitly satisfying any
  check. Applied so **every** admin router needs at least `admin`; `read_only`
  passes only on reads; a couple of **sensitive** ops require `super_admin` as a
  worked example. Start **coarse**.
- **Failures** return `403` with a stable code (e.g. `insufficient-role`) and are
  **audited** (actor, operation, decision — identifiers only, no PHI).

## Safe rollout — `RBAC_ENABLED`

Enforcement is gated behind a config flag `RBAC_ENABLED`, **default OFF**, so
turning on roles cannot lock everyone out before Azure AD App Roles are
provisioned and assigned.

Enable sequence:

1. Provision the App Roles in the Entra app registration.
2. Assign roles to admin users / groups.
3. Verify issued tokens now carry the expected `roles` claim.
4. Flip `RBAC_ENABLED=on`.

With the flag **off**, behaviour matches today (any authenticated Entra admin is
allowed). With it **on**, `require_role` enforces. `AUTH0_*` and `RETTX_ENTRA_*`
remain required; `RBAC_ENABLED` is added alongside.

## Client (rettxadmin — consumer, UX only)

- Expose the Entra `roles` claim from MSAL into auth state (`roles: string[]`).
- Add a `roleGuard` (layered on `MsalGuard`) that blocks routes the role can't
  access.
- Gate the sidenav by consuming the **`requiredRoles`** slot defined on
  `AdminNavItem` in [spec 042](../042-admin-app-shell/spec.md); hide/disable
  items the role cannot use.
- **This is UX only.** The API enforces server-side and returns 403 regardless.
  Surface 403s clearly rather than failing silently.

## Non-goals

- No migration of admin to Auth0; no change to Entra-only admin trust.
- No DB-driven `Principal.role`; no change to `Principal.status` semantics
  (lifecycle, not authz).
- No fine-grained permission matrix in the MVP — start with three roles on one
  claim; extend later.
- No client-side authorization as a control — the client only reflects access.

## Constitution Check

- **Principle VI (Security baseline):** authorization is enforced **server-side**
  on every admin endpoint via `require_role`; UI gating is explicitly a
  usability nicety, not a control. Decisions are auditable (actor, operation,
  outcome) with no PII in logs. Identity stays on federated Entra with
  short-lived tokens.
- **Least privilege:** the default posture is "no roles ⇒ no admin"; the flagged
  rollout prevents accidental lock-out while moving from "everyone" to
  role-scoped access; `read_only` enables view-without-mutate for auditors.
- **Principle III (Transparency) / Governance:** the authorization model is
  recorded in [ADR 0012](../../docs/adr/0012-admin-rbac-entra-app-roles.md) and
  [patterns.md §4](../../.specify/memory/patterns.md), not left implicit in code.
- **Patterns §4 (Authentication & authorization):** admin stays on Entra;
  authorization is always server-side.

## Acceptance criteria

- [ ] `get_user_info()` no longer hardcodes `is_admin=True`; it reads the Entra
      `roles` claim and exposes `UserInfo.roles: list[str]`.
- [ ] `require_role(*roles)` (and optional `require_permission`) exists in
      `app/dependencies/admin_permissions.py`, layered on `get_admin_id`, with
      `super_admin` satisfying any check.
- [ ] All existing admin routers require at least the base `admin` role;
      `read_only` passes on reads only; ≥1 sensitive op requires `super_admin`.
- [ ] Enforcement is gated by `RBAC_ENABLED` (default OFF); with it OFF,
      behaviour equals today (no lock-out); with it ON, roles are enforced.
- [ ] Authorization failures return 403 with a stable code and are audited (no
      PHI).
- [ ] rettxadmin exposes the `roles` claim into auth state, adds a `roleGuard`
      layered on `MsalGuard`, and gates the sidenav via the spec 042
      `requiredRoles` slot.
- [ ] Client gating is UX only; 403s from the API are surfaced clearly; no
      client logic assumes it is the security control.
- [ ] No Auth0 in admin; no `Principal.role`; `Principal.status` unchanged.

## Open questions

- **Permission granularity:** ship pure role checks for the MVP, or introduce a
  thin `require_permission` map now? (Recommend: roles only, with
  `require_permission` as an optional convenience wrapper over the same roles.)
- **Group vs. user assignment:** assign App Roles to Azure AD **groups** or
  directly to **users**? (Ops decision — groups scale better; capture in the
  rollout runbook.)
- **`read_only` scope:** does `read_only` see every read endpoint, or a curated
  subset? (Recommend: all GETs for the MVP; curate later if needed.)

## Relationships

- Pairs with **[spec 042 — Admin app shell](../042-admin-app-shell/spec.md)**,
  which defines the `requiredRoles` nav extension point this spec consumes.
- Decision record: **[ADR 0012 — Admin RBAC via Entra App Roles](../../docs/adr/0012-admin-rbac-entra-app-roles.md)**.
- Conventions: **[patterns.md §4](../../.specify/memory/patterns.md)**
  (auth/authz, server-side enforcement) and §2 (role vocabulary).

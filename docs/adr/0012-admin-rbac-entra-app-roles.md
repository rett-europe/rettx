# ADR 0012 — Admin RBAC: Entra App Roles for membership + super_admin-configurable capabilities

- **Status**: Proposed (2026-07-26)
- **Date**: 2026-07-26
- **Decision-makers**: rettX maintainers (Pedro)
- **Relates to**: [spec 043 — Admin RBAC MVP](../../specs/043-admin-rbac-mvp/spec.md)
  (the enforcement + rollout this ADR governs),
  [spec 042 — Admin app shell](../../specs/042-admin-app-shell/spec.md)
  (the config-driven nav whose `requiredRoles` slot consumes these roles on the
  client), [patterns.md §4](../../.specify/memory/patterns.md)
  (authentication & authorization), and the program constitution
  **Principle VI (Security baseline)** — server-side authorization and least
  privilege.

## Context

The rettX admin surface (`rettxadmin`) and backend (`rettxapi`) today have
**authentication but no authorization** for admins.

- **Two deliberate identity planes.** Admin/staff authenticate via **Microsoft
  Entra ID (Azure AD) using MSAL**; caregivers authenticate via **Auth0**. This
  split is intentional. `rettxapi` admin endpoints trust **Entra tokens only**
  (`require_admin` → `get_admin_id` → `EntraClient`, `auth_provider="entra"`).
- **No RBAC exists.** In `app/authentication/entra_client.py`, `get_user_info()`
  **hardcodes `is_admin=True`**, and the real roles-claim check
  (`is_admin = payload.get('roles', []) == ["admin"]`) is **commented out**. Any
  authenticated Entra admin therefore has full, undifferentiated access.
- **The `Principal` model is the wrong home for admin roles.** `Principal`
  (`app/models/principal/principal_models.py`) represents the **Auth0/caregiver**
  identity and carries only an account-lifecycle `status`
  (`PROVISIONAL`/`ACTIVE`/`LOCKED`) — **not** an authorization field. Crucially,
  **admins are Entra principals and may have no `Principal` record at all**.
- On the client, `rettxadmin` guards routes with `MsalGuard` (authentication
  only); there is no role concept. Spec 042 introduces a config-driven nav with
  an optional `requiredRoles` extension point awaiting a role source.

We need a source of truth for **admin** authorization that (a) fits Entra
identities that may lack a `Principal` record, (b) is enforced server-side, and
(c) can be rolled out without locking existing admins out. In addition, the
product owner wants to **tune what `admin` and `read_only` can do at runtime**
(role-level, MVP) without an Azure AD change for every adjustment — so a purely
directory-driven permission model is too rigid.

## Decision

**Adopt a HYBRID model: Microsoft Entra App Roles own admin role
*membership*, while the granular *capabilities* each role grants are
rettX-managed configuration that a `super_admin` tunes at runtime.**

1. **Role membership rides the token.** Which admins are `super_admin` /
   `admin` / `read_only` is delivered in the verified Entra access-token
   **`roles` claim**. `rettxapi` reads the claim it already trusts (from existing
   signature/issuer/audience validation) — it does not add a new identity lookup.
   This layer is IT/ops-managed and deliberately coarse.
2. **Capabilities are rettX-managed config, not code and not Entra.** The
   granular capabilities (`area.action`, e.g. `patients.manage`,
   `campaigns.send`) that `admin` and `read_only` grant are held in a small
   **role→capability config document** persisted in rettX (e.g. an
   `admin_role_capabilities` Cosmos container), seeded with safe defaults
   (`admin` = all-but-super; `read_only` = views only). A `super_admin` edits this
   at runtime via a super-only endpoint — **no Azure AD round-trip** is needed to
   change product behaviour. Granularity is **role-level** (one set for all
   `admin`s, one for all `read_only`s); no per-user tuning, no custom roles.
3. **`super_admin` is fixed / break-glass.** It implicitly holds **all**
   capabilities, cannot be edited, diminished, or locked out, and is the only role
   permitted to edit the capability config (`rbac.manage`, super-only).
4. **Server-side enforcement is the boundary.** A `require_capability("area.action")`
   dependency in `app/dependencies/admin_permissions.py`, layered on
   `get_admin_id`, resolves the caller's Entra role → `super_admin` allows
   anything; otherwise it allows iff the **configured** capability set for that
   role contains the required capability. A thin `require_role(*roles)` backs the
   super-only config endpoints. `get_user_info()` stops hardcoding `is_admin=True`
   and instead surfaces `UserInfo.roles: list[str]`.
5. **Membership does NOT move onto `Principal`.** `Principal.role` stays unused;
   what rettX persists is a tiny role→capability **config document**, not identity
   and not per-user role assignment. Identity/membership remain in Entra.
6. **Flag-gated rollout.** Enforcement sits behind `RBAC_ENABLED`
   (**default OFF**). The enable sequence is: provision App Roles in the Entra
   app registration → seed capability defaults → assign roles to users/groups →
   verify the `roles` claim appears in issued tokens → flip `RBAC_ENABLED=on`.
7. **Config changes are audited** (actor + role + before/after capability sets);
   the full audit surface is a later spec (044), but the event is emitted now.
8. **Client gating is UX only.** `rettxadmin` reflects roles from the MSAL
   `roles` claim to gate nav items (via spec 042's `requiredRoles`) and routes,
   and hosts the `super_admin` capability editor, but never as a security
   control — the API decides.

### Why this is not a contradiction of "no DB-driven role"

The earlier stance rejected putting **role membership / identity** in the
database (a `Principal.role`). That still holds: **membership stays in Entra**.
What is now persisted in rettX is a small, coarse **role→capability map** — a
piece of **product configuration**, not identity and not a per-user assignment.
Separating the two lets IT/ops own *who is an admin* in the directory while the
product owner (`super_admin`) tunes *what an admin can do* at runtime, without a
directory change and without ever attaching a role to a caregiver `Principal`.

## Consequences

**Positive**

- **Fits the identity model.** Admin role *membership* attaches to the **Entra**
  identity that actually authenticates admins, with no dependency on a
  caregiver-oriented `Principal` record that admins may not have.
- **Clean split of ownership.** IT/ops own *who is an admin* (Entra App Roles);
  the product owner (`super_admin`) owns *what an admin can do* (the rettX
  capability config) and can iterate at runtime **without an Azure AD
  round-trip** — fast product tuning without directory changes.
- **Server-side, auditable enforcement** satisfies Constitution Principle VI and
  patterns.md §4; the client can only reflect access, never grant it. Capability
  config changes are audited (actor + before/after).
- **Safe rollout.** `RBAC_ENABLED=off` preserves today's behaviour until App
  Roles are provisioned/assigned and defaults are seeded, eliminating lock-out
  risk. `super_admin` is fixed and cannot be locked out.
- **Extensible.** Finer capabilities can be added to the catalog and toggled per
  role without schema or identity changes.

**Negative / costs**

- **New moving parts.** A **capability catalog**, a persisted **role→capability
  store** (with seeding/migration), a **super_admin editor UI**, and
  **capability resolution** in the enforcement path all have to be built and
  maintained — more than a pure role check.
- **Config is security-relevant.** The role→capability document governs access,
  so its edits must be tightly guarded (`super_admin` only), validated
  (no super-only capability assignable to `admin`/`read_only`), and **audited**.
- **Ops dependency remains.** Membership still requires Azure AD **App Role
  provisioning and assignment** (a directory/admin task).
- **Coordinated cross-repo change.** rettxapi (catalog + store + endpoints +
  enforcement + audit) and rettxadmin (role reflection + editor UI) must land
  together, tracked by spec 043 and fanned out as two `squad` issues.
- **Token/claim dependency.** If App Roles are misconfigured, tokens may omit the
  `roles` claim; the default-off flag and the "verify the claim" rollout step
  mitigate this, but it must be checked before enabling.

## Alternatives considered

- **Manage the granular permissions in Entra directly** (fine-grained App Roles
  or Entra-side permission scopes). *Rejected.* Entra App Roles are coarse and
  directory-managed: every product-level tweak to what `admin` can do would
  require an Azure AD change by IT/ops, making iteration slow and putting product
  decisions in the wrong hands. Keeping membership in Entra but the capability map
  in rettX config gives the product owner runtime control while preserving the
  directory as the identity source of truth.
- **DB-driven `Principal.role`** (role *membership* in the database). *Rejected.*
  Admins are Entra principals that may have **no `Principal` record** (Principal =
  the Auth0/caregiver identity), so a DB role field does not cleanly cover admin
  identities and **splits the identity source of truth**. Note this is distinct
  from the accepted decision: we persist a coarse role→**capability** config, not
  per-user role membership or identity.
- **Static allow-list of admin emails in config.** *Rejected.* Brittle and
  unauditable: no granularity (all-or-nothing), changes require a redeploy or
  config edit, and there is no directory-level record of who was granted what or
  when.
- **Move admin to Auth0 + Auth0 RBAC.** *Rejected.* Contradicts the backend's
  **Entra-only** admin trust (`auth_provider="entra"`), would break admin
  authentication, and imposes a larger migration for no benefit — the admin plane
  is deliberately on Entra.
- **Client-side-only gating in `rettxadmin`.** *Rejected.* UI gating (and the
  editor UI itself) is not a security control (Constitution Principle VI); anyone
  can bypass a hidden menu item by calling the API directly. Client gating stays,
  but only as UX on top of server-side enforcement.

## Cross-links

- [spec 043 — Admin RBAC MVP](../../specs/043-admin-rbac-mvp/spec.md)
- [spec 042 — Admin app shell](../../specs/042-admin-app-shell/spec.md)
- [patterns.md §4 — Authentication & authorization](../../.specify/memory/patterns.md)
- Constitution **Principle VI (Security baseline)** — server-side authorization,
  least privilege, auditability.

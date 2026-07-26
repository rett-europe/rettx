# ADR 0012 — Admin RBAC via Microsoft Entra App Roles

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
(c) can be rolled out without locking existing admins out.

## Decision

**Adopt Microsoft Entra App Roles as the source of truth for admin
authorization.**

1. **Roles ride the token.** Admin roles are delivered in the verified Entra
   access-token **`roles` claim**. `rettxapi` reads the claim it already trusts
   (from existing signature/issuer/audience validation) — it does not add a new
   identity lookup.
2. **Thin MVP role set:** `super_admin` (owner / break-glass; superset of all
   checks), `admin` (base operator role required by every admin endpoint), and
   `read_only` (view without mutate). Finer permissions can extend the same claim
   later.
3. **Server-side enforcement is the boundary.** A reusable dependency
   (`require_role(*roles)` / `require_permission(perm)` in
   `app/dependencies/admin_permissions.py`), layered on `get_admin_id`, gates
   admin routers. `get_user_info()` stops hardcoding `is_admin=True` and instead
   surfaces `UserInfo.roles: list[str]`.
4. **Flag-gated rollout.** Enforcement sits behind `RBAC_ENABLED`
   (**default OFF**). The enable sequence is: provision App Roles in the Entra
   app registration → assign to users/groups → verify the `roles` claim appears
   in issued tokens → flip `RBAC_ENABLED=on`.
5. **Client gating is UX only.** `rettxadmin` reflects roles from the MSAL
   `roles` claim to gate nav items (via spec 042's `requiredRoles`) and routes,
   but never as a security control — the API decides.

## Consequences

**Positive**

- **Fits the identity model.** Admin authorization attaches to the **Entra**
  identity that actually authenticates admins, with no dependency on a
  caregiver-oriented `Principal` record that admins may not have.
- **Single source of truth.** Roles live in Entra and travel in the token; there
  is no second store to keep in sync, and no split between identity and authz.
- **Server-side, auditable enforcement** satisfies Constitution Principle VI and
  patterns.md §4; the client can only reflect access, never grant it.
- **Safe rollout.** `RBAC_ENABLED=off` preserves today's behaviour until App
  Roles are provisioned and assigned, eliminating lock-out risk.
- **Extensible.** Finer-grained permissions can be layered onto the same `roles`
  claim without re-architecting identity.

**Negative / costs**

- **Ops dependency.** Requires Azure AD **App Role provisioning and assignment**;
  role changes are managed in Entra (a directory/admin task), not in the app DB.
- **Coordinated cross-repo change.** rettxapi (enforcement) and rettxadmin
  (reflection) must land together, tracked by spec 043 and fanned out as two
  `squad` issues.
- **Token/claim dependency.** If App Roles are misconfigured, tokens may omit the
  `roles` claim; the default-off flag and the "verify the claim" rollout step
  mitigate this, but it must be checked before enabling.
- **Coarse to start.** The three-role MVP does not model per-operation
  permissions yet; separation-of-duty beyond `super_admin`/`admin`/`read_only`
  is a follow-up on the same claim.

## Alternatives considered

- **DB-driven `Principal.role`.** *Rejected.* Admins are Entra principals that
  may have **no `Principal` record** (Principal = the Auth0/caregiver identity),
  so a DB role field does not cleanly cover admin identities. It also **splits
  the identity source of truth** between Entra (authentication) and the DB
  (authorization) and adds moving parts (persistence, sync, lifecycle).
- **Static allow-list of admin emails in config.** *Rejected.* Brittle and
  unauditable: no granularity (all-or-nothing), changes require a redeploy or
  config edit, and there is no directory-level record of who was granted what or
  when.
- **Move admin to Auth0 + Auth0 RBAC.** *Rejected.* Contradicts the backend's
  **Entra-only** admin trust (`auth_provider="entra"`), would break admin
  authentication, and imposes a larger migration for no benefit — the admin plane
  is deliberately on Entra.
- **Client-side-only gating in `rettxadmin`.** *Rejected.* UI gating is not a
  security control (Constitution Principle VI); anyone can bypass a hidden menu
  item by calling the API directly. Client gating stays, but only as UX on top of
  server-side enforcement.

## Cross-links

- [spec 043 — Admin RBAC MVP](../../specs/043-admin-rbac-mvp/spec.md)
- [spec 042 — Admin app shell](../../specs/042-admin-app-shell/spec.md)
- [patterns.md §4 — Authentication & authorization](../../.specify/memory/patterns.md)
- Constitution **Principle VI (Security baseline)** — server-side authorization,
  least privilege, auditability.

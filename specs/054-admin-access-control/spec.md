<!--
  Frontmatter below is machine-read by .github/workflows/spec-fanout.yml when
  this spec is merged into main. Fanout only runs when status is `ready` or
  `accepted`. While `draft`, nothing fans out, so it is safe to review and
  iterate.

  Allowed fanout repos: rettxweb, rettxadmin, rettxapi, rettxmutation, rettxid,
  templates, rettxinfra.

  STACK & DELIVERY PRE-FLIGHT (patterns.md §7): this spec changes who may call
  which admin operation (rettxapi), what the admin dashboard shows (rettxadmin)
  and which admin roles exist and who holds them (rettxinfra, per ADR 0016).
  The caregiver app, templates, rettxmutation and rettxid are unaffected, so
  they get no slice.

  IMPORTANT: this spec is OUTCOMES ONLY. `rettx` is a PUBLIC repo. The
  endpoint-by-endpoint inventory of today's admin surface, the gaps it found,
  and the names of people holding roles live in the private repos.
-->
---
spec_id: "054"
slug: "admin-access-control"
title: "Admin access control: every admin action needs a named permission"
status: draft   # draft | ready | accepted | superseded
authored: "2026-11-16"
author: "perocha"
source_issue: ""
relates_to: "specs/043-admin-rbac-mvp/ (extends it; supersedes its read_only role and its rettxadmin slice); docs/adr/0012-admin-rbac-entra-app-roles.md (amended); specs/048-admin-access-audit/ (complements its refusal auditing); docs/adr/0016-infrastructure-as-code-private-repo.md (role membership as code)"
fanout:
  - repo: rettxapi
    summary: |
      OWNER OF ENFORCEMENT. Spec 043 switched admin role checks on, but
      permissions are still grouped coarsely by area, so several sensitive
      actions (sending, exporting, deleting, changing identity, validating
      genetic results, reading audit trails) cannot be granted or withheld on
      their own. Do:
      (1) Gate every admin operation by exactly one capability from this
      spec's catalog, chosen by what the operation does to which class of
      data, not by HTTP method. Read-only operations need a view capability
      whatever method they use. An admin operation without a declared
      capability is refused, and the API's own checks fail the build if one
      is introduced.
      (2) Treat the role set as data: any role in the caller's token that has
      a stored capability bundle is honoured; a role without one grants
      nothing. super_admin keeps all capabilities and cannot be edited.
      super_admin can create, edit and delete bundles for other roles, with
      no lost updates when two edits race.
      (3) Tell a signed-in admin their effective capabilities.
      (4) Seed the roles for this MVP: admin = every capability except
      rbac.manage; viewer = stats.view. Retire read_only.
      (5) Audit every refused admin request (who, their roles, the missing
      capability, the operation, a traceable request id), including refusals
      for missing roles and super_admin-only operations.
      (6) Capability edits take effect within 5 minutes with no restart.
      (7) Credentials are never written to logs at any level.
  - repo: rettxadmin
    summary: |
      CONSUMER (UX only, the API decides). Supersedes spec 043's rettxadmin
      slice. Ask the API what the signed-in admin can do, and show only the
      screens, menu entries and actions they can use. Show one consistent
      "you don't have permission" experience for every refusal, distinct from
      other errors (for example a locked patient). A refused page shows no
      data and does not silently fail to open. A viewer sees the Overview,
      limited to the figures they hold. super_admin gets a role editor: list
      roles and their capabilities, create, edit and delete bundles for
      non-fixed roles, with super_admin shown as fixed.
  - repo: rettxinfra
    summary: |
      Own admin role definitions and membership as code (ADR 0016). Add the
      `viewer` role to the admin app registration. Every person-to-role
      assignment is a reviewed change that super_admin approves. Provide test
      assignments for a viewer and an admin to smoke-test the rollout. After
      cutover, remove the `read_only` role. Adding a future job role is a
      role definition here plus a capability bundle stored by super_admin,
      with no app code.
---

# Feature Specification: Admin access control

**Feature Branch**: `054-admin-access-control`
**Created**: 2026-11-16
**Status**: Draft
**Input**: "We need an holistic plan for this, involving rettxapi. We should be
able to restrict access to certain endpoints." … "I want to have a first MVP of
RBAC and at the same time, design a solution that is future-proof."

---

## Why this exists

[Spec 043](../043-admin-rbac-mvp/spec.md) gave the admin dashboard roles: role
membership comes from Entra, and what each role may do is a capability set
stored in rettX and editable by `super_admin`. That model is in production.

It is not yet enough to run the registry with more than one kind of staff:

- **Permissions are too coarse.** They are grouped by area (patients, users,
  campaigns, …) and split only into "view" and "change". Sending messages,
  exporting registry data, deleting a patient, changing a patient's identity,
  validating a genetic result and reading audit trails cannot be granted or
  withheld on their own.
- **The read-only role is too broad.** Today it can view personal data. The
  people who need a read-only seat (board members, stakeholders) need aggregate
  figures only.
- **The dashboard doesn't know who you are.** It shows every screen to every
  admin, and refusals look like ordinary errors.
- **Adding a new kind of staff role is a code change**, because the role set
  is fixed.

A read-only assessment of today's admin surface (every admin operation, every
dashboard screen, and the action each performs) produced the decisions below.
The inventory itself stays in the private repos.

## The model

Four layers, each owned in one place:

| Layer | Question | Owner | Changed by |
|---|---|---|---|
| People → roles | Who holds which role? | Entra, as code in rettxinfra | A reviewed rettxinfra change, approved by super_admin |
| Roles → capabilities | What does each role bundle? | Data stored in rettX | super_admin, in the admin dashboard |
| Capabilities → operations | Which capability does each admin operation need? | rettxapi (the security boundary) | Code |
| Capabilities → screens | What does the dashboard show? | rettxadmin (convenience only) | Code |

Only the third layer is expensive to change, so this spec gets it right once,
for the whole admin surface. Everything that varies with how the team is
organised (roles and their bundles) is data.

### Design rules

1. **A capability is an action on a class of data, not a screen.**
   Identified data (anything that names or can single out a person) and
   aggregate or de-identified data are different classes, so they get
   different capabilities.
2. **Roles are named bundles of capabilities**, stored as data. A new role
   needs a role definition in rettxinfra and a bundle stored by super_admin,
   and no code in rettxapi or rettxadmin.
3. **Deny by default.** Every admin operation needs exactly one capability. An
   operation without one is refused. A new capability is held by nobody but
   super_admin until it is granted.
4. **The dashboard asks; the API decides.** The dashboard shows what the API
   says the admin may do. Hiding a button is never the control.
5. **New features bring their own capabilities.** For example, a future
   de-identified genetics curation feature would add its own capability and
   role through its own spec, without touching existing ones.

## Capability catalog

New capabilities are marked ★. Capabilities from spec 043 keep their names.

| Capability | Allows | Data class |
|---|---|---|
| `stats.view` ★ | Aggregate figures: the Overview, distributions, counts | Aggregate |
| `patients.view` | Read patient records, their files, diagnoses, clinical and care information | Identified |
| `patients.manage` | Change patient records other than identity, genetics and deletion | Identified |
| `patients.delete` ★ | Delete a patient, including revoking everyone's access to them | Identified |
| `identity.manage` ★ | Change, lock or unlock a patient's identity | Identified |
| `genetics.view` | Read genetic results and the mutation catalog | Identified |
| `genetics.validate` ★ | Validate or reject a patient's genetic report and mutations, and choose the primary mutation | Identified |
| `genetics.manage` | Maintain the shared mutation catalog and its search | Reference |
| `users.view` | Read caregiver accounts and who can access which patient | Identified |
| `users.manage_access` | Grant, change or revoke caregiver access and features | Identified |
| `surveys.view` / `surveys.manage` | Read / change surveys and their assignments | Identified |
| `campaigns.view` / `campaigns.manage` | Read / prepare messaging campaigns | Identified |
| `campaigns.send` | Send, resend or retry any message, push notification or campaign | Identified |
| `pulse_catalog.view` / `pulse_catalog.manage` | Read / change the Pulse metric catalog | Reference |
| `data.export` ★ | Take any report, extract or snapshot of registry data out of the dashboard | Any |
| `audit.view` | Read any audit trail, including delivery statistics | Identified |
| `rbac.manage` | Edit role bundles. Held only by super_admin; cannot be granted | Configuration |

Read-only operations need a view capability whatever technical form they take.

## Roles in this MVP

| Role | Bundle | Who |
|---|---|---|
| `super_admin` | Everything, fixed, cannot be edited or locked out | Owner |
| `admin` | Every capability except `rbac.manage` (today's reach, so nobody loses access) | Operators |
| `viewer` (replaces `read_only`) | `stats.view` | Board members, stakeholders |

Specialised job roles (for example patient support, communications, access
management, data stewardship, genetics curation) are **not** part of this MVP.
Each can be added later as data and a rettxinfra change, when real people need
it.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — A board member sees figures, not people (P1)

A stakeholder holds `viewer`. They sign in and see the Overview with the
aggregate figures. No menu entry leads to patients, users, surveys, campaigns
or audit. Opening such a page by its address shows "you don't have
permission" and no data.

**Acceptance**

1. **Given** a viewer, **when** they open the dashboard, **then** they land on
   the Overview and see only figures covered by `stats.view`.
2. **Given** a viewer, **when** they call any admin operation that needs
   anything but `stats.view`, **then** it is refused and the refusal is audited.

### User Story 2 — Operators keep working (P1)

An operator holds `admin`. After rollout they can do everything they could
before, except edit roles.

**Acceptance**

1. **Given** an admin, **when** they use any screen they used before rollout,
   **then** it works as before.
2. **Given** an admin, **when** they try to edit roles, **then** it is refused.

### User Story 3 — A sensitive action can be withheld on its own (P1)

super_admin removes `campaigns.send` from a role. Holders of that role can
still prepare campaigns but cannot send anything; the send buttons disappear
and a direct attempt is refused within 5 minutes of the change.

### User Story 4 — A new kind of staff role without code (P2)

The team needs a "communications" role. super_admin approves a rettxinfra
change that defines the role and assigns two people, then stores its bundle in
the role editor. Both people get exactly that bundle. Nothing is released in
rettxapi or rettxadmin.

### User Story 5 — Refusals are traceable (P2)

A refused request can be found in the audit trail by person, operation,
missing capability, and request id, and matched to the request in the API's
telemetry.

### Edge cases

- **Several roles:** a person's capabilities are the union of their roles'
  bundles.
- **No role, or an unknown role:** grants nothing; every admin operation is
  refused.
- **Role store unavailable:** non-super requests are refused (fail closed);
  super_admin is unaffected. Service recovers without a restart.
- **Two super_admins edit the same role at once:** one edit wins and the other
  is told to reload; nothing is silently lost.
- **A person is removed from a role:** they lose it when their current sign-in
  token expires (up to about an hour, set by Entra). Capability edits apply
  within 5 minutes.
- **A role is deleted in rettxinfra but its bundle remains:** nobody holds it;
  the dashboard flags it as unused.
- **A capability is added in a later release:** nobody but super_admin holds it
  until a bundle grants it.

---

## Requirements *(mandatory)*

### Enforcement (rettxapi)

- **FR-001** Every admin operation MUST require exactly one capability from the
  catalog, chosen by the action and the class of data it touches.
- **FR-002** An admin operation without a declared capability MUST be refused,
  and introducing one MUST fail rettxapi's own checks before release.
- **FR-003** Read-only operations MUST need a view capability regardless of
  their technical form.
- **FR-004** The role set MUST be data: a role in the caller's token with a
  stored bundle is honoured; a role without one grants nothing; capabilities
  across roles combine as a union.
- **FR-005** `super_admin` MUST hold every capability, MUST NOT be editable,
  and MUST be the only holder of `rbac.manage`.
- **FR-006** super_admin MUST be able to list, create, edit and delete role
  bundles other than super_admin's. Unknown capabilities and `rbac.manage`
  MUST be rejected. Concurrent edits MUST NOT silently overwrite each other.
  Every change MUST be audited with before and after.
- **FR-007** A signed-in admin MUST be able to learn their effective
  capabilities from the API.
- **FR-008** Capability edits MUST take effect within 5 minutes without a
  restart.
- **FR-009** Every refused admin request MUST be audited with the actor, their
  roles, the missing capability, the operation, and a request id traceable in
  telemetry. This includes refusals for missing roles and super_admin-only
  operations. No personal data in the event.
- **FR-010** Credentials and tokens MUST NOT be written to logs at any log
  level.

### Dashboard (rettxadmin, UX only)

- **FR-011** The dashboard MUST show only the screens, menu entries and actions
  the admin's effective capabilities allow.
- **FR-012** Every refusal MUST produce one consistent "you don't have
  permission" experience, distinguishable from other errors such as a locked
  patient. A refused page MUST show no data and MUST NOT fail silently.
- **FR-013** A viewer MUST land on the Overview and see only the figures
  `stats.view` covers.
- **FR-014** super_admin MUST have a role editor covering FR-006, showing
  super_admin as fixed and never offering `rbac.manage` as grantable.

### Roles and membership (rettxinfra)

- **FR-015** Admin role definitions and every person-to-role assignment MUST be
  code in rettxinfra, changed only through a review approved by super_admin.
- **FR-016** The `viewer` role MUST exist before rollout; `read_only` MUST be
  removed after cutover.

### Rollout

- **FR-017** Rollout MUST NOT lock anyone out. Order:
  1. rettxinfra adds `viewer`.
  2. rettxapi ships the full mapping, FR-007, and the seeded bundles
     (`admin`, `viewer`).
  3. rettxadmin ships the capability-aware dashboard and the role editor.
  4. A test viewer and a test admin smoke-test their stories.
  5. rettxinfra removes `read_only`, and its stored bundle is deleted.
- **FR-018** At any step, switching role enforcement off MUST restore today's
  behaviour for every signed-in, assigned admin.

### Explicitly out of scope

- Specialised job roles (later, as data).
- A de-identified genetics curation feature and its role (its own spec).
- Per-person permissions; permissions are per role only.
- Moving admins off Entra, or any change to caregiver sign-in.

---

## Success Criteria *(mandatory)*

- **SC-001** 100% of admin operations declare exactly one capability, and the
  check that enforces it runs on every rettxapi change.
- **SC-002** A viewer can reach no personal data through the dashboard or the
  API.
- **SC-003** After rollout, an admin can do everything they could before,
  except edit roles.
- **SC-004** A new role with its own bundle is live with no rettxapi or
  rettxadmin release.
- **SC-005** Every refusal in a rollout smoke test appears in the audit trail
  with its request id.

## Assumptions

- Role membership is delivered in the Entra access token, as in spec 043.
- The capability store from spec 043 is reused; its existing `admin` bundle is
  updated to include the new capabilities at rollout.
- Today only the owner holds an admin role, so renaming `read_only` affects
  nobody.

## Open questions

- **Individual messages vs. bulk sends.** Should sending one message to a
  patient's caregivers (welcome, reminders, requests for information) be a
  separate capability from bulk campaigns and push notifications? It would let
  a future patient-support role write to families without being able to
  message everyone. Recommendation: split now (`messages.send` and
  `campaigns.send`), since the mapping is done once.
- **Small numbers in aggregates.** Should figures shown to a viewer suppress
  very small counts, which in a rare-disease registry could single someone
  out? Recommendation: decide before the first real viewer is assigned.

## Relationships

- Extends [spec 043](../043-admin-rbac-mvp/spec.md): same model, finer
  catalog, open role set. Supersedes 043's `read_only` role and its rettxadmin
  slice.
- Amends [ADR 0012](../../docs/adr/0012-admin-rbac-entra-app-roles.md): the
  role set is no longer fixed.
- Complements [spec 048](../048-admin-access-audit/spec.md): FR-009 covers
  every refusal, which 048's access history can surface.
- Membership as code: [ADR 0016](../../docs/adr/0016-infrastructure-as-code-private-repo.md),
  [spec 052](../052-rettxinfra/spec.md).

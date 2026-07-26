<!--
  Frontmatter below is machine-read by .github/workflows/spec-fanout.yml when
  this spec is merged into main. The `fanout` array drives which downstream
  repos get a `[spec/<slug>] <title>` issue with the `squad` label. Fanout only
  runs when `status:` is `ready` or `accepted` — while this is `draft` nothing
  fans out, so it is safe to review and iterate. Flip `status: ready` (the
  single switch) when the spec is agreed and you want the squad issues opened
  on merge.

  Allowed fanout repos: rettxweb, rettxadmin, rettxapi, rettxmutation, rettxid, templates.

  STACK & DELIVERY PRE-FLIGHT (patterns.md §7): fanout targets checked against
  patterns.md §1.
  - rettxapi = Python 3.11 / FastAPI / Azure Functions v4 / Cosmos DB. Owns the
    API contract, the patient_access grant model, the new invite entity, and the
    NEW narrow `pulse` permission scope + its server-side guard.
  - rettxweb = Angular 18 PWA wrapped with Capacitor as a NATIVE Android app
    (iOS planned), Auth0 OIDC. Invite acceptance ties into the Auth0 sign-up /
    email-verification path; invite/join nudges use the NATIVE FCM device-token
    push path (Capacitor Push plugin), not Web Push/VAPID.
  - rettxadmin = Angular 18 / Entra ID (MSAL). Admin visibility + grant/revoke.
  - templates = per-locale Message Center templates (email + in-app + push) AND
    the new versioned "Pulse Contribution Consent" ConsentDocument + any Auth0
    email template changes. A missing channel file is silently skipped at
    render, so every channel that should notify MUST have its template here.
  - rettxid = NOT affected. The pseudonymous rettX ID is unchanged and invite
    tokens are NOT rettX IDs. Entry intentionally omitted from fanout.
-->
---
spec_id: "041"
slug: "multi-caregiver-sharing"
title: "Patient Sharing — Pulse Contributors (Consent-Gated, Privacy-First)"
status: ready   # draft | ready | accepted | superseded
authored: "2026-07-25"
author: "perocha"
fanout:
  - repo: rettxapi
    summary: |
      Backend + OWNER of the sharing API contract. Today the `patient_access`
      container can already REPRESENT multiple grants per patient (grants keyed
      by `principal_id`, active-only filters `include_revoked`/`include_deleted`,
      `query_by_principal_id` lookup) and access is enforced by
      `require_patient_read_access_v2` (READONLY+) and
      `require_patient_write_access_v2` (EDIT+). What is MISSING is any mechanism
      to CREATE a share. Build the CONSTRAINED v1:

      (1) New pending **Invitation** entity/container keyed by the invited
      EMAIL, with a state machine
      `pending → accepted | declined | expired | cancelled`, a single-use token
      stored HASHED at rest, an expiry (default 7 days), the inviter (owner or
      admin), the target patient, the fixed `pulse` scope, and the Pulse
      Contribution Consent id/version to be accepted. There is NO role choice.
      Invites are NOT restricted to already-registered users (Model B — invite
      any email, provision-on-accept).
      (2) New NARROW permission scope `pulse` (contribute), strictly weaker than
      `edit`: it permits CREATING Pulse entries and a MINIMAL read (patient
      display name/nickname + the Pulse tracker & history) and NOTHING else —
      NO genetic data, NO documents, NO medical profile, and NO edit of patient
      info. Add a `require_patient_pulse_write` dependency and ensure Pulse-write
      endpoints accept it while every non-Pulse read/write endpoint rejects it.
      This MUST be enforced server-side (UI hiding is not a control).
      (3) RESOLVE-INVITATION-TO-GRANT on ACCEPT (post-authentication): if the
      invitee has no rettX account they self-register via the EXISTING Auth0
      signup (rettxapi does NOT create Auth0 users) and their Principal is
      JIT-provisioned by the existing `ensure_principal_for_user` path; then
      verify the authenticated principal's VERIFIED email matches `invited_email`
      (reject on mismatch — THIS is the wrong-email enforcement point), require
      acceptance of the current Pulse Contribution Consent version, and create the
      `pulse` `patient_access` grant RECORDING the accepted consent
      (`consent_document_id` + `version` + `accepted_at` + `principal_id`),
      transitioning the invitation `pending → accepted`.
      (4) Revocation: only the OWNER (or admin) may revoke a contributor; a
      contributor may self-revoke (= consent withdrawal). Revoke = soft (reuse
      `include_revoked`); Pulse entries the contributor authored REMAIN with
      provenance preserved.
      (5) Pre-accept data minimization: endpoints reachable by an
      unauthenticated/mismatched recipient MUST expose NOTHING identifying about
      the patient.
      (6) Rate-limit invite creation and accept attempts. Emit an AUDIT event for
      every lifecycle transition, no PII in logs.
      (7) Attribute every Pulse entry to the acting `principal_id`; keep visible
      history. Trigger Message Center sends (invite, "someone joined your
      patient") — content authored in `templates`.
      Endpoints: create-invite, list-invites (owner), resend-invite,
      cancel-invite, accept-invite, decline-invite, list-contributors (owner),
      revoke-contributor.
      NET-NEW pieces are exactly: (a) the pending email-keyed **Invitation**
      entity + lifecycle; (b) the **resolve-invitation-to-grant** step
      (verified-email-match + consent record + `pulse` grant creation); (c) the
      invite-issue + accept endpoints. rettxapi MUST NOT gain Auth0
      user-creation and MUST NOT change the `Principal` model — the invitee
      self-registers via existing Auth0 signup and JIT provisioning does the
      rest.
  - repo: rettxweb
    summary: |
      Caregiver-facing (Auth0, Capacitor native Android) UI:
      (1) Owner "invite a Pulse contributor": enter email only (no role picker),
      see pending invites, resend/cancel, and a list of active contributors with
      revoke.
      (2) Accept-invite flow for the invitee: land from the invite link →
      authenticate (or Auth0 sign-up + email verification if no account) → the
      screen reveals NOTHING identifying about the patient until the email-match
      passes → review + accept the Pulse Contribution Consent → access granted.
      Handle decline and expired/invalid tokens gracefully.
      (3) Contributor's CONSTRAINED view: only the patient display name/nickname
      + the Pulse tracker & history + the ability to add Pulse entries. No
      genetic data, documents, medical profile, or edit surfaces. A contributor
      may self-revoke ("leave").
      (4) Notifications: in-app + NATIVE push (FCM device token via the Capacitor
      Push plugin — NOT Web Push/VAPID) to the OWNER for invite sent and someone
      joined; to the invitee for the invite itself.
      (5) RE-CONSENT UX (net-new): the backend already enforces consent-version
      acceptance, but rettxweb has no UI for it. Build the re-consent gate — when
      a contributor's recorded consent version is behind the current one, block
      further Pulse contribution and present the new consent to accept (or
      decline = leave) before they can continue.
  - repo: rettxadmin
    summary: |
      Admin-facing (Entra ID / MSAL) support path:
      (1) View every principal who can access a patient (owner + contributors,
      including revoked), with scope, consent status, and accepted-at.
      (2) Admin-initiated grant of the Pulse-contributor scope — which STILL
      requires the invitee to complete the same consent double-opt-in; admin
      cannot silently add a contributor.
      (3) Admin revoke and a read-only view of the invite/grant AUDIT trail.
  - repo: templates
    summary: |
      Author the content this spec renders (a missing channel file is silently
      skipped, so every notifying channel needs its files here):
      (1) New Message Center templates, per-locale, for: Pulse-contributor invite
      and "a contributor joined your patient" — with email (`<locale>.html` +
      `<locale>.subject.txt`), in-app (`<locale>.inapp.txt` where the email is a
      poor in-app fit), and push (`<locale>.push.subject.txt` +
      `<locale>.push.txt`, generic / PHI-free).
      (2) A new versioned "Pulse Contribution Consent" ConsentDocument, distinct
      from the patient-creation consent and scoped to contributing Pulse
      observations only.
      (3) Any Auth0 email-template changes needed for the invitee sign-up /
      email-verification path.
---

# Feature Specification: Patient Sharing — Pulse Contributors (Consent-Gated, Privacy-First)

**Feature Branch**: `041-multi-caregiver-sharing`  
**Created**: 2026-07-25  
**Status**: Draft  
**Input**: Control-plane brainstorm — let a patient owner share their patient
with additional people so those people can **help log Pulse**, with **consent**
and **privacy** as the central constraints, while keeping v1 complexity tightly
constrained.

## Decisions locked (2026-07-25)

1. **Initiation** — **Both**: the patient **owner** (creator) invites
   (self-service, primary); **admin** is a support path. Neither may bypass
   invitee consent.
2. **Wrong-email safeguard** — **Strictest**: nothing identifying is revealed
   pre-acceptance; a grant is created only when the accepting identity's
   **verified email matches** the invited address — enforced at **invitation
   resolution** (see Model B below).
3. **Constrained sharing model (single owner + Pulse contributors)** — there is
   **one owner** (the creator) and no "co-caregiver" concept. Invitees are
   **Pulse contributors**: they can **only create Pulse entries** and have a
   **minimal read** (patient display name/nickname + the Pulse tracker &
   history). They **cannot** edit patient info, see genetic data / documents /
   medical profile, or invite/revoke anyone. There is **no role picker**.
4. **Consent** — a **new, distinct, versioned "Pulse Contribution Consent"**,
   scoped to contributing observations, recorded on the `patient_access` grant.

**Explicitly out of scope for v1**: multiple equal owners, ownership transfer,
and complex custody situations (e.g. divorced / dual-equal parents). These are
accepted as corner cases to be revisited later.

## Platform constraint & invite flow (Model B)

rettX **cannot store a person without a pre-existing Auth0 identity** — verified
in the live `rettxapi` code:

- `Principal` (`app/models/principal/principal_models.py`) requires
  `identities: list[Identity]` with `min_length=1`; each `Identity.user_id`
  (Auth0 `sub`) is mandatory. There is **no** placeholder / pending principal.
- Principals are created **only** by JIT provisioning on a user's **first
  authenticated login** (`app/routers/users.py` `/user/profile` →
  `PrincipalProfileServices.ensure_principal_for_user`, created with
  `status=PROVISIONAL`). There is no other creation path.
- `patient_access` grants **require an existing `principal_id`**: `grant_access`
  calls `_validate_principal_exists` and 404s if it is missing
  (`app/services/patient_access_services/patient_access_services.py`). There is
  **no** grant-by-email and no pending grant.
- The Auth0 client (`app/authentication/auth0_client.py`) can read / search /
  update users and send verification emails but has **no `create_user`** —
  rettxapi **cannot mint Auth0 accounts**.

**Decision — Model B: invite any email, provision-on-accept** (Pedro,
2026-07-26). Invites are **not** restricted to already-registered users; a
brand-new email can be invited **without rettxapi ever creating an Auth0 user**,
by reusing the existing Auth0 self-signup + JIT path:

1. **Issue.** The owner (or admin) creates a pending **Invitation** keyed by the
   invited **email** (net-new entity — see Key Entities). Nothing identifying
   about the patient is exposed pre-acceptance.
2. **Self-register (if needed).** The invitee opens the invite link. If they have
   no rettX account they **self-register through the existing Auth0 signup** —
   that is what mints the Auth0 identity; rettxapi does not. Their **Principal is
   JIT-provisioned** on first authenticated login via the existing
   `ensure_principal_for_user` path. If they already have an account, they log in.
3. **Resolve.** After authentication, accepting the invitation **resolves it into
   a `pulse` `patient_access` grant**: the system enforces that the authenticated
   **principal's verified email matches `invited_email`** (this is the
   wrong-email safeguard's enforcement point), records the Pulse Contribution
   Consent acceptance on the grant, and transitions the invitation
   `pending → accepted`. Decline / expiry / cancel follow the lifecycle.

The **only** net-new backend pieces are therefore: **(a)** the pending
email-keyed **Invitation** entity + its lifecycle; **(b)** the
**resolve-invitation-to-grant** step (verified-email-match + consent record +
`pulse` grant creation); and **(c)** the **invite-issue and accept endpoints**.
There is **no** Auth0 `create_user` and **no** change to the `Principal`
model — the invitee self-registers and JIT provisioning does the rest.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Owner invites a Pulse contributor by email (Priority: P1)

The patient owner wants a partner/relative/carer to help log Pulse. From the
patient screen they enter that person's email and send an invite (no role to
choose). They see it as `pending` and can resend or cancel it.

**Why this priority**: This is the core missing capability — there is currently
no way to create a share at all. It is the smallest slice that delivers value.

**Independent Test**: Sign in as the owner, invite an email, confirm a `pending`
invite exists and an invite message is dispatched — with no second user yet.

**Acceptance Scenarios**:

1. **Given** an owner viewing their patient, **When** they invite
   `x@example.com`, **Then** a `pending` invite is created, an invite message is
   sent to that address, and the owner sees it listed as pending.
2. **Given** a `pending` invite, **When** the owner cancels it, **Then** its
   state becomes `cancelled` and the token can no longer be accepted.
3. **Given** a principal who is **not** the owner (e.g. a contributor),
   **When** they attempt to invite someone, **Then** the request is rejected.

### User Story 2 - Invitee accepts safely with consent (Priority: P1)

The invited person opens the invite, authenticates (or **self-registers via the
existing Auth0 signup** if they have no account, which JIT-provisions their
Principal on first login), sees **nothing identifying** about the patient until
their verified email is confirmed to match, reviews and accepts the Pulse
Contribution Consent, and only then gains the Pulse-contributor scope.

**Why this priority**: Consent + privacy are the non-negotiable constraints;
acceptance is what actually creates access. With Story 1 this is the MVP.

**Independent Test**: Follow an invite link as the correct recipient, verify no
patient-identifying data is shown pre-acceptance, complete consent, and confirm
an active `pulse`-scope grant carrying the consent record.

**Acceptance Scenarios**:

1. **Given** a valid `pending` invite, **When** the recipient authenticates with
   a verified email that **matches** the invited address and accepts the current
   Pulse Contribution Consent, **Then** an `active` `patient_access` grant is
   created at the `pulse` scope, carrying the consent id/version/timestamp, and
   the constrained contributor view becomes available.
2. **Given** a valid `pending` invite, **When** a person authenticates with an
   email that does **not** match, **Then** access is **not** granted and no
   patient-identifying information is disclosed.
3. **Given** a `pending` invite past its expiry, **When** anyone opens it,
   **Then** it is `expired` and cannot be accepted (owner may resend).
4. **Given** a valid invite, **When** the recipient declines, **Then** its state
   becomes `declined` and no grant is created.
5. **Given** an invited email with **no** rettX account, **When** the recipient
   self-registers via the existing Auth0 signup and logs in, **Then** their
   Principal is JIT-provisioned (no rettxapi-side Auth0 user creation) and, on
   accepting with a matching verified email + consent, a `pulse` grant is
   created.

### User Story 3 - Contributor logs Pulse, tightly scoped (Priority: P2)

An active Pulse contributor can view the patient's name/nickname and the Pulse
tracker & history, and can add Pulse entries. They cannot reach anything else.
Each entry is attributed to them and is visible to the owner.

**Why this priority**: This is the actual day-to-day value, but it depends on
Stories 1–2.

**Independent Test**: As a contributor, add a Pulse entry (succeeds, attributed)
and attempt to read/edit patient profile or genetic data (all denied
server-side).

**Acceptance Scenarios**:

1. **Given** a `pulse`-scope contributor, **When** they add a Pulse entry,
   **Then** it is stored, attributed to their principal, and visible to the
   owner in shared history.
2. **Given** a `pulse`-scope contributor, **When** they request the patient's
   genetic data, documents, or medical profile, or attempt to edit patient info,
   **Then** the request is **rejected server-side**.
3. **Given** a `pulse`-scope contributor, **When** they view the patient,
   **Then** they see only the display name/nickname and the Pulse tracker &
   history.
4. **Given** a contributor whose recorded consent version is behind the current
   Pulse Contribution Consent, **When** they open the patient to log Pulse,
   **Then** contribution is blocked until they accept the current version
   (declining = leave / self-revoke).

### User Story 4 - Revocation & offboarding (Priority: P2)

The owner (or admin) can revoke a contributor; a contributor can leave (withdraw
consent). Access ceases immediately; Pulse entries they authored remain as the
patient's record with provenance intact.

**Why this priority**: Withdrawal must be possible at any time (Principle I).

**Acceptance Scenarios**:

1. **Given** an active contributor, **When** the owner revokes them, **Then**
   the grant becomes `revoked`, access stops immediately, and their authored
   Pulse entries remain visible with attribution.
2. **Given** an active contributor, **When** they choose to leave, **Then** their
   own grant is revoked (consent withdrawn).

### User Story 5 - Admin support path (Priority: P3)

An admin can see the owner + all contributors on a patient, initiate a
Pulse-contributor grant (still consent-gated), revoke, and read the audit trail.

**Acceptance Scenarios**:

1. **Given** an admin, **When** they open a patient, **Then** they see the owner
   and all contributors (including revoked) with scope + consent status +
   accepted-at.
2. **Given** an admin-initiated grant, **When** the target has not consented,
   **Then** access is **not** active until the target completes the same consent
   double-opt-in.

### Edge Cases

- Invitee has **no account** → invite routes into Auth0 sign-up + email
  verification before the review/consent step.
- Invitee is **already** a contributor → invite is a no-op / surfaced as
  already-shared, not a duplicate grant.
- Owner invites their **own** email → rejected with a clear message.
- Token **reuse / replay** after acceptance or on another device → rejected
  (single-use, hashed).
- Email address **changes** at the IdP between invite and accept → match is
  against the *verified* email at accept time.
- Patient is **deleted** while an invite is pending → invite is invalidated.
- Contributor authorship surfaces a name in Pulse history → other contributors
  may see that name via entry attribution (accepted; there is no separate
  contributor-management view for contributors).
- Rapid repeated invites (spray) → rate-limited.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The patient **owner** (P1) and an **admin** (P3) MUST be able to
  create an invite to grant the Pulse-contributor scope on a specific patient to
  an email address. No other principal may invite.
- **FR-002**: An invite MUST NOT offer a role/permission choice — it grants
  exactly the fixed **`pulse`** (contribute) scope.
- **FR-003**: The system MUST provide a **`pulse` permission scope** that is
  strictly narrower than `edit`: it permits creating Pulse entries and a minimal
  read (patient display name/nickname + Pulse tracker & history) and MUST deny
  everything else (genetic data, documents, medical profile, any patient-info
  edit). This MUST be enforced **server-side**.
- **FR-004**: An invite MUST carry a state in `{pending, accepted, declined,
  expired, cancelled}`, a single-use token **hashed at rest**, an expiry
  (default 7 days), the invited email, the inviter (owner/admin), and the
  patient.
- **FR-005**: Before acceptance, the system MUST NOT disclose **any**
  patient-identifying information (name, rettX ID, diagnosis, documents) to the
  recipient or to any party holding the token.
- **FR-006**: A grant MUST be activated **only** when the accepting identity's
  **verified email matches** the invited address; on mismatch, access MUST NOT
  be granted and no patient data disclosed.
- **FR-007**: Acceptance MUST require the invitee to accept the **current
  version** of the distinct **Pulse Contribution Consent**; the accepted
  `consent_document_id`, `version`, `accepted_at`, and `principal_id` MUST be
  recorded on the `patient_access` grant.
- **FR-008**: Any change to the Pulse Contribution Consent version MUST trigger
  **re-consent**: on the contributor's next action the system MUST block further
  Pulse contribution until they accept the current version. Declining re-consent
  is treated as withdrawal (self-revoke). *Note: the backend already enforces
  consent-version acceptance; the **rettxweb re-consent UX is net-new and is in
  scope for this spec** (see rettxweb fanout).*
- **FR-009**: Consent MUST be **withdrawable** at any time; withdrawal revokes
  the contributor's own grant.
- **FR-010**: The owner and admin MUST be able to revoke a contributor's grant;
  a contributor MUST be able to self-revoke. Revocation MUST be **soft** (grant
  flagged revoked) and take effect immediately.
- **FR-011**: Pulse entries authored by a revoked contributor MUST remain as the
  patient's record with provenance/attribution preserved. On contributor
  **account erasure**, attribution MUST be **pseudonymized**: retain the Pulse
  entry, the opaque `principal_id`, and the timestamp (labelled e.g. "external
  contributor — account removed") but drop the contributor's name and email.
  Ordinary revocation (contributor still exists) keeps the display name.
- **FR-012**: Every Pulse entry MUST be attributed to the acting `principal_id`
  and be visible in the patient's shared Pulse history.
- **FR-013**: The system MUST emit an **audit** record (timestamp, actor,
  outcome, no PII) for every invite and grant lifecycle transition.
- **FR-014**: The system MUST support **resend** and **cancel** of a pending
  invite, and **decline** by the invitee.
- **FR-015**: The system MUST **rate-limit** invite creation and accept attempts.
- **FR-016**: The **owner** MUST be notified when an invite is sent and when a
  contributor joins.
- **FR-017**: Admin-initiated grants MUST follow the same consent double-opt-in;
  admins MUST NOT be able to activate access without invitee consent.

### Key Entities *(include if feature involves data)*

- **Invitation** (net-new): a pending, **email-keyed** offer to grant the
  Pulse-contributor scope, resolved into a grant on acceptance. Fields: `id`,
  `patient_id`, `invited_email`, `scope` (fixed `pulse`), `consent_document_id` +
  `version` (the Pulse Contribution Consent to be accepted), `token` (hashed at
  rest), `status` (`pending → accepted | declined | expired | cancelled`),
  `created_at`, `expires_at` (7 days). Nothing identifying about the patient is
  exposed pre-acceptance; `invited_email` is the wrong-email safeguard's anchor
  (matched against the accepting principal's verified email at resolution).
- **PatientAccess grant** (existing, extended): patient ref, principal, scope
  (`owner` for the creator, `pulse` for contributors), state
  (`active | revoked`), and the **accepted Pulse Contribution Consent** record
  (`consent_document_id`, `version`, `accepted_at`).
- **Pulse Contribution ConsentDocument** (new): versioned legal artefact,
  distinct from the patient-creation consent, scoped to contributing
  observations; authored in `templates`.
- **AuditEvent**: actor principal, action, target, timestamp, outcome — opaque
  identifiers only.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An owner can invite a contributor and that contributor can gain
  Pulse access in a single guided flow in **under 3 minutes** (excluding IdP
  sign-up).
- **SC-002**: **Zero** patient-identifying data is retrievable by a recipient
  whose verified email does not match the invited address (verified by test).
- **SC-003**: A `pulse`-scope contributor can retrieve **only** the patient
  display name/nickname + Pulse data; every attempt to reach genetic data,
  documents, medical profile, or to edit patient info is denied (verified by
  test).
- **SC-004**: 100% of active contributor grants carry a recorded Pulse
  Contribution Consent (id + version + timestamp), and 100% of invite/grant
  lifecycle transitions produce an audit record.
- **SC-005**: A revoked contributor loses access **immediately** (next request
  denied) while their authored Pulse entries remain attributed in history.

## Constitution Check

- **I — Caregivers first (NON-NEGOTIABLE)**: minimal-burden invite (no role
  decision), withdrawal anytime, no dark patterns. ✅
- **II — Privacy by design (NON-NEGOTIABLE)**: strict pre-accept minimization,
  narrow `pulse` scope (contributors never see the clinical record), distinct
  withdrawable consent, purpose limitation, verified email-match, audit. ✅✅
- **III — Transparency (NON-NEGOTIABLE)**: the architectural decision (new
  `pulse` scope + single-owner boundary) is recorded in
  [ADR 0011](../../docs/adr/0011-pulse-contributor-access-scope.md);
  patient-readable docs to follow on the public site before launch. ✅
- **IV — Accuracy/accountability**: Pulse-entry provenance/attribution
  preserved. ✅
- **VI — Security baseline**: server-side enforcement of the narrow `pulse`
  scope (existing `require_*_access_v2` + new `require_patient_pulse_write`),
  hashed single-use tokens, rate limiting, full audit. ✅

## Assumptions

- Multi-grant `patient_access` and the `require_*_access_v2` dependencies already
  exist in `rettxapi` (verified) and are reused; the `pulse` scope + its guard
  are the net-new backend addition. The backend also already enforces
  **consent-version** acceptance — the net-new work there is the **rettxweb
  re-consent UX** (FR-008).
- The **owner** is the patient's creator; ownership transfer and multi-owner
  custody are **out of scope** for v1.
- Invitee identity is established via **Auth0**; the accept flow can trigger
  sign-up + email verification.
- Notifications reuse the existing **Message Center** (email + in-app + native
  push).
- **`rettxid` is not affected**; invite tokens are not rettX IDs.
- Default invite expiry is **7 days**.

## patterns.md extensions (applied)

These were **applied** to [`.specify/memory/patterns.md`](../../.specify/memory/patterns.md)
§2 on 2026-07-26 (see its §11 change log):

- **Permission level**: added the narrow **`pulse`** scope — *not* a rung on the
  read/edit ladder (does not imply general `read`); Pulse-create + minimal Pulse
  read only, server-enforced.
- **Vocabulary**: *Pulse contributor* (a principal holding the `pulse` scope),
  *Invite* (with lifecycle states), and the single-**owner** stewardship model.
- **Invite state vocabulary**: `pending | accepted | declined | expired |
  cancelled` (invite) and `active | revoked` (grant).
- **ConsentDocument subtype**: *Pulse Contribution Consent*, versioned, distinct
  from the creation consent.

## Open decisions

All headline and secondary decisions are **resolved** (2026-07-25). The
companion **[ADR 0011](../../docs/adr/0011-pulse-contributor-access-scope.md)**
(new `pulse` scope + single-owner boundary) is authored and the `patterns.md`
extensions are applied. Remaining before `status: ready`: agree the fanout
summaries and add patient-readable docs on the public site. Flip `status: ready`
to fan out. **Kept `draft` for now — nothing fans out.**

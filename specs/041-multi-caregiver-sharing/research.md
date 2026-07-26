# Multi-Caregiver Sharing — Design Options & Brainstorm (research for spec 041)

**Status:** design record / research backing `spec.md` in this folder.
**Repo context:** `rett-europe/rettx` control plane. No downstream repo edits.
**Author:** perocha · **Date:** 2026-07-25

---

## 0. Problem statement

A patient in rettX should be shareable with **2+ caregivers** who can view (and
potentially update) the same patient record — especially valuable for **Pulse**.
The two design constraints that dominate everything below are **CONSENT** and
**PRIVACY**, per constitution principles I (caregivers first), II (privacy by
design), III (transparency).

### Ground truth (already verified in the `rettxapi` codebase — do not re-derive)

- The data model **already** supports multiple access grants per patient:
  a `patient_access` container holds grants keyed by `principal_id`, with
  active-only filters (`include_revoked` / `include_deleted`) and a
  `query_by_principal_id` lookup.
- Access resolves into a `ResolvedPatientAccessContext` (`principal_id` +
  `patient_id`) and is enforced server-side by dependencies:
  `require_patient_read_access_v2` (READONLY+) and
  `require_patient_write_access_v2` (EDIT+).
- **So multi-caregiver access is REPRESENTABLE today.**
- **Missing:** any mechanism — caregiver-facing *or* admin-facing — to actually
  **create a share** (add a second caregiver to an existing patient).
- **Consent gap:** consent is captured only at patient **creation**, by the
  creating caregiver. There is **no** consent step for a *second* caregiver
  added to an existing patient.

### Permission levels (patterns.md §2)

`owner`, `edit`, `read` — server-enforced. Seed facts confirm READONLY+ and
EDIT+ dependency gates. The **owner** is the record's steward (creator).

---

## 1. Design dimensions — options, trade-offs, recommendation

### (a) Initiation model — who can start a share?

| Option | Description | Trade-offs |
|---|---|---|
| A1 Caregiver-initiated | Owner invites another caregiver by email | Self-service, low burden (Principle I); owner controls their own record |
| A2 Admin-initiated | Registry admin grants access | Useful for support/edge cases; heavier, less patient-empowering; risk of paternalism |
| A3 Both | Caregiver primary + admin as support path | Most complete; more surface area |

**Recommendation: A3 (both), phased.** Caregiver-initiated invite is the P1
primary path (aligns with Principle I: caregivers own their data, minimal
burden). Admin-initiated grant is a P2/P3 support path with stricter audit.
**Crucially, neither path may bypass invitee consent** — admin cannot silently
add a caregiver; the double-opt-in below still applies.

### (b) Invite / accept lifecycle & states

Proposed states (single invite object):

```
                cancel / resend
                     │
 (create) ──▶ PENDING ──▶ ACCEPTED ──▶ (grant becomes ACTIVE)
                │  │  └────▶ DECLINED
                │  └───────▶ EXPIRED
                └──────────▶ CANCELLED   (owner/admin withdrew before accept)

 ACTIVE grant ──▶ REVOKED   (owner/admin/self withdraws after accept)
```

- **Invitee has no account:** invite links into an Auth0 sign-up path; after
  sign-up + email verification they land in the review/consent step.
- **Invitee already has an account:** authenticate, then review/consent.
- **Wrong-email safeguard (double opt-in):** the invite reveals **nothing
  identifying** pre-acceptance (see (e)). Invitee must authenticate with an
  identity whose **verified email matches** the invited email, then review and
  **accept the shared-access consent**, and only THEN is the grant activated and
  patient identity revealed.
- **Token:** single-use, **hashed at rest**, time-boxed expiry (default **7
  days**, OPEN), resend + cancel supported, rate-limited.

**Recommendation:** adopt the state machine above; make the invite object the
source of truth for lifecycle, and the `patient_access` grant the source of
truth for *active access* (created only on acceptance).

### (c) Consent model for the secondary caregiver

| Option | Description | Trade-offs |
|---|---|---|
| C1 Reuse creation consent | Secondary accepts same artifact the creator did | Simple; but semantics differ — they are not the creator/owner |
| C2 Distinct shared-access consent | New versioned `ConsentDocument` for joining an existing patient | Clear lawful basis; matches their actual role; small extra authoring |
| C3 Hybrid | Creation consent + shared-access addendum | Most explicit; more artifacts to maintain |

**Recommendation: C2 — a distinct, versioned "Shared-Access Consent"
`ConsentDocument`.** Rationale: the secondary caregiver's relationship and
lawful basis differ from the creator's (they are accepting to view/handle
special-category data about **someone else's** patient). Per Principle II
(purpose limitation, informed consent, withdrawable):

- The **accepted-consent record lives on the `patient_access` grant**:
  `consent_document_id` + `version` + `accepted_at` + `principal_id`.
- **Re-consent** required on a material policy/version change.
- **Withdrawal** = the caregiver revokes their own grant (consent is
  withdrawable at any time).
- Consent artifact is authored in the **`templates`** repo (per patterns §1,
  consent forms live there).

### (d) Roles / permissions of a secondary caregiver

- **Default = `read` (least privilege).** Inviter selects `read` or `edit` at
  invite time. (OPEN: default view-only vs edit — question for Pedro.)
- **Owner stays singular** (the creator). Secondary caregivers are **members**,
  not owners → clear "owner vs member" distinction.
- **v1: only the owner (and admin) can invite or revoke** others — avoids
  transitive sprawl and consent-chain ambiguity.
- **Pulse read/write** follows the grant level (`edit` → can log Pulse entries).
- **Delete patient:** owner only.
- **Can members see co-caregivers?** Recommend: members can see that
  co-caregivers exist + display name + role (needed for coordination and to make
  shared-edit attribution meaningful). **OPEN — privacy trade-off for Pedro.**

### (e) Privacy / security safeguards

- **Pre-accept data minimization (Principle II):** to an unverified/incorrect
  recipient, reveal **nothing identifying** — no patient name, no rettX ID, no
  diagnosis. The invite says only something like *"A caregiver has invited you to
  help care for a patient on rettX."* (OPEN: may we show the **inviter's** first
  name? That is itself a small disclosure — question for Pedro.)
- **Email verification / match:** grant activates only when the authenticated
  identity's verified email matches the invited address.
- **Invite expiry** + **rate limiting** on invite creation and accept attempts.
- **Notify existing caregiver(s)** when an invite is sent and when someone joins
  (transparency + anti-mis-share signal).
- **GDPR interplay:** the **data subject is the patient**, not the caregiver.
  Distinguish (i) erasure of a caregiver's *account* from (ii) the patient's
  right to erasure. A revoked caregiver's *authored* patient data (e.g. Pulse
  entries) is the **patient's** data — provenance must be preserved (Principle
  IV); pseudonymize the actor only on account erasure. **OPEN — legal input.**
- **Full audit trail** for invite create/resend/cancel/accept/decline/expire and
  grant activate/revoke (Principle VI: auditable).

### (f) Attribution & audit for shared edits

- Every Pulse (and other) entry is attributed to the **acting `principal_id`**.
- History is **visible** (who logged what, when) — Principle IV: data provenance
  preserved (who entered, when, against what schema version).
- Audit records are immutable; correlation uses opaque identifiers (Principle
  VI: no PII in logs).

### (g) Revocation & offboarding

- **Who can revoke whom:** owner revokes any member; admin can revoke anyone;
  a member can **self-revoke** (= withdraw consent). Owner cannot be revoked
  (only account/ownership transfer, out of scope v1).
- On revoke: grant flagged `revoked` (soft-delete — the existing
  `include_revoked` filter already supports this). Access ceases immediately.
- **Authored data stays** (patient's data; provenance preserved). Attribution
  retained unless/until actor account erasure. **OPEN — confirm policy.**

### (h) Admin tooling (`rettxadmin`, Entra ID)

- **Visibility:** list every principal who can access a patient (incl. revoked),
  with role + consent status + accepted-at.
- **Grant/revoke:** admin-initiated grant (still requires invitee consent
  double-opt-in) and admin revoke.
- **Audit:** admin view of the full invite/grant audit trail.

---

## 2. Cross-repo impact map (for a FUTURE spec-fanout — do NOT implement here)

| Repo | Slice |
|---|---|
| **rettxapi** (contract owner) | New invite/share endpoints (create, list, accept, decline, cancel, resend, revoke, list co-caregivers); invite entity/container with state machine + hashed token + expiry; extend `patient_access` grant with role + accepted-consent record + invite linkage; reuse existing `require_*_access_v2` deps; audit events; trigger message sends. |
| **rettxweb** (Auth0, Capacitor native) | Caregiver UI: invite-a-caregiver (email + role), pending-invites list, accept-invite flow (authenticate → review → accept shared-access consent), co-caregiver list, revoke, notifications. Native push nudge for invite/join (FCM device token path). |
| **rettxadmin** (Entra ID) | Admin view of patient access grants, admin grant/revoke, admin audit view. |
| **templates** | New Message Center templates (email + in-app + push, per-locale): invite, "you've been added", "someone joined your patient". New **Shared-Access Consent** `ConsentDocument`. Any Auth0 sign-up email template changes. |
| **rettxid** | **Likely none.** Pseudonymous ID unchanged; invite tokens are NOT rettX IDs. *Confirm no impact.* |

---

## 3. Proposed `patterns.md` extensions (propose, don't invent ad hoc)

- **Shared vocabulary additions:** *Share / Access Grant*, *Invite*,
  *Co-caregiver (secondary caregiver)*, *Owner vs Member* distinction.
- **Invite state vocabulary:** `pending | accepted | declined | expired |
  cancelled` (invite) and `active | revoked` (grant).
- **ConsentDocument subtype:** *Shared-Access Consent* (distinct from creation
  consent), versioned.

(No new routing labels appear necessary.)

---

## 4. Constitution Check (highlights)

- **I (caregivers first):** self-service invite, minimal-burden flow, withdrawal
  anytime, no dark patterns. ✅
- **II (privacy by design):** pre-accept minimization, distinct withdrawable
  consent, purpose limitation, EU/GDPR data-subject handling, audit. ✅
- **III (transparency):** ships with an ADR + patient-readable docs on the
  sharing/consent model. ✅
- **IV (accuracy/accountability):** shared-edit provenance/attribution
  preserved. ✅
- **VI (security):** server-side authz (already), hashed single-use tokens,
  rate limiting, full audit. ✅

---

## 5. RECOMMENDED approach (one-paragraph summary)

Caregiver-initiated, email-based **invite with double opt-in**: owner invites by
email + chooses role (default `read`); recipient sees **nothing identifying**
until they authenticate with a **matching verified email** and **accept a
distinct, versioned Shared-Access Consent**, at which point a `patient_access`
grant is activated (carrying the consent record). Admin has a parallel
grant/revoke + visibility path that **also** honours consent. All lifecycle
events are audited; shared edits are attributed to the acting principal;
revocation is soft and preserves patient-data provenance.

---

## 6. OPEN DECISIONS for Pedro (product / legal)

**Highest-leverage — DECIDED by Pedro (2026-07-25):**
1. **Initiation:** ✅ **Both** — caregiver self-service is primary, admin as a
   support path (both honour consent).
2. **Wrong-email tolerance / pre-accept disclosure:** ✅ **Strictest** — reveal
   nothing identifying pre-acceptance; require verified email-match to activate.
3. **Default role:** ✅ **Read-only default; inviter selects `read` or `edit`**
   at invite time.
4. **Consent artifact:** ✅ **New distinct, versioned Shared-Access Consent**,
   recorded on the `patient_access` grant.

### PIVOT — simplified model (Pedro, 2026-07-25)

Pedro chose to **radically constrain complexity** and the spec was rewritten
around it (see `specs/041-multi-caregiver-sharing/spec.md`):

- **Single owner** (the patient creator) is the *only* administrator. No
  "co-caregiver" concept; no owner-vs-member logic; contributors cannot invite
  or revoke others.
- Invitees become **Pulse contributors**: they can **only create Pulse
  entries**. They **cannot** edit patient info.
- **Read scope is minimal**: a contributor sees only the patient display
  name/nickname + the Pulse tracker & history — **no** genetic data, documents,
  or medical profile. (Even stronger Principle II data minimization.)
- Supersedes decision #3 (no `read`/`edit` picker — role is the fixed
  Pulse-contributor scope). Consent (#4) narrows to a **Pulse Contribution
  Consent**.
- Backend note: the Pulse-write-but-not-patient-edit restriction needs a **new
  narrow server-side scope** (e.g. `pulse`/`contribute`), enforced server-side
  (Principle VI) — not a reuse of `edit`.
- Corner cases (e.g. divorced / dual-equal parents) are **out of scope for v1**.

**Secondary (decide before spec `ready`):**
- Can members see co-caregivers' identities/roles?
- Can members (not just owner) invite/revoke others?
- Erasure/attribution policy for a revoked caregiver's authored Pulse data.
- Invite expiry duration (default 7 days?).
- Notify-all-caregivers-on-join policy.
- Confirm `rettxid` has no impact.

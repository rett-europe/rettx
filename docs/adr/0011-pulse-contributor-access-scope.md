# ADR 0011 — Narrow `pulse` contributor scope for multi-caregiver Pulse contribution

- **Status**: Proposed (2026-07-26)
- **Date**: 2026-07-26
- **Decision-makers**: rettX maintainers
- **Relates to**: [spec 041 — Patient Sharing: Pulse Contributors](../../specs/041-multi-caregiver-sharing/spec.md)
  (the cross-cutting spec this ADR anchors),
  [spec 035 — rettX Pulse](../../specs/035-pulse-tracker/spec.md) (the umbrella
  Pulse tracker whose entries contributors write),
  [`patterns.md` §2](../../.specify/memory/patterns.md) (shared vocabulary /
  permission levels) and [§4](../../.specify/memory/patterns.md) (server-side
  authorization), [program constitution](../../.specify/memory/constitution.md)
  principles **I** (caregivers first), **II** (privacy by design) and **VI**
  (security baseline)

## Context

A patient owner should be able to let a second person — a partner, relative, or
carer — help **log Pulse** for their patient, which is especially valuable for
day-to-day Pulse tracking. The two hard constraints are **consent** and
**privacy** (constitution I/II).

The data layer can already **represent** this. In `rettxapi` the `patient_access`
container holds multiple grants per patient, keyed by `principal_id`, with
active-only filters (`include_revoked` / `include_deleted`) and a
`query_by_principal_id` lookup. Access resolves into a
`ResolvedPatientAccessContext` and is enforced server-side by the dependencies
`require_patient_read_access_v2` (READONLY+) and `require_patient_write_access_v2`
(EDIT+). What is **missing** is any mechanism to *create* a share, and there is
no consent step for a person added to an *existing* patient (consent is captured
only at patient creation, by the creator).

The product decision (Pedro, 2026-07-25) is to keep v1 **deliberately small**:
one **owner** (the creator) stays the sole administrator, and the people they add
can do exactly one thing — **contribute Pulse entries**. They must **not** be
able to edit patient information or see the clinical record (genetic data,
documents, medical profile). The broader "co-caregiver" idea (a second steward
with read/edit of the whole record who can invite others) is **out of scope for
v1**; complex custody situations (e.g. divorced / dual-equal parents) are
accepted as corner cases to revisit later.

The problem is that the existing permission ladder — `owner`, `edit`, `read`
([`patterns.md` §2](../../.specify/memory/patterns.md)) — cannot express
"may create Pulse entries **but** may not edit the patient **and** may not read
the clinical record". `edit` is too broad (it grants full write, including
patient info); `read` is both too broad (whole record) and too narrow (no
write). No existing level fits, and per constitution **VI** the restriction MUST
be enforced server-side — UI gating is not a security control.

## Decision

Introduce a **new, narrow, server-enforced `pulse` permission scope** in the
`patient_access` model as the mechanism for multi-caregiver Pulse contribution,
and keep the surrounding sharing model minimal.

1. **New `pulse` scope.** Distinct from `owner` / `edit` / `read`, the `pulse`
   scope permits **creating Pulse entries** and a **minimal read** — the patient
   display name / nickname and the Pulse tracker & history — and **nothing
   else**. It grants no access to genetic data, uploaded documents, or the
   medical profile, and no ability to edit patient information. It is **not** a
   rung on the read/edit ladder (it does not imply general `read`); it is a
   capability scope enforced by its own dependency, e.g.
   `require_patient_pulse_write`. Pulse-write endpoints accept it; every other
   read/write endpoint rejects it.
2. **Single owner, no co-caregiver in v1.** The patient **owner** (creator)
   remains the sole administrator. A `pulse` contributor cannot invite or revoke
   anyone, cannot see a co-contributor management view, and cannot edit the
   patient. Ownership transfer and multi-owner custody are out of scope for v1.
3. **Consent-gated, privacy-first onboarding.** A `pulse` grant is created only
   through an invite with **double opt-in** — nothing identifying is revealed
   before acceptance, the accepting identity's **verified email must match** the
   invited address, and the invitee must accept a distinct, versioned **Pulse
   Contribution Consent** whose acceptance (`consent_document_id`, `version`,
   `accepted_at`, `principal_id`) is recorded on the grant. The full lifecycle,
   states, and safeguards live in
   [spec 041](../../specs/041-multi-caregiver-sharing/spec.md).

This ADR owns the **architectural** decision (a new access scope + the
single-owner boundary); spec 041 owns the feature detail and the cross-repo
fan-out.

## Consequences

**Positive**

- **Least privilege by construction** (constitution II): a contributor can never
  reach the clinical record, so a mis-share leaks far less than a general
  read/edit grant would. Privacy is enforced by the scope, not by UI hiding.
- **Server-side enforcement** (constitution VI): the `require_patient_pulse_write`
  dependency makes "Pulse only" a real trust boundary, consistent with the
  existing `require_*_access_v2` pattern.
- **Small surface area**: no co-caregiver management, no role picker, fewer
  states and fewer consent questions — the smallest change that delivers the
  Pulse-help value.
- Reuses the existing multi-grant `patient_access` machinery; the net-new
  backend piece is one scope + one guard.

**Negative / costs**

- A **new access level** is a shared-vocabulary change: `patterns.md` §2 must
  record `pulse`, and every surface/endpoint author must understand that it does
  **not** imply general `read`.
- Each patient-data endpoint must be reviewed to ensure it correctly **rejects**
  the `pulse` scope; a missed endpoint is a privacy regression.
- The narrow scope does **not** cover legitimate future needs (a genuine second
  steward, shared editing, contributor-managed invites); those will need a
  follow-up decision rather than a quick widening of `pulse`.
- Custody corner cases (dual-equal parents) remain unserved in v1 — an accepted,
  documented limitation.

## Alternatives considered

- **Reuse the existing `edit` level for contributors** and hide non-Pulse
  surfaces in the client. Rejected: `edit` grants full patient-info write and
  clinical read; UI hiding is not a security control (constitution VI), so a
  contributor could edit clinical data or read the whole record via the API.
  Fails least-privilege and privacy.
- **A full "co-caregiver" role** (a second steward with read/edit of the whole
  record, able to invite others and see co-caregivers). Rejected for v1: a much
  larger consent and privacy surface, more invite/grant states, owner-vs-member
  ambiguity, and transitive-invite sprawl — disproportionate to the actual need,
  which is "help me log Pulse". Deferred, not discarded.
- **Client-side-only gating** of a Pulse-only experience over an `edit` grant.
  Rejected outright: not a server-side control (constitution VI).
- **A generic per-feature ACL / scoped-permission framework.** Rejected as
  over-engineering for a single capability today; if more scoped-sharing needs
  emerge, that generalisation can be its own ADR building on the `pulse`
  precedent.

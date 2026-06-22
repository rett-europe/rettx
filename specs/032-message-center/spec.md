<!--
  Frontmatter below is machine-read by .github/workflows/spec-fanout.yml when
  this spec is merged into main. The `fanout` array drives which downstream
  repos get a `[spec/<slug>] <title>` issue with the `squad` label. Set
  `status: ready` when this spec should fan out on merge — drafts will not.

  Allowed fanout repos: rettxweb, rettxadmin, rettxapi, rettxmutation, rettxid.
-->
---
spec_id: "032"
slug: "message-center"
title: "rettX Message Center"
status: ready   # draft | ready | accepted | superseded
authored: "2026-06-22"
author: "perocha"
source_issue: "rett-europe/rettx#10"
fanout:
  - repo: rettxapi
    summary: |
      Backend + data model (§9), and OWNER of the implementation of the shared
      API contract hosted in this spec (`contracts/caregiver-api-contract.md`,
      `contracts/admin-api-contract.md`). Build a persist-first **Message**
      (one document per caregiver, optional patient ref, category, read state,
      stable reference ID, reproducible content snapshot) and a per-channel
      **Delivery** (email only in v1) with retry/resend. Evolve the blob email
      templates into **versioned communication templates** (in-app + email +
      reserved push fields), rendered/selected by the **caregiver's profile
      language code** — the canonical source (D1) — with English fallback. Add caregiver v2 endpoints (list/detail/unread-
      count/read/archive) and admin endpoints (send individual + bulk, preview,
      list/filter, resend) with bulk idempotency. Add a MESSAGE audit domain
      (distinct from the audit log). New Cosmos container `messages` partitioned
      by `/recipient_id`. Reuse the existing SendGrid send, bulk-campaign engine,
      audit service, and PatientAccess authZ (~70% of infra already exists).
      KEY DECISION (D2): no durable async infrastructure exists today — deliver
      **synchronously** in v1 (persisted message + `failed` status + admin
      resend), treating a Storage Queue worker as a funded fast-follow, not an
      assumption. Implement strictly to the contracts under `contracts/`; do not
      redefine endpoint shapes.
  - repo: rettxweb
    summary: |
      Caregiver web app (§8) — greenfield Messages surface. Add a `/messages`
      list + `/messages/:id` detail, a read/unread indicator + mark-as-read, and
      an app-wide unread-count **badge** (the nav `NavItem.badgeKey` is already
      reserved) fetched globally after login, all gated behind a program-reserved
      `messages` feature flag. CONSUME `contracts/caregiver-api-contract.md` — do
      not invent endpoints. Reuse the existing Auth0 auto-token interceptor and
      the `care-profile.service` pattern. Add chrome i18n keys across all
      language files; treat the message **body** as backend-localized opaque
      content (sanitize if HTML). For patient-linked messages, render only what
      the backend returns — never infer patient access client-side. For language,
      pass the caregiver's profile language (from principal info via `rettxapi`)
      straight through to the API — do not map or substitute it (D1).
  - repo: rettxadmin
    summary: |
      Admin dashboard (§10) — evolve the EXISTING individual-send and bulk
      email-campaign UIs to route through the new persist-first message
      creation. Surface the message **reference ID** and per-message delivery +
      read status, clearly distinguishing a persisted rettX message from its
      email delivery. Add a content **preview** (new) and a template-version
      selector (new); the send **language is derived from each recipient's
      profile, not chosen per-send** (D1). Add a filterable **message index**
      screen; rely on backend idempotency for bulk (keep the existing 100-cap,
      dedupe, and "recently emailed" safeguards). Preserve current workflows —
      mind the entangled forkJoin file-validation flow in `genetic-files-section`.
      CONSUME `contracts/admin-api-contract.md`. The ISO 3166-1 country codes in
      admin's own i18n files localize admin chrome only and are NOT the renderer
      input (D1).
---

# Feature Specification: rettX Message Center

**Spec ID**: `032-message-center` · **Status**: Ready · **Created**: 2026-06-22
**Source issue**: [rett-europe/rettx#10](https://github.com/rett-europe/rettx/issues/10) (cross-cutting)
**Owner**: rettX control plane (this repo) — authored and coordinated here; scoped work is fanned out to the affected repos via the `spec-fanout` workflow on merge.
**Input**: "Introduce a centralized Message Center that persists caregiver communications inside rettX as the canonical user-facing record, with email as the first delivery channel and the architecture ready for future channels (push, etc.)."

## Overview

rettX already sends operational email to caregivers (onboarding, diagnosis validation,
survey invitations, data-quality requests) both individually and in bulk
(see specs `010-email-templates`, `027-bulk-email-campaigns`). Today email is the
*record* of communication: once sent, the caregiver has no in-app history, delivery is
coupled to email, and adding a second channel (push) would require parallel orchestration.

The **Message Center** inverts this: a **message** is persisted inside rettX *before*
delivery, becoming the canonical user-facing communication record. Email becomes one
**delivery** of that message, not the message itself. Version 1 keeps email as the only
delivery channel but models it as a channel, so push and other channels can be added later
without re-architecting.

The umbrella issue [rettx#10](https://github.com/rett-europe/rettx/issues/10) is
**cross-cutting**. This document is the **single program-level specification** for the feature,
authored and owned in the rettX control plane. It is not scoped to one surface: it covers the
caregiver app (§8), the backend API & data model (§9), and the admin dashboard (§10) as one
coherent design, and it **hosts the shared API contract** (`contracts/`) as the single source of
truth.

On merge, the `spec-fanout` workflow opens one scoped `[spec/message-center]` issue (label
`squad`) in each affected repo, carrying that repo's gap-informed brief from the `fanout:`
frontmatter above:

| Surface | Repo | Parent §scope | Role |
|---|---|---|---|
| **Backend API & data model** | `rettxapi` | §9 | Implements + versions the shared contract |
| **Caregiver web app** | `rettxweb` | §8 | Consumes the caregiver contract |
| **Admin dashboard** | `rettxadmin` | §10 | Consumes the admin contract |

Each repo derives its own implementation plan/tasks from this spec; none redefine the endpoint
shapes — the **published API contract** under `contracts/` is the agreed boundary.

The first version is **one-way** (rettX → caregiver). Replies go to a monitored mailbox
(e.g. `support@rettx.eu`); automatic ingestion of replies is out of scope.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Caregiver reads their messages in-app (Priority: P1)

As an authenticated caregiver, I want a Messages section in rettX that lists every
communication rettX has sent me — newest first, with a clear read/unread indicator — so I
have one trustworthy history of what rettX told me, independent of my email inbox.

**Why this priority**: This is the core value proposition and the reason the message must
be persisted before delivery. Without the caregiver-visible history, the Message Center is
just a renamed email log. It is independently shippable: once messages exist and a list +
detail + mark-as-read endpoint exist, the caregiver app delivers value even before any new
admin tooling.

**Independent Test**: Seed N persisted messages for a caregiver, call the list endpoint,
open one via the detail endpoint, mark it read, and confirm the unread count drops — all
scoped strictly to the authenticated caregiver.

**Acceptance Scenarios**:

1. **Given** a caregiver with several persisted messages, **When** they request their message
   list, **Then** they receive their messages in reverse-chronological order with read/unread
   state, category code, optional patient reference, and a content snapshot, paginated.
2. **Given** a caregiver opens an unread message, **When** they fetch its detail, **Then** the
   full in-app title and body are returned and the message becomes read (read timestamp set).
3. **Given** a caregiver has 3 unread messages, **When** they request their unread count,
   **Then** the system returns `3`; after reading one it returns `2`.
4. **Given** caregiver A and caregiver B, **When** caregiver A requests message `M` that
   belongs to caregiver B, **Then** the system returns 404/forbidden and never discloses B's
   content or existence.
5. **Given** a message is linked to a patient, **When** a caregiver who no longer has access
   to that patient lists messages, **Then** the patient-linked message is not exposed (or is
   shown without patient-specific content) per the authorization rule.
6. **Given** a caregiver with no messages, **When** they request their list, **Then** an empty
   result with total `0` is returned (clean empty state).

---

### User Story 2 — Admin sends an individual message to a caregiver (Priority: P1)

As an admin, I want to send a templated communication to a single caregiver (optionally
about a specific patient) so that the caregiver gets both a persisted in-app message and an
email notification, and I can later see whether it was delivered and read.

**Why this priority**: Individual sends are the most common operational action today
(`POST /send-email`) and must route through the new create-then-deliver flow without losing
existing capability. It is the smallest end-to-end vertical slice that exercises persist →
render → deliver → track.

**Independent Test**: As admin, create a message for one caregiver from a template; confirm
a message document is persisted, an email delivery is attempted and its status recorded, and
the same message appears in that caregiver's list (Story 1).

**Acceptance Scenarios**:

1. **Given** an admin selects a caregiver, a communication template, and (optionally) a
   patient, **When** they create the message, **Then** the message is persisted first with a
   rendered content snapshot and a human-readable **message reference ID**, and only then is
   email delivery triggered.
2. **Given** a created message, **When** email delivery succeeds, **Then** the message's email
   delivery status becomes `sent` with a timestamp; the caregiver can see the message in-app.
3. **Given** a created message, **When** email delivery fails, **Then** the message remains
   persisted and visible in-app, the email delivery status becomes `failed` with an error,
   and the admin can retry delivery without re-creating the message.
4. **Given** a caregiver whose preferred language is `pt`, **When** the message is rendered,
   **Then** the in-app and email content use the `pt` representation, falling back to the
   default language when a translation is missing.
5. **Given** a message references a patient, **When** it is created, **Then** the admin must
   hold permission to that patient (and the target caregiver must have access), otherwise the
   request is rejected.

---

### User Story 3 — Admin sends a bulk communication (one message per caregiver) (Priority: P2)

As an admin, I want to send a communication to a selected population of caregivers so that
each caregiver receives their **own independent** persisted message and email, with
per-recipient delivery tracking and no duplicate sends on retry.

**Why this priority**: Bulk is high-value but builds on the individual send slice and the
existing campaign lifecycle (`027`). Modeling each recipient as an independent message (not
one shared message with many recipients) keeps read state, permissions, and future
personalization simple.

**Independent Test**: Create a bulk communication targeting a known cohort; confirm exactly
one message document per resolved caregiver, independent per-recipient delivery status, and
that re-triggering does not create duplicates or re-send already-sent recipients.

**Acceptance Scenarios**:

1. **Given** an admin defines a bulk communication over a resolved caregiver cohort, **When**
   it is sent, **Then** exactly one persisted message is created per caregiver, each with its
   own reference ID, read state, and delivery record.
2. **Given** a bulk send where some email deliveries fail, **When** it completes, **Then**
   aggregate counts and the list of failed recipients with error reasons are reported, and
   each failed recipient's message is still persisted and visible in-app.
3. **Given** a bulk send is retried after partial failure, **When** the retry runs, **Then**
   only previously-failed deliveries are re-attempted (idempotent); already-sent recipients
   are not re-created or re-emailed.
4. **Given** a caregiver appears twice in the resolved cohort, **When** the bulk send runs,
   **Then** de-duplication ensures the caregiver receives a single message for that send.

---

### User Story 4 — Admin observes delivery and read status (Priority: P2)

As an admin, I want to see, for any sent message or bulk communication, the delivery status
of the email channel and (where appropriate) whether the caregiver has read the in-app
message, filterable by caregiver, patient, category, campaign, date, template, and status,
so I can audit communications and follow up on failures.

**Why this priority**: Visibility and resend close the operational loop, but depend on
messages and deliveries already existing.

**Independent Test**: With a mix of sent/failed/read messages, query the admin listing with
each filter and confirm correct results, including distinguishing a persisted rettX message
from its email delivery.

**Acceptance Scenarios**:

1. **Given** sent messages with varied states, **When** an admin lists messages filtered by
   `status=failed`, **Then** only messages whose email delivery failed are returned.
2. **Given** a message that the caregiver has opened, **When** an admin views it, **Then** the
   read indicator and read timestamp are shown.
3. **Given** a failed email delivery, **When** the admin triggers a resend, **Then** a new
   delivery attempt is recorded against the same message without creating a new message.
4. **Given** the admin filters by `campaign`, `category`, `patient`, `template`, and a date
   range, **When** results are returned, **Then** they honor every supplied filter.

---

### User Story 5 — Caregiver sees a notification badge / unread count after login (Priority: P3)

As a caregiver, I want the app navigation to surface how many unread messages I have, so I
know to check the Message Center without opening every screen.

**Why this priority**: A nice-to-have that increases engagement; the underlying unread-count
endpoint (Story 1) is the dependency, so this is mostly a frontend concern.

**Independent Test**: Verify the unread-count endpoint returns an accurate, fast count for a
caregiver and updates after reads.

**Acceptance Scenarios**:

1. **Given** a caregiver logs in, **When** the app requests the unread count, **Then** a single
   lightweight call returns the count without fetching full message bodies.
2. **Given** the caregiver reads all messages, **When** the count is re-requested, **Then** it
   returns `0`.

---

### User Story 6 — Caregiver archives/hides a message (Priority: P3)

As a caregiver, I want to archive (hide) a message I no longer need in my main list, so my
Message Center stays tidy — without permanently destroying the communication record.

**Why this priority**: Improves UX but is not required for MVP; archiving must not violate
traceability (the record is retained, only the caregiver's view changes).

**Independent Test**: Archive a message and confirm it is excluded from the default list,
still retrievable via an archived filter, and still present for audit/retention.

**Acceptance Scenarios**:

1. **Given** a caregiver archives a message, **When** they request their default list, **Then**
   the archived message is excluded but the record is retained.
2. **Given** an archived message, **When** the caregiver requests archived items, **Then** it is
   returned. Hard deletion of the communication record by caregivers is not permitted.

---

### Edge Cases

- **Template translation missing**: rendering falls back to the configured default language;
  the chosen language is recorded in the content snapshot.
- **Template changes after send**: the message retains its rendered snapshot; later template
  edits never alter what was already communicated.
- **Caregiver has no verified email**: the in-app message is still persisted; email delivery
  is skipped or marked `not_attempted`/`failed` with a clear reason, and the caregiver still
  sees the message in-app.
- **Caregiver loses patient access after a patient-linked message was sent**: patient-specific
  content is not disclosed in the in-app history per the authorization rule.
- **Partial bulk failure mid-run**: each recipient's message and delivery are tracked
  independently; the operation reports per-recipient outcomes and supports idempotent retry.
- **Duplicate/double-submit of a send**: idempotency prevents creating duplicate messages or
  duplicate email deliveries for the same logical send.
- **Very large cohort**: bulk sends respect a cohort size limit (aligned with existing campaign
  limits) and persist-then-deliver asynchronously so the request does not block on delivery.
- **Concurrent read + admin view**: read-state updates are last-write-wins and never block.
- **Reply received by mailbox**: the email carries the message reference ID so a human can
  manually correlate a reply to the original message; no automatic ingestion.

## Requirements *(mandatory)*

### Functional Requirements — Message model & persistence

- **FR-001**: The system MUST persist a **message** as a discrete record *before* any delivery
  is attempted, and MUST treat the persisted message as the canonical user-facing record.
- **FR-002**: Each message MUST belong to exactly one **recipient caregiver** (one document per
  caregiver) and MUST NOT be modeled as a single shared message with many recipients.
- **FR-003**: A message MAY optionally reference exactly one **patient**; patient reference is
  not required.
- **FR-004**: Each message MUST carry a stable **message reference ID** that is safe to expose
  in emails and admin tooling for manual correlation of replies.
- **FR-005**: Each message MUST record a **category** from a stable, controlled vocabulary
  (see FR-024) to support filtering, analytics, and future notification preferences.
- **FR-006**: Each message MUST store a **content snapshot** (the rendered in-app and
  channel content, plus the language and template version used) so the communicated content is
  reproducible even after templates change.
- **FR-007**: Each message MUST track **read/unread state** with a read timestamp, scoped to
  the recipient caregiver.
- **FR-008**: The system MUST support caregiver **archive/hide** of a message without
  destroying the underlying record; caregivers MUST NOT be able to hard-delete records.
- **FR-009**: The system MUST record creation/update audit fields (who, when) consistent with
  the platform's base document model.

### Functional Requirements — Templates & rendering

- **FR-010**: The system MUST evolve email templates into **communication templates** that can
  hold channel-specific representations: in-app title, in-app body, email subject, email HTML
  body, email plain-text body (and reserved fields for future push title/body).
- **FR-011**: Communication templates MUST be **versioned**, and message creation MUST capture
  the template version (or a sufficient content snapshot) that was used.
- **FR-012**: Rendering MUST honor the recipient's **preferred language** and MUST fall back to
  the configured default language when a translation is missing, recording the language used.
- **FR-013**: In-app and email representations of the same message MAY differ; the email SHOULD
  be able to encourage logging into rettX while the in-app message carries fuller context.
- **FR-014**: The system MUST allow **previewing** rendered content (per language/version) for
  a given template before a message is created/sent.

### Functional Requirements — Delivery & channels

- **FR-015**: The system MUST model **delivery** as a per-channel attempt attached to a message;
  v1 MUST support the **email** channel only while keeping the model channel-agnostic.
- **FR-016**: The system MUST persist the message first and then trigger delivery
  **asynchronously**, so the create/send request does not block on the email provider.
- **FR-017**: Each email delivery MUST record a status (e.g. `pending`, `sent`, `failed`,
  `not_attempted`) with timestamps and, on failure, an error reason.
- **FR-018**: The system MUST support **retry/resend** of a failed email delivery against the
  existing message without creating a new message.
- **FR-019**: Bulk sends MUST be **idempotent**: retrying MUST NOT duplicate messages or re-send
  already-delivered recipients, and duplicate recipients in a cohort MUST be de-duplicated.
- **FR-020**: Email notifications MUST include the message **reference ID** and a clear **reply
  policy** (e.g. reply-to support mailbox / open rettX for details).
- **FR-021**: The system SHOULD be able to incorporate provider delivery signals (e.g. bounce)
  if/when available, but provider webhook ingestion is NOT required for v1 (send-time status is
  acceptable for v1). *(See Open Question Q3.)*

### Functional Requirements — Caregiver-facing API

- **FR-022**: Caregivers MUST be able to list **only their own** messages, paginated, newest
  first, with read state, category, optional patient reference, and content snapshot summary.
- **FR-023**: Caregivers MUST be able to fetch a single message's detail, retrieve an unread
  count, mark a message read, and archive a message — all strictly scoped to themselves.

### Functional Requirements — Categories, admin, audit, security

- **FR-024**: The system MUST define an initial, stable set of **message categories**:
  onboarding, diagnosis-validation, file-upload-request, missing-information-request,
  survey-invitation, consent-update, profile-update-request, research-invitation,
  system-announcement, support-operational.
- **FR-025**: Admins MUST be able to create an individual message, create a bulk communication,
  preview content, list/filter sent messages (by caregiver, patient, category, campaign, date,
  status, template), view delivery + read status, and resend failed deliveries.
- **FR-026**: Existing individual and bulk **email workflows MUST be preserved** for admins,
  routed through the new message-creation process (no loss of current capability).
- **FR-027**: The system MUST enforce **caregiver-level authorization** so a caregiver can only
  access their own messages, and **patient-level authorization** so patient-linked content is
  only exposed to users permitted to that patient.
- **FR-028**: The Message Center MUST remain **separate from the audit log**: messages store
  user-facing communications; audit events store internal system/admin events. A message MAY be
  linked to an audit event but the two MUST remain distinct concepts.
- **FR-029**: The system MUST emit audit events for message lifecycle (created, delivered,
  read, resent, archived) under a communications audit domain, without storing PHI unnecessarily.
- **FR-030**: Email bodies (and future push payloads) MUST avoid unnecessary clinical detail;
  sensitive context SHOULD live behind authentication in the in-app message. A future push, when
  added, MUST be generic (e.g. "You have a new message in rettX").
- **FR-031**: The system MUST define **retention** expectations for messages and deliveries and
  honor **GDPR** data-subject handling (export/erasure) for caregiver communications.
  *(See Open Question Q1.)*

### Key Entities *(include if feature involves data)*

- **Message**: A persisted communication for exactly one caregiver. Key attributes: identifier,
  reference ID, recipient caregiver reference, optional patient reference, category code,
  language used, content snapshot (in-app title/body + channel content + template id/version),
  read state + read timestamp, archived state, audit fields, optional campaign/correlation link.
- **Delivery**: A per-channel send attempt attached to a message. Key attributes: channel
  (email for v1), status, timestamps, error reason, provider reference. Multiple deliveries
  (e.g. retries) MAY exist per message per channel.
- **Communication Template**: A versioned, reusable template holding channel-specific,
  localized representations (in-app title/body, email subject/HTML/plain text; reserved push
  fields). Evolves from today's blob-based email templates.
- **Message Category**: A controlled vocabulary value classifying a message for filtering,
  analytics, and future notification preferences.
- **Bulk Communication / Campaign**: The admin-initiated definition of a send over a resolved
  caregiver cohort that fans out into one Message per recipient (builds on existing campaign
  lifecycle).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of caregiver communications created through the Message Center are persisted
  before delivery, and remain visible in-app even when email delivery fails.
- **SC-002**: A caregiver can find the in-app history of every Message-Center communication
  rettX sent them, with accurate read/unread state, in one place.
- **SC-003**: For any sent message, an admin can determine email delivery status and (where
  applicable) read status, and resend a failed delivery without creating a duplicate message.
- **SC-004**: Bulk sends produce exactly one message per resolved caregiver with zero duplicate
  messages or duplicate emails across retries.
- **SC-005**: The unread-count call for a logged-in caregiver returns quickly enough to drive a
  navigation badge without fetching message bodies (target: well under typical page-load budget).
- **SC-006**: No existing admin email workflow regresses; every send that worked before works
  after, now also producing a persisted message.
- **SC-007**: No caregiver can ever retrieve another caregiver's message or patient-linked
  content they are not authorized to see (validated by authorization tests).
- **SC-008**: The content a caregiver saw at send time is reproducible from the stored snapshot
  even after the underlying template is edited.

## Cross-Team Coordination *(mandatory for this feature)*

This feature cannot ship from any single repo. It is coordinated from the control plane: this
spec is the shared design, and the **published API contract** under `contracts/` — **owned here,
implemented and versioned by `rettxapi`** — is the boundary the two frontends consume rather
than redefine.

- `contracts/caregiver-api-contract.md` — the caregiver-facing message API (list, detail,
  unread count, mark-read, archive, content snapshot for i18n). **Consumed by** `rettxweb` (§8).
- `contracts/admin-api-contract.md` — the admin messaging API (send individual + bulk, preview,
  language/template-version selection, delivery + read status, filtering, resend, reference-ID).
  **Consumed by** `rettxadmin` (§10).

**Anti-divergence mechanism**: there is exactly one canonical API contract (these two files in
the control plane). Frontends do not invent endpoint shapes; changes are versioned here, and the
`spec-fanout` issues link every repo back to this spec.

**Sequencing principle**: `rettxapi` ships the persist + caregiver-read slice (Story 1 + 2)
behind no behavioral change to existing flows, then **freezes** the contract; `rettxweb` builds
the caregiver Messages section against the frozen caregiver contract; `rettxadmin` migrates
existing send screens onto the new create-then-deliver endpoints while preserving current UX.

### Program-level cross-cutting decisions (from the control-plane gap analysis)

Surfaced by reading all three repos together; each is decided **once, here**, so the lanes do
not diverge:

- **D1 — Canonical language code (RESOLVED).** The single source of truth is the **caregiver's
  language preference stored in their principal/profile, owned and served by `rettxapi`**. Both
  frontends read it from the caregiver profile (`rettxweb` from principal info via `rettxapi`;
  `rettxadmin` from the same caregiver profile) and **pass it through unchanged** to the
  send/render call — neither maps nor substitutes it. `rettxapi` keys communication templates by
  exactly that profile code, with **English fallback** when no template exists for the code. The
  ISO 3166-1 country codes in `rettxadmin`'s own i18n files localize the **admin UI chrome only**
  and are out of scope for the renderer input — so there is no real divergence to reconcile.
- **D2 — Synchronous delivery in v1.** `rettxapi` has no durable async infrastructure (no
  queue / Service Bus / Durable Functions). v1 delivers **synchronously** within the request,
  with durability via the persisted message + `failed` delivery status + admin resend; a Storage
  Queue worker is a funded fast-follow, not assumed. Frontends MUST NOT assume queued/async
  delivery semantics. *(Refines FR-016 and Q3.)*
- **D3 — Bulk model.** Each caregiver gets one independent persisted message; the existing
  `rettxapi` campaign engine and `rettxadmin` campaign UI are reused as the fan-out mechanism
  (one message per recipient), not replaced.
- **D4 — Feature flag.** Gate staged rollout of the caregiver surface behind a program-reserved
  `messages` flag using the **existing feature-flag framework** (caregiver `app_metadata.features`,
  the same `featureMatchGuard` mechanism already in `rettxweb`) — no new flag infrastructure.

## Assumptions

- The existing **Principal** model is the caregiver identity; its `preferences.language`,
  `given_name`, and email drive rendering and targeting (reused, not rebuilt).
- The existing **PatientAccess** model governs patient-level authorization for patient-linked
  messages.
- The existing **campaign lifecycle** (`027`) and **email send/templating** (`010`) are the
  foundation; the Message Center wraps and extends them rather than replacing them.
- Delivery is **asynchronous** (persist first, then deliver); send-time delivery status is
  acceptable for v1 (provider webhooks optional/future).
- A new Cosmos container is acceptable for messages; partition strategy favors per-caregiver
  read performance (finalized in `plan.md`).
- Email remains the **only** delivery channel in v1; the model is channel-agnostic for future
  push without re-architecting.
- Frontend translation of structured codes continues per the platform i18n pattern; the backend
  provides content snapshots and codes, not localized UI strings beyond rendered message content.

## Out of Scope (v1)

- Push notifications and other non-email channels (model is ready; no delivery in v1).
- Full bidirectional in-app messaging; caregiver-to-admin chat; message threading.
- Automatic ingestion of email replies into rettX.
- Support ticket assignment, SLA, moderation workflows.
- Structured caregiver request actions from the app (e.g. "contact us about this message",
  "report incorrect data") — considered for a later version.
- Provider open/click tracking and webhook-based bounce/complaint handling (optional/future).

## Constitution Check

*GATE: must hold before implementation planning is accepted. Checked against the **program
constitution** (`.specify/memory/constitution.md`); repo-specific technical principles
(layering, async-first, API versioning, configuration, error handling) are verified in each
repo's own derived plan and its local constitution.*

- **I. Patients & caregivers come first (NON-NEGOTIABLE)** — gives caregivers one trustworthy,
  in-app history of every communication, independent of their email inbox; messages persist and
  remain visible even when email delivery fails. ✅
- **II. Privacy by design (NON-NEGOTIABLE)** — caregiver-only + patient-level authorization
  (FR-027); clinical detail kept out of email/push with sensitive context behind authentication
  (FR-030); messages kept distinct from the audit log (FR-028); GDPR retention/erasure addressed
  (FR-031, Q1). ✅
- **III. Transparency above all (NON-NEGOTIABLE)** — a reproducible content snapshot records
  exactly what was communicated, even after templates change (FR-006); message lifecycle is
  audited (FR-029); a stable reference ID supports traceability of replies (FR-004). ✅
- **IV. Clinical accuracy & accountability** — versioned communication templates; the rendered
  snapshot is the accountable record of what each caregiver was told (FR-006, FR-011). ✅
- **V. Accessibility & inclusion** — the caregiver Messages surface follows the web app's
  WCAG/ARIA and mobile conventions and ships with the full supported-language set for chrome;
  message bodies are backend-localized (the canonical code set is decision D1). ✅
- **VI. Security baseline** — authN required on every surface; least-privilege caregiver/patient
  scoping; no PHI in logs; secrets via Key Vault. ✅
- **VII. Open by default / VIII. Sustainability & stewardship** — reuses existing SendGrid,
  campaign, audit and patient-access machinery rather than standing up new infrastructure; the
  channel-agnostic model avoids re-architecting when push is added later. ✅

## Open Questions *(max 3 — resolve during research)*

- **Q1 [NEEDS CLARIFICATION]**: Retention policy for messages/deliveries and the GDPR
  export/erasure behavior — does erasure redact content while retaining an audit-safe tombstone,
  or remove the message entirely? (Drives FR-031 and storage design.)
- **Q2 [NEEDS CLARIFICATION]**: For patient-linked messages, when a caregiver later loses
  patient access, should the message be fully hidden or shown with patient-specific content
  redacted? (Drives FR-027 and US1 scenario 5.)
- **Q3 [NEEDS CLARIFICATION]**: Is send-time email status sufficient for v1, or is at least
  bounce handling (provider webhook) required before launch? (Drives FR-021 scope.)

# Research & Gap Analysis: rettX Message Center

**Feature**: `032-message-center` | **Date**: 2026-06-22 | **Spec**: [spec.md](spec.md)
**Basis**: live stable `main` @ `0462f9e` (v0.0.44 + #291/#292/#293)

This document captures the gap analysis explicitly requested: **current functionality vs.
what the Message Center needs**. Status legend: ✅ FULLY present · 🟡 PARTIAL · ❌ ABSENT.
Each row cites concrete files/symbols so the implementation plan can reuse, not rebuild.

---

## 1. Summary scorecard

| Capability area | Status today | Reuse vs. build |
|---|---|---|
| 1. Email sending (SendGrid) | 🟡 individual-send only | Reuse client; wrap behind delivery layer |
| 2. Email templates (Blob + Jinja2) | 🟡 no versioning, no in-app/channel split | Extend → communication templates |
| 3. Bulk communication (campaign lifecycle) | ✅ draft→send→track→retry | Reuse as bulk fan-out engine |
| 4. Caregiver / Principal model | ✅ rich profile, language, email | Reuse as recipient identity |
| 5. In-app message persistence / inbox | ❌ none (push history ≠ inbox) | **Build** (core of this feature) |
| 6. Routers (admin + v2 caregiver) | ✅ structure exists | Add message routers |
| 7. Repository / Cosmos patterns | ✅ singleton + async + partition | Reuse for `messages` container |
| 8. Audit logging | ✅ domain-based, fire-and-forget | Add `MESSAGES`/comms domain (separate) |
| 9. Auth / permissions | ✅ token + admin + patient-access | Reuse for caregiver + patient scoping |
| 10. Delivery status tracking | 🟡 send-time only, no webhooks | Reuse send-time; webhooks deferred |

**Net**: ~70% of the supporting infrastructure already exists. The genuinely new build is the
**persisted message record + caregiver inbox API** (area 5) and the **template evolution** to
channel-aware, versioned communication templates (area 2). Everything else is reuse/extension.

---

## 2. Detailed gap analysis

### 2.1 Email sending — 🟡 PARTIAL
- `app/services/admin/email_services.py` — `EmailServices` singleton, `SendGridAPIClient`,
  exponential backoff (5 retries), `send_email(to_email, template_name, language, variables)`,
  fires audit events on success/failure.
- `app/routers/admin/communications.py` — `POST /send-email` (single send),
  guarded by `require_admin`, calls `admin_services.send_email_to_user()`.
- `app/core/config.py` — `RETTX_SENDGRID_API_KEY`, `RETTX_SENDER_EMAIL`,
  `RETTX_STORAGE_EMAIL_TEMPLATE_CONTAINER`.
- **Gaps**: no async-decoupled delivery (send is inline); no provider webhooks
  (bounce/open/click); delivery status = "API accepted", not "delivered".
- **Decision**: keep `EmailServices` as the email **channel adapter**; the new delivery
  orchestrator calls it. Persist message first, then deliver async (FR-016).

### 2.2 Email/communication templates — 🟡 PARTIAL
- `app/services/admin/email_template_loader.py` — `BlobTemplateLoader` loads
  `{template}/{language}.html` and `.subject.txt` from Blob; Jinja2; not cached.
- `app/models/admin/email_models.py` — `EmailTemplateEnum` (welcome, reminder_genetics,
  no_rett_diagnosis, missing_mutation_in_report, missing_patient_info,
  information_request_custom, missing_name, missing_surname, missing_dob,
  info_mismatch_name, info_mismatch_dob). Naming aligns with `FileStatus` (spec `010`).
- `app/models/user/user_preferences.py` — `LANGUAGE_MAP` (supported languages).
- **Gaps**: ❌ no versioning/rollback, ❌ no in-app vs email channel split (email-only today),
  ❌ no audit of template changes, ❌ enum-bound (no dynamic templates).
- **Decision**: introduce **communication templates** carrying channel-specific localized
  representations (in-app title/body, email subject/HTML/text; reserved push). Version them;
  message creation snapshots rendered output + template id/version (FR-006, FR-010, FR-011).
  Backward compatibility: existing email templates map to the email channel of a comm template.

### 2.3 Bulk communication — ✅ FULLY present (foundation)
- `app/models/admin/campaign_models.py` — `CampaignDocument` (draft/completed, patient_ids,
  aggregate counts, created_by/at, sent_by/at), `RecipientRecord` (per-patient status, error),
  max 100 patients/campaign.
- `app/repository/campaign_repository.py` — `CampaignRepository`, container
  `bulk_email_campaigns`, partition `/campaign_id`.
- `app/services/admin/campaign_services.py` — create/send/get/list/retry_failed/delete_draft;
  resolves principal per patient; loops `email_services.send_email()`; per-recipient status.
- `app/routers/admin/campaigns.py` — create/update/send/list/detail/retry/delete.
- **Gap vs. Message Center**: campaigns currently fan out **emails**, not **persisted
  messages**. The "one document per recipient" requirement (FR-002) maps cleanly: each
  `RecipientRecord` becomes (or spawns) a persisted Message.
- **Decision**: reuse the campaign lifecycle as the **bulk fan-out engine**. On send, create
  one Message per resolved caregiver, then deliver. Idempotency + retry already modeled (FR-019).

### 2.4 Caregiver / Principal model — ✅ FULLY present
- `app/models/principal/principal_models.py` — `Principal` (BaseDocument): `email`,
  `email_verified`, `identities[]`, `profile` (given_name, family_name,
  `preferences.language`, location, contact_info), `status` (PROVISIONAL/ACTIVE/LOCKED).
- Container `principals_v2`, partition `/id`.
- **Gap**: `email_verified` may be false → email targeting must handle unverified/missing email
  gracefully (still persist in-app message). Minor.
- **Decision**: Principal is the **recipient** identity. Recipient key on Message = principal id.

### 2.5 In-app message persistence / inbox — ❌ ABSENT (the core build)
- Closest existing concept: `app/models/notification/notification_models.py`
  `PushNotificationHistory` (id, user_id, title, body, category, is_read, read_at,
  delivery_status) + `push_notification_repository.py` (container `notifications`,
  partition `/user_id`) + `notification_history_services.py`.
- **This is push history, not a message inbox**: it records *push* sends, is admin-oriented,
  and is not the canonical user-facing record decoupled from a channel.
- **Decision**: **Build** a dedicated `Message` model + `messages` container + message
  repository + caregiver-facing service/endpoints. The push-notification history is a useful
  *pattern reference* (read/unread, pagination, filtering) but not the storage.
- **Note**: when push is added later, the existing push infra (`push_notification_services.py`,
  device tokens) becomes a **second delivery channel** for a Message — confirming the
  channel-agnostic design.

### 2.6 Routers — ✅ FULLY present (structure)
- Admin: `app/routers/admin/` (communications, campaigns, audit, principals, patient_access, …).
- Caregiver/user-facing: `app/routers/v2/` (careprofile, files, mutations, patients, pulse,
  surveys). New caregiver message endpoints belong here (e.g. `app/routers/v2/messages.py`).
- Guards: `app/dependencies/admin.py` (`require_admin`),
  `app/dependencies/user_permissions.py` (`get_current_user_id`).
- **Decision**: add `v2/messages.py` (caregiver) + `admin/messages.py` (admin), or fold admin
  send into `admin/communications.py`/`admin/campaigns.py` to preserve current workflows.

### 2.7 Repository / Cosmos patterns — ✅ FULLY present
- `app/models/core/core_models.py` — `BaseDocument` (id, created_at, created_by, version,
  last_updated_at, last_updated_by, is_deleted).
- Pattern (e.g. `campaign_repository.py`): singleton `get_instance()` + `asyncio.Lock`,
  async `_initialize()`, `create_item`/`query_items`/`replace_item` (+ etag),
  `create_container_if_not_exists`.
- Config: every container has `RETTX_{NAME}_CONTAINER_NAME` + `RETTX_{NAME}_PARTITION_KEY`.
- **Decision**: new container `messages` (name/partition finalized in plan.md, leaning
  partition `/recipient_id` for caregiver-scoped reads). Follow the standard repository pattern.

### 2.8 Audit logging — ✅ FULLY present
- `app/models/core/audit_event.py` — `AuditEvent` (patient_id, domain, event_type, timestamp,
  actor_id, correlation_id, outcome, metadata, retention_tier); `AuditDomain` includes **EMAIL**;
  `RetentionTier` (STANDARD ≥12mo, LONG ≥7yr).
- `app/services/audit_services.py` — `AuditServices` singleton, fire-and-forget,
  `log_email_event(...)` and domain helpers.
- `app/repository/audit_event_repository.py` — append-only, container `audit_events`,
  partition `/patient_id`.
- **Decision**: per FR-028, the Message Center is **separate** from audit. Add a MESSAGE
  audit domain (`AuditDomain.MESSAGE`, enum value `message`) and `log_message_event(...)` helper for
  lifecycle events (created/delivered/read/resent/archived). Messages are user-facing records;
  audit stays internal. A message MAY carry an audit correlation id.

### 2.9 Auth / permissions — ✅ FULLY present
- `app/authentication/auth0_client.py` (`Auth0Client`), `get_current_user_id()`
  (`user_permissions.py`), admin gate (`admin.py`/`admin_permissions.py`).
- `app/models/patient_access/patient_access_models.py` — `PatientAccess`
  (principal_id, patient_id, access_level, consent, revocation; `is_active`).
- `app/models/core/core_models.py` — `AccessLevelEnum` (NONE/READONLY/EDIT/OWNER).
- **Decision**: caregiver endpoints scope every query to `get_current_user_id()`'s principal;
  patient-linked content additionally checks `PatientAccess.is_active`. Resolves Q2.

### 2.10 Delivery status tracking — 🟡 PARTIAL
- `campaign_models.py` `RecipientRecord.status` (SENT/FAILED) + error; campaign aggregates.
- `notification_models.py` `DeliveryStatus` (per-device for push).
- Audit dual-write of send outcome.
- **Gap**: ❌ no provider webhooks (bounce/open/click); status = send-time only.
- **Decision**: v1 uses send-time status on the Delivery record (FR-017). Webhook ingestion is
  an optional future increment (Q3); the Delivery model leaves room for provider references.

---

## 3. Key design decisions (from gaps)

- **D1 — Persist before deliver**: Message is the source of truth; delivery is a side effect
  (FR-001, FR-016). Reuses async patterns already in the codebase.
- **D2 — One document per recipient** (FR-002): aligns with `RecipientRecord` granularity;
  keeps read state, authz, and future personalization simple; partition by recipient.
- **D3 — Communication templates supersede email templates** (FR-010/011): additive — existing
  email templates become the email channel of a versioned comm template; content snapshot at
  send time guarantees reproducibility (D-comply with i18n "structured codes" platform rule).
- **D4 — Reuse campaign lifecycle for bulk** (FR-019): campaigns fan out to Messages, not raw
  emails; idempotency/retry already present.
- **D5 — Audit stays separate** (FR-028): new MESSAGE audit domain (`message`); Message Center is not the
  audit log.
- **D6 — Channel-agnostic delivery**: email is the only v1 channel; push infra already exists and
  slots in later as a second channel with no message-model change.

---

## 4. Open questions (mirror spec) — to resolve with product/security before plan freeze

- **Q1 — Retention & GDPR erasure** of messages/deliveries (redact-with-tombstone vs. delete).
- **Q2 — Patient-access loss**: hide vs. redact patient-linked content (lean: hide patient
  specifics, keep generic record; see D-§2.9).
- **Q3 — Delivery fidelity for v1**: send-time status only vs. minimum bounce webhook.

## 5. Cross-repo dependencies

This gap analysis backs the backend (`rettxapi`) slice of [rettx#10](https://github.com/rett-europe/rettx/issues/10).
The control plane owns the published API contract; the two frontends consume the contract and own
their own UI in their derived plans:

- **rettxweb** (§8): caregiver app consumes the caregiver message endpoints and owns the Messages
  UI. Published contract: `contracts/caregiver-api-contract.md`.
- **rettxadmin** (§10): admin dashboard migrates existing send screens to create-then-deliver and
  owns delivery/read status UI. Published contract: `contracts/admin-api-contract.md`.
- No changes required to `rettxmutation` or `rettxid`.

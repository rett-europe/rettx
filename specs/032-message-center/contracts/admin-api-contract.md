# Published API Contract — Admin Messaging

**Feature**: `032-message-center` | **Hosted by**: rettX control plane (this spec) · **Implemented + versioned by**: `rettxapi`
**Consumer**: `rettxadmin` dashboard (§10)
**Umbrella**: [rettx#10](https://github.com/rett-europe/rettx/issues/10) · **Contract version**: `v0.2 (draft)`

> **Scope of this document.** This is the **published interface** for admin messaging — the
> single source of truth all sides agree on, hosted in the control plane and implemented +
> versioned by `rettxapi`. It defines *only the API the admin dashboard consumes*; the
> admin-frontend UI is specified by the `rettxadmin` lane (parent issue §10 "Admin frontend
> impact"). Shapes are indicative until frozen at backend Phases P3–P5 (see [../plan.md](../plan.md));
> changes require a version bump + a heads-up to the `rettxadmin` lane.

## 1. Endpoints (admin-authenticated, `require_admin`)

Existing endpoints (`POST /send-email`, campaign endpoints from spec `027`) remain live; the new
create-then-deliver behavior layers underneath and existing admin workflows are preserved until
the P7 cutover (FR-026).

| Method | Path (indicative) | Purpose |
|---|---|---|
| `POST` | `/admin/messages` | Create + deliver an individual message (persist first, deliver synchronously within the request — v1, per D2). |
| `POST` | `/admin/messages/preview` | Render preview for a template + language + version (no send). |
| `GET` | `/admin/messages` | List/filter sent messages (caregiver, patient, category, campaign, date, status, template) + pagination. |
| `GET` | `/admin/messages/{message_id}` | Message detail incl. delivery + read status. |
| `POST` | `/admin/messages/{message_id}/resend` | Resend failed email delivery (same message). |
| `POST` | `/admin/communications/bulk` | Create a bulk communication → one message per caregiver (reuses campaign lifecycle). |
| `GET` | `/admin/communications/{campaign_id}` | Bulk send detail with per-recipient delivery status. |
| `POST` | `/admin/communications/{campaign_id}/retry` | Idempotent retry of failed recipients. |
| `GET` | `/admin/communication-templates` | List versioned communication templates (selection/preview). |

> Exact placement (new `admin/messages.py` vs. extending `admin/communications.py` /
> `admin/campaigns.py`) is finalized at P3–P5 to preserve current admin workflows.

## 2. Shapes (indicative)

**Create individual (request)**:
```json
{
  "recipient_principal_id": "…",
  "template_id": "survey-invitation",
  "template_version": "1.2",
  "patient_id": "…",
  "category_code": "survey-invitation",
  "variables": { "…": "…" },
  "idempotency_key": "…"
}
```
> **`language` is server-derived (D1), not a request field.** The send language is resolved by
> `rettxapi` from the **recipient caregiver's profile language** (English fallback); admins do not
> pass it per-send. An optional `language_override` MAY be added later for explicit admin override,
> but is out of scope for v1.

**Message + delivery (response)**:
```json
{
  "id": "…",
  "reference_id": "MSG-20260622-AB12CD",
  "recipient_principal_id": "…",
  "patient_id": null,
  "category_code": "survey-invitation",
  "language": "pt",
  "template": { "id": "survey-invitation", "version": "1.2" },
  "is_read": false, "read_at": null,
  "deliveries": [
    { "channel": "email", "status": "sent", "sent_at": "…", "error": null, "provider_ref": "…" }
  ],
  "created_at": "…", "created_by": "admin-user-id"
}
```

## 3. Conventions

- Hyphenated codes; full UTC timestamps.
- `reference_id` format is **`MSG-{yyyymmdd}-{short}`** (e.g. `MSG-20260622-AB12CD`) — shared with
  the caregiver contract; email-safe, stable, unique.
- `deliveries[]` is **embedded on the message** (v1 is single-channel email); it is not a separate
  resource. The model stays channel-agnostic for a future push channel.
- Delivery `status` ∈ `pending | sent | failed | not_attempted`, recorded from the provider send
  response at send time (v1, per D2 / umbrella Q3); `provider_ref` is retained for later
  correlation. No bounce/delivery webhook in v1.
- Re-send of a completed campaign → `409 Conflict` (consistent with spec `027`).
- A **persisted rettX message** is distinct from its **email delivery** — the response models
  both (message envelope + `deliveries[]`), so the UI can show the distinction (umbrella §10).

## 4. Sequencing

1. Backend P3–P5 build, then **freeze** this contract (`v0.1` → `v1.0`).
2. `rettxadmin` migrates send + status screens onto the new endpoints (old still live).
3. Backend P7 routes existing admin email workflows through message creation (cutover).

## 5. Open items needing a joint decision (rettxapi ↔ rettxadmin)

- **O1**: Surface read status for all messages or only selected categories?
- **O2**: Bulk audience selection model (reuse current patient-cohort selection → resolve caregivers).
- **O3**: How much of the old "send email" screen is replaced vs. wrapped during P3–P7 transition.
- **O4 (RESOLVED → send-time status only for v1; umbrella Q3).** "Delivered" in the UI means the
  provider accepted the send (`sent`); bounce/complaint webhooks are out of scope for v1. The UI
  shows `pending | sent | failed | not_attempted` and offers resend on `failed`.

## 6. Coordination

Hosted in the control plane (`specs/032-message-center/`) and linked from the `spec-fanout`
issue opened in `rettxadmin`. It is the single source of truth for the admin messaging API
surface; the `rettxadmin` lane consumes it rather than redefining it.

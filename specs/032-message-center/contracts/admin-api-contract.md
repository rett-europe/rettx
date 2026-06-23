# Published API Contract — Admin Messaging

**Feature**: `032-message-center` | **Hosted by**: rettX control plane (this spec) · **Implemented + versioned by**: `rettxapi`
**Consumer**: `rettxadmin` dashboard (§10)
**Umbrella**: [rettx#10](https://github.com/rett-europe/rettx/issues/10) · **Contract version**: `v1.0 — FROZEN (rettxapi P3+P4+P5 shipped): individual-send + bulk + list/filter all frozen`

> **Scope of this document.** This is the **published interface** for admin messaging — the
> single source of truth all sides agree on, hosted in the control plane and implemented +
> versioned by `rettxapi`. It defines *only the API the admin dashboard consumes*; the
> admin-frontend UI is specified by the `rettxadmin` lane (parent issue §10 "Admin frontend
> impact"). **Fully frozen at v1.0:** the **individual-send** (create / preview / detail / resend),
> **bulk** (`/admin/communications/*`), and **list/filter** (`GET /admin/messages`) endpoints are
> all **frozen at v1.0** (backend P3 + P4 + P5 shipped + verified) — `rettxadmin` may build against
> the entire surface now. Changes to frozen shapes require a version bump (v1.1+) + a heads-up to the
> `rettxadmin` lane.

## 1. Endpoints (admin-authenticated, `require_admin`)

Existing endpoints (`POST /send-email`, campaign endpoints from spec `027`) remain live; the new
create-then-deliver behavior layers underneath and existing admin workflows are preserved until
the P7 cutover (FR-026).

| Method | Path | Purpose | Freeze status |
|---|---|---|---|
| `POST` | `/admin/messages` | Create + deliver an individual message (persist first, deliver synchronously within the request — v1, per D2). Returns **`201 Created`**. | **FROZEN v1.0** (P3) |
| `POST` | `/admin/messages/preview` | Render preview for a template + version (no send). Accepts an **optional `language`** for inspection only — see §3. | **FROZEN v1.0** (P3) |
| `GET` | `/admin/messages/{message_id}` | Message detail incl. delivery + read status. | **FROZEN v1.0** (P3) |
| `POST` | `/admin/messages/{message_id}/resend` | Resend a failed delivery by re-delivering the **stored content snapshot** (no re-render, SC-008); appends a new `Delivery`. | **FROZEN v1.0** (P3) |
| `GET` | `/admin/messages` | List/filter sent messages (caregiver, patient, category, campaign, date, delivery status, template) + pagination. Compact row projection — see §2.5. | **FROZEN v1.0** (P5) |
| `POST` | `/admin/communications/bulk` | Create a bulk communication: patient-cohort audience → resolved to **active caregivers** → **one persisted message per caregiver**, tagged with `campaign_id`. Returns **`201 Created`**. | **FROZEN v1.0** (P4) |
| `GET` | `/admin/communications/{campaign_id}` | Bulk rollup + per-recipient delivery/read status (derived from messages by `campaign_id`). | **FROZEN v1.0** (P4) |
| `POST` | `/admin/communications/{campaign_id}/retry` | Idempotent retry: re-delivers only the **failed** messages (never duplicates, SC-004). **`200`**; **`409`** if nothing failed. | **FROZEN v1.0** (P4) |
| `GET` | `/admin/communication-templates` | List versioned communication templates (selection/preview). | indicative |

> Exact placement (new `admin/messages.py` vs. extending `admin/communications.py` /
> `admin/campaigns.py`) is finalized at P3–P5 to preserve current admin workflows.

## 2. Shapes — individual send (frozen at v1.0)

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
> **`language` is server-derived (D1), not a request field** on real sends. The send language is
> resolved by `rettxapi` from the **recipient caregiver's profile language** (English fallback);
> admins do not pass it on `POST /admin/messages`. **Exception:** `POST /admin/messages/preview`
> accepts an **optional `language`** so an admin can inspect any localization before sending; this
> is preview-only (never persists or sends) and does not affect D1 for real sends. An optional send
> `language_override` MAY be added later but is out of scope for v1.

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

### Bulk — frozen at v1.0 (P4)

**Bulk create (request)** — `POST /admin/communications/bulk`:
```json
{
  "template_id": "survey-invitation",
  "template_version": "1.2",
  "category_code": "survey-invitation",
  "patient_ids": ["…"],
  "variables": { "…": "…" }
}
```
`patient_ids` is 1–100 (aligned with the existing campaign cohort cap). **No `language`** (each
resolved caregiver's send language is server-derived, D1).

**Bulk create (response, `201`)** — counters are flat and the full per-recipient list is inline:
```json
{
  "campaign_id": "comm_ab12cd34",
  "category_code": "survey-invitation",
  "total_patients": 45,
  "total_recipients": 42,
  "sent": 40,
  "failed": 2,
  "not_attempted": 0,
  "recipients": [
    {
      "recipient_principal_id": "…",
      "message_id": "…",
      "reference_id": "MSG-20260623-AB12CD",
      "delivery_status": "sent",
      "is_read": false,
      "error": null
    }
  ],
  "skipped_patients": [
    { "patient_id": "…", "reason": "no-active-caregiver" }
  ],
  "created_at": "…",
  "created_by": "admin-user-id"
}
```

**Bulk rollup (response)** — `GET /admin/communications/{campaign_id}` (message-derived; same flat
counters as create, plus `read_count`):
```json
{
  "campaign_id": "comm_ab12cd34",
  "total_recipients": 42,
  "sent": 40,
  "failed": 2,
  "not_attempted": 0,
  "read_count": 12,
  "recipients": [
    {
      "recipient_principal_id": "…",
      "message_id": "…",
      "reference_id": "MSG-20260623-AB12CD",
      "delivery_status": "sent",
      "is_read": false,
      "error": null
    }
  ]
}
```

**Bulk retry (response, `200`)** — `POST /admin/communications/{campaign_id}/retry`; re-delivers only
previously-failed recipients (never creates new messages, SC-004). `409` if nothing failed:
```json
{
  "campaign_id": "comm_ab12cd34",
  "retried": 2,
  "now_sent": 2,
  "still_failed": 0,
  "recipients": [
    {
      "recipient_principal_id": "…",
      "message_id": "…",
      "reference_id": "MSG-20260623-AB12CD",
      "delivery_status": "sent",
      "is_read": false,
      "error": null
    }
  ]
}
```


## 2.5 Shapes — list/filter (frozen at v1.0, P5)

**List/filter (request)** — `GET /admin/messages`, all query params optional:

| Param | Type | Notes |
|---|---|---|
| `page` | int ≥1 | default `1` |
| `page_size` | int 1–100 | default `20` |
| `recipient_principal_id` | string | exact match |
| `patient_id` | string | exact match |
| `category_code` | string | hyphenated code |
| `campaign_id` | string | `comm_{uuid8}` |
| `template_id` | string | exact match |
| `delivery_status` | enum | `pending \| sent \| failed \| not_attempted` (matches denormalized `latest_delivery_status`) |
| `is_read` | bool | |
| `created_from` / `created_to` | ISO-8601 UTC | inclusive; compared lexicographically on `created_at` |

Cross-partition, **newest-first**.

**List/filter (response)** — `AdminMessageListResponse`, same pagination envelope as the caregiver
contract (`{ messages[], total, page, page_size }`); each row is a **compact projection**:
```json
{
  "messages": [
    {
      "id": "…",
      "reference_id": "MSG-20260623-AB12CD",
      "recipient_principal_id": "…",
      "patient_id": "…",
      "category_code": "survey-invitation",
      "language": "pt",
      "template": { "id": "survey-invitation", "version": "1.2" },
      "is_read": false,
      "read_at": null,
      "latest_delivery_status": "sent",
      "campaign_id": "comm_ab12cd34",
      "created_at": "…",
      "created_by": "admin-user-id"
    }
  ],
  "total": 137,
  "page": 1,
  "page_size": 20
}
```
> **Compact-row design (ratified):** the list row deliberately **omits the full embedded
> `deliveries[]`** and surfaces `latest_delivery_status` (a denormalized summary of the most recent
> attempt) instead. The full `deliveries[]` array remains available via the frozen
> `GET /admin/messages/{id}` detail — the list is for scanning, the detail for drill-in.
> `latest_delivery_status` is maintained on every send/resend; messages persisted **before** the P5
> deploy (early P3/P4 test data) lack the field and will not match a `delivery_status` filter (no
> backfill in v1). This is an acceptable v1 limitation (affects test data only) and is additive to
> revisit later.

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
- **Create** (`POST /admin/messages`) returns **`201 Created`** with the message envelope.
  **Idempotency (FR-019):** repeating a request with the same `idempotency_key` returns the
  **existing** message and does **not** create a duplicate or re-send.
- **Resend** (`POST /admin/messages/{id}/resend`) re-delivers the **stored content snapshot**
  (no re-render — SC-008) and appends a new `Delivery` entry rather than mutating the prior one.
- **Bulk `campaign_id`** is formatted **`comm_{uuid8}`** (a distinct namespace from the
  `027` email-campaign `camp_` ids) and is opaque to the frontend — use it only as the rollup path
  parameter.
- **Bulk v1 semantics (ratified):** (a) cohort patients with **no active caregiver** are returned
  in the create response `skipped_patients[]` (each `{ patient_id, reason }`) but do **not** appear in
  the persisted rollup (the rollup is message-derived); persisting unresolved patients in the rollup
  is an **additive** v1.x change if `rettxadmin` needs it. (b) Bulk messages set `patient_id = null`
  (caregiver-level), because one caregiver may map to several cohort patients; per-message patient
  attribution for bulk is out of scope for v1 (additive later if required).

## 4. Sequencing

1. ✅ Backend P3 shipped → **individual-send** endpoints (create / preview / detail / resend)
   **frozen at `v1.0`** (2026-06-22). `rettxadmin` may migrate the individual-send + status screens.
2. ✅ Backend P4 shipped → **bulk** endpoints (`/admin/communications/*`) **frozen at `v1.0`**
   (2026-06-22). `rettxadmin` may build the bulk-communication screens (old `/bulk-email-campaigns`
   still live).
3. ✅ Backend P5 shipped → **list/filter** (`GET /admin/messages`) **frozen at `v1.0`** (2026-06-23).
   `rettxadmin` may build the filterable message index. **Admin contract now fully frozen at v1.0.**
4. Backend P7 routes existing admin email workflows through message creation (cutover).

## 5. Open items needing a joint decision (rettxapi ↔ rettxadmin)

- **O1**: Surface read status for all messages or only selected categories? *(frontend UX, `rettxadmin` lane)*
- **O2 (RESOLVED → patient-cohort audience).** Bulk audience is a patient cohort
  (`patient_ids[]`, 1–100) resolved to **active caregivers**; each caregiver gets **one** persisted
  message tagged `campaign_id`. Patients with no active caregiver → `skipped_patients[]` in the
  create response. Per the ratified v1 semantics in §3, bulk messages carry `patient_id = null` and
  unresolved patients are not in the persisted rollup (both additive to extend later).
- **O3**: How much of the old "send email" screen is replaced vs. wrapped during P3–P7 transition. *(frontend UX, `rettxadmin` lane)*
- **O4 (RESOLVED → send-time status only for v1; umbrella Q3).** "Delivered" in the UI means the
  provider accepted the send (`sent`); bounce/complaint webhooks are out of scope for v1. The UI
  shows `pending | sent | failed | not_attempted` and offers resend on `failed`.

## 6. Coordination

Hosted in the control plane (`specs/032-message-center/`) and linked from the `spec-fanout`
issue opened in `rettxadmin`. It is the single source of truth for the admin messaging API
surface; the `rettxadmin` lane consumes it rather than redefining it.

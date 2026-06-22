# Published API Contract — Caregiver Messages

**Feature**: `032-message-center` | **Hosted by**: rettX control plane (this spec) · **Implemented + versioned by**: `rettxapi`
**Consumer**: `rettxweb` caregiver app (§8)
**Umbrella**: [rettx#10](https://github.com/rett-europe/rettx/issues/10) · **Contract version**: `v1.0 (FROZEN — caregiver surface; rettxapi P1 shipped 2026-06-22)`

> **Scope of this document.** This is the **published interface** for the caregiver Messages
> surface — the single source of truth all sides agree on, hosted in the control plane and
> implemented + versioned by `rettxapi`. It defines *only the API the caregiver app consumes*;
> the caregiver-frontend UI is specified by the `rettxweb` lane (parent issue §8 "Caregiver
> frontend impact"). The shapes below are **frozen at v1.0** (backend P1 shipped and verified);
> `rettxweb` may build against them. Any change now requires a **version bump** (v1.1+) and a
> heads-up to the `rettxweb` lane.

## 1. Endpoints (caregiver-authenticated)

Auth0 caregiver token → principal. Every response is strictly scoped to the authenticated
caregiver; cross-caregiver access returns 404 (never discloses existence).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v2/messages` | Paginated list of the caregiver's messages (filters: `unread`, `category`, `archived`). |
| `GET` | `/v2/messages/{message_id}` | Message detail. Does **not** mark the message read (read is an explicit action — see O1). |
| `GET` | `/v2/messages/unread-count` | Lightweight unread count for a nav badge. |
| `POST` | `/v2/messages/{message_id}/read` | Mark a message read (idempotent). Returns **`204 No Content`**. |
| `POST` | `/v2/messages/{message_id}/archive` | Archive/hide (record retained). |

## 2. Shapes (frozen at v1.0)

**List response envelope** (`GET /v2/messages`):
```json
{ "messages": [ /* list item */ ], "total": 0, "page": 1, "page_size": 20 }
```

**List item**:
```json
{
  "id": "…",
  "reference_id": "MSG-20260622-AB12CD",
  "category_code": "survey-invitation",
  "title": "…",
  "preview": "…",
  "is_read": false,
  "read_at": null,
  "is_archived": false,
  "patient_ref": { "patient_id": "…", "display_safe": true },
  "created_at": "2026-06-22T10:00:00Z",
  "links": [ { "type": "survey", "target": "…" } ]
}
```
`patient_ref` is `null` when the message is not patient-linked (or when patient access is lost —
see §3). `links` is present but MAY be empty (see O2).

**Detail** (`GET /v2/messages/{message_id}`): adds full in-app `body`, resolved `links`, and drops
`preview`; otherwise the same fields. Email/HTML channel internals are **not** exposed to caregivers.

**Unread count** (`GET /v2/messages/unread-count`): `{ "unread_count": 0 }`.

**Mark read** (`POST /v2/messages/{message_id}/read`): **`204 No Content`**, empty body; idempotent
(repeating on an already-read message is a no-op `204`).

## 3. Conventions

- Timestamps: full UTC ISO-8601.
- `reference_id` format is **`MSG-{yyyymmdd}-{short}`** (e.g. `MSG-20260622-AB12CD`): email-safe,
  stable, and unique — used for reply correlation and support.
- **Patient-access loss (umbrella Q2, resolved):** when the caregiver no longer has access to a
  linked patient, the message is **retained and still listed**, but `patient_ref` is returned as
  `null` and patient-specific content is omitted from `title`/`body`/`preview`. The frontend
  renders exactly what the backend returns (it does not hide the message itself).
- i18n: backend sends **structured codes** (`category_code`, separators are **hyphens** e.g.
  `survey-invitation`); the frontend maps codes → localized strings. The rendered in-app
  `title`/`body` come from the message **content snapshot** (already localized at send time).
- Pagination envelope: `{ messages[], total, page, page_size }` (mirrors existing v2 list endpoints).

## 4. Sequencing

1. ✅ Backend P1 shipped → this contract is **frozen at `v1.0`** (2026-06-22).
2. `rettxweb` builds the Messages section against `v1.0` (safe to start now).
3. Backend P7 enables the caregiver feature flag → section goes live for enabled principals.

## 5. Open items needing a joint decision (rettxapi ↔ rettxweb)

- **O1 (RESOLVED → explicit read action).** `POST /{message_id}/read` is the **canonical** way to
  mark a message read; `GET /{message_id}` is read-only and does **not** auto-mark-read. This keeps
  reads idempotent and unread analytics clean. The frontend marks read on an explicit user action.
- **O2 (RESOLVED → backend-resolved `links[]`; shape frozen).** Action links are provided by the
  **backend** as `links[]`, each item `{ "type": "<action-type>", "target": "<url-or-ref>" }`. The
  frontend renders them as-is and does **not** derive targets from `category_code` (it cannot know
  the specific survey/file/entity). In P1 the array is present but **empty**; populating it
  per-message is an **additive** change (not a v1.0 break). The `{ type, target }` shape is frozen.
- **O3 (RESOLVED → redact, do not hide; umbrella Q2).** On patient-access loss the backend keeps
  the message in the list and returns it with `patient_ref: null` and patient-specifics omitted
  (see §3). The frontend MUST NOT independently hide patient-linked messages — it renders what the
  backend returns.

## 6. Coordination

Hosted in the control plane (`specs/032-message-center/`) and linked from the `spec-fanout`
issue opened in `rettxweb`. It is the single source of truth for the caregiver API surface; the
`rettxweb` lane consumes it rather than redefining it.

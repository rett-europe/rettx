# Published API Contract — Caregiver Messages

**Feature**: `032-message-center` | **Hosted by**: rettX control plane (this spec) · **Implemented + versioned by**: `rettxapi`
**Consumer**: `rettxweb` caregiver app (§8)
**Umbrella**: [rettx#10](https://github.com/rett-europe/rettx/issues/10) · **Contract version**: `v0.1 (draft)`

> **Scope of this document.** This is the **published interface** for the caregiver Messages
> surface — the single source of truth all sides agree on, hosted in the control plane and
> implemented + versioned by `rettxapi`. It defines *only the API the caregiver app consumes*;
> the caregiver-frontend UI is specified by the `rettxweb` lane (parent issue §8 "Caregiver
> frontend impact"). Treat the shapes below as indicative until frozen at backend Phase P1
> (see [../plan.md](../plan.md)); changes require a version bump + a heads-up to the `rettxweb` lane.

## 1. Endpoints (caregiver-authenticated)

Auth0 caregiver token → principal. Every response is strictly scoped to the authenticated
caregiver; cross-caregiver access returns 404 (never discloses existence).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v2/messages` | Paginated list of the caregiver's messages (filters: `unread`, `category`, `archived`). |
| `GET` | `/v2/messages/{message_id}` | Message detail (optionally marks read; see Open Item O1). |
| `GET` | `/v2/messages/unread-count` | Lightweight unread count for a nav badge. |
| `POST` | `/v2/messages/{message_id}/read` | Mark a message read (idempotent). |
| `POST` | `/v2/messages/{message_id}/archive` | Archive/hide (record retained). |

## 2. Shapes (indicative)

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
`patient_ref` is `null` when the message is not patient-linked.

**Detail**: adds full in-app `body`, resolved `links`, `category_code`, `reference_id`,
`created_at`. Email/HTML channel internals are **not** exposed to caregivers.

## 3. Conventions

- Timestamps: full UTC ISO-8601.
- i18n: backend sends **structured codes** (`category_code`, separators are **hyphens** e.g.
  `survey-invitation`); the frontend maps codes → localized strings. The rendered in-app
  `title`/`body` come from the message **content snapshot** (already localized at send time).
- Pagination mirrors existing v2 list endpoints (`page`/`page_size` + `total`).

## 4. Sequencing

1. Backend P0–P2 build, then **freeze** this contract (`v0.1` → `v1.0`).
2. `rettxweb` builds the Messages section against `v1.0`.
3. Backend P7 enables the caregiver feature flag → section goes live for enabled principals.

## 5. Open items needing a joint decision (rettxapi ↔ rettxweb)

- **O1**: Mark-read on detail-open vs. explicit action (affects unread accuracy + analytics).
- **O2**: Are links backend-provided (`links[]`) or frontend-derived from `category_code`?
- **O3**: Patient-access-loss behavior (umbrella Q2): hide message entirely vs. show generic
  record without patient specifics — must match the backend decision in [../spec.md](../spec.md).

## 6. Coordination

Hosted in the control plane (`specs/032-message-center/`) and linked from the `spec-fanout`
issue opened in `rettxweb`. It is the single source of truth for the caregiver API surface; the
`rettxweb` lane consumes it rather than redefining it.

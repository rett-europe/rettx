# Contract — Device Token Registration (Message Center Push)

**Spec**: [033 — Message Center Push](../spec.md) · **Status**: Ready (freeze on spec merge)
**Owner**: `rettxapi` (implements + versions) · **Consumer**: `rettxweb` (native + PWA)

This is the single, canonical contract for a caregiver client to register the device it wants
push delivered to. It is an **extension** of the device-token endpoint that already exists in
`rettxapi` — the goal is to make **native FCM token** registration explicit and unambiguous so
the caregiver native Android app and the browser PWA use one endpoint with a discriminated
payload. Frontends MUST NOT invent alternative shapes.

> Design note (from the control-plane gap analysis): the `rettxapi` `DeviceToken` model already
> stores `device_token: Union[str, WebPushSubscription]` with `device_type ∈ {ios, android,
> web}`, so **no breaking schema change** is required — native tokens are the `str` variant.
> Today `rettxweb` hardcodes the **web-push** shape (`device_type: "web"` + endpoint/keys); on
> native platforms it MUST send the **native** shape below instead. Disambiguation is by
> `device_type`.

## Identity & auth

- All endpoints require the caregiver's authenticated bearer token.
- A token is registered against the caller's **Auth0 `user_id`** (the `sub`). Message
  recipients are identified by **`principal_id`**; the backend resolves
  `principal_id → linked user_id(s) → active device tokens` at send time (spec §D-PUSH-2).
  Clients never send `principal_id` here.

## `POST /device-tokens` — register (or upsert) a device

Registers the calling user's device for push. Idempotent per `(user_id, device_id)`:
re-registering the same device updates the token and re-activates it.

### Request body — native (Android / iOS)

```json
{
  "device_token": "<FCM registration token string>",
  "device_type": "android",
  "device_id": "<stable per-install id>",
  "app_version": "<semver or build>"
}
```

- `device_token` — the **FCM registration token string** from
  `PushNotifications.register()` (Capacitor). A bare string, **not** an object.
- `device_type` — `"android"` (or `"ios"` when that surface ships; out of scope for v1 delivery).
- `device_id` — a stable identifier for this install, used for idempotent upsert and targeted
  invalidation.
- `app_version` — client build, for diagnostics.

### Request body — browser PWA (unchanged, retained)

```json
{
  "device_token": {
    "endpoint": "https://…",
    "keys": { "p256dh": "<base64url>", "auth": "<base64url>" }
  },
  "device_type": "web",
  "device_id": "<fingerprint id>",
  "app_version": "<build>"
}
```

- The Web Push subscription object continues to be accepted for `device_type: "web"` and is
  delivered via the existing VAPID/`pywebpush` path.

### Responses

- `200/201` — registered; body echoes the stored token record id + `device_type` + active state.
- `400` — malformed body, or a `device_token` shape that does not match `device_type`
  (e.g. an object sent with `device_type: "android"`, or a bare string with `"web"`).
- `401` — unauthenticated.

### Validation rules

- `device_type: "android" | "ios"` ⇒ `device_token` MUST be a non-empty **string**.
- `device_type: "web"` ⇒ `device_token` MUST be the **subscription object** (`endpoint` + `keys`).
- Registration is available to **all** caregivers (the `push_notification` capability is
  force-on); the server does not reject registration. Whether push actually fires is gated by
  the presence of an **active registered token** (spec FR-015/FR-016). Clients SHOULD only
  register after the user grants OS notification permission.

## `GET /device-tokens` — list the caller's registered devices

Returns the active (and optionally invalidated) tokens for the authenticated user, for the
client to reconcile local state.

## Invalidate / delete

- `PUT /device-tokens/{id}/invalidate` — mark a token inactive (e.g. permission revoked).
- `DELETE /device-tokens/{id}` — remove a token (e.g. sign-out).
- The **backend** also invalidates a token automatically when FCM returns
  `UNREGISTERED` / `NOT_FOUND` on send (spec FR-007), independent of client calls.

## Delivery selection (informative — backend behaviour)

At message send, for each resolved active token:

| `device_type` | Transport |
|---|---|
| `android`, `ios` | **FCM HTTP v1** (`…/v1/projects/{project_id}/messages:send`), service account in Key Vault |
| `web` | **Web Push / VAPID** (`pywebpush`), existing stack |

The push carries a short localized `title`/`body` (from the versioned template, recipient
profile language, English fallback) and a `data` payload with the target `message_id` /
reference for deep-linking to `/messages/:id`. The full message body is never in the push.

## Versioning

This contract is owned here and versioned by `rettxapi`. Any shape change (new `device_type`,
new field, altered discrimination) is made in this file first; consumers do not diverge. The
`spec-fanout` issues link every repo back to this spec.

<!--
  Frontmatter below is machine-read by .github/workflows/spec-fanout.yml when
  this spec is merged into main. The `fanout` array drives which downstream
  repos get a `[spec/<slug>] <title>` issue with the `squad` label. Set
  `status: ready` when this spec should fan out on merge — drafts will not.

  Allowed fanout repos: rettxweb, rettxadmin, rettxapi, rettxmutation, rettxid.

  STACK & DELIVERY PRE-FLIGHT (patterns.md §7): each fanout repo's delivery
  mechanism was verified against patterns.md §1. rettxweb is a Capacitor native
  Android app → native FCM device tokens (registry updated in the same PR that
  introduced this spec). rettxapi has Web Push/VAPID but no FCM HTTP v1.
-->
---
spec_id: "033"
slug: "message-center-push"
title: "rettX Message Center — Push Notifications"
status: ready   # draft | ready | accepted | superseded
authored: "2026-07-07"
author: "perocha"
source_issue: "rett-europe/rettx#24"
relates_to: "specs/032-message-center/"
fanout:
  - repo: rettxapi
    summary: |
      Backend + OWNER of the shared device-token registration contract hosted
      here (`contracts/device-token-registration.md`). Add a **third delivery
      channel — PUSH** to the existing persist-then-deliver Message Center flow
      (`message_admin_services._create_and_deliver_one`), dispatched
      **synchronously** right after email (D2 — no async infra assumed), recorded
      as a per-channel `Delivery` with send-time status and admin resend. Build a
      **native FCM HTTP v1** transport (`firebase-admin`/`google-auth` + a Firebase
      **service-account** in Key Vault; POST `…/messages:send`) — the existing push
      stack is **Web Push/VAPID (`pywebpush`)**, which does NOT reach a native
      Android token. KEEP web-push for the browser PWA and dispatch per
      `device_type` (android/ios → FCM v1; web → pywebpush). Resolve the crux
      **identity mapping**: device tokens are keyed on Auth0 `user_id`, but message
      recipients are `principal_id` — add a principal → linked identities → active
      tokens resolver in the push path. Add `push_title`/`push_body` to
      `ContentSnapshot` and `push.subject.txt`/`push.txt` versioned template
      suffixes, rendered by the recipient's **profile language** (032 D1) with
      English fallback. The push capability is **available to all**
      caregivers (the `push_notification` flag is force-on, mirroring
      `messages`); delivery is naturally gated by **active device-token
      presence** — resolve `principal_id → identities → active tokens` and
      send to each; an empty token set simply **skips** push (not a failure),
      so do NOT hard-gate on a default-false per-user flag. Handle FCM
      `UNREGISTERED`/`NOT_FOUND` by invalidating the stored token. Do NOT reuse the
      standalone admin ad-hoc web-push endpoints as the Message Center channel.
      Implement strictly to `contracts/device-token-registration.md`.
  - repo: rettxweb
    summary: |
      Caregiver app (Capacitor native Android). Make the **native app** receive a
      push when a Message Center message is sent, and deep-link a tapped push into
      `/messages/:id`. Add `@capacitor/push-notifications`, wire Firebase on
      Android (`google-services.json`, `POST_NOTIFICATIONS` runtime permission for
      Android 13+; the build.gradle hook already exists). Branch
      `push-notification.service.ts` on `Capacitor.isNativePlatform()`: on native,
      use `PushNotifications.register()` → **FCM token string** and register it via
      the frozen `POST /device-tokens` contract as `device_type:'android'`
      (**not** the web-push endpoint+keys shape it hardcodes today); keep the
      existing browser Web Push/VAPID path intact for the PWA. Add a native push
      init service that mirrors the proven `native-auth.service.ts` pattern
      (`addListener` + `zone.run` + `router.navigateByUrl`) for
      `pushNotificationReceived` (foreground) and `pushNotificationActionPerformed`
      (tap → `/messages/:id`), and calls `messageUnreadService.refresh()` on
      receive so the badge updates live. Register on **OS-permission grant**
      (request the Android 13+ `POST_NOTIFICATIONS` permission at first run,
      optionally behind a custom pre-prompt) and the in-app notification
      toggle; the `push_notification` flag is force-on for all, so the opt-in
      UI is available to every caregiver. CONSUME
      `contracts/device-token-registration.md` — do not invent the token shape.
  - repo: rettxadmin
    summary: |
      Smallest slice. The admin send path already persist-and-delegates to the
      backend, which owns channel fan-out; admin only reads back `deliveries[]`.
      For v1: widen `DeliveryChannel` in `models/message.ts` to `'email' | 'push'`
      so a push delivery entry deserializes cleanly. Per-channel status **display**
      is deferred (no component renders `deliveries[]` today; building a
      message-detail/status view is separate, non-push work). Do **NOT** touch the
      dormant standalone `push-notification-section` manual tool — it is orthogonal
      to the Message Center (keyed off Auth0 `user_id`, not `principal_id`) and must
      not be confused with the MC push channel. No new per-user toggle is needed;
      push consent is device-enforced (OS opt-in / active-token presence).
---

# Feature Specification: rettX Message Center — Push Notifications

**Spec ID**: `033-message-center-push` · **Status**: Ready · **Created**: 2026-07-07
**Source issue**: [rett-europe/rettx#24](https://github.com/rett-europe/rettx/issues/24) (cross-cutting)
**Builds on**: [`specs/032-message-center/`](../032-message-center/) (Message Center, live in production)
**Owner**: rettX control plane (this repo) — authored and coordinated here; scoped work is fanned out to the affected repos via the `spec-fanout` workflow on merge.
**Input**: "When a message is sent from the admin app it must, in addition to the existing email and in-app message, trigger a **push notification** — especially now that the caregiver app (`rettxweb`) is published as a Capacitor native Android pilot, where push is a primary engagement channel."

## Overview

The **Message Center** (spec 032, live in production) persists a caregiver **message**
inside rettX and delivers it over channels. v1 shipped **two** channels: **email** and the
**in-app** record the caregiver reads at `/messages`. The data model was deliberately made
channel-agnostic so a third channel could be added without re-architecting.

This spec adds that third channel: **push notifications**. When an admin sends a message, in
addition to email and the in-app record, rettX dispatches a **push notification** to the
caregiver's registered devices, and tapping it opens the message at `/messages/:id`.

The driver is that `rettxweb` is now published as a **Capacitor-wrapped native Android app**
(pilot). On a native surface, push is delivered through **Firebase Cloud Messaging (FCM) HTTP
v1** using a **native device token**, not the browser Web Push/VAPID path. The control-plane
stack registry (`patterns.md` §1) has been updated to record this platform fact, and this
spec was authored against it (per the §7 pre-flight rule).

A control-plane gap analysis of all three repos surfaced two facts that shape the design:

1. **A push stack already exists in `rettxapi` and `rettxweb`, but it is Web Push / VAPID
   (`pywebpush`), not FCM HTTP v1**, and a native FCM token cannot be delivered to by that
   stack. FCM HTTP v1 is **net-new**.
2. **That existing push stack is not wired into the Message Center send flow** (which is
   email-only), and the communication templates have **no push fields yet**. So this feature
   is: *(a)* add an FCM v1 transport, *(b)* graft push into the persist-then-deliver flow as a
   first-class channel, and *(c)* add push content to the versioned templates.

On merge, the `spec-fanout` workflow opens one scoped `[spec/message-center-push]` issue
(label `squad`) in each affected repo, carrying that repo's gap-informed brief from the
`fanout:` frontmatter above:

| Surface | Repo | Role |
|---|---|---|
| **Backend API, transport & data model** | `rettxapi` | Implements + versions the shared contract; builds the FCM v1 transport and the push delivery channel |
| **Caregiver native app** | `rettxweb` | Registers native FCM tokens; receives + deep-links push |
| **Admin dashboard** | `rettxadmin` | Widens the delivery-channel type (status display deferred) |

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Caregiver receives a push when a message is sent (Priority: P1)

As a caregiver using the rettX **native Android app** with notifications enabled, when an
admin sends me a Message Center message, I receive a **push notification** on my device
showing a short title and preview, so I learn about the communication without opening the app
or my email.

**Independent test**: with a registered Android device token (caregiver opted in),
send an individual message from admin → the device receives an FCM push whose title/body match
the message's rendered push content in the caregiver's profile language; a `push` delivery is
recorded on the persisted message with status `sent`.

### User Story 2 — Tapping the push opens the message (Priority: P1)

As a caregiver, when I tap the push notification, the app opens directly to that message at
`/messages/:id` (launching or foregrounding the app as needed), so I can read the full content
immediately and the message is marked read per the existing 032 behaviour.

**Independent test**: tap a delivered push (app backgrounded and killed) → app opens at
`/messages/:id` for the correct message; the unread badge decrements per 032.

### User Story 3 — Caregiver registers / de-registers a device for push (Priority: P1)

As a caregiver, when I open the native app and grant notification permission, my device is
registered to receive push; if I deny or revoke permission, or sign out, my device stops
receiving push, so notifications reflect my consent and device state.

**Independent test**: granting permission registers a native FCM token via
`POST /device-tokens` (`device_type: android`); revoking/sign-out invalidates it; a message
send after invalidation produces no push to that device and no spurious `failed` delivery.

### User Story 4 — Push respects the caregiver's device opt-in (Priority: P2)

As the program, the push capability is enabled for **all** caregivers, but I only send push to
those who have **opted in at the device level** (granted OS notification permission → have an
active registered token), so push honours device-notification norms while email + in-app always
land (the in-app `messages` channel is on for everyone).

**Independent test**: for a principal with **no active device token** (never opted in, or
revoked), a message send records email + in-app deliveries but **no** push delivery (omitted /
`not_attempted`, not a failure); once the caregiver opts in and a token is registered, the next
send attempts a `push` delivery to each active device.

### User Story 5 — Admin sees push as a delivery channel (Priority: P3)

As an admin, the delivery record of a sent message can represent a **push** channel alongside
email, so future status surfaces can show push outcomes without a model change.

**Independent test**: the admin message model accepts a `push` delivery-channel value without
error; existing email-only flows are unchanged.

### Edge Cases

- **No registered devices** for the recipient → no push delivery attempted; email + in-app
  unaffected; not treated as a failure.
- **Stale token** → FCM returns `UNREGISTERED`/`NOT_FOUND` → that token is invalidated; the
  delivery is recorded as `failed` for that device but does not block other channels/devices.
- **Multiple devices / multiple linked identities** → resolve the recipient `principal_id` to
  all linked `user_id`s and all their active tokens; send to each; record outcome.
- **Mixed device types** for one principal → android/ios tokens go via FCM v1; any web-push
  subscriptions go via the existing VAPID path (both are in v1 scope, per D-PUSH-1).
- **FCM transport/auth outage** → push deliveries recorded `failed`; message + email + in-app
  still persist and succeed; admin resend can retry push (synchronous, per D2).
- **Permission denied on Android 13+** → app registers no token; no push; in-app remains the
  reliable record.
- **Push tapped for a message the caregiver can no longer access** (patient-access loss, 032
  Q2) → app opens `/messages/:id`; the backend already withholds patient specifics at read
  time; the envelope still renders.

## Requirements *(mandatory)*

### Functional Requirements — Delivery channel & flow

- **FR-001** Push MUST be a first-class **delivery channel** on the persisted Message: extend
  the delivery-channel enum with `push`; a message MAY have email, in-app, and push deliveries.
- **FR-002** Push MUST be dispatched within the **existing persist-then-deliver flow**,
  **synchronously** within the send request, immediately after email (consistent with 032 **D2**
  — no queue/async infrastructure is assumed). Durability comes from the persisted message +
  per-channel delivery status + admin resend.
- **FR-003** Each push attempt MUST record a per-channel `Delivery` with a send-time status
  (`sent` / `failed` / `not_attempted`) so a message with a failed push can be resent, exactly
  like email.
- **FR-004** Push failure MUST NOT block or roll back the persisted message, its email, or its
  in-app record; channels are independent.

### Functional Requirements — FCM transport

- **FR-005** The system MUST deliver to **native device tokens via FCM HTTP v1**
  (`…/v1/projects/{project_id}/messages:send`), authenticated with a Firebase **service
  account** whose credentials are stored in **Key Vault** (never in source). This is net-new;
  the existing `pywebpush`/VAPID sender does not reach native tokens.
- **FR-006** The existing **Web Push / VAPID** stack MUST remain intact **and is in v1 scope**:
  the message-send push path also delivers to caregivers' registered **browser** web-push
  subscriptions, selecting transport by device type (`android`/`ios` → FCM v1; `web` → VAPID).
- **FR-007** On an FCM `UNREGISTERED` / `NOT_FOUND` (or equivalent invalid-token) response the
  system MUST invalidate the offending stored token so it is not retried.
- **FR-008** The dedicated Message Center push path MUST NOT reuse the standalone admin ad-hoc
  push endpoints; those remain a separate, orthogonal tool.

### Functional Requirements — Recipient & device resolution

- **FR-009** The push path MUST resolve the message **recipient `principal_id`** to all
  **linked identities (`user_id`s)** and their **active device tokens**, because tokens are
  registered per Auth0 `user_id` while messages target `principal_id`.
- **FR-010** Device registration MUST use the single, shared **`POST /device-tokens`** contract
  (see `contracts/device-token-registration.md`): native clients register an FCM **token
  string** with `device_type` `android` (or `ios`); browser clients continue to register a Web
  Push subscription with `device_type` `web`. Registration MUST be authenticated and idempotent
  per device.
- **FR-011** Sign-out / permission-revocation on a client MUST invalidate that device's token
  via the existing invalidate/delete endpoints.

### Functional Requirements — Content & localisation

- **FR-012** Push content (title + body) MUST come from the **versioned communication
  templates**, adding a `push.subject.txt` / `push.txt` suffix pair alongside the existing
  email and `inapp.*` suffixes, and MUST be captured in the message **content snapshot**
  (`push_title` / `push_body`) so what was pushed is reproducible (Constitution III/IV).
- **FR-013** Push content MUST be rendered in the **recipient's profile language** (032 **D1**),
  with **English fallback** when no localized template exists — identical to email/in-app.
- **FR-014** The push payload MUST carry a **data** section identifying the target message
  (e.g. `message_id` and/or reference ID) sufficient to deep-link to `/messages/:id`; the full
  message body is NOT delivered in the push (it lives in the persisted message).

### Functional Requirements — Consent & gating

- **FR-015** The push **capability MUST be enabled for all** caregivers — the
  `push_notification` feature flag is force-on (mirroring the `messages` channel per ADR 0005),
  so every caregiver's app surfaces the opt-in UI. There is **no per-user admin precondition**.
- **FR-016** Actual push delivery MUST be gated on the recipient having **≥1 active registered
  device token**, which requires the caregiver's **device-level opt-in** (OS notification
  permission granted, and not disabled via the in-app notification toggle). A recipient with no
  active token receives email + in-app but **no** push; this is **not** a failure and MUST NOT
  block or fail the send.

### Functional Requirements — Caregiver native app

- **FR-017** The native Android app MUST register for push (`@capacitor/push-notifications`),
  request the Android 13+ `POST_NOTIFICATIONS` permission, obtain the FCM token, and register it
  via `POST /device-tokens`; registration is driven by the caregiver's OS-permission grant and
  the in-app notification toggle (the `push_notification` flag being force-on for all).
- **FR-018** The app MUST handle a **received** push (foreground) by refreshing the unread
  badge, and a **tapped** push by navigating to `/messages/:id`, re-entering Angular's zone
  (mirroring the existing native deep-link handler).
- **FR-019** The browser PWA push behaviour MUST be preserved unchanged; native and web paths
  coexist, branched on platform.

### Functional Requirements — Admin

- **FR-020** The admin message model MUST accept a `push` delivery-channel value so push
  deliveries deserialize without error. Per-channel status **display** is out of v1 scope.

### Key Entities *(include if feature involves data)*

- **DeviceToken** *(exists)* — a registered device for a caregiver identity: `user_id`
  (Auth0 sub), `device_type` (`android` | `ios` | `web`), `device_token` (FCM token **string**
  for native; Web Push subscription object for web), `device_id`, `app_version`, active/invalid
  state. Keyed/partitioned by `user_id`.
- **Delivery** *(extended)* — a per-channel delivery of a message: `channel`
  (`email` | `push` | in-app), `status` (`sent` | `failed` | `not_attempted`), timestamps, and
  a provider/transport reference. Push adds per-device outcomes.
- **ContentSnapshot** *(extended)* — the reproducible rendered content of a message; add
  `push_title` / `push_body` alongside the existing email and in-app fields.
- **CommunicationTemplate** *(extended)* — versioned, language-keyed template; add
  `push.subject.txt` / `push.txt` suffixes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001** Sending an individual message to a caregiver with an enabled, registered Android
  device results in a push received on the device, in the caregiver's profile language, with a
  `push` delivery recorded `sent`.
- **SC-002** Tapping the push opens the app at the correct `/messages/:id` from cold start,
  background, and foreground.
- **SC-003** A caregiver who has **not opted in at the device level** (no active token) receives
  email + in-app but **no** push; after they grant permission and register a device, push starts
  on the next send.
- **SC-004** A failed or stale-token push never blocks the persisted message, its email, or its
  in-app record; stale tokens are invalidated and not retried.
- **SC-005** Existing browser PWA push and all existing email/in-app Message Center behaviour
  are unchanged (no regression).

## Cross-Team Coordination *(mandatory for this feature)*

This feature cannot ship from any single repo. It is coordinated from the control plane: this
spec is the shared design, and the **published contract** under `contracts/` — **owned here,
implemented and versioned by `rettxapi`** — is the boundary `rettxweb` consumes rather than
redefines.

- `contracts/device-token-registration.md` — the device-token registration contract, extended
  to make **native FCM token** registration explicit (string token + `device_type` `android`/
  `ios`). **Implemented by** `rettxapi`; **consumed by** `rettxweb`.

**Sequencing principle**: `rettxapi` lands (1) the device-token contract confirmation +
native-token handling, (2) the FCM v1 transport, and (3) the push delivery channel wired into
the send flow with template/snapshot push fields — then **freezes** the contract. `rettxweb`
builds native registration + receive/deep-link against the frozen contract. `rettxadmin`'s
one-line channel-type widening can land any time.

### Program-level cross-cutting decisions (from the control-plane gap analysis)

Decided **once, here**, so the lanes do not diverge. These extend the 032 decisions (D1–D4).

- **D-PUSH-1 — Two transports, BOTH in v1.** Native Android push via **FCM HTTP v1** is the P1
  target (the published pilot). The existing browser **Web Push/VAPID** stack is retained and
  **also delivered to in v1** (near-free reuse); the message-send push path dispatches per
  `device_type` (`android`/`ios` → FCM v1; `web` → VAPID). *(Resolves O2.)*
- **D-PUSH-2 — Identity resolution is `rettxapi`'s.** The `principal_id → user_id(s) → device
  tokens` resolution lives in the backend push path, reusing existing principal/identity
  services. Frontends never resolve devices.
- **D-PUSH-3 — Registration contract is unchanged in shape.** The existing `POST /device-tokens`
  already accepts a string token and `device_type ∈ {android, ios, web}`; native support needs
  **no breaking schema change** — clients disambiguate by `device_type`. `rettxweb` must send
  the **native** shape on native platforms (it currently hardcodes the web-push shape).
- **D-PUSH-4 — Synchronous, per 032 D2.** Push is dispatched synchronously within the send
  request; no async/queue semantics are assumed. A Storage Queue worker remains a deferred
  fast-follow shared with 032.
- **D-PUSH-5 — Enabled for all, gated by device opt-in.** The push capability is **on for every
  caregiver** (the `push_notification` flag is force-on, like `messages` per ADR 0005) — there is
  no per-user admin precondition. Whether a caregiver actually *receives* push is gated at the
  **device level**: the app requests OS notification permission (standard install-time pop-up,
  optionally a custom pre-prompt) and registers a token only when granted; the in-app toggle lets
  the caregiver enable/disable at will. Send logic = "deliver to every active registered token
  for the recipient"; no active token ⇒ no push, email + in-app still land. Post-pilot this is
  the standard default. *(Resolves O1.)*
- **D-PUSH-6 — Push content via versioned templates + D1 language.** Push title/body are
  template-driven, snapshotted, and rendered in the recipient's profile language with English
  fallback — identical to email/in-app.

## Assumptions

- The existing **DeviceToken** store, `POST /device-tokens` registration, and the
  `push_notification` feature flag (all live in `rettxapi`/`rettxweb`) are the foundation; this
  feature wires them into the Message Center and adds an FCM v1 transport rather than rebuilding.
- The existing **Message / Delivery / ContentSnapshot** model (032) is channel-agnostic and is
  **extended**, not replaced.
- A **Firebase project** + Android app registration (`google-services.json`) and a **service
  account** for FCM v1 are provisioned as an external dependency; secrets go to Key Vault.
- Delivery is **persist-first, then synchronous** (032 D2); send-time push status is acceptable
  for v1 (delivery receipts optional/future).
- **Android** is the native pilot target; the token model already allows `ios` for a later APNs
  effort not built here.
- Message-send push **is** delivered to existing **browser Web Push** subscriptions in v1
  (reusing the VAPID sender) alongside native FCM.

## Out of Scope (v1)

- **iOS / APNs** delivery (the token model allows `ios`; no iOS push is built in v1).
- **Bulk-campaign push** — the admin bulk path is not on the Message Center (032), so bulk push
  has no home yet; individual-send push only.
- The **standalone ad-hoc admin push tool** (the dormant `push-notification-section` and the
  admin `/send-push-notification` endpoints) — orthogonal, keyed off Auth0 `user_id`, and
  explicitly **not** the Message Center push channel.
- Rich **per-channel delivery-status UI** in admin (no component renders `deliveries[]` today);
  v1 only widens the channel type.
- **Delivery/open receipts**, silent/data-only pushes, notification categories/actions, and
  quiet-hours/scheduling.
- Reply/bidirectional push, threading, or push for non-Message-Center events.

## Constitution Check

*GATE: checked against the **program constitution** (`.specify/memory/constitution.md`);
repo-specific technical principles are verified in each repo's derived plan.*

- **I. Patients & caregivers come first (NON-NEGOTIABLE)** — timely awareness of a
  communication on the device caregivers actually use; the in-app persisted record remains the
  reliable source even if push fails. ✅
- **II. Privacy by design (NON-NEGOTIABLE)** — the push payload carries only a short
  title/body + an identifier for deep-linking, **not** clinical detail or patient specifics;
  the full, access-controlled content stays in the authenticated app (mirrors 032 FR-030). ✅
- **III. Transparency above all (NON-NEGOTIABLE)** — the pushed title/body are captured in the
  reproducible content snapshot; each push is recorded as a delivery with status. ✅
- **IV. Clinical accuracy & accountability** — push content is versioned-template-driven and
  snapshotted; no free-form clinical text on the channel. ✅
- **V. Accessibility & inclusion** — push content is localized in the caregiver's profile
  language with English fallback (D1); the native app follows OS notification conventions. ✅
- **VI. Security baseline** — authenticated registration; FCM service-account + VAPID secrets in
  Key Vault; least-privilege recipient resolution; no PHI in payloads or logs; stale-token
  invalidation. ✅
- **VII. Open by default / VIII. Sustainability & stewardship** — reuses the existing device-
  token store, feature-flag framework, template pipeline, and 032 delivery model; adds one new
  transport rather than a parallel notification system. ✅

## Resolved Decisions *(confirmed by maintainer, folded in)*

- **O1 — Rollout default → enabled for all, device opt-in.** The push capability is enabled for
  **all** caregivers (feature-flag force-on, like `messages`); each caregiver opts in at the
  **device level** via the OS notification pop-up (install-time, optionally a custom pre-prompt)
  and/or the in-app toggle. Delivery is gated on active device-token presence, not on a per-user
  admin flag. This is the standard mobile pattern and the intended post-pilot default. Folded
  into **FR-015 / FR-016**, **D-PUSH-5**, US4, SC-003.
- **O2 — Browser web-push in v1 → included.** The Message Center push is delivered to existing
  **browser Web Push/VAPID** subscriptions in v1 alongside native Android FCM (near-free reuse).
  Folded into **FR-006**, **D-PUSH-1**.

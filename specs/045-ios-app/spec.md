<!--
  Frontmatter below is machine-read by .github/workflows/spec-fanout.yml when
  this spec is merged into main. The `fanout` array drives which downstream
  repos get a `[spec/<slug>] <title>` issue with the `squad` label. Set
  `status: ready` when this spec should fan out on merge — drafts will not.

  Allowed fanout repos: rettxweb, rettxadmin, rettxapi, rettxmutation, rettxid, templates.

  STACK & DELIVERY PRE-FLIGHT (patterns.md §1 / §7): the one fanout repo's
  delivery mechanism was verified against patterns.md §1. rettxweb is an Angular
  PWA wrapped with Capacitor as a native app (Android live; iOS planned) → iOS is
  a **native mobile surface**, so push is native APNs → FCM HTTP v1 (NOT browser
  Web Push/VAPID). The backend FCM v1 path and the device-token contract already
  exist per spec 033, so NO rettxapi slice is created — the iOS token is just
  registered as `device_type: 'ios'` against the frozen contract.
-->
---
spec_id: "045"
slug: "ios-app"
title: "rettX iOS App (Capacitor on GitHub Actions)"
status: draft   # draft | ready | accepted | superseded  -- KEEP as draft so it does NOT fan out until a maintainer flips it to ready
authored: "2026-07-28"
author: "perocha"
source_issue: ""
relates_to: "specs/033-message-center-push/"
fanout:
  - repo: rettxweb
    summary: |
      Add a native **iOS** target to the caregiver app (Angular + Capacitor 8,
      appId `eu.retteurope.rettx`) reusing the existing web bundle, and ship it
      to TestFlight/App Store entirely from **GitHub Actions `macos-latest`**
      (no Mac) — decision recorded in ADR 0014. Concretely:
      (1) **Platform** — add `@capacitor/ios`, `npx cap add ios`, `cap sync`,
      commit `ios/`. Reconcile `capacitor.config.ts` for iOS: confirm the
      `server.hostname: app.rettx.eu` behaviour under **WKWebView** (add an
      explicit `iosScheme` if needed), splash + `backgroundColor #4E4BBF`
      parity, and `SystemBars` safe-area handling for the notch / Dynamic
      Island. All plugins in use already support iOS; there are no custom native
      Java plugins.
      (2) **Auth0** — register the iOS callback URL scheme / associated domain,
      add the iOS redirect URIs in the Auth0 tenant, and verify the
      `@capacitor/browser` / ASWebAuthenticationSession **login + logout**
      round-trip on device.
      (3) **Push** — add `GoogleService-Info.plist` (from a base64 CI secret),
      the `aps-environment` entitlement, request notification permission, obtain
      the APNs→FCM token and register it as **`device_type: 'ios'`** via the
      **frozen** `POST /device-tokens` contract
      (`specs/033-message-center-push/contracts/device-token-registration.md`);
      confirm the **APNs auth key** is uploaded to Firebase; deep-link a tapped
      push to `/messages/:id` (mirror the Android native handler and refresh the
      unread badge). No backend change — the FCM v1 dispatch already handles
      `ios` (verify).
      (4) **Assets** — generate iOS icons + splash via `@capacitor/assets`.
      (5) **CI — `ios-release.yml`** mirroring `android-release.yml`:
      `runs-on: macos-latest`, Node setup, `npm ci`, the same
      `environment.prod.ts` placeholder substitution + appVersion stamping,
      `ng build --configuration=production`, `cap sync ios`, CocoaPods install,
      headless signing (fastlane **match**, or `.p12` + provisioning profile
      from base64 secrets) into a temp Keychain, `xcodebuild archive` + export
      `.ipa`, upload to TestFlight via the App Store Connect API key. Version:
      `CFBundleShortVersionString` = package.json version,
      `CFBundleVersion` = `1000 + run_number`; keep the same `v*` tag ↔
      package.json assert; triggers `workflow_dispatch` + `v*` tags; protect
      with an `ios-release` environment.
      (6) **Secrets** (document, do not commit values): `APPSTORE_CONNECT_API_KEY`
      (.p8 base64) / `APPSTORE_KEY_ID` / `APPSTORE_ISSUER_ID`; signing via
      `MATCH_GIT_URL` + `MATCH_PASSWORD` **or** `IOS_DIST_CERT_P12_BASE64` +
      `IOS_DIST_CERT_PASSWORD` + `IOS_PROVISIONING_PROFILE_BASE64`;
      `GOOGLE_SERVICE_INFO_PLIST_BASE64`.
---

# Feature Specification: rettX iOS App (Capacitor on GitHub Actions)

**Spec ID**: `045-ios-app` · **Status**: Draft · **Created**: 2026-07-28
**Author**: perocha
**Owner**: rettX control plane (this repo) — authored and coordinated here; the scoped work fans out to `rettxweb` via the `spec-fanout` workflow **once a maintainer flips `status` to `ready`**.
**Decision of record**: [ADR 0014 — iOS app via Capacitor on GitHub Actions macOS runners](../../docs/adr/0014-ios-app-via-capacitor-github-actions.md)
**Builds on**: [`specs/033-message-center-push/`](../033-message-center-push/) (froze the device-token contract and the FCM HTTP v1 backend that already dispatches to `ios` tokens)
**Input**: "Ship a native iOS build of the rettX caregiver app without buying a Mac, reusing the existing Capacitor/Angular bundle, built and signed on GitHub Actions, delivering push through the FCM v1 path we already have."

## Overview

`rettxweb` is an Angular PWA **wrapped with Capacitor 8** as a native app. The
Android target is live (pilot, shipped via `android-release.yml`); there is **no
iOS target** yet. Because the web bundle is 100% reused and every plugin in use
already supports iOS (no custom native Java plugins), adding iOS is primarily
*platform scaffolding + Apple-side setup + a CI pipeline*, not new product code.

The two historical blockers were **build host** (Apple builds need macOS/Xcode;
the project has no Mac) and **push** (iOS needs APNs). Both are now solved:

1. **Build host** → GitHub Actions **`macos-latest`** hosted runners build,
   sign, and ship headlessly. No Mac hardware; the pipeline mirrors the proven
   `android-release.yml`.
2. **Push** → spec 033 already built the **FCM HTTP v1** backend and dispatches
   `android`/`ios` tokens through it, and froze the `POST /device-tokens`
   contract. iOS work is registering an **APNs auth key in Firebase** and having
   the app register its APNs→FCM token as **`device_type: 'ios'`** — no new
   backend transport.

This spec therefore fans out to **`rettxweb` only**. The backend iOS push path
already exists (spec 033); no `rettxapi` slice is created. (See Assumptions for
the one item to *verify*: that `rettxapi` FCM v1 dispatch already accepts `ios`
tokens end-to-end.)

| Surface | Repo | Role |
|---|---|---|
| **Caregiver native app** | `rettxweb` | Adds the iOS Capacitor target, Auth0 iOS callback, iOS push registration + deep-link, assets, and the `ios-release.yml` CI pipeline |

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Caregiver installs rettX from the App Store / TestFlight (Priority: P1)

As an iOS caregiver, I can install the rettX app from **TestFlight** (beta) and
later the **App Store**, so I have the same rettX experience my Android peers
have.

**Independent test**: a signed build produced by `ios-release.yml` appears in
TestFlight and installs on a physical iPhone; the app launches to the rettX web
bundle with the correct icon, splash, and `#4E4BBF` background.

### User Story 2 — Caregiver receives a push and taps to deep-link (Priority: P1)

As an iOS caregiver with notifications enabled, when an admin sends me a Message
Center message I receive a **push** on my iPhone, and tapping it opens the
message at `/messages/:id`.

**Independent test**: with an `ios` device token registered, sending a message
delivers an APNs→FCM push to the device; tapping it (cold start, background,
foreground) opens `/messages/:id` for the correct message and the unread badge
decrements per spec 032/033.

### User Story 3 — Auth0 login works in the iOS WebView (Priority: P1)

As an iOS caregiver, I can log in and log out through Auth0 in the native app,
so authentication behaves exactly as on Android/web.

**Independent test**: the `@capacitor/browser` / ASWebAuthenticationSession
login round-trip completes and returns to the app via the registered iOS
callback; logout clears the session; token refresh works.

### User Story 4 — Splash and safe-areas render correctly (Priority: P2)

As an iOS caregiver on a notch / Dynamic Island device, the splash screen and
app chrome render without clipping or mis-coloured bars.

**Independent test**: on an iPhone with a notch/Dynamic Island, the splash shows
the rettX asset on `#4E4BBF`, and `SystemBars` safe-area insets keep content out
of the notch and home-indicator zones.

### User Story 5 — Badge count updates (Priority: P3)

As an iOS caregiver, the app icon badge reflects my unread message count.

**Independent test**: receiving a push (or refreshing unread) updates the app
icon badge via `@capawesome/capacitor-badge`; reading the message clears it.

### Edge Cases

- **Notification permission denied** on iOS → app registers no `ios` token; no
  push; the in-app record at `/messages` remains the reliable channel.
- **`server.hostname` under WKWebView** behaves differently than Android's
  WebView → confirm the `app.rettx.eu` origin trick works, or add an explicit
  `iosScheme`; login/cookies/deep-links must still work.
- **Push tapped while app killed** → the tap payload must survive cold start and
  still deep-link to `/messages/:id`.
- **APNs sandbox vs production** environment mismatch → `aps-environment` must
  match the distribution channel (TestFlight/App Store = production APNs).
- **App Store review** flags health-adjacent data (seizure/medication logging) →
  privacy nutrition labels + privacy policy must be accurate; framing must avoid
  medical-device claims (constitution IV).

## Requirements *(mandatory)*

### Functional Requirements — Capacitor iOS platform

- **FR-001** The app MUST add the Capacitor iOS platform: install
  `@capacitor/ios`, run `npx cap add ios` + `cap sync`, and **commit the
  generated `ios/`** project to `rettxweb`, reusing the existing web bundle
  (`webDir: dist/rettxweb/browser`) with no fork of app code.
- **FR-002** `capacitor.config.ts` MUST be reconciled for iOS: confirm the
  `server.hostname: app.rettx.eu` behaviour under **WKWebView** and add an
  explicit `iosScheme` if the origin trick misbehaves; keep the splash and
  `backgroundColor #4E4BBF` at parity with Android.
- **FR-003** `SystemBars` / safe-area handling MUST be verified on iOS notch /
  Dynamic Island devices so content is not clipped by the status bar or home
  indicator.

### Functional Requirements — Auth0

- **FR-004** The iOS **callback URL scheme / associated domain** MUST be
  registered, and the corresponding **redirect URIs added in the Auth0 tenant**,
  so the native login flow can return to the app.
- **FR-005** The `@capacitor/browser` / ASWebAuthenticationSession **login +
  logout** round-trip MUST be verified on a physical device, including token
  refresh, matching the existing native-auth behaviour.

### Functional Requirements — Push

- **FR-006** The app MUST add `GoogleService-Info.plist` (materialised in CI
  from `GOOGLE_SERVICE_INFO_PLIST_BASE64`) and the **`aps-environment`**
  entitlement, and request notification permission at the appropriate moment
  (mirroring the Android opt-in pattern).
- **FR-007** On permission grant the app MUST obtain the **APNs→FCM token** and
  register it as **`device_type: 'ios'`** via the frozen
  `POST /device-tokens` contract
  ([spec 033 contract](../033-message-center-push/contracts/device-token-registration.md));
  it MUST NOT invent an alternative token shape.
- **FR-008** The **APNs Authentication Key** MUST be uploaded to Firebase so FCM
  HTTP v1 can deliver to iOS tokens (Apple-side setup; verified as a gate).
- **FR-009** A **tapped** push MUST deep-link to `/messages/:id` (re-entering
  Angular's zone, mirroring the Android native handler); a **received**
  foreground push MUST refresh the unread badge/count. The web PWA and Android
  behaviours MUST remain unchanged.

### Functional Requirements — Assets

- **FR-010** iOS **icons and splash** MUST be generated via
  `@capacitor/assets` from the existing brand source, matching Android output.

### Functional Requirements — CI (`ios-release.yml`)

- **FR-011** A new `ios-release.yml` workflow in `rettxweb` MUST mirror
  `android-release.yml`, running on **`runs-on: macos-latest`**, with Node
  setup, `npm ci`, the same `environment.prod.ts` placeholder substitution +
  appVersion stamping, `ng build --configuration=production`, `cap sync ios`,
  and CocoaPods install.
- **FR-012** The workflow MUST import signing **headlessly** — **fastlane
  match** (`MATCH_GIT_URL` + `MATCH_PASSWORD`) **or** a `.p12` cert +
  provisioning profile from base64 secrets — into a temporary Keychain, then
  `xcodebuild archive` and export a distribution `.ipa`.
- **FR-013** The workflow MUST upload the `.ipa` to **TestFlight / App Store
  Connect** using an **App Store Connect API key** (`.p8` + key id + issuer id),
  with no interactive Apple ID / 2FA.
- **FR-014** Versioning MUST set `CFBundleShortVersionString` = the package.json
  version and `CFBundleVersion` = **`1000 + run_number`**, and MUST keep the
  same `v*` tag ↔ package.json version **assert** used by the Android workflow.
- **FR-015** Triggers MUST be **`workflow_dispatch`** and **`v*` tags**, and the
  job MUST run under a protected **`ios-release`** environment.

### Functional Requirements — Secrets (documentation only)

- **FR-016** The following CI secrets MUST be documented (never committed with
  real values) and provisioned in `rettxweb` before first release:
  - **App Store Connect API**: `APPSTORE_CONNECT_API_KEY` (`.p8`, base64),
    `APPSTORE_KEY_ID`, `APPSTORE_ISSUER_ID`.
  - **Signing (choose one)**: `MATCH_GIT_URL` + `MATCH_PASSWORD` **or**
    `IOS_DIST_CERT_P12_BASE64` + `IOS_DIST_CERT_PASSWORD` +
    `IOS_PROVISIONING_PROFILE_BASE64`.
  - **Firebase**: `GOOGLE_SERVICE_INFO_PLIST_BASE64`.

### Key Entities *(include if feature involves data)*

- **DeviceToken** *(exists — spec 033)* — the iOS build registers the `ios`
  variant: `device_type: 'ios'`, `device_token` = the APNs→FCM registration
  string, plus `device_id` / `app_version`. Keyed by Auth0 `user_id`; no schema
  change (the model already allows `ios`).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001** The **first signed TestFlight build is produced green from CI**
  (`ios-release.yml` on `macos-latest`) with no manual Mac step.
- **SC-002** A push sent from admin is **received and tapped on a physical
  iPhone**, deep-linking to the correct `/messages/:id` from cold start.
- **SC-003** **Auth0 login + logout** works in the native iOS app on device.
- **SC-004** The **App Store submission is accepted** (privacy labels + privacy
  policy in place; no medical-device framing).
- **SC-005** Android and web PWA behaviour are **unchanged** (no regression);
  the web bundle is byte-identical across platforms.

## Cross-Team Coordination *(mandatory for this feature)*

This feature is single-repo in execution (**`rettxweb`**) but depends on
control-plane prior art and Apple-side setup that a maintainer owns.

- **Consumes the frozen contract** `contracts/device-token-registration.md`
  (owned by `rettxapi`, published in spec 033) — the iOS client registers the
  `ios` variant and MUST NOT redefine the shape.
- **Apple-side one-time setup (maintainer, out of the code slice)**: Apple
  Developer Program enrolment (non-profit fee waiver), App Store Connect app
  record for `eu.retteurope.rettx`, distribution cert + provisioning profile
  (or `fastlane match` seed), App Store Connect API key, APNs auth key uploaded
  to Firebase, privacy policy + App Privacy nutrition labels.
- **No `rettxapi` / `rettxadmin` slice**: the backend FCM v1 dispatch and the
  device-token contract already exist (spec 033); iOS reuses them.

## Assumptions

- **《verify》** `rettxapi`'s FCM HTTP v1 dispatch already handles
  `device_type: 'ios'` tokens end-to-end (spec 033 dispatches android/ios → FCM
  v1). To be confirmed before the fan-out issue is worked; if a backend gap is
  found, a `rettxapi` slice is added then — not assumed now.
- The `DeviceToken` model already allows `device_type: 'ios'` (spec 033 Key
  Entities), so **no backend schema change** is expected.
- GitHub **`macos-latest`** runners with a current Xcode + CocoaPods are
  available to `rettxweb`; macOS-runner minutes are budgeted (ADR 0014, cost).
- Rett Europe can enrol in the Apple Developer Program (non-profit fee waiver)
  or an existing account is available.
- Every native plugin in use has iOS support and there are **no custom native
  Java plugins**, so no plugin is Android-locked.

## Out of Scope (v1)

- **HealthKit** integration (no read/write of Apple Health data).
- **iPad-optimised** layout / multitasking; v1 ships the iPhone experience.
- **Universal Links** beyond the push deep-link (no web-to-app associated-domain
  routing for arbitrary URLs).
- **Silent/data-only** pushes, notification categories/actions, rich media, and
  quiet-hours scheduling (inherited from spec 033 out-of-scope).
- Any change to the `rettxapi` push transport or the device-token contract.

## Constitution Check

*GATE: checked against the **program constitution**
(`.specify/memory/constitution.md`); repo-specific technical principles are
verified in `rettxweb`'s derived plan.*

- **I. Patients & caregivers come first (NON-NEGOTIABLE)** — brings the full
  rettX experience + reliable push to iOS caregivers, reusing the same bundle so
  behaviour is consistent; the in-app record remains the reliable channel if
  push fails. ✅
- **II. Privacy by design (NON-NEGOTIABLE)** — **no PHI** in the app bundle,
  logs, CI, push payloads, or examples; the push carries only a title/body +
  message identifier (spec 033), full content stays in the authenticated app.
  App Privacy nutrition labels + privacy policy are gated deliverables. ✅
- **III. Transparency above all (NON-NEGOTIABLE)** — decision recorded in ADR
  0014 and this public spec; the CI pipeline and config are in-repo. ✅
- **IV. Clinical accuracy & accountability** — health-adjacent data is framed
  **without medical-device claims**; App Store metadata reviewed accordingly. ✅
- **V. Accessibility & inclusion** — iOS follows OS notification + safe-area
  conventions; the app inherits the existing i18n set (`patterns.md` §5) — no
  new user-facing strings are added by this platform work. ✅
- **VI. Security baseline** — signing certs, APNs `.p8`, App Store Connect API
  key, and `GoogleService-Info.plist` are **CI secrets**, never in source; the
  `ios-release` environment is protected; token registration is authenticated
  (frozen contract). ✅
- **VII. Open by default / VIII. Sustainability & stewardship** — reuses the
  shared web bundle, the spec-033 push backend, and the Android pipeline shape;
  one small native surface instead of a second codebase; macOS-runner cost is
  acknowledged and tracked. ✅

### Delivery-mechanism pre-flight (patterns.md §1)

iOS is a **Capacitor native mobile surface**, so push is **native APNs → FCM
HTTP v1** (the token is registered as `device_type: 'ios'` against the frozen
spec-033 contract) — **not** browser Web Push/VAPID. Verified before authoring,
per the §1 "read before any device-dependent spec" rule.

# ADR 0014 — iOS app via Capacitor, built on GitHub Actions macOS runners

- **Status**: Proposed (2026-07-28)
- **Date**: 2026-07-28
- **Decision-makers**: rettX maintainers
- **Relates to**: [ADR 0001](0001-control-plane-repo.md) (control plane &
  per-repo ownership), [spec 033](../../specs/033-message-center-push/spec.md)
  (Message Center push — froze the device-token contract and the FCM HTTP v1
  backend path), [spec 045](../../specs/045-ios-app/spec.md) (this decision's
  implementation spec), [`patterns.md` §1](../../.specify/memory/patterns.md)
  (surfaces / delivery-mechanism pre-flight),
  [program constitution](../../.specify/memory/constitution.md) (PHI / privacy
  non-negotiables). External:
  [Capacitor iOS docs](https://capacitorjs.com/docs/ios),
  [Apple — Distributing your app for beta testing](https://developer.apple.com/testflight/),
  [App Store Connect API](https://developer.apple.com/documentation/appstoreconnectapi),
  [fastlane match](https://docs.fastlane.tools/actions/match/),
  [Firebase — APNs & FCM](https://firebase.google.com/docs/cloud-messaging/ios/certs).

## Context

The caregiver app `rettxweb` is an Angular + **Capacitor 8** app. It already
ships a native **Android** build: an `android/` project exists and releases to
Google Play via `.github/workflows/android-release.yml` (in `rettxweb`). There
is currently **no `ios/`** project and no iOS distribution.

The web bundle is 100% reused across platforms. `capacitor.config.ts` sets
appId `eu.retteurope.rettx`, appName `rettX`, webDir `dist/rettxweb/browser`,
`server.hostname: app.rettx.eu` (with `androidScheme: https`) and
`backgroundColor #4E4BBF`. Every native plugin in use — `@capacitor/app`,
`@capacitor/browser`, `@capacitor/push-notifications`,
`@capacitor/splash-screen`, `@capawesome/capacitor-badge`, and core
`SystemBars` / `SplashScreen` — has first-class iOS support. There are **no
custom native Java plugins**, so nothing is Android-locked at the native layer.

Two facts constrain *how* we can build for iOS:

1. **No Mac.** Pedro (and the project) has **no physical Mac**, and Apple builds
   require macOS + Xcode to compile, sign, and archive.
2. **We do have GitHub Actions.** The org already runs its release pipelines on
   GitHub-hosted runners, and GitHub offers **`macos-latest` hosted runners**
   with Xcode preinstalled — which removes the build-host problem entirely.

The push backend for iOS **largely already exists**. Spec 033 froze the
device-token registration contract
(`specs/033-message-center-push/contracts/device-token-registration.md`) and
`rettxapi` already dispatches **android/ios → FCM HTTP v1**. iOS push is
therefore mostly *Apple-side setup* (APNs auth key registered in Firebase) plus
the `rettxweb` app registering its APNs→FCM token as `device_type: 'ios'` — not
a new backend transport.

Rett Europe is a **non-profit**, which is likely eligible for Apple's Developer
Program **fee-waiver** for non-profits; an Apple Developer Program enrolment (or
confirmation of an existing account) is a prerequisite either way.

## Decision

Build the rettX **iOS app with Capacitor**, reusing the existing web bundle, and
build / sign / distribute it **entirely on GitHub Actions `macos-latest`
runners** — no physical Mac and no interactive Xcode.

Concretely:

- **Platform**: add `@capacitor/ios`, `npx cap add ios`, `cap sync`, and commit
  the generated `ios/` project to `rettxweb`. The web bundle is unchanged; iOS
  is another Capacitor target, not a rewrite.
- **Build host**: a new `ios-release.yml` workflow in `rettxweb` mirroring
  `android-release.yml`, running on `runs-on: macos-latest` (Xcode +
  CocoaPods), doing `npm ci` → prod env substitution + version stamping →
  `ng build --configuration=production` → `cap sync ios` → `xcodebuild archive`
  → export `.ipa`.
- **Headless signing**: no interactive Keychain. Recommend **fastlane match**
  storing encrypted distribution certs + provisioning profiles in a private
  git repo (`MATCH_GIT_URL` + `MATCH_PASSWORD`); acceptable alternative is
  **`.p12` cert + provisioning profile** delivered as base64 CI secrets
  (`IOS_DIST_CERT_P12_BASE64` + `IOS_DIST_CERT_PASSWORD` +
  `IOS_PROVISIONING_PROFILE_BASE64`), imported into a temporary Keychain in CI.
- **Distribution**: upload to **TestFlight / App Store Connect** using an **App
  Store Connect API key** (`.p8` + key id + issuer id) — no Apple ID password,
  no 2FA prompt in CI.
- **Push**: register an **APNs Authentication Key (`.p8`) in Firebase** so the
  existing FCM HTTP v1 backend (spec 033) reaches iOS tokens; add
  `GoogleService-Info.plist` (from a base64 CI secret) and the `aps-environment`
  entitlement. The app registers the APNs→FCM token as `device_type: 'ios'`
  through the **already-frozen** `POST /device-tokens` contract.

This ADR records the **decision and its shape**; the executable detail —
platform add, config reconciliation, Auth0 iOS callback, push wiring, CI, and
the secrets checklist — lives in **[spec 045](../../specs/045-ios-app/spec.md)**
and fans out to `rettxweb` when the spec is flipped to `ready`.

## Options considered

- **Option A — Capacitor iOS on GitHub Actions macOS runners (recommended).**
  Reuse the existing web bundle as a Capacitor iOS target; build, sign, and ship
  headlessly on `macos-latest`. No Mac hardware, no new codebase, and the push
  backend already exists (spec 033). One small native surface to maintain
  alongside Android.
- **Option B — Capacitor iOS, but require a physical Mac / Xcode Cloud.**
  Rejected: Pedro has **no Mac**, and Xcode Cloud adds another Apple-side
  billing/config surface for no benefit over hosted GitHub runners, which
  already solve the build-host problem and keep CI in one place.
- **Option C — a separate native SwiftUI app.** Rejected: throws away the
  shared Angular/Capacitor web bundle, **doubles** feature and maintenance work,
  and diverges the caregiver experience across platforms — contrary to
  sustainability/stewardship (constitution VIII) for a small team.
- **Option D — stay Android-only / rely on the iOS PWA.** Rejected: iOS PWAs
  have **unreliable push** and no App Store presence, so iOS caregivers would
  miss Message Center pushes (spec 033) and could not install rettX from the
  store — a materially worse experience for a large share of the community.

## Recommendation

Adopt **Option A**. It is the only option that requires no Mac hardware, reuses
the existing web bundle and the already-built FCM v1 push path, and keeps the
whole release on GitHub Actions where the Android pipeline already lives. Track
execution in spec 045 (fan-out: `rettxweb` only — the backend iOS push path
already exists per spec 033).

## Consequences

### Positive

- iOS caregivers get a **real App Store app** with reliable push, reusing the
  existing web bundle — near-parity with Android for little incremental code.
- **No Mac purchase**; the build host is a GitHub-hosted `macos-latest` runner,
  and the release pipeline mirrors the proven `android-release.yml`.
- The push backend is **already done** (spec 033 FCM v1 + frozen device-token
  contract); iOS push is Apple-side setup + a `device_type: 'ios'`
  registration, not a new transport.

### Negative / cost

- **Health-adjacent data** (seizure / medication logging) draws **extra App
  Store review scrutiny**: accurate **privacy nutrition labels**, a published
  **privacy policy**, and careful, non-medical-device framing are mandatory —
  and review can bounce the first submission.
- **Apple Developer Program enrolment** is required (check for an existing
  account first; pursue the **non-profit fee-waiver** path for Rett Europe),
  with annual renewal and identity verification overhead.
- **Ongoing macOS-runner minutes** are billed at a higher multiplier than Linux
  runners, adding recurring CI cost (constitution VIII — track it).
- **Signing/secret management** adds operational surface: certs, profiles,
  APNs `.p8`, and the App Store Connect API key must be provisioned, stored as
  CI secrets, and rotated.

### Neutral

- No change to the Angular web app or the `rettxapi` backend contract; iOS is an
  additive Capacitor target consuming the frozen spec-033 contract.
- The device-token model already allows `device_type: 'ios'`, so no schema or
  backend change is anticipated (to be confirmed in spec 045's assumptions).

## Follow-ups (on acceptance)

- **Spec 045 (this PR)** — author `specs/045-ios-app/spec.md` capturing the
  `rettxweb` implementation slice (platform add, config reconciliation, Auth0
  iOS callback, push wiring, `ios-release.yml`, assets, and the secrets
  checklist). Kept `status: draft` so it does **not** fan out until a maintainer
  flips it to `ready`.
- **Apple-side one-time setup (maintainer)** — enrol / confirm the Apple
  Developer Program account (non-profit fee waiver); create the App Store
  Connect app record (`eu.retteurope.rettx`); generate the distribution
  certificate + provisioning profile (or seed `fastlane match`); create the App
  Store Connect API key (`.p8`); create and upload the **APNs auth key** to
  Firebase; author the privacy policy + App Privacy nutrition labels.
- **CI secrets (maintainer)** — provision the secrets enumerated in spec 045 in
  the `rettxweb` repo / `ios-release` protected environment.
- **Fan-out (gated on maintainer go-ahead)** — flip spec 045 to `ready` so the
  `spec-fanout` workflow opens the scoped `rettxweb` `squad` issue.

<!--
  Frontmatter below is machine-read by .github/workflows/spec-fanout.yml when
  this spec is merged into main. Fanout only runs when status is `ready` or
  `accepted` — while `draft` nothing fans out, so it is safe to review and
  iterate. Flip `status: ready` when agreed and you want the squad issues
  opened on merge.

  Allowed fanout repos: rettxweb, rettxadmin, rettxapi, rettxmutation, rettxid,
  templates.

  STACK & DELIVERY PRE-FLIGHT (patterns.md §7): this spec changes CLIENT
  behaviour only. rettxweb = Angular 18+ standalone PWA wrapped with Capacitor 8
  as a native Android app (iOS planned) — treat as a NATIVE MOBILE SURFACE. That
  matters here: the Angular service worker is deliberately DISABLED on native
  (WebView storage survives APK reinstalls), so the service-worker limbs of the
  recovery ladder are web/desktop-only and MUST no-op safely on native.
  rettxadmin is the same Angular family and inherits the same policy.
  No API change: the diagnostic payload is client-emitted telemetry and reuses
  the existing per-install `correlationId` from spec 034. There is therefore NO
  rettxapi slice, no schema change, no new delivery mechanism and no
  `templates` slice.
-->
---
spec_id: "049"
slug: "unicorn-diagnostics-recovery"
title: "The unicorn must capture and cure — fatal client error diagnostics and recovery"
status: draft   # draft | ready | accepted | superseded
authored: "2026-08-04"
author: "perocha"
relates_to: "specs/034-auth-observability/ (origin of the `unicorn` term and of the per-install `correlationId`); .specify/memory/patterns.md §2 Operational shorthand (defines `unicorn`); rett-europe/rettxweb#298 (PwaUpdateService never checks at startup); rett-europe/rettxweb#299 (deploys delete superseded hashed assets — the structural root cause)"
fanout:
  - repo: rettxweb
    summary: |
      PRIMARY IMPLEMENTER. The `/global-error` page ("the unicorn") becomes the
      single canonical capture-and-recover surface for fatal client errors.

      Do:
      (1) Emit ONE canonical `unicorn_shown` telemetry event FROM the error page
      component after it renders — not from `GlobalErrorHandler`, which races the
      page teardown that eats its best-effort flush. Every producer routes
      through this page, so a page-level event is complete BY CONSTRUCTION and
      cannot be bypassed by a producer added later.
      (2) Introduce a closed `cause` taxonomy and require every producer to hand
      one over. `unknown` is a permitted, COUNTED value — an `unknown` rate is
      itself the signal that a producer is not tagging.
      (3) Capture build identity and staleness (see FR-003, FR-004). This is the
      dimension the program currently lacks: `appVersion` is the RELEASE version,
      not the deployed build, so three deploys in one evening are
      indistinguishable in telemetry.
      (4) Replace the `routerLink="/"` placebo with a cause-aware recovery
      ladder that can actually change the failing state (FR-008, FR-009).
      (5) Measure whether recovery worked (FR-011). Shipping an escape hatch
      without measuring it repeats the exact mistake this spec corrects.
      (6) Translate the page (FR-012). It is currently hardcoded English.

      Do NOT: add a free-text "what happened?" field (FR-006), log raw URLs or
      un-normalised routes, or make the error page depend on services that may
      already be broken (FR-015).
  - repo: rettxadmin
    summary: |
      Inherits the same policy at whatever its fatal-error surface is. Admin
      users are staff rather than caregivers, so the empathetic framing matters
      less, but the diagnostic capture, the closed cause taxonomy, the privacy
      prohibitions and the "never a dead end" rule apply identically.

      Scope is expected to be small. If rettxadmin has no global error surface
      today, the slice is to add one that satisfies FR-001, FR-006, FR-013 and
      FR-015 — not to port the full recovery ladder.
---

## Problem

rettX has a generic fatal-error page at `/global-error`, known across the
program as **the unicorn** (see `patterns.md` §2). It is reached whenever an
unhandled client error escapes to Angular's `ErrorHandler`.

It is the single richest diagnostic moment the app will ever have — we know
exactly what broke, on which build, in which state — and today it throws all of
that away and then offers a recovery that cannot work.

**It captures nothing.** The page component's entire behaviour is:

```ts
ngOnInit(): void {
  console.warn('[PageGlobalErrorComponent] Entered unicorn page 🦄');
}
```

A `console.warn` to a console nobody is reading.

**Its recovery is a placebo.** The only action offered is:

```html
<a routerLink="/" class="home-link">Go Back Home</a>
```

`routerLink` performs a *client-side* navigation. It reuses the same broken
JavaScript context: a stale bundle is still executing, the service worker is
still serving a build that has been deleted from the server, an absent token is
still absent. It never re-fetches `index.html`. For every failure cause measured
below, that button is structurally incapable of fixing the thing it appears to
fix.

**It is hardcoded English.** "Uppsss...", "I don't exist... you're not seeing
this" and "Go Back Home" carry no i18n keys. A Spanish-speaking caregiver
reaches her most confusing moment and the application silently switches
language on her.

### Measured evidence (Azure Application Insights, 30 days to 2026-08-04)

- **64 distinct sessions** reached `/global-error`, producing 197 page views.
  The median session sees it **once**; 44 sessions saw it exactly once.
- Of the errors carrying usable telemetry — **53** in total — the split by cause
  was: **auth/session 28**, **untagged "other" 19**, **stale-deploy chunk 5**
  (desktop only), **resolver/network 1**.
- **The page-view count is not the incidence count.** Bursts of 3–6 page views
  arrive inside a single second (measured: 4 in 0.500s, 3 in 0.504s, 3 in
  0.498s, 6 in 3.4s), because `router.navigate()` is asynchronous and several
  errors thrown in one tick all pass the handler's `router.url !== '/global-error'`
  check. That guard defect is being corrected separately; it is recorded here as
  the reason raw page views must never be read as incidents.
- **187 of 197** page views carry the page name `rettX` — the default document
  title, i.e. before any titled route resolves. Route attribution is effectively
  absent.
- Longest observed time trapped: **31 minutes**, with further sessions at 15 and
  11 minutes. Small in number; severe for those affected.

### What the evidence says about traceability

Diagnosing a single unicorn on 2026-08-04 required manually fetching the live
site and diffing asset hashes against the ones the crashed session had been
executing. Telemetry could not answer it, because:

- `appVersion` is the **release** version (e.g. `1.0.31`), not build identity.
  Several deploys can share one release version, so "is this user running a
  superseded build?" — the decisive question — is unanswerable. Some rows carry
  a **blank** `appVersion` entirely.
- There is no single event meaning "a user saw a unicorn". There are at least
  two producers emitting two different telemetry shapes (`GlobalErrorHandler`
  emits an exception; `patients.resolver` emits a *trace*), so any query filtered
  on one producer is silently blind to the other.
- **64 sessions reached the page but only 53 tracked errors explain them.** At
  least 11 sessions have no telemetry saying why. The intuitive explanation —
  events lost to a page teardown — was checked against the code and does **not**
  hold: `app-insights.service.ts` already flushes on `visibilitychange`,
  `pagehide` and the native `appStateChange`/`pause` events, and
  `GlobalErrorHandler` flushes explicitly. The surviving explanation is the
  producer split above. A `trackTrace` is not an exception, so sessions arriving
  via the resolver are missing from an exception-filtered query while being
  recorded perfectly well. This is a **query-shape** gap, not a delivery gap —
  which is exactly what one canonical event removes.

## What changes

The unicorn stops being a dead end and becomes a **diagnostic checkpoint with a
credible exit**.

1. One canonical, producer-independent event is emitted **from the page**.
2. That event carries enough context to diagnose the failure without touching
   the live site — including build identity and a staleness verdict.
3. The user is offered a recovery **matched to the cause**, capable of changing
   the state that is actually broken.
4. Whether that recovery worked is **measured**.
5. None of the above collects personal data.

The cute unicorn illustration stays. A friendly failure is forgivable; a button
that lies is not.

## Decisions

- **D1 — The page is the emitter, not the handler.** Not because handler
  telemetry is unreliable — flush is comprehensively wired, and that was
  verified rather than assumed — but because there is more than one producer and
  there always will be. An event emitted by a producer counts only the paths
  that remembered to emit it; an event emitted by the page counts **every**
  unicorn by construction, whatever routed there. Producers hand over a cause;
  the page owns the canonical event.
- **D2 — `unknown` is a first-class cause.** Producers that fail to tag are
  visible as an `unknown` rate rather than silently absent. We do not guess a
  cause we cannot evidence.
- **D3 — No free text, ever.** A "tell us what happened" box is the obvious
  product move and is prohibited. Caregivers would enter their child's name and
  clinical detail into an analytics store. See Privacy below.
- **D4 — Recovery is a ladder, not a button.** Each cause has a first action
  that can plausibly fix it and a fallback if it does not.
- **D5 — Recovery is one-shot and burst-safe.** Guards are written
  **synchronously** before an action is scheduled, because errors demonstrably
  arrive several at a time within the same tick. A reload loop on a caregiver's
  device is strictly worse than the unicorn it replaces.
- **D6 — The error page may not itself be able to fail.** It must not depend on
  application services that may already be broken.
- **D7 — The unicorn is not a recovery destination for recoverable failures.**
  Carried forward from spec 034 (FR-012) and still unmet: a resolver that cannot
  load data must produce a recoverable screen, not this page. Routing a transient
  failure here converts a retryable condition into a dead end, and the fix for an
  earlier hang did exactly that. Where a producer currently routes a recoverable
  cause to `/global-error`, that is a defect to be retired. Part of the point of
  the cause taxonomy is to make those cases **countable**, so they can be removed
  on evidence rather than argued about.

## User Scenarios & Testing *(mandatory)*

**S1 — Caregiver on a superseded build (measured, 2026-08-04).**
A caregiver's browser session predates a deploy. She opens the medication
screen; the lazy chunk it needs was deleted from the server hours earlier. She
sees the unicorn. *Today*: "Go Back Home" reloads nothing, the dead bundle is
still running, and she is stuck. *After this spec*: the page records the failing
asset, the running build, and a staleness verdict; it offers "Update and
continue", which clears the stale worker and cache and performs a hard
navigation; she lands on the current build and continues. The recovery outcome
is recorded.

**S2 — Caregiver with a broken session on an old native build.**
The largest measured group (28 of 53). Her cached session predates an auth
change. *After this spec*: the cause is recorded as an auth family, and the
offered action is a real re-login rather than a home link that will fail
identically.

**S3 — Caregiver offline on a train.**
A request fails at the network level. *After this spec*: the page recognises
connectivity, says so plainly, and offers retry rather than a generic apology.

**S4 — An error we have never seen.**
Cause resolves to `unknown`. The page still records everything it can, still
offers the safest general action (hard reload), and the `unknown` rate tells us
a producer needs tagging.

**S5 — Six errors in one tick.**
The burst case, measured. Exactly one recovery action is attempted; the guard is
observed by every sibling in the same tick; the user is not thrown into a reload
loop.

**S6 — The user asks for help.**
She reads out or copies a short incident code. Support can locate the exact
event without her describing anything about her child.

## Requirements *(mandatory)*

### Capture

- **FR-001** The `/global-error` page MUST emit exactly one canonical
  `unicorn_shown` telemetry event per visit, after render.
- **FR-002** The event MUST carry a `cause` from a closed, enum-like set.
  `unknown` MUST be a permitted value and MUST be counted, not suppressed.
  Producers MUST be able to hand a cause to the page.
- **FR-003** The event MUST carry **build identity** — a value that distinguishes
  one deployed build from another, independent of the release version. Blank MUST
  be impossible; if identity cannot be resolved the event MUST say so explicitly.
- **FR-004** The event MUST carry a **staleness verdict**: whether the running
  build is the build the server is currently serving. Comparing the running build
  stamp against the deployed service-worker manifest is a sufficient mechanism.
- **FR-005** The event MUST carry client state relevant to recovery: service
  worker registration state (active / waiting / installing / unsupported /
  disabled) and connectivity.
- **FR-006** The event MUST NOT contain personal data. Specifically: no free-text
  user input, no raw URLs, no un-normalised route (routes MUST be reduced to a
  stable non-identifying form), no patient identifiers, no tokens, and no error
  message field that could carry a name entered by a user.
- **FR-014** Every producer that routes to `/global-error` MUST hand over a
  cause. Adding a new producer without tagging MUST show up as `unknown`, not as
  silence.

### Recovery

- **FR-007** The page MUST display a short **incident code** that the user can
  read aloud or copy, resolvable by support to the exact event, and containing no
  personal data.
- **FR-008** The page MUST offer a recovery action **matched to the cause**, and
  the offered action MUST be one that can plausibly change the failing state.
- **FR-009** For staleness and for `unknown`, the recovery MUST be a **hard**
  recovery: release the stale service worker and caches where present, then
  perform a full document navigation. A client-side router navigation MUST NOT be
  the primary recovery, because it cannot re-fetch the application.
- **FR-010** Recovery MUST be one-shot and burst-safe. The guard MUST be written
  **synchronously before** the action is scheduled, and MUST be observed by
  sibling errors in the same tick. If the guard cannot be persisted, the action
  MUST NOT be attempted.
- **FR-011** Recovery MUST be measurable end to end: the attempt and its outcome
  MUST both be recorded, so the escape hatch can be proven to work rather than
  assumed to.
- **FR-013** The page MUST never be a dead end. At least one offered action MUST
  be capable of changing state, on every cause including `unknown`.

### Quality

- **FR-012** All page copy MUST be translated, `en` and `es` at minimum, with the
  existing English fallback behaviour preserved. No hardcoded user-facing strings.
- **FR-015** The page MUST be defensive: it MUST render, capture and offer
  recovery even when application services are unavailable, and MUST NOT be
  capable of throwing an error that routes back to itself.
- **FR-016** Native surfaces MUST be handled explicitly. Service-worker limbs of
  the recovery ladder MUST no-op safely where the service worker is disabled by
  design, and MUST NOT break the Capacitor shell.

### Detection

- **FR-017** A unicorn **rate alert** MUST exist, so the programme learns of a
  spike from monitoring rather than from a maintainer personally crashing —
  which is how the present work began. The measured baseline gives the threshold
  a real starting point (~64 sessions per 30 days, median one view each), so the
  alert can be tuned against observed behaviour instead of a guess. Carried
  forward from spec 034 (FR-013), which specified the equivalent alert for auth
  failures and was never delivered. Ownership follows whatever the programme
  already uses for App Insights alert rules; this spec requires only that the
  alert exists and is documented.

## Key Entities

- **Unicorn** — the `/global-error` page. Defined in `patterns.md` §2.
- **Cause** — a closed, enum-like classification of why a unicorn was shown.
  Small by design; extended deliberately, never ad hoc.
- **Build identity** — a value distinguishing one deployed build from another.
  Distinct from the release version, which several builds may share.
- **Staleness verdict** — whether the running build is still the one being
  served.
- **Incident code** — a short, non-identifying, user-quotable handle for one
  unicorn event.
- **Recovery ladder** — the ordered set of actions offered for a given cause.

## Privacy

This spec increases what is collected at a failure, so Principle II is engaged
directly and deliberately.

- **Data minimisation.** Everything captured is technical client state chosen
  because it is required to diagnose or to recover. Nothing describes the patient
  or the caregiver.
- **Free text is prohibited (D3).** In a Rett syndrome registry, an open "what
  happened?" box is a near-certain route for a child's name and clinical detail
  to enter an analytics store under no lawful basis and no consent. The incident
  code (FR-007) provides the support pathway without it.
- **Routes are normalised (FR-006).** Patient identifiers are known to appear in
  server-side operation names today; that is a defect to be corrected elsewhere,
  and MUST NOT be reproduced client-side by this spec.
- **Pseudonymisation.** The per-install `correlationId` from spec 034 is an
  opaque UUID and remains the join key. No new identifier is introduced.
- **Transparency.** Under Principle III, what the unicorn captures SHOULD be
  described in patient-readable language on the public docs site.

## Success Criteria *(mandatory)*

Every criterion below states a **baseline** measured on 2026-08-04, a **target**,
and the **instrument** that will decide it. Where a value cannot be measured
today, that unmeasurability *is* the defect being fixed, and is recorded as the
baseline rather than glossed.

All targets are assessed **30 days after rollout**, and the result — met or
missed — is written back into this spec as an amendment. A criterion that is
never checked is not a criterion.

- **SC-1 Cause coverage.** Baseline **0%** — no page-level event exists, and 19
  of 53 tracked errors carry no cause. Target **≥90%** of `unicorn_shown` events
  carry a cause other than `unknown`. Instrument: share of `unicorn_shown` by
  `cause`.
- **SC-2 Build identity.** Baseline **0%** — neither build identity nor a
  staleness verdict exists. Target **100%** of `unicorn_shown` events carry both.
  Instrument: null-rate of those two dimensions.
- **SC-3 Diagnosis without touching production.** Baseline: diagnosing the
  2026-08-04 unicorn required fetching the live site and diffing asset hashes by
  hand. Target: that same diagnosis is reachable **from telemetry alone**.
  Instrument: re-run that specific diagnosis against the new event and reach the
  same verdict with no network request. Binary, and it either works or it does
  not.
- **SC-4 Recovery effectiveness — the headline criterion.** Baseline
  **unknowable**: no recovery outcome is recorded at all, so the honest current
  answer to "does the button work?" is that nobody knows. Target, in two parts.
  First, within 30 days the success rate is **reportable per cause**. Second, the
  stale-build limb specifically achieves **≥90%** success, because a hard reload
  is a mechanism we understand and it should essentially always resolve a stale
  build; a lower figure means the recovery is not doing what we think. Targets
  for the remaining causes are deliberately **not invented now** — they are set
  at the 30-day review against real data and recorded here. Instrument: paired
  recovery-attempted / recovery-outcome events.
- **SC-5 One event per incident.** Baseline: **197 page views across 64
  sessions** (3.1 per session), with bursts of up to 6 inside 3.4 seconds.
  Target: **≤1.2** page views per session, and **zero** bursts of more than one
  `unicorn_shown` within a 5-second window. Instrument: page views per session,
  and event counts bucketed by session and second.
- **SC-6 Time trapped.** Baseline: **31 minutes** worst observed, with further
  sessions at 15 and 11 minutes. Measured as the interval from the first unicorn
  page view to the next successful route activation, or to session end where
  none follows. Target: **95th percentile under 60 seconds**, and **no session
  above 10 minutes**. "Trends to zero" was the earlier wording and it is not a
  target — it cannot be failed.
- **SC-7 No free text.** Baseline: none today, and none permitted ever. Target:
  **zero** free-text input fields on the error surface, enforced by a test in CI
  so that a future well-meaning change fails the build rather than a privacy
  review. See D3.

### Measurement plan

- **The baseline must be frozen before any implementation merges.** These
  numbers were measured against the *current* telemetry shape. Shipping the
  canonical event changes that shape, and once it changes the before/after
  comparison cannot be reconstructed. This is the operational reason the
  implementation PRs are held rather than merged ahead of the spec.
- The queries that produced every baseline above are recorded alongside this
  spec, so the 30-day review re-runs the *same* measurement rather than a
  plausible-looking substitute. A baseline that cannot be re-run is an anecdote.
- Three findings during this investigation turned out to be **measurement
  artefacts** rather than defects — a misleading chart, a miscounted test
  baseline, and an assumed telemetry-delivery failure that the code disproved.
  Each was withdrawn on evidence. The review must be equally willing to conclude
  that a criterion was met for the wrong reason, or that the instrument was
  wrong, rather than defending the spec.

## Phased delivery

- **Phase 1 — See it.** FR-001, FR-002, FR-006, FR-014, FR-015. The canonical
  event with a cause taxonomy and the privacy prohibitions enforced. Ships value
  immediately: the untagged 19 become classifiable.
- **Phase 2 — Explain it.** FR-003, FR-004, FR-005. Build identity, staleness
  verdict, client state. This is what removes manual diagnosis.
- **Phase 3 — Cure it.** FR-007 through FR-011, FR-013, FR-016. The recovery
  ladder, the incident code, and outcome measurement.
- **Phase 4 — Speak plainly.** FR-012. Translation and copy review.

Phases 1 and 2 are independently valuable and MUST NOT be blocked on the
recovery work.

## Risks

- **R1 — Recovery loop.** A recovery that re-triggers the failure could loop on a
  caregiver's device. This is the most serious risk in the spec and is worse than
  the status quo. Mitigation: FR-010's synchronous one-shot guard, refusal to act
  when the guard cannot be persisted, and an explicit test firing several errors
  in a single tick.
- **R2 — Cache clearing degrades offline use.** Releasing caches to escape a
  stale build temporarily removes offline capability. Mitigation: only on the
  staleness and `unknown` limbs, only once, and only where a service worker is
  actually present.
- **R3 — Privacy regression via well-meaning product instinct.** Someone will
  propose a feedback box. Mitigation: D3 and FR-006 are explicit, and SC-7 is
  test-enforced.
- **R4 — The error page itself fails.** Would produce a true dead end.
  Mitigation: FR-015.
- **R5 — Native divergence.** The service worker is disabled by design on native,
  so parts of the ladder are inert there. Mitigation: FR-016, and native causes
  skew auth rather than staleness — consistent with all 5 measured stale-chunk
  cases being desktop.
- **R6 — Cause taxonomy sprawl.** An open-ended set becomes unqueryable.
  Mitigation: closed set, extended deliberately.

## Constitution Check

- **I. Patients & caregivers come first (NON-NEGOTIABLE)** — Aligned, and the
  primary motivation. A caregiver stranded for 31 minutes by a button incapable
  of helping her is a direct failure of this principle.
- **II. Privacy by design (NON-NEGOTIABLE)** — Engaged deliberately. Collection
  increases, so the spec constrains it: data minimisation, an explicit free-text
  prohibition, route normalisation, no new identifier, and a test-enforced
  success criterion. No special-category data is collected.
- **III. Transparency above all (NON-NEGOTIABLE)** — Aligned. What the unicorn
  captures is publishable in patient-readable language, and this spec is public.
- **V. Accessibility and inclusion** — Advanced by FR-012; the current page is
  English-only at the moment of maximum user confusion.
- **VI. Security baseline** — No tokens, credentials or identifiers are captured
  or displayed. The incident code is non-identifying.

No principle is weakened; no amendment is required.

## Assumptions

- The service worker remains enabled on web/desktop and disabled on native.
- The per-install `correlationId` from spec 034 remains the client join key.
- Application Insights remains the client telemetry sink; nothing here depends on
  a specific query language.
- A build stamp can be made available to the running application at build time.
  If it cannot, FR-003 needs a different mechanism and this becomes an open
  decision.

## Relationship to spec 034

Spec 034 (*auth-failure observability & diagnosability*, authored 2026-07-13) has
sat at `status: draft` ever since, so it never fanned out. Much of it was
nonetheless delivered through incident-driven work. The client-side position was
**verified against the code on 2026-08-04**, not assumed:

| 034 requirement | state today |
|---|---|
| FR-007 native reporting + flush before backgrounding | **delivered** — flush on `visibilitychange`, `pagehide`, native `appStateChange` and `pause` |
| FR-008 `X-Rettx-Correlation-Id` / `X-Rettx-App-Version` on every call | **delivered** — `client-telemetry.interceptor.ts`, with specs |
| FR-009 startup + auth-lifecycle breadcrumbs | **delivered** — `startup-telemetry.service.ts`, `auth_guard_pass`, `patients_resolve_*`, `native_auth.*` |
| FR-011 no authed call before a real token | **substantially delivered** — refresh tokens enabled, silent-token probe, `patients_resolve_skipped_unauthenticated` |
| FR-012 a resolver failure must never brick the app **or reach the unicorn** | **half delivered** — it no longer hangs, but it now routes to `/global-error`, which 034 explicitly forbade |
| FR-013 proactive rate alert | **not delivered** |

Two things are therefore carried into this spec rather than left in a stalled
draft: **FR-012's principle**, as D7, and **FR-013's alert**, as FR-017. The
backend half of 034 (FR-001–FR-006, rettxapi auth-failure shaping) is untouched
by this spec and remains 034's to resolve.

The governance lesson is worth stating plainly, because it cost the programme the
same incident twice: 034 was correct, was never wrong, and stalled anyway — on
four unanswered questions. Nothing in the pipeline makes a quiet draft visible,
and silence is indistinguishable from success. That gap is not fixed here; it is
raised as OD-6.

## Out of scope

- **Preventing** stale-build failures by retaining superseded hashed assets —
  the structural root cause, tracked as rettxweb#299. This spec makes the failure
  survivable; #299 makes it stop happening.
- Prompting for updates earlier — rettxweb#298.
- The racy navigation guard in `GlobalErrorHandler`, in flight separately.
- Patient identifiers appearing in **server-side** operation names — a rettxapi
  route-template concern, related but distinct.
- Redesigning the unicorn illustration or the empathetic tone. Both are working.

## Open decisions

- **OD-1** What is the build identity mechanism — an injected build-time stamp,
  the entry bundle hash, or the service-worker manifest hash? Affects FR-003.
- **OD-2** Is the staleness check (FR-004) performed eagerly on every unicorn, or
  only for causes where it is plausibly relevant? Eager is simpler and one extra
  request on an already-failed page is cheap; lazy is tidier.
- **OD-3** What is the initial cause taxonomy? Measurement supports at least
  `stale-build`, an auth family, `network`, and `unknown`. Splitting the auth
  family further should wait for the classifier work now in progress.
- **OD-4** Should the incident code be the `correlationId`, a truncation of it,
  or a separate per-incident value? A per-incident value is more precise for
  support; a truncation is easier to read aloud.
- **OD-5** Does rettxadmin have a fatal-error surface today, or does this create
  one? Determines whether its slice is small or merely tiny.
- **OD-6** How does the programme surface a spec that is authored, correct and
  **stalled**? Spec 034 sat in `draft` for three weeks while the incident it
  described recurred. Options: a scheduled staleness report over `status: draft`
  older than N days, a required decision-by date in frontmatter, or accepting it
  as a purely human review habit. Out of scope for the unicorn work itself, but
  it is the reason this spec had to re-derive ground 034 already covered.

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
title: "The app must never trap a caregiver — fatal client errors and silent hangs"
status: ready   # draft | ready | accepted | superseded
authored: "2026-08-04"
author: "perocha"
relates_to: "specs/034-auth-observability/ (origin of the `unicorn` term and of the per-install correlation id); .specify/memory/patterns.md §2 Operational shorthand (defines `unicorn`)"
fanout:
  - repo: rettxweb
    summary: |
      PRIMARY IMPLEMENTER. Two tracks, both aimed at one outcome: a caregiver
      is never left unable to proceed. Track 1 makes the `/global-error` page
      ("the unicorn") the single canonical capture-and-recover surface for fatal
      client errors. Track 2 makes silent hangs visible and survivable.

      TRACK 1 — the dead end. Do:
      (1) Emit ONE canonical `unicorn_shown` telemetry event FROM the error page
      after it renders — not from the error handler. The reason is
      producer-independence, NOT flush unreliability: flush is already wired on
      page-hide and on the native backgrounding events, which was verified in
      code rather than assumed. A producer-level
      event counts only the paths that remembered to emit it; a page-level event
      is complete BY CONSTRUCTION and cannot be bypassed by a producer added
      later.
      (2) Introduce a closed `cause` taxonomy and require every producer to hand
      one over. `unknown` is a permitted, COUNTED value — an `unknown` rate is
      itself the signal that a producer is not tagging.
      (3) Capture build identity and staleness (see FR-003, FR-004). This is the
      dimension the program currently lacks: the version the client reports is
      the RELEASE version, not the deployed build, so three deploys in one
      evening are indistinguishable in telemetry.
      (4) Replace the placebo home link with a cause-aware recovery
      ladder that can actually change the failing state (FR-008, FR-009).
      (5) Measure whether recovery worked (FR-011). Shipping an escape hatch
      without measuring it repeats the exact mistake this spec corrects.
      (6) Translate the page (FR-012). It is currently hardcoded English.

      TRACK 2 — the silent hang. A request that never completes throws nothing
      and shows nothing; the spinner simply never stops. Do, IN THIS ORDER:
      (7) Ship client request instrumentation FIRST, with no behaviour change
      (FR-018). The user-harm baseline does not exist: server telemetry shows
      zero requests over 30s, but it cannot see a request that never arrived,
      stalled, or was abandoned client-side. Bounding before measuring
      permanently forfeits the before-figure (D9).
      (8) THEN bound and cancel reads at a justified value (FR-019, FR-022).
      Evidence supports 30s as a safety floor — roughly 14s above the worst
      legitimate completion — but whether it is an acceptable caregiver wait is
      an open decision (OD-7), as is uniform-vs-per-class (OD-8).
      (9) Resolve every bounded-out request to a recoverable state IN PLACE
      (FR-020) — retry affordance, partial render or localised message.

      Do NOT: add a free-text "what happened?" field (FR-006), log raw URLs or
      un-normalised routes, make the error page depend on services that may
      already be broken (FR-015), bound writes where cancellation could discard
      caregiver-entered data (FR-021), or let a timeout escape to `ErrorHandler`
      and become a unicorn (D8) — that turns a recoverable condition into a dead
      end and MUST be pinned by tests.
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

**It captures nothing.** The page writes a single line to the browser console
and does nothing else — no telemetry event, no cause, no build identity. A log
line to a console nobody is reading.

**Its recovery is a placebo.** The only action offered is a client-side
navigation back to the home route. That reuses the same broken JavaScript
context: a stale bundle is still executing, a superseded build is still being
served from cache, an absent token is still absent. It never re-fetches the
application shell. For every failure cause measured below, that button is
structurally incapable of fixing the thing it appears to fix.

**It is hardcoded English.** The apology, the explanation and the recovery link
carry no i18n keys. A Spanish-speaking caregiver reaches her most confusing
moment and the application silently switches language on her.

### Measured evidence (client telemetry, 30 days to 2026-08-04)

The underlying figures were measured in the private client telemetry and are
deliberately **not reproduced here**: production failure counts for a private
application are operational detail, and this repository is public. What the
measurement establishes — and what the requirements below rest on — is:

- The unicorn is **recurrent, not exceptional**, and it concentrates in a small
  number of causes. Auth/session dominates; stale-deploy chunk failures are a
  distinct and entirely desktop-side minority; a substantial share is untagged,
  which is itself the finding.
- **Page views are not incidents.** Several page views routinely arrive inside a
  single second, because the navigation is asynchronous and multiple errors
  thrown in one tick all pass the handler's guard. That guard defect is being
  corrected separately; it is recorded here as the reason raw page views must
  never be read as an incidence count.
- **Route attribution is effectively absent.** The overwhelming majority of page
  views carry the default document title — they are recorded before any titled
  route resolves.
- Some sessions stay trapped for **tens of minutes**. Small in number; severe
  for those affected.

### What the evidence says about traceability

Diagnosing a single unicorn on 2026-08-04 required manually fetching the live
site and comparing what it served against what the crashed session had been
executing. Telemetry could not answer it, because:

- The version the client reports is the **release** version, not build identity.
  Several deploys can share one release version, so "is this user running a
  superseded build?" — the decisive question — is unanswerable. Some rows carry
  no version at all.
- There is no single event meaning "a user saw a unicorn". Two producers emit
  two different telemetry shapes — one an exception, the other a trace — so any
  query filtered on one producer is silently blind to the other.
- **More sessions reach the page than tracked errors explain.** The intuitive
  explanation — events lost to a page teardown — was checked against the code and
  does **not** hold: the telemetry client already flushes on page-hide and on the
  native backgrounding events, and the error handler flushes explicitly. The
  surviving explanation is the producer split above. A trace is not an exception,
  so sessions arriving via the second producer are missing from an
  exception-filtered query while being recorded perfectly well. This is a
  **query-shape** gap, not a delivery gap — which is exactly what one canonical
  event removes.

### The second trap: the silent hang

A caregiver can also be trapped **without any error at all**. A request that
never completes throws nothing, routes nowhere, and shows no error page — the
spinner simply never stops. The harm is identical to the unicorn; the mechanism
is the opposite. Nothing fails, so nothing is reported.

This is the failure the maintainer personally hit, and it is why this spec is
about being trapped rather than about one page.

Read latency was measured on rettxapi over the 30 days to 2026-08-04, across the
medication routes. The shape that matters here, with the precise figures held
privately alongside the other baselines:

- One read class has a **long tail well beyond ten seconds** at the 99th
  percentile, and a worst legitimate completion somewhat higher again.
- A second class is **an order of magnitude faster at the 99th percentile** but
  has an occasional slow outlier of comparable size — so tail behaviour is not
  predicted by typical behaviour.
- The remaining named reads are **fast and tightly grouped**, with little spread
  between their 99th percentile and their worst case.

Two conclusions follow, and they answer different questions:

- A bound of 30 s sits comfortably above the worst legitimate completion, so it
  is a defensible **safety floor** — it will not kill slow-but-healthy requests.
- It says nothing about whether 30 s is an acceptable **caregiver wait**. That is
  a product decision, recorded as OD-7, not something a p99 can answer.

**The harm itself is currently unmeasurable, and that is the sharper problem.**
The server-side count of requests exceeding 30 s is **zero** — but server
telemetry is the wrong instrument. A request that never reached rettxapi, stalled
in the network, or was abandoned client-side is simply absent from it. There is
no client-side measure of waits that reached the bound, spinner dwell time,
cancellations, or manual retries.

So there are two distinct baselines and they must never be conflated:

- **Server safety baseline** — no medication invocation exceeded 30 s, and the
  worst legitimate completion sits far below it. Established.
- **User-harm baseline** — **unknown, not instrumented.** Quoting the server
  figure as the hang baseline would pass off completed backend work as
  client-visible trapping.

This is why the bound must not ship before the instrumentation: doing so would
permanently forfeit the before-figure, exactly as shipping the canonical unicorn
event ahead of its baseline would.

## What changes

A caregiver stops being trapped, by either mechanism.

The unicorn stops being a dead end and becomes a **diagnostic checkpoint with a
credible exit**:

1. One canonical, producer-independent event is emitted **from the page**.
2. That event carries enough context to diagnose the failure without touching
   the live site — including build identity and a staleness verdict.
3. The user is offered a recovery **matched to the cause**, capable of changing
   the state that is actually broken.
4. Whether that recovery worked is **measured**.
5. None of the above collects personal data.

And the silent hang stops being invisible:

6. Waiting is **instrumented first**, so the harm can be counted before anything
   claims to fix it.
7. Reads are **bounded and cancelled**, so a caregiver is never left in front of
   a spinner that will never stop.
8. A bounded-out request resolves to a **recoverable state in place** — not a
   blank screen, not a continuing spinner, and explicitly not the unicorn.

The two halves share one outcome — time spent unable to proceed — and that is
the number this spec is ultimately judged on.

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
- **D8 — A bounded wait must not become a unicorn.** The two failure modes in
  this spec are treated separately on purpose. When a request is cut off at its
  bound, the caller handles it in place — a retry affordance, a partial render,
  or a localised message — and the error is marked handled so it does **not**
  escape to `ErrorHandler` and does **not** route to `/global-error`. Converting
  a timeout into a full-page fatal error would take a recoverable condition and
  make it a dead end, which is D7 in the opposite direction. This is a deliberate
  design property and it must be preserved by tests, because it is the kind of
  thing an innocent-looking refactor silently reverses.
- **D9 — Instrument before bounding.** The bound ships only after the
  instrumentation that measures the harm it claims to fix. This is the same rule
  the unicorn work is under: a fix that lands before its baseline can never be
  shown to have worked. It costs one release ordering and buys the ability to
  answer "did this help?" with a number. **This decision was breached on
  2026-08-04** — the bound shipped first. See the amendment under *Phased
  delivery* for what that cost and what still binds. D9 is not weakened by the
  breach; it applies in full to any future tightening of the bound.

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
  Producers MUST be able to hand a cause to the page. The `cause` MUST describe
  **what went wrong**, and MUST NOT be set to the identity of the code path that
  emitted it; where the failure is unclassified, the cause is `unknown` even
  though the emitting path is known. The emitting path MUST be carried as a
  **separate dimension** so that both questions can be asked independently.
  Recorded 2026-08-05 after two implementation attempts collapsed the two: doing
  so drives the `unknown` rate to near zero by renaming rather than by
  classifying, and SC-1 then reports success while measuring nothing.
- **FR-003** The event MUST carry **build identity** — a value that distinguishes
  one deployed build from another, independent of the release version. Blank MUST
  be impossible; if identity cannot be resolved the event MUST say so explicitly.
- **FR-004** The event MUST carry a **staleness verdict**: whether the running
  build is the build the server is currently serving. Where a surface has no
  served build to compare against — the native shell, where the service worker
  is absent by design — the verdict MUST be `unavailable`, stated explicitly,
  rather than a claim of freshness that cannot be established (OD-2).
- **FR-005** The event MUST carry client state relevant to recovery: service
  worker registration state (active / waiting / installing / unsupported /
  disabled / `unresolved`) and connectivity. `unresolved` covers a lookup that
  threw, rejected or timed out: the state could not be established, and
  reporting any of the other five would be a false claim. The same principle
  governs FR-003 and FR-004 — a value that cannot be established MUST say so
  rather than be guessed.
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
  This MUST NOT be satisfied by giving the page a runtime dependency on the
  application's translation service, which would breach FR-015. See the
  amendment of 2026-08-05.
- **FR-015** The page MUST be defensive: it MUST render, capture and offer
  recovery even when application services are unavailable, and MUST NOT be
  capable of throwing an error that routes back to itself.
- **FR-016** Native surfaces MUST be handled explicitly. Service-worker limbs of
  the recovery ladder MUST no-op safely where the service worker is disabled by
  design, and MUST NOT break the Capacitor shell.

### Bounded waiting

These requirements address the silent hang. They deliberately do **not** route
through the unicorn — see D8.

- **FR-018** Client-side request instrumentation MUST exist and MUST ship
  **before** any bound is enforced (D9). It MUST record, per request: start,
  completion or failure, elapsed time, and whether the caller was still waiting
  when the view was destroyed. It MUST also record a **route class**, so that a
  later move to per-class bounds does not require re-instrumenting and waiting
  out a second observation window (OD-8). Identifier-free, per the privacy rules
  below.
- **FR-019** Every read request to rettxapi MUST be bounded. A request that
  exceeds its bound MUST be cancelled rather than left outstanding, so the
  connection and the caller's waiting state are both released.
- **FR-020** A bounded-out request MUST surface to the caregiver as a
  **recoverable** state — a retry affordance, a partial render, or a localised
  message — never as a blank screen, never as a spinner that continues, and
  never as the unicorn. Where a screen already renders useful content, that
  content MUST survive the failure of a secondary request.
- **FR-021** The bound MUST NOT be applied to requests where cancellation could
  lose caregiver-entered data. Reads are safe to cut; writes are not, and a
  timeout that silently discards a medication change is a worse outcome than a
  slow save.
- **FR-022** The bound MUST be a stated value with a recorded justification, not
  an inherited constant. The current evidence supports 30 s as a safety floor
  against false timeouts; whether it is an acceptable caregiver wait is OD-7.

### Detection
- **FR-017** A unicorn **rate alert** MUST exist, so the programme learns of a
  spike from monitoring rather than from a maintainer personally crashing —
  which is how the present work began. The measured baseline gives the threshold
  a real starting point (a modest number of affected sessions per 30 days,
  median one view each), so the
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

- **SC-1 Cause coverage.** Baseline **0%** — no page-level event exists, and a
  substantial share of tracked errors carry no cause at all. Target **≥90%** of
  `unicorn_shown` events carry a cause other than `unknown`. Instrument: share of
  `unicorn_shown` by `cause`. This target is only meaningful while FR-002's
  separation holds: if the emitting path is used as the cause, the criterion
  passes on the day it ships and measures nothing.
- **SC-2 Build identity.** Baseline **0%** — neither build identity nor a
  staleness verdict exists. Target **100%** of `unicorn_shown` events carry both.
  Instrument: null-rate of those two dimensions.
- **SC-3 Diagnosis without touching production.** Baseline: diagnosing the
  2026-08-04 unicorn required fetching the live site and comparing assets by
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
- **SC-5 One event per incident.** Baseline: page views substantially exceed
  sessions — roughly three to one — with bursts of several inside a few seconds.
  Target: **≤1.2** page views per session, and **zero** bursts of more than one
  `unicorn_shown` within a 5-second window. Instrument: page views per session,
  and event counts bucketed by session and second.
- **SC-6 Time trapped.** Baseline: worst observed is **tens of minutes**, with
  several further sessions in the same range. Measured as the interval from the
  first unicorn page view to the next successful route activation, or to session
  end where none follows. Target: **95th percentile under 60 seconds**, and **no
  session above 10 minutes**. "Trends to zero" was the earlier wording and it is
  not a target — it cannot be failed.
- **SC-7 No free text.** Baseline: none today, and none permitted ever. Target:
  **zero** free-text input fields on the error surface, enforced by a test in CI
  so that a future well-meaning change fails the build rather than a privacy
  review. See D3.
- **SC-8 Silent hangs become visible.** Baseline: **unmeasurable**. Server
  telemetry shows zero requests over 30 s, but it cannot see a request that never
  arrived, stalled in the network, or was abandoned — and there is no client-side
  measure of waits, spinner dwell, cancellations or manual retries at all. Target:
  after the instrumentation slice ships, the programme can state **how many
  caregiver waits exceeded the bound, on which screens, over a stated window**.
  This criterion is met by being able to answer the question.
  **Amended 2026-08-04.** As originally written this criterion also required the
  question to be answered *before* the bound was enforced. That clause is now
  **failed and unrecoverable** — the bound shipped first, so waits beyond it no
  longer occur and their duration can never be measured. It is recorded as failed
  rather than deleted. The remaining, still-achievable target is **incidence**:
  how often a wait reaches the bound, by route class, over a stated window. That
  requires FR-018 to record bound-cancellation as a state distinct from ordinary
  failure. Instrument: client request
  start/finish/timeout events.
- **SC-9 Bounded waits actually recover.** Baseline: unknown, pending SC-8.
  Target: **zero** caregiver waits above the bound end in a blank screen, a
  continuing spinner, or the unicorn — every one resolves to a recoverable state
  offering a next action. Instrument: bounded-out events joined to what the
  caregiver saw next. Deliberately expressed as *zero*, because this is a
  correctness property rather than a rate to improve: D8 either holds or it has
  been broken.
- **SC-10 Time trapped is measured across both failure modes.** SC-6 measures
  time trapped on the unicorn. The same measure MUST be reportable for silent
  hangs once SC-8 lands, so the programme can state total time caregivers spent
  unable to proceed, whatever the mechanism. Baseline: only the unicorn half
  exists today. Target: both halves reportable, and
  the combined figure is the number that matters.

### Measurement plan

- **The baseline must be frozen before any implementation merges.** These
  numbers were measured against the *current* telemetry shape. Shipping the
  canonical event changes that shape, and once it changes the before/after
  comparison cannot be reconstructed. This is the operational reason the
  implementation PRs are held rather than merged ahead of the spec.
- **The precise baseline figures, and the queries that produced them, are held
  privately** — they are production telemetry for a private codebase and this is
  a public repository. This spec therefore states baselines by shape, and the
  exact values live with the implementing repo. Two properties must hold there
  and are the implementing repo's obligation to keep: the baseline is **frozen
  and dated before implementation begins**, and the **post-rollout queries are
  written at the same time**, so the 30-day review re-runs the *same*
  measurement rather than a plausible-looking substitute chosen afterwards by
  whoever wants a particular answer. A baseline that cannot be re-run is an
  anecdote; a review query written after the result is not a review.
- Three findings during this investigation turned out to be **measurement
  artefacts** rather than defects — a misleading chart, a miscounted test
  baseline, and an assumed telemetry-delivery failure that the code disproved.
  Each was withdrawn on evidence. The review must be equally willing to conclude
  that a criterion was met for the wrong reason, or that the instrument was
  wrong, rather than defending the spec.

## Phased delivery

Two tracks. The unicorn track and the waiting track are independent and can run
in parallel; within each, order matters because measurement precedes the fix.

**Unicorn track — the dead end.**

- **Phase 1 — See it.** FR-001, FR-002, FR-006, FR-014, FR-015. The canonical
  event with a cause taxonomy and the privacy prohibitions enforced. Ships value
  immediately: the untagged 19 become classifiable.
- **Phase 2 — Explain it.** FR-003, FR-004, FR-005. Build identity, staleness
  verdict, client state. This is what removes manual diagnosis.
- **Phase 3 — Cure it.** FR-007 through FR-011, FR-013, FR-016. The recovery
  ladder, the incident code, and outcome measurement.
- **Phase 4 — Speak plainly.** FR-012. Translation and copy review.

**Waiting track — the silent hang.**

- **Phase A — Count it.** FR-018. Client request instrumentation only, no
  behaviour change. This establishes the user-harm baseline that does not exist
  today, and it MUST land before Phase B (D9). It is the only slice in this spec
  that changes nothing a caregiver can see, and it is the one that makes the rest
  provable.
- **Phase B — Bound it.** FR-019, FR-021, FR-022. Cancellation of reads at a
  justified bound, with writes deliberately excluded.
- **Phase C — Recover in place.** FR-020. Every bounded-out request resolves to a
  recoverable state, and D8 is pinned by tests so a later refactor cannot quietly
  route timeouts into the unicorn.

**Detection — FR-017** spans both tracks and can land once either track emits a
countable event.

Phases 1, 2 and A are independently valuable and MUST NOT be blocked on the
recovery work.

### Amendment 2026-08-04 — Phase B shipped before Phase A, in breach of D9

Recorded as a violation rather than folded into the plan, because a spec that
quietly rewrites itself to match what happened stops being able to hold anything
to account.

**What happened.** The read bound (FR-019, FR-021, and part of FR-020) was
implemented, reviewed and merged to production before FR-018 instrumentation
existed. D9 and FR-018 both require the reverse order. Nothing caught it: no
gate enforces phase ordering, and the pull request was assessed on its own merits
rather than against the spec's sequencing.

**The reasoning that was offered, and why it was only half right.** The argument
for merging was that the bound is a safety floor sitting well above the slowest
legitimate read, so caregivers who abandon a wait do so far below it and remain
observable. That much holds. What it missed is that the harm which motivated the
waiting track is not early abandonment but the **unbounded tail** — requests that
never returned at all. Those are now cancelled at the bound, so the distribution
of waits above it can never be observed. The before-figure is gone.

**What is lost, and what survives.** Lost: the *duration* of waits beyond the
bound, and therefore any statement of the form "waits ran to N minutes before,
and are capped now". Surviving: the *incidence* of bound-hits, which remains a
usable proxy for how often a caregiver would have been stranded, provided
FR-018 records bound-cancellation as a state distinct from ordinary failure.
FR-018 MUST therefore distinguish completion, failure, user abandonment and
bound-cancellation. Conflating the last two destroys the only remaining signal.

**What still binds.** D9 is unchanged and applies with full force to any future
*tightening* of the bound under OD-7. The floor was cheap to get wrong; a bound
set at a caregiver-acceptable value is not, because that is the change whose
effect the programme will actually need to demonstrate. Tightening ships only
after FR-018 data exists.

**The governance point.** This is the second time in this spec's short life that
sequencing failed silently — OD-6 recorded the first. Phase ordering is stated in
prose and enforced by nobody. Any future spec that depends on a "measure first"
ordering should assume the same failure until something in the pipeline makes
the ordering visible at review time.

### Amendment 2026-08-05 — FR-012 and FR-015 are in tension

Surfaced during phase 1 delivery, before phase 4 starts, and recorded here so
that phase 4 opens with the conflict already visible rather than discovering it
mid-implementation.

**The conflict.** FR-012 requires every user-facing string on the fatal page to
be translated. FR-015 requires that page to render, capture and offer recovery
*when application services are unavailable*. The obvious way to satisfy FR-012
is to resolve copy through the application's runtime translation service — which
is an application service, and therefore exactly what FR-015 forbids the page to
depend on. Satisfying either requirement naively defeats the other.

**Why this is not hypothetical.** The failure mode the page exists to survive
includes a partially initialised application. A translation runtime that has not
loaded, or whose locale bundle was fetched from a stale build, is a plausible
cause of arriving at the page in the first place. Copy that resolves through it
would render blank or as raw keys precisely when a caregiver most needs a
sentence they can act on — and a blank fatal page is worse than an untranslated
one.

**The constraint on phase 4.** Phase 4 MUST deliver translated copy without
introducing a runtime service dependency on the fatal surface. The mechanism is
the delivering repository's decision, but it MUST hold two properties: copy
resolution cannot fail in a way that leaves the page without a readable message
and a usable recovery action, and an unresolvable locale MUST fall back to
English rather than to a key or to nothing. If those cannot both be met, FR-015
wins and FR-012 is deferred with that fact recorded — an untranslated page that
works outranks a translated page that might not render.

**Standing note for reviewers.** Until phase 4 lands, hardcoded English on this
page is expected, not an oversight, and a review that flags it as a defect is
reading the wrong phase. The strings predate this spec.

### Amendment 2026-08-05 — FR-005 gains a sixth service-worker state

FR-005 originally fixed the service-worker state at five values: active,
waiting, installing, unsupported, disabled. Phase 2 added a sixth, `unresolved`,
and it is now part of the requirement.

The reason is the one OD-2 already gives for `unavailable`. Those five values are
all *findings* — each asserts something established about the registration. A
lookup that throws, rejects or times out establishes nothing, so reporting any of
the five would be a false claim, and reporting nothing would be blank, which
FR-003 forbids on the same grounds. `unresolved` is the honest answer, and it is
also the operationally useful one: a rising `unresolved` rate is itself a signal,
whereas a lookup failure disguised as `disabled` is indistinguishable from a
caregiver who genuinely has no worker registered.

Two things are worth recording about how this arrived, because the process
matters as much as the value.

The implementation proposed the sixth value and **disclosed it explicitly** as an
extension rather than shipping it inside a diff. That is the behaviour this spec
wants. An implementation that widens a fixed taxonomy silently leaves the code as
the real specification and this document as fiction — which is exactly the failure
the 2026-08-05 amendment to FR-002 was written to prevent. Disclosure is what
makes the extension reviewable.

The corollary is that disclosure alone does not settle anything. It was only half
the job; the requirement was not actually amended until this section was written.
A spec that lags what production emits is not a lesser problem than code that
drifts from its spec — it is the same problem seen from the other end.

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
  skew auth rather than staleness — consistent with every measured stale-build
  case being desktop.
- **R6 — Cause taxonomy sprawl.** An open-ended set becomes unqueryable.
  Mitigation: closed set, extended deliberately.

## Constitution Check

- **I. Patients & caregivers come first (NON-NEGOTIABLE)** — Aligned, and the
  primary motivation. A caregiver stranded for half an hour by a button incapable
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

Spec 034 (*auth-failure observability & diagnosability*, authored 2026-07-13) sat
at `status: draft` and never fanned out. It was **superseded on 2026-08-05**
without being delivered as written. Much of it was nonetheless delivered through
incident-driven work. The client-side position was **verified against the code on
2026-08-04**, not assumed:

| 034 requirement | state today |
|---|---|
| FR-007 native reporting + flush before backgrounding | **delivered** — flushes on page-hide and on the native backgrounding events |
| FR-008 correlation id + client version on every call | **delivered**, with tests |
| FR-009 startup + auth-lifecycle breadcrumbs | **delivered** — startup, auth-guard, patient-resolution and native-auth breadcrumbs all emit |
| FR-011 no authed call before a real token | **substantially delivered** — refresh tokens enabled, silent-token probe, and an explicit skipped-because-unauthenticated signal |
| FR-012 a resolver failure must never brick the app **or reach the unicorn** | **half delivered** — it no longer hangs, but it now routes to the unicorn, which 034 explicitly forbade |
| FR-013 proactive rate alert | **not delivered** |

Two things are therefore carried into this spec rather than left in a stalled
draft: **FR-012's principle**, as D7, and **FR-013's alert**, as FR-017.

The backend half of 034 (FR-001–FR-006, rettxapi auth-failure shaping) is
untouched by this spec and was **not** inherited by it. When 034 was superseded on
2026-08-05 that half was deliberately dropped rather than re-specified — the draft
was over three weeks old and the programme chose to move on rather than keep it
alive. It is nobody's outstanding commitment. If the behaviour is still wrong it
will surface as a bug and be handled on its own merits.

Reviewers should read one consequence of that into OD-3: the `auth` cause has no
producer today and none is scheduled, so it stays structurally zero for the same
reason `network` does. A zero there is not evidence that auth failures are rare.

The governance lesson is worth stating plainly, because it cost the programme the
same incident twice: 034 was correct, was never wrong, and stalled anyway — on
four unanswered questions. Nothing in the pipeline makes a quiet draft visible,
and silence is indistinguishable from success. That gap is not fixed here; it is
raised as OD-6.

## Out of scope

- **Preventing** stale-build failures at their source, rather than surviving
  them. That is tracked in the implementing repo. This spec makes the failure
  survivable; stopping it happening is separate work.
- Prompting for updates earlier — tracked in the implementing repo.
- The racy navigation guard behind the burst behaviour, in flight separately.
- Patient identifiers appearing in **server-side** operation names — a rettxapi
  route-template concern, related but distinct.
- Redesigning the unicorn illustration or the empathetic tone. Both are working.

## Open decisions

- **OD-1** ~~What is the build identity mechanism?~~ **Resolved 2026-08-04 — a
  value injected at build time, distinct from the release version.** The release
  version cannot serve: two deploys of the same version are indistinguishable by
  it, which is exactly the case FR-003 exists for. Any mechanism that depends on
  the service worker also cannot serve, because the worker is absent on the
  native surface by design, and FR-003 forbids blank. One requirement is
  cross-cutting and stays here: **the build MUST fail if the identity is not
  substituted**, so "blank is impossible" is enforced rather than merely
  intended. How the value is injected and guarded is the implementing repo's
  choice.
- **OD-2** ~~Is the staleness check eager or lazy?~~ **Resolved 2026-08-04 —
  eager.** Lazy is circular: it proposes checking staleness only where staleness
  is plausibly relevant, but the verdict is frequently *what establishes* the
  cause, so the input cannot be gated on the output. Eager costs one request on
  a page that has already failed. Where the surface has no served build to
  compare against, the verdict MUST be `unavailable` — never `fresh`, which
  would be a lie, and never blank.
- **OD-3** ~~What is the initial cause taxonomy?~~ **Resolved 2026-08-04 —
  `stale-build`, `auth`, `data-load`, `network`, `unknown`.** None of the
  producers passes a cause at present, which is precisely why FR-014 requires
  that an untagged producer surface as `unknown` rather than as silence. `auth`
  stays a single bucket until the classifier work lands; splitting it now would
  invent distinctions the data cannot support.

  **Justification corrected 2026-08-05. The values stand; the reasoning given
  for them did not.** The original wording claimed the set was "grounded in the
  producers that route to the page today rather than in anticipated ones". That
  is false for two of the five. Phase 1 delivery established that exactly two
  producers route to the fatal page, yielding `stale-build`, `data-load` and
  `unknown`. `auth` is not among them — authentication failures are deliberately
  routed away from this page — and nothing produces `network` at all. Both
  describe anticipated producers, which is the thing that sentence disclaimed.

  **The values do not change**, for two reasons. A bucket that reads zero is
  itself a finding, whereas a value never defined records nothing. And trimming
  the set to today's producers would make the taxonomy a moving target across
  the observation window, defeating the comparison the window exists for. What
  changes is the claim: the set is grounded in the failure modes this programme
  expects to distinguish, two of which are not yet reachable. Any review of the
  cause distribution MUST read `auth` and `network` as structurally zero, not as
  evidence that those failures do not occur.
- **OD-4** ~~Should the incident code be the correlation id, a truncation of it,
  or a separate value?~~ **Resolved 2026-08-04 — a separate per-incident value,
  emitted alongside the existing correlation id.** That id is scoped to the
  install and persists across sessions by design, so every unicorn on a device
  shares it permanently. FR-007 requires a code that resolves to **the exact
  event**, and an install-scoped id resolves instead to a device's entire
  history; a truncation is strictly worse, being shorter and still not unique.
  Emitting both is not redundancy — one gives support the history, the other
  points at the row being discussed.
- **OD-5** ~~Does rettxadmin have a fatal-error surface today?~~ **Resolved
  2026-08-04 — no, and its slice is phase 2, gated.** Neither offered answer
  ("small or merely tiny") was right, because both assumed an existing surface to
  extend. There is none: rettxadmin would be creating one, and the prerequisites
  for doing so are a body of work in their own right rather than a slice of this
  spec. The two apps also serve different populations — caregivers and staff —
  and this spec is named for the first. rettxadmin is **kept in scope by
  decision**, but explicitly **phase 2 and gated on its prerequisites**, so the
  caregiver-facing surface is never held up behind a staff tool. Read the
  fan-out with that asymmetry in mind: these are not comparable slices of the
  same work. What those prerequisites are, and how they are met, belongs to
  rettxadmin's own repo and constitution.
- **OD-6** ~~How does the programme surface a spec that is authored, correct and
  **stalled**?~~ **Resolved 2026-08-04.** `scripts/status.mjs` now reports every
  `draft` spec with the number of days since it was last edited, sorted
  oldest-first, and flags any untouched for 21+ days. Run against this spec it
  immediately named 034 at 22 days — the precise case that prompted the
  question. Two rejected alternatives, recorded so they are not re-proposed: a
  **scheduled workflow** cannot live here, because `rettx` is public and Actions
  logs are world-readable, so a job reading the private repos would publish
  their contents (patterns.md §11); and a **decision-by date in frontmatter**
  puts the burden on the author at the moment they care least, and goes stale
  silently exactly like the spec it is meant to police. Last-edited is derived
  from git, so it cannot drift from reality or be forgotten. It is deliberately
  a prompt to a human, not a gate: a draft under active argument is healthy, and
  only silence is the signal.
- **OD-7 and OD-8 are DEFERRED PENDING FR-018, not blocking.** Recorded
  2026-08-04, when this spec was moved to `ready`. Neither can be answered from
  the evidence that exists, and the instrument that would answer them is
  FR-018 — which only gets built once this spec fans out. Holding the spec in
  `draft` until they are settled therefore makes them permanently unanswerable.
  That is exactly how spec 034 stalled, and repeating it here would reproduce
  the failure this spec was written to explain. They are recorded as open
  questions with provisional answers, and revisited at the 30-day review against
  FR-018 data.
- **OD-7 and OD-8 are coupled, and cannot be answered separately.** The slowest
  legitimate read yet measured has a tail extending well
  beyond ten seconds. Any *uniform* bound must clear that, or it kills
  healthy requests. So "30 s is too long to ask a caregiver to wait" and "one
  bound for every read" **cannot both hold** — shortening the wait necessarily
  means per-class bounds. Answering either one in isolation silently decides the
  other.
- **OD-7** What is an acceptable caregiver wait? Deferred **by
  design rather than by neglect**: D9/FR-018 require instrumentation before
  enforcement, and the server-side evidence cannot answer this question, because
  it measures requests that completed rather than caregivers who gave up. 30 s
  stands as a **provisional safety floor** — explicitly not a settled answer to
  what a caregiver should be asked to tolerate. Revisit once FR-018 data exists,
  and record the number with its reason. Affects FR-022.
- **OD-8** Uniform or per-class? Deferred on the same basis, with two things
  already settled so that deferring costs nothing. First, **uniform is the
  starting rule** — it matches the implementation already in flight, so no slice
  is blocked waiting for this answer. Second, whichever is eventually chosen,
  **FR-018 instrumentation MUST record enough
  per-route-class detail from the first day it ships**. If it does not, choosing
  per-class later means re-instrumenting and waiting out a second observation
  window — so the cheap option now forecloses the better option later. The
  scope/evidence mismatch (measurement covers medication routes, the
  rule covers every read) is then closed by the widened measurement rather than
  by narrowing the rule.

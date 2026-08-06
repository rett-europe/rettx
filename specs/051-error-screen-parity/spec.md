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
  as a native Android app (iOS planned) — treat as a NATIVE MOBILE SURFACE. The
  Angular service worker is deliberately DISABLED on native, so any
  cache-releasing limb of a recovery action is web/desktop-only and MUST no-op
  safely on native. No API change: everything here is client-emitted telemetry
  and client-side behaviour, reusing the diagnostic payload established by spec
  049. There is therefore NO rettxapi slice, no schema change, and no
  `templates` slice.
-->
---
spec_id: "051"
slug: "error-screen-parity"
title: "No error screen may trap a caregiver, and none may go unseen"
status: ready   # draft | ready | accepted | superseded
authored: "2026-08-06"
author: "perocha"
relates_to: "specs/049-unicorn-diagnostics-recovery/ (established the treatment this spec generalises, and left the gaps this spec closes); specs/034-auth-observability/ (per-install correlation id)"
fanout:
  - repo: rettxweb
    summary: |
      PRIMARY AND ONLY IMPLEMENTER. Spec 049 fixed ONE caregiver-facing error
      screen. There are five, and the other four were never touched. This spec
      generalises 049's treatment to all of them, and closes the arrival route
      049 did not model.

      What is true today, verified in the codebase on 2026-08-06 rather than
      assumed:
      (a) Four error screens emit NO telemetry at all. The programme cannot
      count how often a caregiver hits them, so their harm is not merely
      unmeasured — it is unmeasurABLE.
      (b) Each offers exactly one action: a link to the application's start.
      That is the same placebo 049 removed from the fifth screen, for the same
      reason — it cannot change the failing state, and where the start is what
      failed it returns the caregiver to the failure.
      (c) All four are hardcoded English. 049 translated the fifth. A Spanish
      caregiver meeting any of the other four gets English.
      (d) They address the caregiver in raw HTTP status codes.
      (e) They render shared application chrome, so a screen whose job is to
      survive the application's failure depends on that application.

      Do, IN THIS ORDER:
      (1) OBSERVE FIRST, change nothing else (FR-001, FR-002, FR-003). Ship the
      canonical per-screen record before altering any recovery action. 049
      breached this ordering once already and permanently forfeited a
      before-figure; do not repeat it. There is currently NO baseline for these
      four screens and it cannot be reconstructed later.
      (2) Read the reason when one is handed to us (FR-004). Where a caregiver
      is delivered to an error screen by another system that states why, that
      reason MUST be captured instead of discarded and reported as unknown.
      (3) THEN give every screen a recovery that can plausibly change the
      failing state (FR-005, FR-006, FR-007).
      (4) Translate every screen (FR-008) and speak to caregivers in language
      they can act on, not status codes (FR-009).
      (5) Make each screen independent of the application it reports on
      (FR-010).

      Do NOT: emit the record from the producer rather than the screen (049's
      D1 applies unchanged); add a free-text "what happened?" field; log raw
      URLs, un-normalised routes, or any value carried on the arrival that has
      not been checked for personal data (FR-011); or treat the fifth screen's
      implementation as a proven pattern to copy wholesale — see R1.
---

## Problem

Spec 049 was written about one screen. It did its job: that screen is now
observable, offers a recovery matched to the cause, is translated, and no longer
depends on the application whose failure it reports.

There are five caregiver-facing error screens. **049 fixed one.** The other four
were never in its scope and remain exactly as they were, and they share a shape
that 049 spent a whole specification establishing is harmful.

This is not a criticism of 049's scope, which was deliberate and correct. It is
the observation that a caregiver does not know or care which screen they landed
on. The promise 049 made — *the app must never trap a caregiver* — is only kept
on one fifth of the surface where it can be broken.

### What is true today

Verified by reading the implementation on 2026-08-06, not inferred:

| | Fifth screen (049) | The other four |
|---|---|---|
| Appearance recorded | yes | **no telemetry at all** |
| Recovery offered | cause-aware, measured | a single link to the start |
| Language | `en` + `es`, English fallback | **hardcoded English** |
| Independent of the app | yes, guarded in CI | **renders shared app chrome** |

Each of the four is a template of a handful of lines and a class with no
behaviour. They are not badly implemented; they were never implemented at all
beyond a placeholder, and nothing has ever told us they matter.

### The four failures, stated separately

**1. They are invisible.** No record is emitted when they appear. The programme
cannot say how many caregivers met one yesterday, or ever. This is worse than an
unmeasured problem: an unmeasured problem can be measured retrospectively once
someone thinks to look, whereas here **there is nothing to look at**. Every day
that passes without instrumentation is a day permanently absent from the record.

**2. They are dead ends.** The single offered action returns the caregiver to
the application's start. Spec 049 established at length why that is a placebo:
it cannot change the failing state, and it re-enters through the surface that
just failed. That reasoning was never screen-specific. It applies here
identically and was simply never carried across.

**3. They speak English only.** 049 required the fifth screen be translated
because meeting a wall of a foreign language at the moment something breaks
compounds the failure. The same argument applies unchanged to the other four,
which today greet a Spanish-speaking caregiver in English.

**4. They speak in status codes.** The copy leads with a raw HTTP status number
and its protocol-level description. That is a developer's vocabulary. It tells a
caregiver nothing they can act on, and it invites them to report the number
rather than what they were trying to do.

### The arrival 049 never modelled

049 assumed a fatal screen is reached because something threw an error, and
built its machinery on that assumption: a producer catches a failure, classifies
it, and hands over a cause.

Production says otherwise. In a three-day sample, **most arrivals at the fatal
screen carried authentication error parameters** supplied by the authentication
provider. The sequence is: a caregiver's session cannot be silently renewed, the
authentication provider itself navigates the browser to the configured error
destination, and it states the reason in the arrival.

**Nothing throws.** No producer runs. None of 049's classification machinery is
involved. The screen reports the cause as unknown while the actual reason sits,
unread, in the arrival that delivered the caregiver there.

Two consequences, both real:

- The programme's dominant real-world route onto a fatal screen is recorded as
  `unknown`, so the `unknown` rate — which 049 designed as the signal that a
  producer is failing to tag — is instead dominated by a route that has no
  producer to tag it.
- The recovery offered is chosen for `unknown` rather than for the actual
  condition. For an expired session the action that can resolve it is to
  authenticate again. That is a specific, available action, and it is not the
  one being offered.

### Why this cannot wait for the signal to prove itself

049's canonical event **has never been observed firing in production.** That is
recorded honestly on its own issue, and it is not evidence that the event is
broken — the emitting build went live after the last observed arrival, so the
post-deployment sample is zero and the absence is currently unfalsifiable.

It does mean this: **the programme has one instrumented error screen whose
instrumentation has never been seen to work, and four with none at all.** The
correct response is not to wait, because waiting produces no information from
the four uninstrumented screens either way. Instrumenting them is what makes the
silence interpretable — if all five stay silent, that points at emission; if the
four report and the fifth does not, that points somewhere much more specific.

## What changes

- Every caregiver-facing error screen emits one canonical record when it
  appears, identifying which screen and why, using the diagnostic payload spec
  049 already established.
- A reason supplied by whatever delivered the caregiver to the screen is read
  and recorded rather than discarded.
- Every screen offers at least one action capable of changing the failing state.
  For an expired or invalid session, that action re-authenticates.
- Every screen is translated with the existing English fallback, and addresses
  the caregiver in terms of what happened and what to do, not a status code.
- No error screen depends on the application whose failure it is reporting.

## Decisions

- **D1** The record is emitted **by the screen, after it renders** — never by
  whatever decided to show it. This is 049's D1, restated because it must not be
  re-litigated per screen. A producer-level record counts only the paths that
  remembered to emit one; a screen-level record is complete by construction and
  cannot be bypassed by a route added later. The authentication-redirect arrival
  is the proof: it has no producer at all, and a producer-level record would
  miss the programme's most common real route entirely.
- **D2** Instrumentation ships **before** any change to recovery behaviour, as
  a separate increment. 049 breached this ordering once and permanently lost a
  before-figure; that breach is recorded in its own amendment. There is no
  baseline for these four screens today and none can be reconstructed after the
  fact.
- **D3** One treatment for all screens, not five bespoke ones. The differences
  between them are in *what to offer*, not in *whether to observe, translate, or
  offer anything at all*.
- **D4** A reason handed to us on arrival is **evidence to be read**, not a
  string to be displayed. It is captured for diagnosis and used to select a
  recovery. It is not rendered to the caregiver, which would reintroduce
  developer vocabulary through a different door and risks displaying content the
  application did not author.

## User Scenarios & Testing *(mandatory)*

1. **A caregiver's session expires while the app is open.** They are delivered
   to an error screen by the authentication provider, which states the reason.
   The screen records that reason, and offers to sign in again. Signing in
   returns them to the app. It does not offer a link to a start page that will
   fail the same way.
2. **A caregiver follows a stale link to something that no longer exists.** The
   screen is recorded. The caregiver is told, in their own language and without
   a status code, that the page is not there, and is offered a way onward that
   works.
3. **The server fails a request the caregiver made.** The screen is recorded
   with enough context to correlate to the failure. The caregiver is offered a
   retry of what they were doing, not only a return to the start.
4. **A Spanish-speaking caregiver meets any of the five screens.** They read it
   in Spanish. Where a translation is missing, they read English rather than a
   key or a blank.
5. **The application is broken badly enough that its shared components cannot
   render.** The error screen still appears, still records, and still offers its
   action.
6. **Regression: none of the five screens can produce an error that routes to
   another error screen**, including the screen itself.

## Requirements *(mandatory)*

### Observe

- **FR-001** Every caregiver-facing error screen MUST emit exactly one canonical
  record when it appears, emitted by the screen itself after it renders.
- **FR-002** The record MUST identify **which** screen appeared, so screens
  cannot be conflated in analysis, and MUST carry the diagnostic context already
  established by spec 049 rather than inventing a parallel payload.
- **FR-003** Instrumentation MUST ship as an increment that changes no other
  observable behaviour, and MUST be in production long enough to establish a
  baseline before recovery behaviour is altered.
- **FR-004** Where a caregiver is delivered to an error screen by a system that
  states a machine-readable reason, that reason MUST be captured and recorded.
  It MUST NOT be reported as `unknown`, and MUST NOT be displayed verbatim to
  the caregiver.

### Recover

- **FR-005** No error screen may be a dead end. Each MUST offer at least one
  action capable of changing the failing state.
- **FR-006** A link to the application's start MUST NOT be the only action
  offered where the start is itself capable of producing the same failure.
- **FR-007** Where the recorded condition is an expired or invalid session, the
  offered action MUST be to authenticate again.
- **FR-012** Whether a recovery action succeeded MUST be observable, so the
  escape hatch can be proven to work rather than assumed to.

### Quality

- **FR-008** All copy on every error screen MUST be translated, `en` and `es` at
  minimum, with the existing English fallback preserved.
- **FR-009** Copy MUST describe what happened and what the caregiver can do. It
  MUST NOT lead with a protocol status code or its protocol-level description.
- **FR-010** An error screen MUST NOT depend on the application whose failure it
  is reporting: it MUST render, record and offer its action when application
  services are unavailable, and MUST NOT be capable of producing an error that
  routes to an error screen.

### Privacy

- **FR-011** Values carried on an arrival MUST NOT be recorded wholesale. Only
  values checked and known to be free of personal data may be captured; raw
  URLs and un-normalised routes MUST NOT be logged.

## Success Criteria *(mandatory)*

- **SC-1** Every caregiver-facing error screen is observable: for each of the
  five, at least one recorded appearance can be produced on demand in a test
  environment, and the record identifies the screen correctly.
- **SC-2** A baseline exists. After the observation increment has been live for
  a stated period, the programme can state how often caregivers meet each
  screen. Today that number does not exist for four of five.
- **SC-3** The share of fatal arrivals recorded as `unknown` falls, and the
  authentication-redirect route is separately identifiable in the record rather
  than absorbed into `unknown`.
- **SC-4** Every screen offers an action that can change the failing state,
  demonstrated per screen rather than asserted.
- **SC-5** No screen presents a protocol status code as its heading, and every
  screen renders in `es` as well as `en`.

### Measurement plan

Measure with **one instrument**, before and after. Spec 049's criteria were
measured from one source and are to be assessed against another, which makes its
before and after figures not directly comparable; that lesson is inherited here
deliberately. Every criterion above is assessed against the canonical record
introduced by FR-001, and no criterion is baselined against a different source.

Because no baseline exists for four of the five screens, SC-2's "before" figure
is **zero by absence, not by measurement**, and MUST be described that way
rather than reported as an improvement from zero.

## Phased delivery

- **Phase 1 — observe.** FR-001 through FR-004. No behaviour change. This phase
  is independently valuable: it converts an unmeasurable harm into a measured
  one, and it makes 049's unproven signal interpretable.
- **Phase 2 — recover.** FR-005 through FR-007, FR-012. Gated on Phase 1 having
  produced a baseline.
- **Phase 3 — quality.** FR-008 through FR-010. Independent of Phases 1 and 2
  and MUST NOT be blocked behind them.

## Risks

- **R1** *049's implementation is treated as a proven template.* Its canonical
  event has never been observed firing. Copying it wholesale would propagate a
  possible emission defect to four more screens and then report the resulting
  silence as good news. Mitigation: Phase 1 must demonstrate a recorded
  appearance on demand (SC-1) rather than infer success from an absence of
  errors.
- **R2** *The authentication-redirect route is treated as an error to be fixed
  rather than a state to be handled.* An expired session is normal and expected.
  The defect is that it lands on a screen that neither understands nor resolves
  it — not that it happens.
- **R3** *Instrumenting four screens produces four bespoke implementations.*
  Mitigation: D3, and a single shared treatment.
- **R4** *Phase 2 ships before Phase 1 has produced a baseline*, repeating 049's
  recorded ordering breach. Mitigation: D2 and the Phase 2 gate.
- **R5** *A reason captured from an arrival carries personal data.* Mitigation:
  FR-011 — capture only checked values, never the whole arrival.

## Constitution Check

- **Principle I — caregiver first.** This spec exists because four of five error
  screens currently leave a caregiver with nothing that works.
- **Principle II — privacy.** FR-011 narrows what may be captured from an
  arrival, and D4 keeps unauthored content off the screen.
- **Principle III — evidence.** Phase 1 exists precisely so that Phase 2 is
  decided from measurement rather than assumption.

## Assumptions

- The five screens named here are the complete set of caregiver-facing error
  surfaces in the caregiver application as of 2026-08-06. Any surface added
  later inherits these requirements.
- The diagnostic payload established by 049 is adequate for these screens and
  does not need extending. If it does, that is an amendment here, not a parallel
  payload.

## Out of scope

- The staff-facing application. Spec 049's OD-5 kept it in scope but gated; this
  spec does not change that and does not fan out there.
- Making error-screen copy maintainable by translators without a developer.
  This is a real limitation, accepted knowingly on 049 and unchanged here: copy
  that must survive the application's failure cannot depend on the
  application's translation machinery. Recorded so it is not mistaken for an
  oversight.
- Silent hangs, bounded waiting, and request instrumentation. Delivered by 049.
- Any change to the authentication provider's configuration or to what it sends.
  This spec reads what already arrives.

## Open decisions

- **OD-1** For a failed request, is the right recovery a retry of the original
  action, or a return to the last working state? Retry is more direct but is
  only safe where the action is repeatable without side effects.
- **OD-2** Should the four remaining screens converge onto a single screen with
  differing content, or stay as separate screens sharing one treatment? Fewer
  screens is less to keep consistent; separate screens are less likely to
  regress each other.
- **OD-3** How long must Phase 1 run before its baseline is considered
  established? Long enough to cover normal caregiver rhythm, but the programme
  has no measured seasonality to justify a specific figure.

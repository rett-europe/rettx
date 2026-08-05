<!--
  Frontmatter below is machine-read by .github/workflows/spec-fanout.yml when
  this spec is merged into main. Fanout only runs when status is `ready` or
  `accepted` — while `draft` nothing fans out, so it is safe to review and
  iterate. Flip `status: ready` when agreed and you want the squad issues
  opened on merge.

  Allowed fanout repos: rettxweb, rettxadmin, rettxapi, rettxmutation, rettxid,
  templates.

  STACK & DELIVERY PRE-FLIGHT (patterns.md §7): this spec changes BOTH client
  and backend behaviour. rettxweb = Angular 18+ standalone PWA wrapped with
  Capacitor as a native Android app (iOS planned) — treat as a NATIVE MOBILE
  SURFACE, so every requirement below must hold on the mobile treatment view as
  well as the desktop one; the two are separate implementations of the same
  chart and the defects were confirmed present in both. rettxapi = Python 3.11+,
  FastAPI, Azure Functions v4, Cosmos DB; the reads behind this chart are
  already single-partition and correctly indexed, so nothing here asks for a
  data-model or indexing change. rettxadmin is not affected: the treatment chart
  is a caregiver surface and admin has no equivalent view. No `templates` slice
  — the printable sheet is out of scope (see Out of scope).
-->
---
spec_id: "050"
slug: "treatment-timeline-render"
title: "The treatment chart must paint once, completely, and stay put"
status: ready   # draft | ready | accepted | superseded
authored: "2026-08-05"
author: "perocha"
relates_to: "specs/046-medication-regimen/ (introduced the treatment chart and the medication regimen model this spec repairs); specs/049-unicorn-diagnostics-recovery/ (client request instrumentation, and the principle that a caregiver is never left staring at an unresolved surface); .specify/memory/patterns.md §3 API contract ownership"
fanout:
  - repo: rettxweb
    summary: |
      PRIMARY IMPLEMENTER for what the caregiver sees. Three tracks. Tracks 1
      and 2 are self-contained and do NOT depend on the rettxapi slice; track 3
      does.

      TRACK 1 — the chart must not rearrange itself. Today the chart is built
      from two separate row collections: one for rows whose data has arrived and
      one for rows still waiting. A row that arrives late is therefore removed
      from the waiting group and re-created in the arrived group, which moves it
      on screen. Caregivers see rows jump position several seconds after the
      chart first appears. Do: render ONE ordered collection of rows, in the
      order the backend supplied, established before any per-row data resolves,
      and switch only the CONTENT of a row between its waiting and resolved
      states. A row MUST occupy the same position from first paint until the
      caregiver leaves the screen. This must hold however out-of-order or
      delayed the underlying responses are — the ordering guarantee must not
      depend on response timing. Pin it with a test that resolves rows out of
      order, including two rows carrying the SAME displayed medication name with
      different identities, asserting the rendered order never changes.

      TRACK 2 — a row that is still loading must look like it is loading. The
      waiting state currently renders as blank space, so a caregiver reads it as
      "no treatment recorded" rather than "not loaded yet" — a clinically
      misleading reading of a medication chart, and the reason this was reported
      as missing data rather than as slowness. Do: give every unresolved row a
      visible, non-empty loading treatment, clearly distinguishable both from
      "in treatment" and from "no treatment", carrying an accessible name so it
      is not silent to assistive technology. Verify it RENDERS — the current
      defect is an intended loading state that resolves to nothing visible,
      which no test caught.

      TRACK 3 — stop issuing one request per medication. Once rettxapi ships the
      batched shape below, obtain the chart's data in a single request and
      remove the per-row fan-out. Do NOT withhold the whole chart behind a
      single slow response as a substitute for tracks 1 and 2; those must hold
      on their own merits.

      Do NOT: "fix" the reordering by sorting client-side — the backend order is
      already correct, and a client sort would mask the real defect while adding
      a second source of truth for ordering. Do NOT remove the per-row requests
      before the batched shape exists; they are load-bearing today (see D1).
  - repo: rettxapi
    summary: |
      Two independent slices.

      SLICE 1 — let the client fetch a patient's medication chart in one
      request. Today the list of a patient's medications returns only each
      medication's CURRENT state, while the chart must depict earlier periods
      too. The client therefore has no way to draw the chart without issuing a
      further request per medication, and a patient on eight medications costs
      nine round trips. This is a contract gap, not a client defect. Do: provide
      a way to obtain the medications together with their full recorded history
      in ONE request. Additive and backward compatible — existing request and
      response shapes MUST keep working unchanged, because other surfaces depend
      on them. The per-medication history route stays; this does not replace it.

      SLICE 2 — expected client errors must stop being recorded as exceptions.
      Every response at or above 400 that reaches the request wrapper is
      currently recorded as a synthetic exception with a stack trace and an
      error-marked span. Ordinary, expected outcomes — a resource that does not
      exist, a malformed identifier, a request that fails authorisation — are
      therefore indistinguishable in telemetry from genuine faults. This
      actively harms the programme's ability to see real failures and distorts
      any alerting derived from exception rate. Do: record expected client-error
      outcomes as structured, queryable events carrying status and reason, NOT
      as exceptions. Reserve exception recording, stack capture and error-marked
      spans for outcomes the API did not expect. Server-side faults MUST
      continue to be recorded as exceptions.

      Do NOT change how the API answers an unknown or malformed patient
      identifier. That behaviour was reviewed during this investigation and
      found correct: identifier format is validated before any lookup, an access
      grant is required before existence is ever tested, and a caller therefore
      cannot use these routes to discover which patients exist. It must stay
      that way — a "clearer" error here would turn a sound privacy property into
      an enumeration oracle. See D4.
---

# Feature Specification: The treatment chart must paint once, completely, and stay put

**Feature Branch**: `spec-050-treatment-timeline-render`
**Created**: 2026-08-05
**Status**: Ready
**Input**: Reported by the programme owner: the treatment chart takes several
seconds to render on both mobile and desktop; some medications appear without
their treatment periods drawn, and after roughly ten seconds those rows fill in
and move from the bottom of the chart into their proper position.

## Problem

A caregiver opens the treatment chart and watches it assemble itself. Some
medications appear immediately with their treatment periods drawn. Others appear
as a name with **empty space** where their treatment periods should be. Several
seconds later — around ten in the reported case — those rows fill in and **jump
to a different position**, pushing everything else down.

Three things are wrong here, and only one of them is slowness.

**The chart tells the caregiver something untrue.** A medication row with a
blank track does not read as "still loading". On a medication chart it reads as
*"this drug has no recorded treatment"*. For the several seconds it persists,
the caregiver is looking at a clinically misleading statement about their
daughter's treatment. This is why the behaviour was reported as rows being left
without their data, rather than as a performance problem.

**The chart rearranges itself under the caregiver's eyes.** Rows do not settle
into place; they move after the fact. A caregiver who has begun reading the
chart, or has reached out to tap a row, has the content shift beneath them.

**And it is slow.** The chart cannot be drawn from one request. The list of a
patient's medications carries only each medication's current state, but the
chart depicts a window of weeks or months, during which doses were changed and
drugs were started and stopped. Every one of those earlier periods must be
fetched separately, one request per medication. A patient on eight medications
costs nine round trips before the chart is complete, and the chart is only as
fast as the slowest of them.

These compound. The requests are what make the delay long enough to notice; the
missing loading state is what makes the delay look like missing data; and the
two-collection rendering is what makes the recovery look like the chart
scrambling itself.

**None of this is a data problem.** The medications are correct, their order is
correct, and the chart is correct once settled. What is broken is that the
caregiver is shown a sequence of incorrect intermediate states on the way there.

### What this is not

This investigation began from three plausible theories, all of which turned out
to be wrong. They are recorded because each would have produced a confident,
wasted fix, and because the next person to look at this will think of them too.

- **Not late name resolution.** Medication names arrive with the first response;
  nothing looks them up separately.
- **Not a collision between two prescriptions of the same drug.** The reported
  case had the same drug recorded twice at different doses, which looked
  causal. It is not: the two are distinct records throughout, on both sides, and
  neither client nor backend groups by name.
- **Not a slow or unindexed query.** The reads behind this chart are
  single-partition, filtered in the datastore rather than after the fact, and
  supported by appropriate composite indexes. No indexing change is warranted
  and none is requested.

A fourth theory — that the per-medication requests were redundant and could
simply be deleted — was also wrong, and is the most important correction here,
because it is the one that would have shipped. See D1.

## Decisions

- **D1 — The extra requests are load-bearing, and the contract is what must
  change.** It is tempting to conclude the client is fetching data it already
  holds. It is not. The medication list returns each medication's current state
  only; the chart needs the periods *before* the current one. A drug whose dose
  changed last month has an earlier period the list response cannot describe,
  and a caregiver looking at a three-month window expects to see it. Deleting
  the per-row requests would silently truncate the chart to whatever each drug's
  latest dose has covered — a data-integrity regression presented as a
  performance win, and one that would be hard to catch in review because the
  chart would still look plausible. The fan-out is a symptom of a contract that
  cannot express "give me this patient's medication chart". Fix the contract;
  the requests then disappear as a consequence.

- **D2 — Render stability is a correctness requirement, not polish, and it ships
  whether or not the contract changes.** With one request the reorder becomes
  unobservable, which makes it tempting to treat tracks 1 and 2 as redundant.
  They are not. A single-request chart still has a loading state, and any future
  partial or out-of-order state — a retry, a slow response, a progressively
  loaded window — reinstates the defect exactly as it stands today. The current
  design makes correct ordering a coincidence of response timing. A row's
  position must be a property of the data, not of the network.

- **D3 — "Loading" and "no treatment" must never look the same on a medication
  chart.** This is the requirement with actual clinical weight. Elsewhere in the
  app an empty loading state is a cosmetic annoyance; here it is a false
  statement about a child's medication that the caregiver cannot distinguish
  from a true one. The distinction must be visible, and must be available to
  assistive technology rather than carried by colour or emptiness alone.

- **D4 — Do not "improve" the response to an unknown or malformed patient
  identifier.** Telemetry showing repeated not-found responses against a
  patient-shaped identifier prompted a review of this path. Those particular
  responses turned out not to originate from identifier handling at all (see
  OD-2), but the review stands on its own and its finding is what matters here:
  the behaviour is correct and deliberate. Format is validated before any lookup
  occurs, an access grant is required before existence is ever tested, and the
  caller therefore learns nothing about which patients exist. A more "helpful"
  or more specific error here would convert a sound privacy property into an
  enumeration oracle. Recorded as a decision precisely because it looks like a
  loose end and will invite a well-meaning fix.

- **D5 — Expected outcomes are not exceptions.** Recording every client error as
  an exception with a stack trace does not make the system more observable; it
  makes it less so, by burying the failures that matter under the ones that do
  not. The programme cannot reason about an error rate it has deliberately
  polluted. Expected client outcomes become structured events; exceptions are
  reserved for what the API did not expect.

- **D6 — Cold-start latency is real, and it is not this spec.** The slowest
  observed responses are dominated by cold starts, which delay a whole request
  rather than one row, and which affect every route rather than this chart.
  Reducing the number of requests reduces this chart's exposure to that tail,
  which is a genuine benefit, but it is a mitigation and not a fix. The
  underlying platform latency belongs to its own workstream with its own cost
  trade-off, and is listed under Out of scope so it is deferred deliberately
  rather than forgotten.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Caregiver opens the treatment chart (Priority: P1)

I open the treatment chart for my daughter. Every medication she takes is listed
straight away, each in its final position. Any row still loading is visibly
loading. Nothing moves once it has appeared.

**Why this priority**: This is the whole defect as the caregiver experiences it.

**Acceptance**: Given a patient with several medications, when the chart is
opened, then every row appears in its final position and no row changes position
afterwards, however long individual data takes to arrive.

### User Story 2 — Caregiver reads a chart that is still loading (Priority: P1)

While the chart is still loading, I can tell which rows are not ready yet. I am
never shown a medication that looks as though it has no recorded treatment when
in fact its data simply has not arrived.

**Why this priority**: This is the misleading-information failure, and the one
with clinical weight.

**Acceptance**: Given a row whose data has not resolved, when the chart renders,
then that row shows a visible loading state distinguishable from both "in
treatment" and "no treatment recorded", and that state is announced to assistive
technology.

### User Story 3 — Caregiver on many medications (Priority: P2)

My daughter takes eight medications. The chart appears as quickly as it does for
a patient taking two.

**Why this priority**: Delivers the actual speed improvement, and is the reason
the contract changes.

**Acceptance**: Given a patient on any number of medications, when the chart is
opened, then the number of requests needed to draw it does not grow with the
number of medications.

### Edge Cases

- **Same drug recorded twice** — a patient may take the same medication under
  two concurrent prescriptions at different doses. These are distinct rows with
  distinct identities and MUST be treated independently, including under
  out-of-order resolution. This is the case that exposed the defect.
- **A drug whose dose changed inside the window** — the chart MUST still depict
  the earlier period at the earlier dose, AND MUST still mark the day the dose
  changed as distinct from an ordinary day in treatment. This is the case that
  makes D1 true, and the marker is the detail most likely to be lost by an
  incomplete batching implementation.
- **A drug started or stopped inside the window** — partial tracks MUST render
  correctly and MUST NOT be confused with a loading state.
- **Data that never arrives** — a row whose data fails MUST resolve to an
  explicit, recoverable state. It MUST NOT remain in a loading state
  indefinitely, and MUST NOT silently present as "no treatment".

## Requirements *(mandatory)*

### Functional Requirements — Caregiver client (rettxweb)

- **FR-001** Every medication that will appear in the chart MUST occupy its
  final position from the moment the chart is first rendered. Rows MUST NOT be
  inserted, removed or moved as further data resolves.

- **FR-001a** FR-001 governs *when* the set of rows is decided, not *whether*
  rows may be filtered. Omitting a medication whose course never ran in the
  caregiver's selected window is established behaviour from spec 046 and
  remains correct: a drug stopped long ago has no business occupying a row in a
  three-month view, and a patient with a long medication history would otherwise
  be shown a chart padded with rows reading "not on treatment". That filter
  therefore stays — but the decision MUST be made before the chart is first
  rendered, from data already held at that point. A row MUST NOT appear and then
  be removed once its data resolves; that is the same defect as a row that moves.
  Where a case genuinely cannot be decided before first paint, the row MUST be
  kept rather than dropped late: a slightly noisier chart is preferable to one
  that rearranges itself, and it fails safe toward showing the caregiver more
  rather than less.

- **FR-002** Row order MUST be the order supplied by the backend, established
  once, before any per-row data resolves. The client MUST NOT re-sort the chart.

- **FR-003** The ordering guarantee in FR-001 MUST hold regardless of the order,
  timing or interleaving in which underlying responses arrive, and MUST hold
  when two rows carry the same displayed medication name with different
  identities. This MUST be pinned by a test that resolves data out of order.

- **FR-004** A row whose treatment periods have not yet resolved MUST render a
  visible loading treatment, distinguishable from both "in treatment" and "no
  treatment recorded". Empty space MUST NOT be used to mean "loading".

- **FR-005** The loading state in FR-004 MUST be exposed to assistive
  technology, and MUST NOT rely on colour alone to be perceivable.

- **FR-006** There MUST be a test asserting the loading state actually renders
  and is visible, not merely present in markup. The current defect is precisely
  an intended loading state that resolves to nothing on screen.

- **FR-007** Once the backend can return a patient's medications together with
  their history in one request, the client MUST obtain the chart's data that way
  and MUST NOT issue per-medication requests to draw it.

- **FR-008** FR-007 MUST NOT be satisfied by withholding the entire chart until
  every response has arrived. FR-001 and FR-004 remain in force during any
  loading period.

- **FR-009** A row whose data fails to load MUST resolve to an explicit,
  recoverable state, and MUST NOT be left indistinguishable from a medication
  with no recorded treatment.

- **FR-010** All of the above MUST hold on both the mobile and the desktop
  treatment chart. They are separate implementations of the same surface and
  both were confirmed to carry these defects.

### Functional Requirements — Backend (rettxapi, contract owner)

- **FR-011** The API MUST provide a way to obtain a patient's medications
  together with their full recorded history in a single request, sufficient to
  draw the treatment chart over the caregiver's selected window without further
  per-medication requests.

- **FR-011a** "Sufficient" in FR-011 means every superseded period a caregiver
  can see, not merely the boundaries of the current one. The chart distinguishes
  a day on which the dose changed from an ordinary day in treatment, so a
  response that describes only when each medication started and stopped is NOT
  sufficient: it would satisfy FR-011 read loosely while silently losing the
  dose-change markers the chart already displays. Any period, dose or change
  the chart can render today MUST remain renderable from the single response.

  If the response is ever narrowed to the caregiver's selected window to bound
  its size, it MUST still include the version already in force when that window
  opened, not only versions beginning inside it. A medication whose dose last
  changed before the window has no version starting within it, yet governs the
  whole window; filtering on "starts inside the window" would drop that
  medication's track entirely while leaving the response looking complete.

- **FR-012** FR-011 MUST be additive and backward compatible. Existing request
  and response shapes MUST continue to behave exactly as they do today, and the
  per-medication history route MUST remain available.

  "Exactly as today" is deliberately strict, and it is scoped to this
  requirement. FR-011 expands an existing route that other consumers already
  depend on, and the entire justification for expanding it rather than adding a
  new one is that a caller which does not opt in cannot tell the difference.
  That standard is stricter than the programme's general rule for additive
  evolution, and it is **not** a new general rule: it does not forbid additive
  optional fields elsewhere, and it should not be cited as precedent for that.
  Where a future change adds a field on its own terms rather than behind an
  opt-in, the constitution's additive-evolution principle governs as before.

- **FR-013** The number of requests required to render the chart MUST NOT grow
  with the number of medications a patient is taking.

- **FR-014** Expected client-error outcomes MUST be recorded as structured,
  queryable telemetry events carrying their status and reason. They MUST NOT be
  recorded as exceptions, MUST NOT capture stack traces, and MUST NOT mark their
  span as errored.

- **FR-015** Server-side faults MUST continue to be recorded as exceptions with
  full diagnostic capture. FR-014 MUST NOT be implemented by suppressing error
  recording generally.

- **FR-016** The API's response to an unknown or malformed patient identifier
  MUST NOT change. Identifier validation MUST continue to precede any lookup,
  and an access grant MUST continue to be required before existence is tested,
  so these routes cannot be used to determine which patients exist.

## Success Criteria *(mandatory)*

- **SC-001** A caregiver opening the treatment chart sees every medication row
  in its final position immediately, and no row changes position thereafter.

- **SC-002** At no point does a medication appear to have no recorded treatment
  while its data is still loading.

- **SC-003** Rendering the chart costs one request for the chart's data,
  independent of how many medications the patient takes.

- **SC-004** A caregiver on a patient with eight medications sees a complete,
  stable chart in materially less time than today, with the improvement
  attributable to the reduced number of requests.

- **SC-005** The programme can query expected client-error outcomes by status
  and reason without those outcomes appearing in exception telemetry, and the
  API's exception rate reflects only unexpected failures.

  The first half is provable from code and MUST be pinned by tests. The second
  half is only observable after deployment, because platform auto-instrumentation
  may record outcomes independently of the application. SC-005 is therefore
  verified against real telemetry once shipped; if the exception rate does not
  move, the residual source is auto-instrumentation rather than the application
  path this spec changes.

- **SC-006** Automated tests fail if a row changes position after first paint,
  or if a loading row renders as empty space.

## Out of scope

- **Platform cold-start latency.** Real, measured, and the dominant contributor
  to the worst observed response times, but it affects every route rather than
  this chart, and mitigating it is a hosting and cost decision. This spec
  reduces the chart's exposure to it; it does not address it. Deferred
  deliberately — see D6.
- **The printable treatment sheet.** A different artefact with different
  rendering, unaffected by these defects.
- **Any change to the medication data model, indexing or query strategy.** The
  reads were examined and found sound. This excludes changes made *to improve
  latency* — remodelling, new indexes, or reshaping existing queries on the
  theory that they are slow. It does not exclude the read that FR-011 and FR-013
  necessarily require: serving a whole chart from one request means asking for
  data the API was not previously asked for. That read is in scope provided it
  needs no new index and no indexing-policy change, and provided it does not
  replace one request from the client with one query per medication on the
  server — which would be a fix in name only.
- **Any change to how unknown or malformed patient identifiers are answered.**
  Explicitly excluded by D4 and FR-016.

## Open decisions

- **OD-1 — What is the acceptable time for the treatment chart to reach a
  complete, stable render?** This spec requires the chart to stop misleading the
  caregiver while it loads, and removes the request fan-out that makes loading
  long. It does not set a latency budget, because the honest number depends on
  the cold-start workstream in D6. A budget agreed here without that context
  would be either unachievable or meaningless. Recommend setting it once the
  batched shape has been measured in production.

- **OD-2 — Repeated not-found responses were observed against a patient-shaped
  identifier that does not match the programme's identifier format.** The
  mechanism is now resolved: those requests used a path that does not exist on
  the API, so they terminated at routing within milliseconds and never reached
  authentication, identifier validation, an access check, or storage. The
  malformed identifier was therefore never even parsed. There was no security
  exposure at any point, and no connection to the behaviour this spec addresses
  — the requests did no backend work and delayed nothing.

  Two points survive. First, these responses are a concrete example of the
  telemetry defect in FR-014: a caller's wrong URL produced stack-bearing
  exception telemetry indistinguishable from a genuine fault. Second, the caller
  itself is still unidentified. It is not the treatment chart — the caregiver
  client was cleared, the value appears nowhere in its code, and it never
  retries these responses. Candidates are a monitoring probe, an outdated or
  third-party client, or a misconfigured base path somewhere in the ecosystem.
  Worth identifying and then dismissing or giving its own item; it must not
  delay this spec.

- **OD-3 — Should the batched chart response be bounded, and if so by what?**
  FR-011 asks for data sufficient to draw the caregiver's selected window, but
  nothing in this spec gives the API that window, and FR-013 bounds the number
  of requests rather than the size of the response. The result is a response
  that carries every medication's complete history, so it grows with the length
  of a patient's recorded treatment rather than with what is on screen. For a
  patient a few months in this is nothing; for a patient with a decade of dose
  titration it may not be.

  Leaving it unbounded is the right initial choice: a complete response is
  cacheable and lets the caregiver change the window without another request,
  and the failure mode of too much data is slowness, whereas the failure mode of
  a wrong boundary is a chart that misrepresents a child's treatment. Those are
  not symmetric. Like OD-1, the honest answer needs production measurement
  rather than a number agreed in advance.

  If it is later bounded, FR-011a governs how: selection MUST be by overlap with
  the window, never by when a version was created or took effect.

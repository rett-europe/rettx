<!--
  Frontmatter below is machine-read by .github/workflows/spec-fanout.yml when
  this spec is merged into main. The `fanout` array drives which downstream
  repos get a `[spec/<slug>] <title>` issue with the `squad` label. Fanout only
  runs when `status:` is `ready` or `accepted` — while this is `draft` nothing
  fans out, so it is safe to review and iterate. Flip `status: ready` (the single
  switch) when the spec is agreed and you want the squad issues opened on merge.

  Allowed fanout repos: rettxweb, rettxadmin, rettxapi, rettxmutation, rettxid, templates.

  STACK & DELIVERY PRE-FLIGHT (patterns.md §7): the fanout targets were checked
  against patterns.md §1. rettxapi = Azure Functions + FastAPI + OpenTelemetry →
  App Insights (SDK flm_py3.11:otel1.38.0). rettxweb = Capacitor native Android app
  with an existing (but non-reporting on native) App Insights JS integration
  (`app-insights.service.ts`). rettxadmin = Angular SPA on the same App Insights JS
  stack. No new delivery mechanism is introduced — this spec enriches existing
  telemetry pipelines and adds a shared request-header contract.
-->
---
spec_id: "034"
slug: "auth-observability"
title: "rettX Auth-Failure Observability & Diagnosability"
status: superseded   # draft | ready | accepted | superseded
authored: "2026-07-13"
author: "perocha"
source_issue: "rett-europe/rettx#31"
relates_to: "specs/033-message-center-push/"
fanout:
  - repo: rettxapi
    summary: |
      Backend + OWNER of the shared client-telemetry header contract hosted here
      (`contracts/client-telemetry-headers.md`). Make every authentication /
      authorization failure **self-describing and attributable** in App Insights.

      Today `app/dependencies/user_permissions.py` (and `admin_permissions.py`)
      use a bare `HTTPBearer()` (default `auto_error=True`): a **missing or
      malformed Authorization header raises `403 "Not authenticated"` BEFORE the
      dependency body runs**, so none of the existing
      `metrics.business.track_auth_failure(...)` hooks fire and the 403 leaves
      FastAPI internals with **no reason, no route, no identity, no app version**.
      An **invalid** token, by contrast, reaches the body and raises **401**. This
      401-vs-403 split is the ground truth that told us the production incident was
      a **tokenless client**, not token rejection — but it is currently invisible
      until someone reads the code.

      Do:
      (1) Replace the bare `HTTPBearer()` with `HTTPBearer(auto_error=False)` +
      a thin explicit guard so the **missing-bearer** case is captured: emit a
      structured `track_auth_failure(reason="missing_bearer", ...)` event, then
      raise the same 403. Keep the existing 401 invalid-token path but ensure it
      emits the SAME structured shape (extend its dimensions). Apply to BOTH the
      user and admin security dependencies.
      (2) Enrich the central 4xx handler in `function_app.py` (the block that today
      wraps every >=400 result in an `Exception` and `span.record_exception`) so
      each auth failure telemetry item carries dimensions:
      `auth.header_present` (bool), `auth.failure_reason`
      (`missing_bearer` | `invalid_token` | `expired` | `insufficient_scope`),
      `http.route` (normalized, e.g. `GET /v2/patients`), `client.app_version`
      and `client.correlation_id` (read from the request headers defined in the
      contract), `user_agent`, `request_id`, and `token.sub` **only when a valid
      token is present** (never log the raw token).
      (3) Stop logging expected 4xx as full EXCEPTIONs with a stack trace — a
      missing-token 403 is a structured **warning event**, not an error with a
      stack. This cuts the noise that made the burst unreadable while INCREASING
      signal. Do not change the HTTP responses themselves (still 401/403 with the
      existing bodies) — this is purely telemetry enrichment.
      (4) Own the alerting requirement: add (or document, if infra-as-code is not
      in this repo) an App Insights alert rule on an **auth-failure rate spike**
      (401+403 per endpoint over a short window) so the program is paged
      proactively. See FR-013.

      Implement strictly to `contracts/client-telemetry-headers.md` for how to read
      `X-Rettx-App-Version` and `X-Rettx-Correlation-Id`.
  - repo: rettxweb
    summary: |
      Caregiver app (Capacitor native Android). Two jobs: **(A) make client
      telemetry actually work on native**, and **(B) stop the tokenless-cold-start
      race that produces the 403 burst and the hang** — the corrective action the
      new signal will verify.

      (A) Observability. The client App Insights integration
      (`src/app/core/services/app-insights.service.ts`) exists but **reports
      nothing from the native build** — so there is zero client-side view of an
      incident. Find and fix why (connection string missing/empty in the native
      environment, init not running on `Capacitor.isNativePlatform()`, or events
      not flushed before the WebView is backgrounded — call `flush()` on
      pause/visibilitychange). Then: emit a stable per-install
      **correlation id** and send it plus the app version as the request headers
      defined in `contracts/client-telemetry-headers.md`
      (`X-Rettx-Correlation-Id`, `X-Rettx-App-Version`) on **every** API call
      (add to the HTTP interceptor chain — independent of the Auth0 allowedList),
      so client and server telemetry JOIN on one id. Emit structured
      **startup + auth-lifecycle breadcrumbs**: auth-restore start/success/fail,
      access-token acquisition, guard pass, and resolver start/fail — so the
      tokenless window is visible from the client. Ensure unhandled exceptions
      (including the resolver-abort/hang) are reported with the correlation id.

      (B) Resilience / correct the race (the actual bug fix). On native cold start,
      Auth0 restores `isAuthenticated=true` from `localstorage` and
      `CustomAuthGuard` passes on that persisted flag, so the `/patients` route's
      **resolver** (`resolve: { patients: () => getPatients(true) }`) and the burst
      of patient sub-resource calls can fire **before a real access token exists**
      → tokenless requests → server 403 → the resolver error **aborts navigation**
      → the app hangs on the spinner. Fix both halves: (i) **gate authed API calls
      on a real token** — do not issue `/patients` (and siblings) until
      `getAccessTokenSilently()` has resolved a token on cold start; and (ii) make
      the `/patients` resolver **resilient** so a transient/auth failure NEVER
      aborts navigation and bricks the app (catch → resolve empty/retry so the page
      still renders with a recoverable state). This is the same startup-resilience
      posture as the merged #187 fix. It MAY land as its own PR separate from the
      telemetry PR if that keeps diffs reviewable.

      CONSUME `contracts/client-telemetry-headers.md` — do not invent header names.
  - repo: rettxadmin
    summary: |
      Smallest slice — **consistency only**, so admin-side auth failures are as
      attributable as caregiver-app ones. Adopt the shared client-telemetry header
      contract: send `X-Rettx-App-Version` and a per-session
      `X-Rettx-Correlation-Id` on all API requests (HTTP interceptor), and verify
      the admin App Insights integration actually reports and flushes. No auth
      behavioural change, no resolver work (admin is not where the incident is);
      this exists purely so the program has ONE consistent auth-failure signal
      across every client that calls `rettxapi`. CONSUME
      `contracts/client-telemetry-headers.md`. P3 — may follow the rettxapi/rettxweb
      slices.
---

# Feature Specification: rettX Auth-Failure Observability & Diagnosability

**Spec ID**: `034-auth-observability` · **Status**: Superseded · **Created**: 2026-07-13

> **Superseded on 2026-08-05.** This spec never left `draft`, and it is now closed
> without being delivered as written. Everything below is retained as a record of
> what was asked for and why; none of it is an outstanding commitment.
>
> Its client-side requirements were either delivered through incident-driven work
> or carried into [spec 049](../049-unicorn-diagnostics-recovery/spec.md), which
> audits them one by one against the code. Two were carried forward explicitly:
> FR-012's principle as 049's D7, and FR-013's alert as 049's FR-017.
>
> Its backend half was **not** carried forward and is **not** being re-specified.
> That is a deliberate decision, not an oversight: this spec is over three weeks
> old, it stalled on unanswered questions rather than on disagreement, and the
> programme is choosing to move on rather than keep a stale draft alive. If the
> behaviour it describes is still wrong, it will surface as a bug and be handled
> on its own merits.
>
> The governance lesson is recorded in 049 (OD-6) and in `patterns.md`: a correct
> spec that nobody rejects can still die of silence, and nothing in the pipeline
> makes that visible.
**Source issue**: [rett-europe/rettx#31](https://github.com/rett-europe/rettx/issues/31) (cross-cutting)
**Owner**: rettX control plane (this repo) — authored and coordinated here; scoped work is fanned out to the affected repos via the `spec-fanout` workflow on merge.
**Input**: A pilot user's native app hangs on cold start; the only signal is a burst of context-free `403 {'detail': 'Not authenticated'}` server exceptions on `GET /v2/patients`. Diagnosing it required hours of code archaeology. "How will we detect when something is going south, when all we see is a cryptic burst of 403?"

## Overview

This spec is a **response to a real production incident** and, more importantly, to the
class of problem it exposed: **rettX auth failures are not observable**, so every incident
becomes reverse-engineering and there is no proactive detection.

### What the incident proved (from code, not speculation)

- `rettxapi` guards endpoints with FastAPI `HTTPBearer()` (default `auto_error=True`).
  A **missing / malformed `Authorization` header raises `403 "Not authenticated"`
  *before* the auth dependency body runs**; a **present-but-invalid** token reaches the
  body and raises **`401`**. The production burst was **403**, so the ground truth is:
  **the client sent requests with no bearer token at all** — a cold-start Auth0
  session-restoration race — **not** the backend rejecting valid tokens.
- Because `auto_error` raises *before* the dependency body, the existing
  `metrics.business.track_auth_failure(...)` telemetry **never fires for the
  missing-token case**. The 403 exits FastAPI internals with **no reason, no route
  detail, no identity, no app version, no header-present flag**, and is logged as a full
  `EXCEPTION` with a stack — noise, not signal.
- On the client, the `/patients` route uses a **resolver**; a resolver error **aborts
  Angular navigation**, which is why the app hangs on the spinner. And the native client
  App Insights integration **does not report**, so there is **no** client-side
  corroboration and nothing to correlate the server 403s against.

### The problem to solve

Not "patch this one 403" — **make authentication/authorization failures self-describing,
correlated end-to-end, and alertable**, so the next incident is a glance at a dashboard or
an automatic alert instead of an archaeology dig, and so the corrective resilience fix can
be **verified** by signal rather than hope.

On merge (once `status: ready`), `spec-fanout` opens one scoped `[spec/auth-observability]`
issue (label `squad`) in each affected repo, carrying that repo's brief from the `fanout:`
frontmatter above:

| Surface | Repo | Role |
|---|---|---|
| **Backend telemetry + contract owner + alerting** | `rettxapi` | Make every 401/403 self-describing; own the shared header contract and the spike alert |
| **Caregiver native app** | `rettxweb` | Fix native client telemetry + correlation; correct the tokenless cold-start race and the resolver hang |
| **Admin dashboard** | `rettxadmin` | Adopt the shared telemetry headers for a consistent signal (consistency-only) |

## User Scenarios & Testing *(mandatory)*

### User Story 1 — An on-call maintainer diagnoses an auth-failure burst in one glance (Priority: P1)

As a maintainer, when a burst of 401/403s occurs, I open App Insights and immediately see
**why** (`missing_bearer` vs `invalid_token`), **which route**, **which app version**, and a
**correlation id** that joins to the client's own telemetry — without reading source code.

**Independent test**: reproduce a tokenless request against a `rettxapi` staging endpoint →
the resulting telemetry item carries `auth.failure_reason="missing_bearer"`,
`auth.header_present=false`, `http.route`, `client.app_version`, `client.correlation_id`,
and is a structured **warning event, not an EXCEPTION with a stack**. Reproduce with a
malformed/expired token → `auth.failure_reason="invalid_token"`, `auth.header_present=true`,
`token.sub` populated, HTTP status 401.

### User Story 2 — The program is alerted proactively (Priority: P1)

As the program, when the auth-failure rate on any endpoint spikes above a threshold over a
short window, I am **paged automatically**, so I learn about "something going south" before a
pilot user reports it.

**Independent test**: drive a synthetic burst of auth failures on a staging endpoint → the
configured App Insights alert fires within its evaluation window and names the endpoint and
failure reason.

### User Story 3 — Client and server tell one story (Priority: P1)

As a maintainer, when I have a server-side 403, I can find the **matching client-side
telemetry** (startup/auth breadcrumbs, the resolver failure, the device/app context) via a
shared correlation id, so I can see the *client's* view of the same moment.

**Independent test**: trigger a tokenless `/patients` call from an instrumented native build
→ the server 403 telemetry and the client's exception/breadcrumbs share the same
`correlation_id`; the client telemetry actually arrives in App Insights from the **native**
build (not just the browser PWA).

### User Story 4 — The app no longer bricks on a tokenless cold start (Priority: P1)

As a caregiver, when I cold-start the app right after an update, it opens to my data even if
the very first data calls race ahead of the token — it does **not** hang on the spinner or
show the unicorn.

**Independent test**: simulate a cold start where the access token is not yet available when
the `/patients` resolver runs → authed calls **wait for a real token** (no tokenless request
is emitted), and even if a data call fails transiently the resolver **does not abort
navigation** — the patients page renders with a recoverable state. No 403 burst is produced.

### Edge Cases

- **Legitimately unauthenticated / public endpoints** must not be drowned in
  `missing_bearer` noise — only guarded routes emit the auth-failure signal.
- **Token present but expired** → 401 `invalid_token` (or a dedicated `expired` reason),
  `auth.header_present=true` — distinct from `missing_bearer`.
- **Never log secrets**: raw bearer tokens, full Authorization header values, or PHI must
  never appear in telemetry. Only `token.sub` (when a token validated) and boolean/enum
  dimensions.
- **Telemetry must be best-effort**: a failure to emit telemetry (or to flush on the client)
  must never change the HTTP response or crash the app.
- **Correlation id is opaque and non-identifying** — a per-install/session random id, not a
  user identifier or device fingerprint.

## Requirements *(mandatory)*

### Functional Requirements — Backend signal (rettxapi)

- **FR-001** A **missing/malformed bearer** on a guarded route MUST emit a structured
  auth-failure telemetry event with `auth.failure_reason="missing_bearer"` and
  `auth.header_present=false`, then return the existing `403`. This closes the gap where
  `HTTPBearer(auto_error=True)` raised before any telemetry hook.
- **FR-002** A **present-but-invalid/expired** token MUST emit the SAME structured shape with
  `auth.failure_reason` in {`invalid_token`,`expired`}, `auth.header_present=true`, and
  `token.sub` when derivable, returning `401` as today.
- **FR-003** Every auth-failure telemetry item MUST carry: `http.route` (normalized),
  `client.app_version`, `client.correlation_id`, `user_agent`, and `request_id`.
- **FR-004** Expected 4xx (auth failures, silent 404s) MUST NOT be recorded as EXCEPTIONs
  with stack traces; they are **structured warning events**. `5xx` and genuinely unexpected
  errors keep full exception recording.
- **FR-005** Telemetry enrichment MUST NOT change HTTP status codes or response bodies, and
  MUST NOT log raw tokens, full `Authorization` values, or PHI.
- **FR-006** Both the user and admin security dependencies MUST be covered.

### Functional Requirements — Client signal (rettxweb, rettxadmin)

- **FR-007** The client App Insights integration MUST **report from the native build**
  (rettxweb): initialization runs on native, the connection string is present in the native
  environment, and events are **flushed** before the WebView is backgrounded.
- **FR-008** Each client MUST generate a stable, opaque per-install/session **correlation id**
  and send it plus the app version on **every** API request as
  `X-Rettx-Correlation-Id` / `X-Rettx-App-Version` (per the contract), via the HTTP
  interceptor, independent of the Auth0 allowedList.
- **FR-009** rettxweb MUST emit structured **startup + auth-lifecycle breadcrumbs**
  (auth-restore start/success/fail, token acquisition, guard pass, resolver start/fail) and
  report unhandled exceptions (including the resolver-abort/hang) with the correlation id.
- **FR-010** rettxadmin MUST adopt FR-008 and verify its App Insights reports/flushes
  (consistency-only; no auth behavioural change).

### Functional Requirements — Resilience / corrective action (rettxweb)

- **FR-011** On native cold start, authed API calls MUST NOT be issued until a **real access
  token** is available (gate on `getAccessTokenSilently()`), eliminating tokenless requests
  during the Auth0 session-restoration window.
- **FR-012** A data **resolver** (starting with `/patients`) MUST NOT abort navigation / brick
  the app on error: on failure it resolves to a safe empty/recoverable state so the route
  still activates. A transient/auth failure produces a recoverable UI, never an infinite
  spinner or the unicorn.

### Functional Requirements — Alerting (program / rettxapi)

- **FR-013** An **auth-failure rate-spike alert** (401+403 per endpoint over a short window)
  MUST exist so the program is paged proactively. It is owned by rettxapi if alerting is
  managed as infra-as-code there; otherwise it is captured as a documented ops runbook item.

### Key Entities *(include if feature involves data)*

- **Auth-failure telemetry event** — dimensions: `auth.failure_reason`
  (`missing_bearer`|`invalid_token`|`expired`|`insufficient_scope`), `auth.header_present`
  (bool), `http.route`, `http.status` (401|403), `client.app_version`,
  `client.correlation_id`, `user_agent`, `request_id`, `token.sub?` (only when validated).
- **Client-telemetry headers** — the shared request-header contract
  (`contracts/client-telemetry-headers.md`): `X-Rettx-App-Version`, `X-Rettx-Correlation-Id`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001** Given any 401/403 in App Insights, a maintainer can determine reason, route,
  app version, and correlation id **without reading source code**.
- **SC-002** A tokenless-vs-invalid-token failure is distinguishable **at a glance**
  (`auth.failure_reason` + `auth.header_present`), reproducing the ground truth the incident
  required code archaeology to establish.
- **SC-003** A server-side auth failure can be joined to the originating client's telemetry
  via a shared `correlation_id`, and client telemetry arrives from the **native** build.
- **SC-004** An auth-failure rate spike triggers an automatic alert within its evaluation
  window.
- **SC-005** A native cold-start reproduction that previously produced a tokenless `/patients`
  403 burst + spinner hang now produces **no tokenless request** and **no hang** (the page
  renders, with a recoverable state on transient failure).
- **SC-006** Auth-failure telemetry noise is reduced: expected 4xx no longer appear as
  stack-bearing EXCEPTIONs.

## Cross-Team Coordination *(mandatory for this feature)*

### Program-level cross-cutting decisions

1. **The shared header contract is owned here** (`contracts/client-telemetry-headers.md`).
   rettxapi is the reader; rettxweb and rettxadmin are the senders. All three implement the
   exact header names/semantics defined there — no per-repo invention.
2. **`missing_bearer` vs `invalid_token` is a program-level vocabulary** for auth-failure
   reasons; every surface uses the same enum so dashboards and alerts are uniform.
3. **Best-effort, non-blocking telemetry** everywhere: instrumentation must never alter a
   response or crash a client.
4. **No secrets, no PHI in telemetry** — reaffirms constitution principle; correlation ids
   are opaque and non-identifying.
5. **Sequencing**: rettxapi should land first (it defines/reads the contract and provides the
   server signal); rettxweb second (senders + resilience); rettxadmin last (consistency).

## Assumptions

- rettxapi's App Insights / OpenTelemetry pipeline (SDK `flm_py3.11:otel1.38.0`) is the
  system of record for server telemetry and supports custom dimensions on events/spans.
- rettxweb and rettxadmin share the App Insights JS integration
  (`app-insights.service.ts`); the native reporting gap is a configuration/lifecycle bug,
  not an absence of the library.
- Alerting can be expressed either as infra-as-code in rettxapi or as an App Insights alert
  rule created in the portal and documented in an ops runbook.

## Out of Scope (v1)

- A full structured-logging / distributed-tracing overhaul beyond the auth-failure path.
- Rate-limiting or blocking abusive tokenless clients (this spec observes and corrects the
  race; throttling is separate).
- Per-user in-app diagnostics UI.
- Retro-instrumenting non-auth 4xx/5xx beyond the noise-reduction change in FR-004.

## Constitution Check

- **Principle I–III (NON-NEGOTIABLE)**: no patient data or credentials in telemetry;
  correlation ids are opaque and non-identifying; raw tokens/PHI never logged. This spec
  strengthens, not weakens, those guarantees.
- Prefers enriching existing pipelines over new infrastructure; introduces one small,
  well-scoped shared contract rather than ad-hoc per-repo conventions (patterns.md).

## Open Decisions *(to confirm before flipping status: ready)*

- **D1** Exact header names — proposed `X-Rettx-Correlation-Id` / `X-Rettx-App-Version`
  (see contract). Confirm or adjust prefix.
- **D2** Whether the rettxweb **resilience fix (FR-011/FR-012)** rides in this spec or is
  split into its own fast-track PR (it is the active-incident fix and may want to ship ahead
  of the broader telemetry work).
- **D3** Alerting ownership (FR-013): infra-as-code in rettxapi vs a documented portal alert.
- **D4** Whether to include the small **rettxadmin** consistency slice in v1 or defer it.

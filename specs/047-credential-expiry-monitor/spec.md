<!--
  Frontmatter below is machine-read by .github/workflows/spec-fanout.yml when
  this spec is merged into main. The `fanout` array drives which downstream
  repos get a `[spec/<slug>] <title>` issue with the `squad` label. Set
  `status: ready` when this spec should fan out on merge — drafts will not.

  Allowed fanout repos: rettxweb, rettxadmin, rettxapi, rettxmutation, rettxid, templates.

  STACK & DELIVERY PRE-FLIGHT (patterns.md §1 / §7): both fanout repos were
  verified against patterns.md §1. `rettxapi` is Python 3.11 / FastAPI on Azure
  Functions v4 — it owns the Azure + Entra + Key Vault + TLS estate, so the
  cloud-credential slice belongs there. `rettxweb` is an Angular PWA wrapped
  with Capacitor as a **native mobile surface** (Android live, iOS shipping) —
  it owns Apple, Google Play and Android signing material, so the store-credential
  slice belongs there. No `rettxadmin`, `templates`, `rettxmutation` or `rettxid`
  slice is created: their credentials are either Entra app registrations already
  covered by the rettxapi tenant-wide sweep, or PyPI trusted publishing, which
  uses short-lived OIDC and has nothing to expire.

  NO NEW LONG-LIVED SECRETS. This spec deliberately introduces zero credentials
  that would themselves need expiry monitoring — rettxapi authenticates with
  Azure OIDC federated credentials, rettxweb reuses the App Store Connect API
  key and Play service account that already exist.

  IMPORTANT: this spec must NOT be implemented in `rettx`. `rettx` is a PUBLIC
  repo; the checkers reference vault names, tenant/app identifiers, resource
  groups and bundle IDs, which stay inside the private repos.
-->
---
spec_id: "047"
slug: "credential-expiry-monitor"
title: "Credential Expiry Monitor (per-repo, scheduled)"
status: draft   # draft | ready | accepted | superseded  -- KEEP as draft so it does NOT fan out until a maintainer flips it to ready
authored: "2026-08-02"
author: "perocha"
source_issue: ""
relates_to: "specs/001-security-deep-dive/"
fanout:
  - repo: rettxapi
    summary: |
      Own the **cloud** half of the credential expiry monitor: Microsoft Entra
      app credentials, Azure Key Vault secret/certificate expiry, and public
      TLS endpoints. Ship a checker script plus a scheduled workflow
      `.github/workflows/credential-expiry.yml` that implements the **Shared
      checker contract** in the spec (thresholds, report shape, rolling issue,
      exit codes, attested-items manifest).

      Concretely:
      (1) **Entra sweep** — enumerate every application in the tenant and report
      `passwordCredentials[].endDateTime` and `keyCredentials[].endDateTime`.
      The 2026-08-02 manual sweep found a small number of live credentials and
      **two already-expired** ones, which must be reported as CRITICAL until they
      are deleted or renewed; the specific registrations are listed in the
      private baseline (see *Baseline* below). Do not hard-code the app list —
      enumerate, so newly created registrations are covered automatically.
      (2) **Key Vault sweep** — list secrets and certificates in the production
      vault and report `attributes.expires`. **Known gap: no secret currently
      carries an expiry**, so the monitor has nothing to watch. Part of this
      slice is a one-off remediation pass that sets a meaningful `--expires` on
      the *rotatable* secrets (API keys, connection strings, HMAC secrets and
      service-account credentials) while explicitly leaving **non-secret
      configuration values** (container names, partition keys, endpoints, model
      names, TTL numbers) untagged. The checker reports untagged *rotatable*
      secrets in an INFO section; it must not fail the build for untagged config
      values. Classification lives in a checked-in allow-list **in that repo**,
      so it is reviewable without naming individual secrets here.
      (3) **TLS sweep** — probe the public endpoints and report leaf certificate
      `notAfter`. The endpoints are platform-managed and auto-renew, so they are
      WARN-only (never CRITICAL) unless already expired. The endpoint list lives
      with the checker, in that repo.
      (4) **Auth** — the workflow authenticates to Azure with an **OIDC federated
      credential** (`azure/login`, no client secret), because a monitor that needs
      a rotating secret to run is self-defeating. The identity needs directory
      read (to enumerate app registrations) and Key Vault **list/read metadata**
      only — it must never read secret *values*.
      (5) **Attested manifest** — a checked-in YAML for things no API we hold can
      see (identity-provider plan, transactional-email account, domain
      registrations). Each entry carries a hand-maintained `renews_on` date and is
      scored by the same thresholds, so a stale entry warns instead of being
      silently forgotten.

      Report to a single rolling issue and fail the job on CRITICAL, per the
      shared contract. Reuse the repo's existing Python toolchain; do not add a
      new language runtime.

  - repo: rettxweb
    summary: |
      Own the **store / signing** half of the credential expiry monitor: Apple,
      Google Play and Android signing material. Ship a checker script plus a
      scheduled workflow `.github/workflows/credential-expiry.yml` that
      implements the **Shared checker contract** in the spec (thresholds, report
      shape, rolling issue, exit codes, attested-items manifest).

      Concretely:
      (1) **Apple signing** — mint an App Store Connect JWT from the *existing*
      API-key secrets already held by the release workflow and query
      `GET /v1/certificates` and `GET /v1/profiles`, reporting `expirationDate`
      and any non-valid status. Note that the iOS release path currently uses
      **cloud-managed automatic signing**, so Xcode re-mints certs and profiles at
      build time and these are therefore **WARN-only** — but a cert or profile
      that has *already* expired is still CRITICAL, because it signals the account
      itself is in trouble. If the manual `.p12` fallback secrets are populated,
      decode and report their real `notAfter` too — that path does **not**
      self-heal.
      (2) **Android keystore** — decode the upload keystore, run `keytool -list -v`
      with its password, and report the certificate validity end date for the
      signing alias. Google requires an upload key valid well beyond the app's
      lifetime, so this should be decades out — the check exists to prove it,
      since the value is currently unverified.
      (3) **Play service account** — service account JSON keys do not expire, but
      they can be disabled, deleted, or lose their Play Console grant. So do a
      **live auth probe**: exchange the existing service-account credential for an
      `androidpublisher` access token and make one cheap read-only call. Failure
      is CRITICAL; there is no expiry date to report, only reachable/unreachable.
      (4) **Attested manifest** — a checked-in YAML for the annual cliffs no API
      we hold exposes, most importantly the **Apple Developer Program membership**
      renewal date (if it lapses, builds and live listings break) and the Google
      Play developer account. Each entry carries a hand-maintained `renews_on`
      date scored by the same thresholds.
      (5) **Do not** introduce any new secret. Everything above already exists in
      the repo's secret store; the checker only reads what release workflows
      already consume, and must never echo a secret value into logs or the issue
      body. Reference secrets by their existing names **in that repo** — this
      spec deliberately does not enumerate them.

      Report to a single rolling issue and fail the job on CRITICAL, per the
      shared contract. Reuse the repo's existing Node toolchain; do not add a new
      language runtime.
---

# Feature Specification: Credential Expiry Monitor (per-repo, scheduled)

**Feature Branch**: `047-credential-expiry-monitor`
**Created**: 2026-08-02
**Status**: Draft
**Input**: "In 1 week I'll be on holidays. I want to make sure that no credential
expires when I'm away. I want to transform this check into an automation that I
can run once in a while. This will be focused on rettxapi and rettxweb."

---

## Why this exists

rettX runs on a set of credentials whose expiry dates live in six different
places — the Entra directory, Azure Key Vault, Apple's developer portal, the
Google Play console, a domain registrar, and Auth0. **Nothing watches any of
them.** The failure mode is silent and total: a lapsed Apple Developer Program
membership pulls the caregiver app from the store, an expired Entra client
secret breaks admin sign-in, and an unrotated Cosmos key breaks the API — and
each is discovered only when a user reports the outage.

The trigger for this spec was a maintainer going on holiday and wanting proof
that nothing would expire while away. Producing that proof took a manual sweep
across Azure CLI, live TLS probes, and workflow archaeology. That sweep is
mechanical, and it should not depend on one person remembering to run it.

### Baseline measured on 2026-08-02

The manual sweep that motivated this spec produced a full inventory. **It is
deliberately not reproduced here.** `rettx` is a public repository, and a list of
which credentials exist, in which system, under which names, and when each
lapses is an inventory of the estate — the more so because it also records that
nothing is currently watching them. The findings live with the checkers in the
private repos, which is where the implementation belongs anyway (see the
frontmatter pre-flight).

What the automation must reproduce, stated without the inventory:

| Class | Source | Baseline finding |
|---|---|---|
| Directory app credentials | Entra | Several live; **two already expired** and still present |
| Vault secrets & certificates | Azure Key Vault | Present in bulk; **none carries an expiry** |
| Public endpoint TLS | Live probe | Platform-managed, auto-renewing |
| Mobile signing & store access | Apple / Google Play | Partly unverified, partly not machine-visible |
| Subscriptions & registrations | Various | Not machine-visible; needs an attested manifest |

Two structural findings shaped the design:

- **GitHub's secret list is useless for this.** `gh secret list` exposes only
  `updated_at`, never an expiry. Any checker must query the *issuing system*.
- **Key Vault has nothing to monitor yet.** No secret carries an expiry, so a
  Key Vault expiry check would pass vacuously forever. Setting expiry on the
  rotatable secrets is therefore in scope, not a follow-up.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Pre-holiday assurance (P1)

As a maintainer about to be unreachable for three weeks, I run the checker
on demand in both repos and get a single answer: nothing expires inside my
absence, or here is exactly what does.

**Why this priority**: it is the originating need and the smallest useful
increment. A checker that only ever runs manually already replaces the sweep.

**Independent test**: trigger `credential-expiry.yml` via `workflow_dispatch` in
each repo with the horizon set to the length of the absence. The run summary
lists every credential with a days-remaining column and an overall verdict.

**Acceptance scenarios**:
1. **Given** no credential expires within the horizon, **When** the workflow is
   dispatched, **Then** it succeeds and the report shows every item as OK.
2. **Given** at least one credential is inside the CRITICAL window, **When** the
   workflow is dispatched, **Then** the job **fails** and names the offending
   credential, its source system, and its exact expiry date.
3. **Given** a custom horizon is supplied on dispatch, **When** the workflow
   runs, **Then** thresholds are evaluated against that horizon instead of the
   defaults.

---

### User Story 2 — Unattended weekly watch (P1)

As a maintainer, I want the check to run on a schedule and reach me without my
asking, so an expiry that appears after I stop looking is still caught.

**Why this priority**: on-demand only re-creates the "someone must remember"
problem this spec exists to remove.

**Independent test**: let the weekly schedule fire. Confirm a rolling issue is
created on first run and **edited in place** on subsequent runs, with no
duplicates accumulating.

**Acceptance scenarios**:
1. **Given** no report issue exists, **When** the scheduled run finds a WARN or
   CRITICAL item, **Then** exactly one issue is opened with the agreed title and
   label.
2. **Given** a report issue already exists, **When** a later run produces a
   different report, **Then** the **same** issue is updated — a second issue is
   never opened.
3. **Given** every item returns to OK, **When** the next run completes, **Then**
   the issue is updated to an all-clear and **closed**.
4. **Given** the report issue was closed and a new WARN appears, **When** the
   next run completes, **Then** that same issue is reopened rather than replaced.

---

### User Story 3 — Covering what no API exposes (P2)

As a maintainer, I want the annual renewals that no API we hold can see — Apple
Developer Program membership, Play developer account, domain registrations — to
be tracked by the same mechanism, so the report is a complete picture rather
than a partial one that breeds false confidence.

**Why this priority**: the single highest-impact expiry in the estate (Apple
Developer Program) falls in this category. A monitor that silently omits it is
worse than none, because it implies coverage it does not have.

**Independent test**: add an entry to the attested manifest with a `renews_on`
date inside the warning window and confirm it appears in the report scored
identically to an API-derived item.

**Acceptance scenarios**:
1. **Given** an attested entry inside the warning window, **When** the checker
   runs, **Then** it appears in the report marked as attested, not measured.
2. **Given** an attested entry whose `renews_on` is in the past, **When** the
   checker runs, **Then** it is CRITICAL — a stale manifest must be loud, since
   an unmaintained manifest is the expected failure mode.

---

### User Story 4 — Key Vault becomes monitorable (P2)

As a maintainer, I want rotatable Key Vault secrets to carry an expiry date, so
the Key Vault portion of the report is meaningful rather than vacuously green.

**Why this priority**: without it, User Stories 1 and 2 return a false pass for
the single largest group of credentials in the estate.

**Independent test**: after the remediation pass, re-run the checker and confirm
the rotatable secrets appear with real dates and the untagged-secret INFO
section lists only genuine configuration values.

**Acceptance scenarios**:
1. **Given** a rotatable secret with no expiry, **When** the checker runs,
   **Then** it appears in the INFO "untracked" section.
2. **Given** a non-secret configuration value (a container name, a partition
   key, an endpoint URL, a TTL), **When** the checker runs, **Then** it is
   excluded from the untracked section via the checked-in allow-list.
3. **Given** expiry is set on a rotatable secret, **When** the checker runs,
   **Then** it is scored by the standard thresholds.

---

### Edge cases

- **The source system is unreachable** (Azure/Apple/Google outage, or the
  workflow identity lost its grant). This must be reported as an explicit ERROR
  and fail the job. It must never be conflated with "no expiring credentials
  found" — a checker that silently passes when it cannot see anything is the
  worst possible outcome.
- **A credential has no expiry concept at all** (Play service account key, ASC
  `.p8` key). Report reachable/unreachable, never a fabricated date.
- **A credential is already expired.** Always CRITICAL, including when the item
  is otherwise WARN-only, and including when it is plainly dead and unused —
  the correct resolution is deletion, which the report should prompt.
- **Duplicate display names.** Entra apps and Key Vault entries must be
  identified by stable ID in the machine-readable report, even though the human
  table shows friendly names.
- **A secret value must never leak.** The report contains names, sources and
  dates only. Never a value, never a thumbprint that could aid an attacker, and
  never the decoded contents of a base64 secret.
- **Clock/timezone.** All comparisons in UTC; all dates rendered ISO-8601.

---

## Requirements *(mandatory)*

### Shared checker contract (both repos MUST implement identically)

This is the part that makes two independent checkers feel like one system. Both
repos implement the same contract in their own native toolchain — Python in
`rettxapi`, Node in `rettxweb`. **No shared package is created**; the contract is
this section of the spec, and duplication of ~100 lines of scoring logic is the
accepted cost of keeping the repos independent.

- **FR-001** — Each repo MUST expose the check as
  `.github/workflows/credential-expiry.yml`, triggered by `workflow_dispatch`
  **and** a weekly `schedule`. The two repos SHOULD NOT be scheduled at the same
  minute, to keep the two issue notifications distinguishable.
- **FR-002** — Thresholds MUST be: `CRITICAL` ≤ 30 days remaining **or already
  expired**; `WARN` ≤ 60 days; `OK` beyond that. `workflow_dispatch` MUST accept
  an optional horizon input that overrides the WARN window, so a maintainer can
  ask "does anything expire in the next 21 days?" before a trip.
- **FR-003** — Every checked item MUST be reported as: stable id, friendly name,
  source system, expiry date (or `n/a`), days remaining, severity, and whether it
  was **measured** (read from an API) or **attested** (hand-maintained).
- **FR-004** — The checker MUST emit a machine-readable JSON report as a workflow
  artifact **and** a human-readable markdown table in the job summary.
- **FR-005** — When any item is WARN or worse, the checker MUST maintain exactly
  one rolling issue in its own repo, titled
  `[creds] Credential expiry report — <repo>`, labelled `credentials` (created
  idempotently), updated in place, closed when everything returns to OK, and
  reopened rather than duplicated if a new finding appears.
- **FR-006** — The job MUST exit non-zero when any item is CRITICAL, and when any
  source system could not be reached. WARN alone MUST NOT fail the job.
- **FR-007** — Each repo MUST carry a checked-in attested-items manifest with a
  `renews_on` date per entry, scored by the same thresholds as measured items.
- **FR-008** — The checker MUST NOT print, log, or write any secret value.
- **FR-009** — The checker MUST NOT introduce any new long-lived credential.
  `rettxapi` uses Azure OIDC federated credentials; `rettxweb` reuses the App
  Store Connect key and Play service account that its release workflows already
  use.
- **FR-010** — The workflow identity MUST hold the least privilege that works:
  directory **read** and Key Vault **metadata list** for `rettxapi` — explicitly
  *not* permission to read secret values.

### rettxapi slice

- **FR-011** — Enumerate **all** Entra applications in the tenant and report
  every `passwordCredentials` and `keyCredentials` expiry. The app list MUST NOT
  be hard-coded, so new registrations are covered automatically.
- **FR-012** — List Key Vault `rettx` secrets and certificates and report
  `attributes.expires`; report rotatable secrets that have none as INFO.
- **FR-013** — Classify Key Vault entries as *rotatable secret* vs *configuration
  value* via a checked-in, reviewable allow-list — not a name heuristic invented
  at runtime.
- **FR-014** — Set a real expiry on the rotatable secrets identified in FR-013,
  so FR-012 has something to measure.
- **FR-015** — Probe the public TLS endpoints and report leaf `notAfter`.
  Platform-managed endpoints are WARN-only unless already expired.

### rettxweb slice

- **FR-016** — Query the App Store Connect API for certificates and profiles and
  report `expirationDate` plus status. WARN-only under cloud-managed signing;
  CRITICAL if already expired.
- **FR-017** — If the `.p12` fallback secrets are populated, decode and report
  their true expiry — that path does not self-heal, so it is not WARN-only.
- **FR-018** — Report the Android upload keystore certificate validity end date.
- **FR-019** — Verify the Play service account can still obtain an
  `androidpublisher` token; report reachability, not a fabricated expiry.
- **FR-020** — Track the Apple Developer Program membership renewal date in the
  attested manifest. This is the single highest-impact expiry in the estate.

### Explicitly out of scope

- Automatic **rotation** or renewal of any credential. This spec observes only.
  Anything that can both read and rotate every credential is a far more
  dangerous thing to own than the problem it solves.
- Any implementation in `rettx` itself. It is public; the infrastructure
  identifiers stay in the private repos.
- `rettxadmin`, `templates`, `rettxmutation`, `rettxid` — see the pre-flight note
  in the frontmatter.

---

## Success Criteria *(mandatory)*

- **SC-001** — A maintainer can answer "does anything expire in the next N days?"
  for the whole estate in under five minutes, by dispatching two workflows and
  reading two summaries — with no local tooling, no Azure CLI session, and no
  tribal knowledge.
- **SC-002** — The weekly run reproduces the 2026-08-02 baseline table above,
  including flagging both already-expired Entra credentials as CRITICAL.
- **SC-003** — Every rotatable Key Vault secret carries an expiry date, and the
  untracked INFO section contains only genuine configuration values.
- **SC-004** — No credential in the estate is invisible to the report: anything
  not machine-readable appears in an attested manifest instead of being omitted.
- **SC-005** — Zero new long-lived secrets exist as a result of this spec.
- **SC-006** — A source-system outage produces a failed job with an explicit
  error, never a green run.

---

## Assumptions

- The cloud subscription and directory tenant remain the single home for rettX
  cloud resources, with one production Key Vault. Their identifiers live with
  the checkers in the private repos, not here.
- DNS and domain registration are **not** in Azure, so registrar expiry is only
  reachable via the attested manifest.
- iOS releases keep using cloud-managed automatic signing. If the repo ever
  switches back to the `.p12` path as primary, FR-017 stops being a fallback and
  its findings become CRITICAL rather than WARN.
- 30/60-day thresholds are the starting point; they can be tuned per repo
  without amending this spec.

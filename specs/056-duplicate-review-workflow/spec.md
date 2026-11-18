<!--
  DRAFT. Nothing fans out while status is `draft`. Iterate in the open.
  This public specification defines outcomes and cross-repository contract
  semantics only. Sensitive operating details remain in the private repos.

  STACK & DELIVERY PRE-FLIGHT (patterns.md §1 and §7): rettxadmin is the
  administrative web surface, and rettxapi owns server-side state and
  authorization. The MVP scan is an admin-requested synchronous operation;
  it has no device delivery, push, native-mobile, scheduler, or queue path.
  The caregiver surface is unchanged. Existing identity-matching capability is
  consumed by rettxapi; rettxid is explicitly unchanged. No infrastructure
  addition is expected, so there is no rettxinfra fanout.
-->
---
spec_id: "056"
slug: "duplicate-review-workflow"
title: "Duplicate review workflow for unconfirmed patients"
status: draft   # draft | ready | accepted | superseded
authored: "2026-11-18"
author: "perocha"
relates_to: "patterns.md §1 Repositories and roles; patterns.md §2 Personas and coverage; specs/048-admin-access-audit/; specs/054-admin-access-control/"
fanout:
  - repo: rettxapi
    summary: |
      PRIMARY IMPLEMENTER AND CONTRACT OWNER. Provide an authorized,
      admin-triggered synchronous duplicate-review operation over a bounded
      cohort of active, unconfirmed patients. Reuse existing identity
      canonicalization and fuzzy matching without changing rettxid. Persist
      the operation, algorithm version, evidence and match reasons; publish
      results once the scan succeeds; atomically apply or update
      potential_duplicate only for eligible unconfirmed patients; and clear
      stale labels on confirmation or review resolution. Keep scan request,
      orchestration, matching and result publication as separable
      responsibilities with idempotent retry semantics so a later operation
      can return 202 without changing the public meaning of a result. Enforce
      RBAC, privacy boundaries and an auditable record of scan and label
      changes.
  - repo: rettxadmin
    summary: |
      Give authorized admins cohort filters, bounded selection, a bulk duplicate
      scan action, visible progress/result feedback, and reviewable duplicate
      evidence on patient detail. Let admins resolve cases without merging or
      deleting records. Reuse the existing email campaign workflow for outreach
      to selected active, unconfirmed candidates, including no-files,
      no-diagnosis and label filters. Show patient-data actions only when the
      current admin has the required capability; the API remains authoritative.
---

# Feature Specification: Duplicate review workflow for unconfirmed patients

**Feature Branch**: `spec-056-duplicate-review-workflow`
**Created**: 2026-11-18
**Status**: Draft
**Input**: "Let's go then with the spec for this MVP": an admin-triggered
duplicate review workflow for active patients without a confirmed diagnosis,
cross-cutting rettxapi and rettxadmin without new infrastructure.

## Why this exists

rettX IDs are random, stateless identifiers. They guarantee a recognizable
identifier but do not prove that two records represent two different people.
Identity canonicalization and fuzzy matching already exist, and an admin can
already inspect on-demand exact duplicate candidates plus a warning on patient
detail. The current candidate check covers exact canonical/hash matches and
normalized same-date-of-birth matches, but it does not provide a repeatable
cohort scan, persisted evidence, or an automatically maintained review label.

The registry is currently small enough that an authorized operator can scan an
explicitly bounded cohort on demand. The first release should therefore replace
manual case-by-case discovery with a synchronous review workflow, while keeping
its operation shape suitable for an asynchronous future.

## Goals

- Identify possible duplicate active patient records before an admin invests in
  further onboarding or outreach.
- Let an admin review the evidence, resolve false positives, and retain an
  auditable explanation of the decision.
- Keep `rettxid` unchanged and use patient attributes only through the existing
  identity-matching capability.
- Reuse existing patient labels and campaign outreach rather than introduce a
  new communication channel.
- Avoid new infrastructure for the MVP.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Scan a bounded unconfirmed cohort (Priority: P1)

An authorized admin filters active patients without a confirmed diagnosis,
selects a cohort, and runs one duplicate review scan. The cohort is normally
around 180 patients and is never accepted above the published MVP bound. The
operator waits for the request to finish, then sees a summary and opens any
patient that needs review.

**Why this priority**: This provides the primary registry-quality value without
requiring a scheduler or background infrastructure.

**Independent Test**: With a cohort containing known exact, borderline, and
non-matching records, an authorized admin can trigger one scan and receive a
complete, attributable result within the bound.

**Acceptance Scenarios**:

1. **Given** an authorized admin and 180 eligible selected patients, **when**
   the admin starts a scan, **then** the system scans every selected eligible
   patient, persists one operation and its evidence, and returns a final summary.
2. **Given** a selection larger than the MVP limit, **when** the admin attempts
   a scan, **then** no scan starts and the admin is told the maximum cohort
   size.
3. **Given** an in-progress or completed scan, **when** the same idempotent
   request is retried, **then** no duplicate operation or conflicting label
   update is created and the caller receives the corresponding current result.

---

### User Story 2 - Review evidence and resolve a possible duplicate (Priority: P1)

An admin opens an unconfirmed patient with `potential_duplicate`, sees the
candidate records, match reasons, strength classification, scan time, and
algorithm version, and either keeps the case for review or resolves it as not a
duplicate. Resolving a case changes the review state and clears the label
without merging, deleting, or changing either patient record.

**Why this priority**: A label without explainable evidence or a safe resolution
path would create work and not resolve ambiguity.

**Independent Test**: An admin can explain why a patient was labelled and
resolve the case, then verify that the evidence and resolution remain
auditable.

**Acceptance Scenarios**:

1. **Given** a patient labelled by a scan, **when** an authorized admin opens
   patient detail, **then** the admin sees the candidates and persisted
   reasons for the current result.
2. **Given** a reviewed false positive, **when** the admin resolves it with a
   recorded reason, **then** the label is removed while both patient records
   and the historical evidence remain intact.
3. **Given** a scan produced more than one candidate, **when** the admin reviews
   the patient, **then** each candidate and its match evidence remain distinct.

---

### User Story 3 - Keep duplicate labels accurate as diagnoses change (Priority: P1)

A patient gains a confirmed diagnosis or has a duplicate case resolved. The
registry removes the stale `potential_duplicate` label. Confirmed patients are
never labelled as potential duplicates, although they may still appear as
matching candidates for eligible unconfirmed patients.

**Why this priority**: The review queue must represent actionable uncertainty,
not historical matches already settled by a confirmed diagnosis.

**Independent Test**: Confirm a previously labelled patient and verify that the
label and active review state disappear without deleting the prior scan.

**Acceptance Scenarios**:

1. **Given** an unconfirmed patient with `potential_duplicate`, **when** a
   diagnosis is confirmed, **then** the label is cleared and the patient is no
   longer selected by the duplicate-review label filter.
2. **Given** an eligible unconfirmed patient matched to a confirmed record,
   **when** the scan completes, **then** the unconfirmed patient may receive the
   label while the confirmed record does not.

---

### User Story 4 - Select and contact a review cohort (Priority: P2)

An authorized admin filters the patient list by active status, no files,
unconfirmed/no diagnosis, and labels, then uses the existing campaign workflow
to contact a selected set of patients. The campaign may use the
`potential_duplicate` label but duplicate detection does not itself send a
message.

**Why this priority**: Outreach is useful after review, but it is secondary to
finding and explaining candidates.

**Independent Test**: A bulk selection created from the relevant filters can
feed the existing campaign workflow without re-entering recipients.

**Acceptance Scenarios**:

1. **Given** eligible patients with different label, file, and diagnosis
   states, **when** the admin applies the combined filters, **then** only
   patients satisfying every selected condition remain.
2. **Given** a selected outreach cohort, **when** the admin invokes the
   campaign action, **then** the existing campaign preparation flow opens with
   that cohort and no duplicate-specific delivery path is created.
3. **Given** a user lacking campaign-send authority, **when** the user
   prepares or views a duplicate campaign, **then** the send action is unavailable
   and direct attempts are refused.

### Edge Cases

- A patient becomes confirmed while a scan is in progress: the scan result is
  recorded, but the now-confirmed patient is not labelled.
- A scan is retried after success: the saved operation is returned or reused;
  repeated evidence and label events are not created.
- A scan cannot complete successfully: no new `potential_duplicate` labels from
  that operation are published, and the failure is visible and auditable.
- The selected set contains an ineligible patient: that patient is excluded
  with a visible reason; the scan proceeds only if the remaining cohort is
  valid.
- The same target is compared with the same candidate in multiple ways: the
  evidence is published as one candidate result with all applicable reasons.
- A matching result disappears in a later scan after data changes: the label
  and active review state are updated without deleting prior scan evidence.
- Matching fields are incomplete or malformed: the patient remains eligible for
  the scan, the missing comparison is recorded as unavailable, and the scan
  does not guess.
- An authorized user starts concurrent scans for overlapping cohorts: one
  candidate's current review state must follow an ordered, non-duplicating
  publication; neither scan may overwrite a newer completed result.
- A patient's consent is withdrawn or the record becomes unavailable: it is
  excluded from the cohort and from new review publication.

## Requirements *(mandatory)*

### Scan scope and matching

- **FR-001**: The system MUST allow an authorized admin to scan an explicitly
  selected cohort of active patients without a confirmed diagnosis.
- **FR-002**: The selected cohort MUST have an MVP hard limit of no more than
  200 patients; the initial operational target is approximately 180.
- **FR-003**: Only active patients without a confirmed diagnosis MUST be
  eligible for a new `potential_duplicate` label.
- **FR-004**: Confirmed patients MUST be eligible as matching candidates but
  MUST NEVER receive `potential_duplicate` through this workflow.
- **FR-005**: Duplicate review MUST use the existing identity canonicalization
  and fuzzy matching capability, including its PASS, BORDERLINE, and FAIL
  result classifications. The workflow MUST NOT redefine those classifications.
- **FR-006**: Caregiver email address and phone number MUST NOT be inputs to the
  duplicate matcher.
- **FR-007**: Every candidate result MUST preserve the compared record,
  match classification, applicable match reasons, and an algorithm version
  sufficient to explain the result later.
- **FR-008**: The matcher MUST remain separated from the scan request and
  orchestration responsibility so matching rules can evolve without changing
  the workflow's operation contract.

### Operation and result lifecycle

- **FR-009**: The MVP scan MUST be requested and completed synchronously for
  the bounded cohort, with one final success or failure result returned to the
  caller.
- **FR-010**: The scan operation MUST persist an operation record, requester,
  timestamps, cohort scope, cohort counts, outcome, and matcher algorithm
  version.
- **FR-011**: The operation shape MUST be capable of later returning an accepted
  operation and exposing its eventual result without prescribing a queue,
  scheduler, worker, or other infrastructure.
- **FR-012**: The scan request, orchestration, matching, and result publication
  responsibilities MUST remain separable. A future asynchronous delivery
  change MUST NOT require callers to reinterpret match evidence or labels.
- **FR-013**: Repeating a request with the same idempotency identity MUST return
  the corresponding operation state or result without creating a second set of
  candidate evidence or label events.
- **FR-014**: Result publication, including applying or updating
  `potential_duplicate`, MUST be atomic at the patient-review level after a
  successful scan evaluation. Partial or failed publication MUST NOT leave an
  apparently successful current result.
- **FR-015**: A new result MUST supersede the patient's prior active review
  result without deleting historical scan evidence.
- **FR-016**: The system MUST persist a failure outcome and a user-visible,
  non-sensitive reason when a requested scan cannot complete.

### Labels and resolution

- **FR-017**: The successful scan MUST apply or update `potential_duplicate`
  only for eligible patients with an actionable candidate result under the
  current matching policy.
- **FR-018**: The system MUST clear the `potential_duplicate` label when a
  patient gains a confirmed diagnosis, is resolved as not a duplicate, or a
  newer successful scan no longer supports it.
- **FR-019**: Clearing a label MUST NOT delete patient records, historical
  evidence, the scan operation, or prior administrative decisions.
- **FR-020**: An authorized admin MUST be able to record a resolution reason and
  clear an active duplicate review without merging or deleting any record.
- **FR-021**: A confirmed diagnosis or explicit resolution MUST take precedence
  over an older scan result that would otherwise leave a patient labelled.

### Admin workflow

- **FR-022**: rettxadmin MUST provide patient-list filters for active status,
  confirmed/unconfirmed diagnosis state, no files, no diagnosis, and labels,
  including `potential_duplicate`.
- **FR-023**: rettxadmin MUST support multi-patient selection and a bulk action
  to start the duplicate scan for the selected eligible cohort.
- **FR-024**: Before starting, the admin MUST see the selected eligible count,
  the excluded count by reason, and the cohort bound.
- **FR-025**: While the synchronous request is running, rettxadmin MUST prevent
  accidental duplicate submission and show whether the operation is still
  running, succeeded, or failed.
- **FR-026**: Patient detail MUST show the current candidates, classification,
  match reasons, scan time, algorithm version, and review/resolution state to
  authorized admins.
- **FR-027**: The duplicate workflow MUST reuse the existing email campaign
  preparation and delivery flow for outreach to a selected cohort. It MUST NOT
  create a parallel campaign or messaging implementation.
- **FR-028**: Duplicate review MUST NOT automatically send, schedule, or require
  outreach. Campaign creation remains a separate explicit admin action.

### Privacy, authorization, and audit

- **FR-029**: Starting, reading, or resolving duplicate reviews MUST require a
  named admin capability enforced server-side. Hiding an admin action is not
  sufficient authorization.
- **FR-030**: Reusing duplicate-review results in an outreach campaign MUST
  respect the existing campaign-view, prepare, and send permissions.
- **FR-031**: The result shown to an admin MUST expose no more matching data
  than is necessary to review the candidate; raw identity hashes and unrelated
  caregiver contact details MUST NOT be shown.
- **FR-032**: Logs and telemetry MUST identify the scan by operation and opaque
  record references, not by patient name, date of birth, caregiver contact
  data, or raw matcher inputs.
- **FR-033**: Scan start, completion or failure, evidence publication, label
  changes, and resolutions MUST be auditable by actor, time, affected record,
  outcome, and algorithm version.
- **FR-034**: Authorization refusals for scan and resolution actions MUST follow
  the established admin refusal and audit behaviour.

### Explicitly out of scope

- Automatic merge, linkage, identity unification, or deletion of patient
  records.
- Making a medical or diagnosis determination from a duplicate result.
- A scheduled or recurring scan.
- Queue, worker, scheduler, or other new asynchronous infrastructure.
- Any change to `rettxid` generation, format, uniqueness, or semantics.
- Caregiver-visible duplicate notices or a self-service duplicate resolution
  flow.
- Matching on caregiver email addresses or phone numbers.
- A new outreach channel, template system, or duplicate-specific campaign.
- Automatic caregiver messaging after a scan.

## Cross-repository contract

The following semantics are shared outcomes; rettxapi owns the concrete
contract and versions it, and rettxadmin consumes it.

- **C1 Scan request:** identifies an explicit bounded cohort and carries an
  idempotency identity. It reports the accepted eligible cohort and any
  exclusions before publication.
- **C2 Operation result:** represents the same lifecycle whether completed
  during the request or completed later: requested, running, succeeded, or
  failed, with a terminal audit timestamp and a failure summary when relevant.
- **C3 Candidate evidence:** identifies the target and candidate using record
  references safe for the admin context, the matcher classification, the
  applicable match reasons, and the algorithm version. It does not expose raw
  matcher inputs or caregiver contact details.
- **C4 Review state:** distinguishes active duplicate review from resolved and
  superseded states while retaining historical evidence.
- **C5 Label publication:** `potential_duplicate` represents the current
  active review state. Its update is derived from the published scan or an
  explicit administrative resolution, not inferred independently by the admin
  application.
- **C6 Backwards-compatible campaign use:** the existing campaign recipient and
  label filters accept selected or filtered patients exactly as for other
  admin workflows; duplicate review adds no communication contract.

A future asynchronous release may return operation state immediately and make
the same result available later. That changes delivery timing, not C2 evidence,
C4 review state, C5 label meaning, or the audit obligations.

## Success Criteria *(mandatory)*

- **SC-001**: 95% of scans covering up to 180 eligible patients complete with a
  final success or failure response within 60 seconds in the production-sized
  test environment, without an operator needing to leave the scan screen.
- **SC-002**: 100% of successful operation results can be traced from the
  requested cohort through persisted candidate evidence to every published or
  cleared `potential_duplicate` label.
- **SC-003**: Replaying any completed idempotent request leaves operation
  count, candidate evidence count, and label-event count unchanged.
- **SC-004**: No confirmed patient receives `potential_duplicate` in release
  acceptance testing, while a confirmed record may still support a candidate
  for an eligible unconfirmed patient.
- **SC-005**: An authorized admin can start a 180-patient scan, find a
  borderline candidate, understand the recorded reasons, and resolve it in
  under 5 minutes without data-holder assistance.
- **SC-006**: After a patient gains a confirmed diagnosis or an admin records a
  resolution, the stale label is absent within the same completed user action.
- **SC-007**: All 100% of scan starts, terminal outcomes, label changes, and
  resolutions in acceptance testing are attributable to an authorized actor
  and algorithm version.
- **SC-008**: No caregiver email address or phone number appears in matcher
  inputs, candidate evidence, scan audit events, or scan logs during acceptance
  testing.
- **SC-009**: At least 90% of duplicate-review users in the first pilot report
  that the evidence is sufficient to decide whether to keep reviewing or
  resolve the case.
- **SC-010**: The cohort bound is enforced before matching for every request;
  zero over-limit requests begin matching work.

## Phased delivery

1. **rettxapi contract and persistence first.** Define the operation, evidence,
   review-state, authorization and audit semantics; then implement the
   bounded synchronous execution and idempotent publication.
2. **rettxadmin in parallel after contract agreement.** Add combined filters,
   bulk selection, scan feedback, evidence review, resolution, and campaign
   handoff. Client capability gating is UX only.
3. **Coordinated acceptance.** Run the 180-patient timing, idempotency,
   confirmation-precedence, privacy, RBAC, audit, and campaign-handoff tests.
4. **Future migration, separately specified.** If latency or volume requires
   background processing, preserve C1-C5 and migrate timing/delivery without
   naming or changing to queue technology as part of this MVP.

## Assumptions

- Existing canonicalization and fuzzy matching remain the source of match
  classifications and can be reused without changing `rettxid`.
- The current matching policy already distinguishes exact canonical/hash
  matches, normalized same-date-of-birth candidates, fuzzy PASS,
  BORDERLINE, and FAIL results. Final release thresholds remain owned by
  rettxapi's established identity-matching policy.
- The current `potential_duplicate` patient label is retained; this feature
  changes how it is populated, maintained, reviewed, and cleared.
- The existing admin campaign workflow can accept a selected recipient set and
  the existing campaign filters; no caregiver-facing change is required.
- The present registry scale supports a synchronous hard-bound cohort without
  a scheduler or queue. A future scale change requires separate approval.
- Admin identities, named capabilities, and refusal auditing follow the
  established admin access-control model.

## Risks

- **R1 - False positives create needless outreach.** Mitigation: preserve
  classification and reasons, require an explicit resolution decision, and
  keep matching inputs limited to identity-relevant data.
- **R2 - A completed scan leaves an inaccurate label.** Mitigation: publish at
  patient-review granularity, clear on newer successful results, confirmation,
  and resolution, and retain only historical evidence.
- **R3 - A future scale increase makes synchronous work unsuitable.**
  Mitigation: keep operation, orchestration, matcher, and publication
  semantics separable, with a hard cohort bound and measured latency.
- **R4 - Admin evidence reveals unnecessary personal data.** Mitigation: show
  only the minimum comparison evidence needed and exclude caregiver contact
  fields from matching and display.
- **R5 - The review queue encourages a merge assumption.** Mitigation: the
  interface and audit vocabulary use "review", "candidate", and "resolve";
  there is no merge or delete action.

## Constitution Check

- **Principle I - Patients and caregivers first.** The workflow reduces
  unnecessary duplicate onboarding and outreach while keeping an admin,
  rather than the caregiver, responsible for resolution.
- **Principle II - Privacy by design.** It adds no caregiver data category,
  excludes email and phone from matching, minimizes review evidence, and keeps
  patient data within authorized admin flows.
- **Principle III - Transparency.** Scan and label decisions retain reasons,
  actor, time, and algorithm version; matching remains review assistance,
  never an unexplained determination.
- **Principle IV - Clinical accuracy.** Duplicate review is not a diagnosis,
  confirmed patients are protected from labelling, and no medical state is
  inferred from a match.
- **Principle VI - Security.** Server-side named permissions, authenticated
  admin access, minimal safe audit data, and explicit refusal records apply.
- **Principle VIII - Sustainability.** The MVP uses existing matching, labels,
  and campaigns; avoids infrastructure; and separates operation semantics from
  future delivery timing.

<!--
  DRAFT. Nothing fans out while status is `draft`. Iterate in the open.
  Outcome-level only: how each repo achieves this is that repo's decision.
-->
---
spec_id: "055"
slug: "expert-review-snippets"
title: "Expert review of diagnoses via redacted snippets"
status: draft   # draft | ready | accepted | superseded
authored: "2026-11-17"
author: "perocha"
relates_to: "patterns.md §2 Personas and coverage (Expert reviewer, Admin, Caregiver), specs/054-admin-access-control/ (open role set; new role), specs/048-admin-access-audit/ (access audit), specs/032-message-center/ (caregiver requests)"
fanout:
  - repo: rettxapi
    summary: |
      PRIMARY IMPLEMENTER AND CONTRACT OWNER. Introduce the expert review
      request and its lifecycle, the reviewer-facing restricted view, the new
      reviewer role and capability, auditing, and the path by which an expert
      proposes a variant using the existing variant validation.
  - repo: rettxadmin
    summary: |
      Admin (persona A) creates a review request from a patient's uploaded
      documents by selecting snippets and writing the ask, and follows its
      status. Expert (persona B) gets two new screens and nothing else of the
      admin surface: a review queue (pending / ongoing / replied) and a
      request detail page showing only the request reference, the asks,
      snippets and thread (US-6, US-7).
  - repo: rettxweb
    summary: |
      Only if the existing admin-triggered "more information" request cannot
      carry an expert-originated question. The request is always triggered by
      the admin, and the caregiver is never told who the expert is. Drop this
      entry if the existing request fits (to be confirmed from code).
  - repo: rettxmutation
    summary: |
      Make existing variant extraction and validation reusable for an
      expert-proposed variant, with the same rules as admin entry.
---

# Feature Specification: Expert review of diagnoses via redacted snippets

**Status**: Draft  
**Input**: Onboarding workflow: caregiver uploads a Rett diagnosis; admin verifies
identity and diagnosis; hard cases go to expert review.

## Context

During onboarding a caregiver uploads a diagnosis document. An admin (persona A)
checks that name and date of birth match and that the document supports a Rett
syndrome diagnosis (typically a MECP2 variant, about 90% of cases). When the
variant is complex or the diagnosis is doubtful, the patient moves to "expert
review". Today there is no way to involve a clinical or genetic expert (persona
B) without exposing the full patient record.

Personas, as defined in
[patterns.md §2 *Personas and coverage*](../../.specify/memory/patterns.md):
persona A is the **Admin**, persona B the **Expert reviewer**, and the
**Caregiver** answers information requests. This spec moves the Expert reviewer
from "in design" to available when delivered.

## User Scenarios & Testing

### User Story 1 - Admin asks an expert a specific question (P1)
Admin selects one or more snippets from the patient's uploaded documents, writes
a specific ask, and sends it. The patient moves to expert review.
**Acceptance**: the expert sees only the ask and the snippets.

### User Story 2 - Expert answers (P1)
Expert reviews, then confirms, disagrees, or comments, optionally with a
structured verdict (for example: diagnosis consistent / not consistent /
inconclusive; variant confirmed / corrected).
**Acceptance**: admin sees the answer on the case and decides the next status.

### User Story 3 - Expert needs more information (P1)
Expert asks for more. The admin can answer from the record, send further
snippets, or relay a question to the caregiver. The caregiver's answer reaches
the expert only via the admin as redacted content.
**Acceptance**: the caregiver never learns the expert's identity; the expert
never receives caregiver contact details.

### User Story 4 - Expert proposes a variant (P2)
Expert proposes a variant. It is checked by the same validation as any admin-
entered variant (including external variant validator) before it can be applied.
**Acceptance**: an invalid variant cannot be accepted; the admin explicitly
applies a validated proposal to the patient.

### User Story 5 - Snippets from existing documents (P1, feasibility to confirm)
Admin builds snippets from documents already on file, without re-upload.
Two forms are in scope, and either may ship first:
- **Region snippet**: admin selects a region of the original document.
- **Structured snippet**: admin selects already-extracted fields (variant, lab,
  report date, diagnosis statement).
**Acceptance**: neither form carries the original document or its hidden data.

### User Story 6 - Expert review queue (P1)
On sign-in the expert lands on a shared queue of all open requests. Nothing is
assigned: any expert can pick any request and reply to as many as they choose.
Requests are grouped or filterable by state:
- **Pending**: new or reopened, no expert reply yet.
- **Ongoing**: an expert has asked for more information and it has not arrived
  yet (shown as "waiting for information").
- **Replied**: at least one expert has answered; the admin has not closed it.

Each row shows the request reference, the first line of the current ask, its
state, when it last changed, how many expert replies it has, and whether there
is something new since this expert last opened it. Closed requests are not
listed.
**Acceptance**: the queue shows no patient, caregiver or document information,
and the expert sees no other admin screen or navigation.

### User Story 7 - Request detail (P1)
Opening a request shows the ask, the snippets, and the full thread in time
order: questions, every expert's replies (each attributed), information
requests and admin replies. From
here the expert can answer (free text and, optionally, a structured verdict),
ask for more information, or propose a variant (US-4).
**Acceptance**: the page shows only the request reference, asks, snippets and
the thread; any withdrawn snippet is gone.

## Requirements

- **FR-001**: The expert MUST NOT be able to read patient name, date of birth,
  caregiver details, patient identifiers, or original documents.
- **FR-002**: Requests are not assigned. Every expert sees every open request
  in a shared pool, and may reply to as many as they choose. Each is identified
  by a request reference that cannot be reversed by them.
- **FR-002c**: More than one expert may reply to the same request. Each reply
  is attributed to its expert and visible to every expert on the request's
  thread, so a later expert can agree, add to, or disagree with an earlier
  reply. The admin sees all replies and decides.
- **FR-002a**: Each patient has at most one review request. A further round
  for the same patient reopens that request, adding a new ask to its thread,
  rather than creating a new one.
- **FR-002b**: Nothing shown to the expert may reveal that a request maps to a
  patient record. The request reference MUST NOT be, contain, or be derivable
  from the patient id, the rettX ID, or any other patient identifier.
- **FR-003**: A snippet MUST NOT carry file metadata or content outside the
  selected region/fields.
- **FR-004**: Before sending, the admin MUST confirm that no personal data is
  visible in any snippet. The confirmation is recorded.
- **FR-005**: A review request has a lifecycle: requested, needs more
  information, answered, closed. Each transition records actor and time. The
  expert queue shows these as Pending (requested, or reopened, with no expert
  reply yet), Ongoing (needs more information), and Replied (at least one
  expert reply). Closed requests leave the queue; an admin can reopen one, which
  returns it to Pending in the shared pool.
- **FR-006**: The expert role is a role in the open admin role set of spec 054, with
  capabilities limited to reading open requests in the pool, replying, asking
  for more information, and proposing variants. Experts are Entra identities
  (internal or guest).
- **FR-007**: Every expert access and admin action on a request MUST be audited,
  consistent with spec 048. Audit entries contain identifiers, not snippet
  content.
- **FR-008**: An expert-proposed variant MUST pass the same validation as any
  other variant entry, and MUST NOT change the patient record until an admin
  applies it.
- **FR-009**: Expert answers do not by themselves change a patient's diagnosis
  or status; an admin decision does.
- **FR-010**: Snippet access MUST end when the request is closed.
- **FR-011**: Information requests to the caregiver MUST be sent in the admin's
  name, never the expert's.
- **FR-012**: No clinical advice is given to caregivers by this flow. Wording
  avoids medical claims.

## Edge Cases
- Snippet accidentally contains a name or barcode: admin can withdraw it;
  withdrawn snippets become unavailable to the expert immediately.
- No expert picks a request up: it stays Pending in the pool; the admin can
  close it.
- Patient is deleted or consent withdrawn: open requests are closed and
  snippets removed.
- Same document has multiple variants: each ask references its own snippet.
- Request reopened for a new round: it returns to Pending in the shared pool
  with its earlier thread intact. Earlier snippets are visible again unless
  withdrawn.
- Two experts reply at the same time: both replies are kept; neither
  overwrites the other.
- An expert leaves the role: their past replies stay on the thread, attributed
  to them.

## Assumptions and Open Questions
- Feasibility of region snippets (non-uniform document formats, scans, PDFs)
  is unconfirmed. Structured snippets are the fallback and must work alone.
- Automatic personal-data detection is out of scope for the first version.
- Legal basis for sharing health data with external experts (GDPR processing
  agreement, expert terms) must be settled before guest experts are enabled; an
  ADR is expected.
- Whether the existing "more information" request (spec 032 message center
  plus the lifecycle information-request state) fits this use case is
  unconfirmed. Prefer reuse over a new mechanism.
- The personas this spec relies on (admin, expert, caregiver) should be
  defined first in a program-level personas reference; see the follow-up.
- Success measures: share of expert reviews completed, time to answer, zero
  personal-data leaks to experts.

## Out of Scope
- Direct expert access to patient records.
- Expert communication with caregivers.
- Automatic redaction.

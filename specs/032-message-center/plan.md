# Working Plan: rettX Message Center

**Implementation lane**: `rettxapi` (backend) | **Date**: 2026-06-22 | **Spec**: [spec.md](spec.md) | **Gap analysis**: [research.md](research.md)
**Status**: Skeleton plan for the backend slice (the `go:needs-research` phase). Per-section
technical detail is filled in the `rettxapi` repo (services/endpoints) with data/security/testing
review; this copy is the control-plane reference for the API lane.

> Guiding constraint from Pedro: **the live stable version is the basis of everything.** Every
> phase must be additive and mergeable to `main` with **zero behavioral change** to existing
> production flows until explicitly turned on. Mirror the `031-rettx-pulse` approach: small,
> independently mergeable phases, each producing something exercisable in a real environment.

---

## 1. Technical Context

- **Language/Runtime**: Python 3.11, FastAPI ≥0.115, Azure Functions v4 (Python worker).
- **Data**: Azure Cosmos DB. **New container** `messages` (partition leaning `/recipient_id`
  for caregiver-scoped reads — finalized in §4). Reuse `bulk_email_campaigns` for bulk fan-out,
  `audit_events` for the separate comms audit domain.
- **Templates/Storage**: Azure Blob (existing email-template container) extended to
  channel-aware, versioned communication templates.
- **Email channel**: existing `EmailServices` (SendGrid) reused as the channel adapter.
- **Auth**: Auth0 caregiver tokens (`get_current_user_id`), admin gate (`require_admin`),
  `PatientAccess` for patient-linked authorization.
- **Async**: persist-then-deliver-async; all I/O async (Constitution IX).
- **Testing**: pytest + pytest-asyncio + httpx; three-layer boundary (router mocks service,
  service mocks repo, repo mocks Cosmos/Blob/SendGrid clients).
- **Feature flag**: gate caregiver-facing surfaces behind a principal feature flag
  (pattern: `019-principal-feature-flags`) so production sees no change until enabled.

## 2. Constitution Check (gate)

See spec §"Constitution Check" — all 10 principles addressed. Re-checked at every phase exit.
Key gates: caregiver/patient authorization tests (III, V); additive endpoints only (VI);
no PHI in logs/email (II, III); domain exceptions in repo → HTTPException in service (VIII).

## 3. Phased delivery (additive, no production disruption)

Each phase is one reviewable PR, merges to `main`, and is safe in production (new code paths
unused/flagged until the activating phase).

| Phase | Title | Outcome (exercisable) | Prod impact |
|---|---|---|---|
| **P0** | Container + Message model + repository | `messages` container provisioned; `Message` + `Delivery` models; repository CRUD with tests. No endpoints. | None (new container, no traffic) |
| **P1** | Caregiver read API (MVP) — *US1, US5* | `GET /v2/messages`, `GET /v2/messages/{id}`, `GET /v2/messages/unread-count`, `POST /v2/messages/{id}/read`. Strict self-scoping. Seedable via repo. | None (new endpoints, flagged) |
| **P2** | Communication templates + rendering + snapshot — *US2 deps, FR-010/011/014* | Versioned comm templates (in-app + email channel reps); render + preview; content snapshot. Existing email templates mapped to email channel. | None (existing email send unchanged) |
| **P3** | Individual send via create-then-deliver — *US2* | Admin creates a Message → persisted → email delivered async → status tracked. New message visible in P1 API. | None until admin uses new path; old `/send-email` preserved |
| **P4** | Bulk send fan-out — *US3* | Campaign send creates one Message per resolved caregiver (reusing `027` lifecycle); idempotent retry; per-recipient delivery. | None until used; old bulk path preserved |
| **P5** | Admin visibility + resend — *US4* | Admin list/filter (caregiver, patient, category, campaign, date, status, template), delivery + read status, resend failed. | None |
| **P6** | Caregiver archive + comms audit domain — *US6, FR-028/029* | Archive/hide; `MESSAGES` audit domain + `log_message_event`. | None |
| **P7** | Cutover + flag enablement | Enable caregiver feature flag; route existing admin email workflows through message creation (FR-026); deprecate-in-place old direct-email path. | **Behavioral switch** — done last, after web/admin ready |
| **P8 (future)** | Provider webhooks / push channel | Optional: bounce webhook (Q3); push as 2nd channel (reuse push infra). | Out of v1 |

**MVP** = P0 + P1 + P2 + P3 (a caregiver sees persisted messages; an admin sends one that
persists + emails + tracks). P4–P6 complete the operational loop; P7 flips production.

## 4. Open design items to finalize before P0 freeze

- **Partition key**: `/recipient_id` (caregiver-scoped list/unread-count are the hot reads) vs.
  `/id`. Lean `/recipient_id`; admin cross-caregiver queries use cross-partition queries with
  filters (acceptable; admin volume low). Confirm with data reviewer.
- **Reference ID format**: human-safe, email-exposable (e.g. `MSG-{yyyymmdd}-{short}`), unique.
- **Delivery model**: embedded list on Message vs. separate sub-records. Lean embedded
  `deliveries[]` for v1 (single email channel, low cardinality) — simpler reads.
- **Idempotency key** for sends (FR-019): derive from campaign id + recipient id (bulk) and an
  explicit client idempotency token (individual) to prevent double-submit.
- **Resolve Q1/Q2/Q3** (retention/GDPR, patient-access loss behavior, webhook scope).

## 5. Cross-team coordination plan (strict)

The API contract is the shared boundary; freeze it per slice before frontends build.

```text
Backend P0–P2 ─┐
               ├─(freeze caregiver contract)──► rettxweb builds Messages section (US1/US5/US6 UI)
Backend P1 ────┘
Backend P3–P5 ─(freeze admin contract)────────► rettxadmin migrates send screens + status UI
Backend P7 ────(both frontends ready)─────────► enable flag → production cutover
```

- **rettxweb** (caregiver app, umbrella §8). Owns: Messages list/detail, unread badge, mark-read,
  archive, empty/loading states, mobile + a11y, i18n rendering from content snapshot. **Consumes**
  `contracts/caregiver-api-contract.md` (this slot); the UI gap analysis lives in its derived plan.
- **rettxadmin** (admin dashboard, umbrella §10). Owns: individual + bulk send UI, preview,
  language/template version selection, delivery + read status, filtering, resend, reference-ID
  display, preserving current admin workflows. **Consumes** `contracts/admin-api-contract.md`
  (this slot); the UI gap analysis lives in its derived plan.
- **Coordination mechanism**: the two `contracts/*.md` files in this slot are the single source of
  truth for the API surface; the consuming lanes use them rather than redefining shapes. The
  `spec-fanout` issues opened in each repo are cross-linked to the parent
  [rettx#10](https://github.com/rett-europe/rettx/issues/10); changes to a frozen contract require a
  noted version bump and a heads-up to the consuming lane.

## 6. Testing strategy

- **Repo layer** (P0): CRUD, partition behavior, etag concurrency, domain exceptions.
- **Service layer** (P1–P6): self-scoping authorization, patient-access enforcement (Q2),
  render/snapshot reproducibility, persist-before-deliver ordering, idempotent retry.
- **Router layer**: status codes, pagination, filter correctness, 404/forbidden cross-caregiver.
- **Mandatory negative tests**: caregiver A cannot read caregiver B's message (SC-007); bulk
  retry creates no duplicates (SC-004); template edit does not change past snapshot (SC-008).
- **Regression**: existing `010`/`027` email + campaign tests must stay green through P7.

## 7. Risks & mitigations

- **R1 — Production regression on existing email flows.** Mitigation: P3/P4 add *new* paths;
  old paths untouched until P7; full regression suite gate.
- **R2 — Frontend/backend contract drift.** Mitigation: versioned contract docs frozen per
  slice; companion issues; no silent contract changes.
- **R3 — PHI leakage in email/logs.** Mitigation: content snapshot keeps clinical detail in-app;
  email bodies generic; no PHI in logs/spans (II/III); security review at P2/P3.
- **R4 — Cosmos partition mis-choice hurting caregiver reads.** Mitigation: decide in §4 with
  data reviewer before P0 freeze; `/recipient_id` favors the hot path.
- **R5 — GDPR erasure undefined (Q1).** Mitigation: resolve before P0 storage freeze.

## 8. Definition of done (v1)

- SC-001…SC-008 met; MVP (P0–P3) demonstrable end-to-end in a real environment.
- Existing admin email/campaign workflows preserved and green (FR-026, SC-006).
- Caregiver/patient authorization proven by tests (SC-007).
- Contract docs frozen and consumed by `rettxweb` + `rettxadmin`; production flag enabled (P7).

# ADR 0009 — Pulse menstrual period modelled as start + duration

- **Status**: Proposed (2026-07-22)
- **Date**: 2026-07-22
- **Decision-makers**: rettX maintainers
- **Relates to**: [spec 037](../../specs/037-pulse-menstrual-duration/spec.md)
  (rettX Pulse — Menstrual Period as Start + Duration),
  [spec 035 — rettX Pulse](../../specs/035-pulse-tracker/spec.md) (the umbrella
  Pulse tracker spec this amends), [ADR 0002](0002-cross-cutting-gap-analysis-pipeline.md)
  (spec → `spec-fanout` orchestration), rettxweb#231 and rettxweb#229 (the live bugs
  that surfaced this)
- **Supersedes**: the menstrual preset of the merged umbrella spec
  **[035 — rettX Pulse](../../specs/035-pulse-tracker/spec.md)** — specifically
  **FR-005b** (*"Menstrual cycle preset MUST be modelled as a start/end span … an
  open span with no Ended is valid"*) and its milestone **M4**, plus the "open
  Started with no Ended renders as an in-progress span" edge case. That model is
  exactly what produced the "ongoing forever" bug (rettxweb#231); this ADR replaces
  it with start + duration.

## Context

Pulse tracks a menstrual period as **two independent point-events** — a `started`
entry and an `ended` entry — paired heuristically at read time. Both the client
(rettxweb `pulse-entry-presenter.ts` `deriveMenstrualSpans`/`deriveSpans`,
`MENSTRUAL_SPAN_CONFIG`) and the server (rettxapi `menstrual_derivation.py`, exposed
at `GET /v2/patients/{rettxid}/pulse/metrics/menstrual-cycle/cycles`) walk entries
chronologically and pair a `started` with the next `ended`.

This pairing's failure modes are the **default caregiver behaviour**, not edge cases:

- **Forgetting to log the end** (the norm) leaves a period **`ongoing` forever**. A
  period from 20 May still rendered "ongoing" on 22 Jul with two newer periods
  present (rettxweb#231). The mini-calendar painted it as `endDate ?? today`, a solid
  multi-week block. PR #233 patched this with an "ongoing cap", but that is a
  band-aid over a structural flaw.
- **Logging an end with no open start** is **silently dropped** — caregiver input
  vanishes with no feedback.
- Logging one period correctly requires **two visits** (start, then remember to
  return and close it).

The root problem is that the data model can represent **illegal states**: a period
with no start, and a period that is open forever. "Ongoing" conflates *genuinely in
progress right now* with *forgot to close it*, and nothing ever closes a stale one.

The `duration`/`count` numeric primitives, the generic entry-form pipeline, and the
per-field seed-validation contract already exist on both sides — so a
single-field-per-period model is expressible with the machinery we have.

## Decision

Model a menstrual period as a **single self-contained entry**: a **start date** (the
entry date) plus a required integer **`duration-days`** (primitive `count`, unit
days, min 1), with `flow` optional. End date and period length are **derived** from
the record; cycle length is the gap between consecutive starts. We **remove** the
`started`/`ended` events, the span pairing, the stored `ongoing` state, and the
orphan-end handling entirely.

Specifics:

1. **Make illegal states unrepresentable.** Every period has a start (it *is* the
   entry) and a concrete length. There is no way to record an end without a start,
   and no period can be open-ended.
2. **Duration is an integer count of days** using the `count` primitive — *not* the
   existing `duration` primitive, which is seconds (Seizure uses it). This keeps the
   stored value honest and human-meaningful.
3. **Default length = the patient's own trailing average completed-period length,
   else `DEFAULT_PERIOD_LENGTH_DAYS = 5`**, pre-filled and caregiver-editable. This
   is an observational display convenience, **not clinical guidance**.
4. **"In progress" becomes purely presentational** — derived as
   `start ≈ today && derivedEnd > today` — never a stored open state.
5. **Reconcile both mental models with one stored field.** The entry form offers a
   `duration-days` input *and* an optional "it ended on <date>" convenience that
   computes the duration under the hood. Caregivers who think in "end dates" and
   those who think in "how many days" both work; only one field is stored.
6. **Backend-first, contract-owned.** rettxapi owns the seed definition that
   validates entries, so its seed + derivation change lands and deploys before
   rettxweb starts sending `duration-days`.
7. **No migration.** With ~2 pilot testers, the product owner deletes existing
   menstrual entries; we write no backfill/transform code.

## Consequences

**Positive**

- The rettxweb#231 class of bug is eliminated by construction, not patched. PR #233's
  ongoing-cap logic is removed as obsolete.
- One entry logs one period; no second-visit requirement; no silently dropped input.
- Averages compute from concrete durations only — no null/ongoing pollution.
- Simpler code on both sides: pairing loops and orphan handling deleted.

**Negative / costs**

- A coordinated **cross-repo change** (rettxapi contract first, then rettxweb),
  tracked by spec 037 and fanned out as two `squad` issues.
- i18n churn across **19 locales** (remove started/ended labels, add duration + "in
  progress"/"ended on" copy).
- A deliberate one-time **data reset** of pilot menstrual entries.
- We lose the ability to distinguish a "still bleeding, length unknown" period from a
  defaulted one — accepted: the caregiver edits duration if it runs long, and the
  in-progress chip signals recency.

## Alternatives considered

- **Harden the paired-event model** (auto-close stale spans after N days, warn on
  orphan ends). Rejected: keeps illegal states representable and layers heuristics on
  a fragile base; PR #233 already showed band-aids accumulate.
- **Keep `started`/`ended` but make `ended` optional with a stored default end.**
  Rejected: still two event types, still pairing, still an "open until defaulted"
  ambiguity.
- **Reuse the `duration` (seconds) primitive** for the length. Rejected: seconds for
  a multi-day period is misleading and invites unit bugs; `count` days is honest.
- **Do a data migration** of existing paired events into duration records. Rejected:
  disproportionate for ~2 testers; the owner prefers a clean reset.

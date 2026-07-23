# ADR 0010 — Pulse sleep entry: total duration + quality, with input-only bedtime/wake

- **Status**: Proposed (2026-07-22)
- **Date**: 2026-07-22
- **Decision-makers**: rettX maintainers
- **Relates to**: [spec 038](../../specs/038-pulse-sleep-tracking/spec.md)
  (rettX Pulse — Sleep Tracking), [spec 035 — rettX Pulse](../../specs/035-pulse-tracker/spec.md)
  (the umbrella Pulse tracker this ADR extends with a 6th catalog preset),
  [ADR 0009](0009-pulse-menstrual-period-duration-model.md) (menstrual period as
  start + duration — the precedent for "one self-contained entry, one canonical
  stored field, an input-only convenience for the other mental model"),
  [ADR 0002](0002-cross-cutting-gap-analysis-pipeline.md) (spec → `spec-fanout`
  orchestration)
- **Extends**: the merged umbrella spec **[035 — rettX Pulse](../../specs/035-pulse-tracker/spec.md)**
  by adding a sixth catalog preset (`sleep`). It does **not** supersede or weaken any
  existing 035 requirement.

## Context

rettX Pulse models each metric as a seed preset composed from generic value
primitives (DURATION, SCALE, COUNT, NOTE, category). The backend (rettxapi
`app/models/pulse/seed_presets.py` + entry validation in
`app/services/pulse_services/pulse_tracker_entry_services.py`) is the contract owner:
it validates every entry field against the seed and 400s an unknown metric or field.
The client (rettxweb `src/app/core/domain/pulse/seed-presets.ts`) mirrors the seed
and drives a generic entry form.

Sleep is a recurring caregiver concern in Rett syndrome — fragmented nights, long
settling times, frequent wakings — but Pulse has no way to record it. Adding sleep
raises two design questions:

1. **How is the amount of sleep captured and stored?** Caregivers think about sleep
   in two ways: "they slept about seven and a half hours" (a *duration*) and "they
   went down at 20:30 and woke at 06:10" (*clock times*). A naive model would store
   both a bedtime and a wake time — but that reintroduces the class of problem ADR
   0009 removed for menstrual periods: a record can be left in a **half-entered,
   illegal state** (bedtime with no wake, or vice versa), and clock times on a
   date-anchored entry invite cross-midnight and timezone bugs.
2. **What is Sleep, presentationally?** Unlike seizures or periods (which are counted),
   the caregiver value in sleep is a **trend** — average hours per night and how it is
   moving — not a tally.

The primitives needed (DURATION in minutes, SCALE 1–5, COUNT) and the generic
per-field validation already exist on both sides, so a well-shaped sleep preset is
expressible with the machinery we have — no new primitive is required.

## Decision

Model a night's sleep as a **single self-contained catalog entry** whose canonical
amount is one **DURATION** field (`sleep-duration`, minutes), with a **required**
quality scale and an optional wakings count. **Bedtime and wake-time are an input
convenience that back-computes the duration and are NOT persisted.**

Specifics:

1. **One entry = one sleep episode (night or nap).** `sleep-duration` (primitive
   DURATION, unit minutes, REQUIRED, 1–1440) is the single canonical stored amount —
   the total sleep for that episode. There is no separate stored bedtime or wake time.
   Because an entry is one episode, multiple entries per date are allowed (a night
   plus one or more naps); there is no per-day uniqueness constraint.
2. **Bedtime/wake are input-only.** The form offers an optional bedtime + wake-time
   pair that computes `sleep-duration` = elapsed minutes (if wake ≤ bedtime, add 24h
   for cross-midnight). Only the computed duration is stored. Caregivers who think in
   *durations* and those who think in *clock times* both land on the same one stored
   field — exactly the two-mental-models / one-field pattern ADR 0009 established with
   the menstrual "Ended on" convenience.
3. **Quality is required.** `quality` (primitive SCALE, 1–5, REQUIRED) with Poor↔Great
   anchors. Pedro flagged quality as core to the metric, so it is not optional. It
   applies to both night and nap entries.
4. **Night wakings is optional.** `night-wakings` (primitive COUNT, 0–30, OPTIONAL).
5. **The night/nap distinction is a 2-option CATEGORY, not a boolean.** `sleep-type`
   (primitive CATEGORY, options `night` (default) / `nap`) is surfaced as a simple
   "Nap" tick. Our primitive set has **no boolean**, so a 2-option CATEGORY is the
   honest mapping. It is **OPTIONAL** in the seed so it can never hard-break an entry,
   but the app always sends an explicit value; any derivation treats a missing value
   as `night`. The Duration default is type-dependent (`DEFAULT_SLEEP_MINUTES = 480`
   for night, `DEFAULT_NAP_MINUTES = 60` for nap).
6. **Sleep is the first trend metric — and the trend is night-only.** The Metrics-tab
   card subtitle shows an average *duration* ("avg 7h 40m / night"), not a count; the
   metric detail shows a nightly-hours trend chart with an avg-hours/night headline
   plus secondary avg quality and avg wakings. The trend and averages are computed
   from **NIGHT entries only** so naps don't skew them; naps still appear in the entry
   history. All aggregation is **client-side** — no new server read/derivation
   endpoint.
7. **Composed from existing primitives.** The `sleep` seed introduces **no new
   primitive**; it is a new preset (`definition_version` 1, `scope=catalog`,
   `is_seed_preset=True`) assembled from DURATION + SCALE + COUNT + CATEGORY + NOTE.
   This is the sixth catalog preset.
8. **Backend-first, contract-owned.** rettxapi owns the seed that validates entries,
   so the `sleep` seed lands and deploys before rettxweb starts sending the metric
   (the backend 400s `unknown-metric-code` until then).
9. **No migration.** A brand-new metric has no existing entries; no backfill code.

## Consequences

**Positive**

- **Illegal states are unrepresentable.** There is no stored "bedtime without wake"
  half-entry; the canonical amount is always a single well-formed duration.
- **Consistency with ADR 0009.** Sleep reuses the same "one self-contained entry, one
  canonical stored field, an optional input-only convenience for the other mental
  model" shape as the menstrual period, keeping the Pulse model coherent.
- **Backend stays generic.** No new primitive and no metric-specific server branching;
  the existing DURATION/SCALE/COUNT/CATEGORY validation enforces the bounds.
- **No clock-time fields on date-anchored entries.** Cross-midnight and timezone
  hazards are handled once, at input time on the client, not baked into stored data.
- **Naps are captured without a new type.** The night/nap distinction rides on an
  existing CATEGORY primitive, and naps are cleanly excluded from the night-only
  trend, so nap logging never skews the "avg hours/night" figure.
- **Trend-first UX.** Averages compute from concrete durations; the caregiver gets the
  "how are they sleeping lately" answer directly.

**Negative / costs**

- **Exact bedtime/wake clock times are not retained** — only the computed duration. If
  a future need arises to show or analyse actual bed/wake times, that is a follow-up
  enhancement (e.g. persisting the pair, or adding a clock-time primitive).
- **All trend/average computation is client-side**, so any future server-side sleep
  analytics would need a new derivation endpoint added later.
- **No dedicated nap summary in v1.** Naps are recorded and listed but get no separate
  average or chart yet — a possible future enhancement.
- A coordinated **cross-repo change** (rettxapi seed contract first, then rettxweb),
  tracked by spec 038 and fanned out as two `squad` issues.
- i18n across **19 locales** for the new sleep strings (label, field labels, quality
  anchors, bedtime/wake labels, hour/minute units, "avg / night", "{n} wakings", and
  Sleep type / Night / Nap).
- Adds a **sixth catalog preset** to the umbrella Pulse spec (relates to spec 035).

## Alternatives considered

- **Store bedtime and wake time as two persisted fields.** Rejected: reintroduces the
  half-entered illegal state ADR 0009 eliminated, puts clock times on date-anchored
  entries (cross-midnight/timezone hazards), and complicates aggregation — trends want
  a duration, not two timestamps.
- **Make quality optional.** Rejected: Pedro flagged quality as core; an optional
  quality would leave many nights with only a duration and no sense of how the night
  went, undermining the metric's purpose.
- **Add a new "sleep" primitive.** Rejected: unnecessary — DURATION (minutes) + SCALE
  + COUNT + CATEGORY already express the whole shape; a new primitive would add
  backend surface for no gain.
- **Model the nap flag as a boolean.** Rejected: the primitive set has no boolean
  primitive. A 2-option CATEGORY (`night`/`nap`) is the honest mapping and keeps the
  door open to more sleep types later without a schema change.
- **Add a server-side sleep trend/derivation endpoint now.** Rejected as premature:
  the client can compute nightly-hours averages from the entries it already reads; a
  server endpoint can be added later if cross-surface analytics need it.
- **Fold naps into the nightly average.** Rejected: naps would skew "avg hours/night".
  Naps are captured but excluded from the night-only trend.

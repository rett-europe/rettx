# ADR 0015 — Medication is a dated regimen, not a Pulse event

- **Status**: Proposed (2026-08-01)
- **Date**: 2026-08-01
- **Decision-makers**: rettX maintainers
- **Relates to**: [spec 046](../../specs/046-medication-regimen/spec.md)
  (rettX Medication Regimen), [spec 035 — rettX Pulse](../../specs/035-pulse-tracker/spec.md)
  (the umbrella Pulse spec this amends), [spec 036](../../specs/036-pulse-metric-catalog-admin/spec.md)
  (the admin catalog through which retirement is performed),
  [spec 044](../../specs/044-pulse-desktop-experience/spec.md) (the Insights host,
  whose missing adherence denominator this unblocks),
  [ADR 0002](0002-cross-cutting-gap-analysis-pipeline.md) (spec → `spec-fanout`)
- **Supersedes**: the **medication** parts of the merged umbrella spec
  **[035 — rettX Pulse](../../specs/035-pulse-tracker/spec.md)** — specifically
  **FR-005** (*the `dose` primitive records the actual dose given; the Medication
  preset carries a medication-name short-text*), the **medication** row of
  **FR-007**'s seed-preset list, milestone **M6** (*"MVP logs medication name +
  dose given … actual-vs-prescribed deviation moves to Phase 2, sourced from a
  caregiver-owned medications list"*), and the Phase 2 line **"Medication
  actual-vs-prescribed deviation"**. The caregiver-owned medications list that
  035 deferred to Phase 2 is what this ADR specifies — but it **replaces** the
  daily medication entry rather than supplementing it.

## Context

Pulse records medication as a **daily tracker entry**: the `medication` seed
preset (`medication-name` short-text + `dose` amount/unit + note), one entry per
dose per day, alongside seizures, sleep, bathroom and menstrual cycle.

That shape is wrong for the domain, and the consequences have surfaced
independently in three places:

1. **Caregiver burden.** Medication is the one thing in Pulse that does not
   change from day to day. Re-entering a drug name and dose daily is the most
   repetitive interaction in the product — directly at odds with Principle I's
   "burden on caregivers MUST be minimised". Rett caregivers manage complex
   polypharmacy; several drugs, several times a day, indefinitely.
2. **The model cannot answer the primary question.** "What is this patient taking
   today?" and "what were they taking last March?" require a *standing state with
   dates*. A stream of independent free-text entries can only approximate it, and
   only if logging was perfect. Every clinical conversation starts with exactly
   this question.
3. **Insight is structurally blocked.** Correlating medication with seizures,
   stool or side effects needs **exposure windows** — started on X, dose changed
   on Y, stopped on Z. Spec 044 hit this from the other side and had to label its
   medication panel *"doses logged, NOT an adherence %"*, explicitly because
   there is **no expected-dose denominator** in the model. Spec 035's own M6
   acknowledged the gap and deferred a "caregiver-owned medications list with an
   optional usual dose" to Phase 2.
4. **The artefact already exists on paper.** Caregivers keep a medication sheet —
   rows of drugs, columns of times of day (*Matí / Dinar / Tarda / Vespre /
   Altres*), a weight in the header because paediatric doses are mg/kg — and hand
   it to schools and respite carers. rettX was asking them to maintain a second,
   worse representation of the same thing.

A read-only gap analysis of `rettxapi` and `rettxweb` (2026-08-01) confirmed the
machinery needed to fix this already exists: immutable versioned documents
(`pulse_catalog_definitions`), a proven retirement path that leaves historical
entries rendering, definition-driven entry forms, and a pure client-side
insights compute function.

## Decision

**Medication becomes a patient-scoped, effective-dated regimen resource. The
`medication` Pulse metric is retired.**

Specifics:

1. **A regimen row is a standing state with dates.** Name, an optional per-slot
   dose schedule over five fixed slots (`morning` · `midday` · `afternoon` ·
   `evening` · `other`), optional free-text instructions, a **required
   `valid_from`** and an **optional `valid_to`**. Open-ended by default.
2. **Changes append immutable versions.** A dose change, stop or restart writes a
   new version; no prior version is mutated. This mirrors the `MetricDefinition`
   versioning pattern already proven in the catalog, partitioned `/patient_id` so
   an **"as of date D"** read is a cheap single-partition query. Correcting a
   mis-typed row is the one in-place write, and is explicitly distinguished from
   a clinical change in both the contract (`change_reason: "corrected"`) and the
   UI.
3. **Daily medication logging is replaced by exception events.** A missed, extra
   or changed dose is recorded as an ordinary **Pulse tracker entry** under a new
   `medication-exception` definition that references the opaque `medication_id`
   (never the drug name). Keeping exceptions inside `pulse_entries` is deliberate:
   the calendar, timeline, day view, metric history, filters, the PowerBI rollup
   and the admin summary all read that container, so exceptions inherit every
   existing visualisation for the cost of one seed preset — and require **zero**
   new Cosmos containers, which matters because `rettxdb` is at 23 of a hard
   25-container limit (see Consequences).
4. **Retire, do not migrate.** Existing pilot medication entries are neither
   converted nor deleted. Retired definitions still resolve, and the viz reads key
   on `metric_code` strings, so history keeps rendering untouched. A best-effort
   conversion (one regimen per distinct name, `from` = first logged date) would
   manufacture clinical-looking date ranges out of logging behaviour — inventing
   precision we do not have, in the one domain where Principle IV says wrong data
   is worse than no data.
5. **Retirement is an operational act, sequenced last.** Because catalog
   bootstrap is insert-if-absent, flipping `is_retired` in code is a no-op in any
   bootstrapped environment. Retirement is a runtime admin catalog `PATCH` per
   environment, performed **only after** the regimen surface is live there, so no
   caregiver is ever left without a way to record medication.
6. **Weight and height become first-class Pulse metrics**, which requires a new
   **`quantity`** value primitive (decimal + unit). `count` is an integer without
   a unit and cannot hold `28.4 kg`; reusing `dose` for a body measurement would
   corrupt dose analytics. Adding a primitive changes the program-level
   value-primitive vocabulary (035, Cross-Team Coordination §2) and is therefore
   made once, here, for all surfaces. rettX records the numbers and charts them;
   it does **not** derive BMI, centiles or growth velocity, which are clinical
   interpretations.
7. **The grid is the product.** The regimen renders as rows × time-of-day slots,
   as of a chosen date, on mobile (collapsed to per-medication cards), on desktop,
   and as a **one-page A4 PDF generated on-device** and handed to the OS share
   sheet — reproducing the artefact caregivers already hand to schools, without
   rettX ever transmitting or storing it.
8. **Insights gain exposure windows.** Medication start/stop markers and shaded
   exposure bands over the existing charts, plus a descriptive before/after
   comparison around each change — computed client-side, with no new endpoint,
   and framed as co-occurrence, never causation.
9. **Regimen documents are co-located in `pulse_entries`, not given their own
   container.** `rettxdb` is a shared-throughput database at 23 of a hard
   25-container limit, and a dedicated container to escape that cap would cost
   ~€9–25/month in perpetuity — disproportionate for one feature in a nonprofit.
   `pulse_entries` is already partitioned `/patient_id`, so regimen reads stay
   single-partition and reuse the same gates and audit path, and every runtime
   query funnels through a single repository. This makes a **document `type`
   discriminator** (`tracker_entry` | `medication_regimen`) part of the decision,
   with reads coalescing absent values to `tracker_entry` for the existing corpus.
   Fewer containers with type discriminators is the Cosmos-native pattern; one
   container per entity is a relational instinct rettX has been paying for.
10. **Medication stays *inside* Pulse, as a full-screen route rather than a tab.**
    It ceases to be a Pulse *metric* but remains within the Pulse area: the
    domains are inseparable in practice, since exceptions are ordinary Pulse
    entries and the insight this feature exists to produce crosses medication
    windows against seizures and stool. It is **not** a top-level destination
    (which would spend the last slot in a mobile tab bar carrying no overflow
    handling), and **not** a fourth tab in the Pulse strip, which was measured
    against its stylesheet and cannot fit one: the tabs are equal-width,
    text-only and have no ellipsis, wrap or scroll, so a long single-word label
    silently overflows at the most common Android width. Instead the grid is a
    full-screen route reached from within Pulse, reusing the pattern the
    metric-detail surface already ships. This costs no horizontal space and suits
    a dense reference sheet better than a glanceable tab; the cost it does carry
    is discoverability, answered by requiring an above-the-fold entry row on the
    Pulse landing view plus a reinforcing card in the Metrics list, rather than a
    single buried link. On desktop, where space is not constrained, the same
    surface may additionally be exposed as a tab — but it must not displace the
    existing default landing view.
11. **rettX records what was prescribed and what was reported — never what was
    taken.** The regimen makes it tempting to render an unbroken run of days as
    "taken as prescribed", because the data now looks like a schedule. It is not:
    the app has no knowledge of administration, only of a plan a caregiver
    entered and exceptions a caregiver chose to log. A day with no exception
    means "on treatment, nothing reported". This constrains wording on every
    surface, and most sharply on the shared sheet, because a document that
    appears to evidence adherence is a clinical claim rettX cannot support
    (Principle IV, and the not-a-medical-device stance). The same reasoning
    keeps the share action recipient-neutral: the sheet is for schools and
    respite carers as much as clinicians, and rettX does not send it anywhere —
    it is generated on-device and handed to the operating system.
12. **A dose carries an optional clock time; the caregiver-chosen slot stays the
    printable column.** Doses are prescribed by the clock, and one medication is
    sometimes given a set interval before another — two doses at 07:30 and 08:00
    belong in the same *morning* column, and only the stored time makes their
    order legible on a sheet a school reads top to bottom. Storing only the time
    was rejected: the printed grid needs fixed columns, so rettX would have to
    invent bucketing thresholds, and those are locale-dependent (midday is 12:00
    in one country and 14:00 in another) — a rule we would get quietly wrong on a
    document someone follows. Structured drug-to-drug offsets were also rejected:
    they create references between independently-versioned rows that break when
    either medication stops, and they invite the next request — *"warn me if
    these are too close together"* — which is clinical decision support. rettX
    records and prints; it does not check spacing or interactions.
13. **Correcting a mistake and recording a prescribed change are different
    operations, and both exist.** They are indistinguishable in a caregiver's own
    words — "change the dose" describes both — but they mean opposite things to
    the record, and either confusion corrupts the insight layer this feature
    exists for. A correction misfiled as a change manufactures a dose increase on
    the day someone noticed a typo, and the before/after comparison then reports
    on an event that never happened. A change misfiled as a correction erases
    that the dose ever was 300 mg, so a later seizure spike is attributed to the
    wrong exposure. Corrections are audited but stay out of the caregiver-facing
    treatment history, which is a story of the treatment, not of the typing.

## Consequences

**Positive**

- The most repetitive interaction in Pulse is removed. Medication is entered once
  and edited when it changes.
- "What are they taking, and what were they taking then?" becomes a first-class,
  cheap query — and a printable sheet that has value outside the app.
- Medication-versus-outcome insight becomes structurally possible: exposure
  windows are recorded as data, not inferred from logging habits.
- The expected-dose denominator that spec 044 lacked now exists, so a true
  adherence percentage becomes computable (deliberately Phase 2 — adherence is a
  judgement about a caregiver's behaviour and needs careful framing).
- History is preserved by construction, satisfying Principle IV's provenance
  requirement better than a mutable list would.
- Exception events cost **zero** new read-path code and **zero** new containers.

**Negative / costs**

- A coordinated **cross-repo change** (rettxapi contract first, then rettxweb),
  fanned out as two `squad` issues, with a strict rollout ordering: retire only
  after the replacement is live.
- **One-off caregiver re-entry**: pilot caregivers type their current sheet once.
  Accepted as the honest alternative to fabricating start dates.
- **No new Cosmos container.** `rettxdb` runs on shared throughput and sits at
  **23 of Azure's hard 25-container limit**, so regimen documents are co-located
  in `pulse_entries` behind a `type` discriminator rather than given their own
  container. This costs €0 and consumes no slot, but it is not free of
  obligation: `pulse_entries` has no discriminator today, and two of its queries
  (`patient_has_any_entry` and the PowerBI `project_entries_for_summary`) have no
  `WHERE` clause and would otherwise swallow regimen documents — the latter with
  a PHI edge, since regimen rows carry a free-text medication name. The type
  retrofit is therefore a **precondition** of the first regimen write, not a
  follow-up.
- Investigation also established that every container was created manually, so
  the `offer_throughput` and indexing-policy arguments in the repositories are
  inert for anything that already exists — the real configuration is whatever was
  provisioned by hand. Any future container must be born with the right partition
  key, throughput and indexing policy, because the code cannot correct it later.
- **Getting the sheet out of the app is solved without a backend.** One
  on-device PDF layout is shared by the caregiver through the OS share sheet, so
  rettX never renders, stores or transmits a child's medication list, and the
  sheet works offline. The residual risk is layout fidelity on one A4 page across
  19 locales, which pilots will settle. Server-rendered delivery by email stays
  deferred with an explicit stance: a short-lived authenticated link, never an
  attachment.
- **i18n churn across 19 locales** (slot labels, exception vocabulary, weight,
  height, the whole medication section).
- Medication names remain **free text** for now, which keeps cross-patient
  analysis out of reach until a coded drug dictionary (ATC / SNOMED CT) lands in
  Phase 2 — named explicitly rather than quietly skipped.

## Alternatives considered

- **Keep the daily medication entry and add a separate "usual dose" list**
  (spec 035's original M6/Phase-2 plan: log doses, compare against a baseline,
  flag deviation). Rejected: it keeps the daily data-entry tax that is the core
  problem, and turns rettX into something that judges whether a caregiver dosed
  correctly — a posture Principle IV and the not-a-medical-device stance both
  argue against.
- **Migrate existing medication entries into regimens** (one per distinct name,
  `from` = first logged entry). Rejected under D4 above: it converts logging
  behaviour into clinical-looking date ranges.
- **Store exception events in a dedicated regimen container** alongside the rows.
  Rejected: they would not appear on the calendar or timeline — exactly where a
  caregiver looks for "missed dose on the 14th" — and reproducing that visibility
  means rebuilding the entire Pulse visualisation stack.
- **Give the regimen its own Cosmos container** (`pulse_medication_regimen`).
  Rejected on cost and scarcity: it consumes one of two remaining slots on a
  shared-throughput database, or ~€9–25/month to make it dedicated and exempt.
  Co-location behind a `type` discriminator delivers identical query performance
  (same partition key, same single-partition reads) for €0. The trade is a
  bounded retrofit of seven queries in one repository file, versus a permanent
  operating cost and a scarcer container budget.
- **Free-form clock times instead of fixed slots.** Rejected: unprintable,
  incomparable across patients, and not how caregivers, schools or the existing
  paper sheet describe a schedule.
- **Reuse the `dose` primitive for weight and height**, avoiding a new
  primitive. Rejected: a body measurement is not a dose; it would pollute every
  dose-oriented query and export with non-dose rows.
- **Server-side insight aggregation** for the before/after panels. Rejected for
  the MVP: at single-patient scale the client needs about five single-partition
  reads and can assemble everything in the existing pure compute function. Kept
  as a Phase 2 option if long ranges prove heavy.
- **A top-level "Medication" navigation destination**, sibling to Pulse.
  Rejected: it separates medication from the Pulse data its insights depend on,
  re-provides a data source and gate that already exist one level up, and
  consumes the last slot in a mobile tab bar that documents a five-item ceiling
  and implements no overflow handling. It also carries the full nav-plumbing
  cost (paired route and placeholder, nav constant, feature-flag field,
  environment override, and a `NAV.*` key in every locale file) before any
  medication UI exists. The one thing it would have bought — reachability for
  caregivers outside the Pulse flag — is not wanted: the flag separates pilot
  from general users, and medication is part of the same pilot.
- **A fourth tab in the Pulse mobile tab strip.** Rejected on measurement, not
  taste: the strip is equal-width, text-only, 13px, and has no ellipsis, no
  single-word wrap and no horizontal scroll, so an oversized label overflows
  silently. French — where all four labels are long unbreakable single words —
  needs roughly 85px per tab against a ~78.5px budget at 360px, the most common
  Android width. It fits only at 412px, and the active tab's heavier font weight
  makes the strip widest exactly when Medication is selected. Making four fit
  would mean redesigning the control (icon+label tabs) or adding a scrollable
  strip, both net-new and both more expensive than reusing the full-screen route
  pattern that already ships.

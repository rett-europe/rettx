# Medication Regimen API contract

**Spec**: [046 — Medication Regimen](../spec.md)
**Owner**: `rettxapi` (implements and versions this contract)
**Consumers**: `rettxweb`
**Conventions**: rettxapi `/v2`; `rettxid` in the path is resolved by the access
dependency; errors are `{"detail": ...}`; optimistic concurrency via `ETag` /
`If-Match`; all codes are stored as codes and translated client-side.

> This file is the single source of truth for the shape. `rettxapi` may refine
> field names during implementation — but any change lands **here** first
> (patterns.md §7), and `rettxweb` never invents endpoint shapes.

## Authorization

Every endpoint below reuses the existing Pulse dependencies unchanged:

| Operation | Dependency |
|---|---|
| Reads | `require_pulse_read_or_existing_data` |
| Writes | `require_pulse_contribute_and_confirmed_diagnosis` |

No new gate, no new flag. Regimen shares Pulse eligibility (`pulse_enabled` +
RettX-confirmed diagnosis + caregiver access / `pulse` contributor scope).

## Vocabularies

**Time-of-day slots** (fixed; codes stored, labels translated client-side):

```
morning | midday | afternoon | evening | other
```

The slot is the **printable column** and is **chosen by the caregiver** — the
server MUST NOT derive it from `time`. A `SlotDose` may additionally carry an
optional wall-clock `time`, which orders doses within a slot; see `SlotDose`
below. rettX does not validate spacing between doses or between medications, and
does not check interactions.

**Dose units** (reuse the existing medication dose unit set):

```
mcg | mg | g | ml | drop | sachet | tablet | capsule | puff | IU
```

Units are **advisory, not clinically validated** — rettX does not judge doses.

**Change reasons** (why a new version exists) — **immutable once written**:

```
started | dose-changed | stopped | restarted
```

Every value names a **clinical event**. There is deliberately no `corrected`
value: a correction is bookkeeping about the record, not something that happened
to the patient, and it creates no new version. Corrections are recorded on the
amended version as `corrected_at` / `corrected_by` and MUST NOT rewrite
`change_reason` — see `PATCH .../versions/{version}` for why. Clients MUST
surface the difference between a prescribed change and a correction
(spec FR-018).

## Resource shape

### `MedicationRegimenRow`

```jsonc
{
  "medication_id": "med-7f3a1c",        // stable across all versions
  "version": 3,                          // 1-based, immutable once written
  "name": "Lamictal",                   // free text — POTENTIAL PHI (FR-014)
  "as_needed": false,                    // PRN row: instructions, no schedule
  "doses": {                             // omit slots with no dose
    "morning":  { "amount": 50,   "unit": "mg", "time": "08:00" },
    "evening":  { "amount": 62.5, "unit": "mg", "time": "20:00" }
  },
  "instructions": null,                  // free text — POTENTIAL PHI (FR-014)
  "valid_from": "2026-07-20",           // REQUIRED
  "valid_to": null,                      // null = still taking
  "change_reason": "dose-changed",       // IMMUTABLE — the clinical event this
                                         // version records. A later correction
                                         // NEVER rewrites it.
  "is_current": true,                    // latest version for this medication_id
  "superseded_by": null,                 // version number, when superseded
  "created_at": "2026-07-20T09:14:00Z",
  "created_by": "<principal-id>",
  "corrected_at": null,                  // set when this version was amended
  "corrected_by": null,                  // in place; null = never corrected
  "_etag": "\"0x8DC...\""
}
```

### `SlotDose`

```jsonc
{ "amount": 12, "amount_max": 15, "unit": "drop" }              // a range: 12–15 drops
{ "amount": 0.25, "unit": "tablet" }                             // ¼ tablet
{ "amount": 250, "unit": "mg", "time": "07:30" }                 // with a clock time
```

`amount` is a decimal. `amount_max` is optional and, when present, MUST be
greater than `amount`. Clients render locale-aware decimal separators and MAY
offer fraction shortcuts (¼ ½ ¾) over the decimal value.

`time` is **optional**, `HH:MM`, 24-hour, and is a **wall-clock time of day** —
not an instant, so it carries no timezone and is never converted. It exists
because doses are prescribed by the clock and because one medication is
sometimes given a set interval before another: two doses at `07:30` and `08:00`
sit in the same `morning` column, and only the stored time makes their order
legible on a printed sheet. Clients MUST order doses within a slot by `time`
ascending, untimed last, and show the time beside the dose (spec FR-016d).

The server MUST NOT derive the slot from `time`, MUST NOT reject a `time` that
looks inconsistent with its slot, and MUST NOT validate spacing between doses or
between medications (spec FR-003a, FR-003b). Sequencing between medications is
expressed by the times plus free-text `instructions` — there are deliberately no
structured links between regimen rows.

## Endpoints

Base: `/v2/patients/{rettxid}/pulse/medications`

| Method | Path | Purpose |
|---|---|---|
| GET | `` | List the regimen **as of a date** (default today) |
| GET | `?include=all` | List every medication ever recorded (current version each) |
| GET | `?history=true` | Additionally return each listed medication's full version chain |
| GET | `/{medication_id}` | One medication, current version |
| GET | `/{medication_id}/history` | All versions, newest first |
| POST | `` | Add a medication (creates `version: 1`) |
| POST | `/{medication_id}/versions` | Record a change → new version |
| PATCH | `/{medication_id}/versions/{version}` | **Correct** an existing version in place |
| DELETE | `/{medication_id}` | Hard-delete a medication and all its versions |

### `GET /v2/patients/{rettxid}/pulse/medications`

Query: `as_of` (ISO date, default today) · `include` (`current` default | `all`) ·
`history` (`false` default | `true`)

Returns, per `medication_id`, the latest `version` whose
`valid_from ≤ as_of ≤ (valid_to ?? ∞)`. Single-partition read on `/patient_id`.

```jsonc
{
  "as_of": "2026-08-01",
  "medications": [ /* MedicationRegimenRow[] */ ],
  "latest_weight": {                    // convenience for the printed sheet
    "amount": 28.0,
    "unit": "kg",
    "recorded_on": "2026-07-20"
  },
  "latest_height": {                    // null when never recorded
    "amount": 132.5,
    "unit": "cm",
    "recorded_on": "2026-05-11"
  }
}
```

- Ordering: `name` ascending, `as_needed` rows last (they print as a block), and
  ties broken by `medication_id` so the order is total. The tie-break is not
  cosmetic: two prescriptions of the same drug at different doses share both
  `name` and `as_needed`, and without a unique final key their relative order
  falls through to storage order and may differ between reads. Clients are
  required to render server order without re-sorting (spec 050, FR-002/FR-002a),
  so an ordering that is not total surfaces as a chart that rearranges itself
  between refreshes. This applies to every response that carries medications in
  a list, including the batched version chains below.

  `name` ascending is compared **case-folded, by code point** — not by locale
  collation. "Case-folded" here means **full Unicode case folding** (the full
  form defined by Unicode's `CaseFolding` data), not lowercasing. The two are
  not interchangeable and the difference is reachable in drug names: full
  folding maps `ß` to `ss`, the micro sign `µ` to Greek mu `μ`, the `ﬁ` ligature
  to `fi`, and Greek final sigma `ς` to `σ`; lowercasing maps none of them. `µg`
  is an ordinary dose unit, and a keyboard emits the micro sign where a document
  may carry Greek mu, so two names differing only in which character they use
  fold together on the server and stay apart under a naive lowercase.
  Implementations MUST name and use the standard rather than accumulate
  character replacements: a hand-maintained substitution list matches until it
  meets the next character nobody thought of, and produces no error when it
  fails.
  This is deliberate and MUST NOT be "improved" to a locale-aware
  comparison: the response is shared and cacheable, so a locale-sensitive order
  would let the same data come back in different orders for different callers,
  which is unorderable in a client that is required not to re-sort. Any client
  fixture or mock MUST fold the same way; one that compares with a locale-aware
  collation renders a plausible chart whose row positions differ from
  production, and nothing fails.

  Known consequence, recorded rather than hidden: code-point comparison places
  every accented name after every unaccented one, so a name beginning `É` sorts
  past `Z`. For a European register of drug names that is visibly odd. Whether
  the sort key should additionally fold diacritics — which would keep the order
  locale-independent and deterministic while placing `É` beside `E` — is an
  open decision (spec 050, OD-4), not a licence to switch to collation.
- A patient with no medications returns `"medications": []` and HTTP 200 — never
  404.
- `latest_weight` / `latest_height` are `null` when no such entry exists. The
  client renders the date alongside the value; rettX never warns that a
  measurement is stale.

#### Batched version chains — `history=true` (added by spec 050)

Opt-in, and opt-in only. When `history` is omitted or `false` the response body is
exactly as above: the `history` key is **absent entirely**, not `null`. Existing
callers see no change.

When `history=true`:

```jsonc
{
  "as_of": "2026-08-01",
  "medications": [ /* unchanged — one MedicationRegimenRow per medication */ ],
  "latest_weight": null,
  "latest_height": null,
  "history": {
    "med-a1b2c3": [ /* MedicationRegimenRow[] — every version, newest first */ ]
  }
}
```

- Each value is the same as the `versions` array from
  `GET /{medication_id}/history` for that medication — same row shape, same
  order — so a client can feed either into the same code.
- Keys are exactly the `medication_id`s present in `medications`.
- `history` and `include` are orthogonal: `include` chooses **which medications**
  appear, `history` never truncates the chain of the ones that do.
- `{}` means "requested, none recorded". An absent key means "not requested".

This exists so that a client painting a treatment chart across several
medications can do so in **one request**. Without it the only way to obtain
earlier dose periods is one `/history` call per medication, which is what
spec 050 removes. `include=all` alone is not sufficient: it returns the current
version of each medication, so every superseded period — and every dose change
within it — is missing.

### `POST /v2/patients/{rettxid}/pulse/medications`

```jsonc
{
  "name": "Movicol ped.",
  "as_needed": false,
  "doses": { "midday": { "amount": 1.5, "unit": "sachet" } },
  "instructions": null,
  "valid_from": "2026-07-20",
  "valid_to": null
}
```

→ `201` with the created row (`version: 1`, `change_reason: "started"`, server-
assigned `medication_id`).

### `POST /v2/patients/{rettxid}/pulse/medications/{medication_id}/versions`

Records a **clinical change**. The body is the new state plus the date it takes
effect. The server writes a new version and marks the previous one superseded —
**without mutating** its stored values.

```jsonc
{
  "doses": { "morning": { "amount": 50, "unit": "mg" },
             "evening": { "amount": 62.5, "unit": "mg" } },
  "valid_from": "2026-08-04",
  "change_reason": "dose-changed"
}
```

Stopping a medication:

```jsonc
{ "valid_to": "2026-08-04", "change_reason": "stopped" }
```

Restarting later is another `POST .../versions` with a new `valid_from` and
`change_reason: "restarted"`. The as-of read MUST NOT return the medication for
dates in the gap.

**Validation** (`422`):
- `valid_to < valid_from`
- `valid_from` earlier than the `valid_from` of the version being superseded
- an unknown slot or unit code
- `amount_max ≤ amount`
- a `time` that is not a valid `HH:MM` 24-hour wall-clock value
- a `change_reason` outside the enum — including the literal string `corrected`,
  which is not a clinical event and MUST be rejected rather than silently stored
- a request body attempting to set `corrected_at` or `corrected_by`; both are
  server-assigned by `PATCH .../versions/{version}` and are never client input

Explicitly **not** rejected: a `time` that looks inconsistent with its slot
(e.g. `07:00` in `evening`). Caregivers have reasons, and policing this would
put rettX in the position of judging a schedule.

No clinical validation of any kind.

### `PATCH .../versions/{version}`

Corrects a mistake **in place**. Requires `If-Match` with the version's `_etag`.
This is the only write that changes an existing version's values, and clients
MUST present it distinctly from a clinical change (FR-018).

**A correction MUST NOT rewrite `change_reason`.** It sets `corrected_at` and
`corrected_by` and leaves every other piece of the version's clinical identity
intact. There is no `corrected` value in the `change_reason` enum, and servers
MUST NOT invent one.

The reason is worth stating, because the obvious design fails. `change_reason`
records **what clinical event this version is** — started, dose-changed, stopped,
restarted. Whether it was later corrected is **bookkeeping about the record**,
not a clinical event. Overwriting the first with the second destroys
information: correct a typo in a version that recorded a genuine prescribed dose
change, and that version stops saying a dose change happened. Any client
honouring "corrections stay out of the treatment history" by filtering on
`change_reason` would then erase a real prescribed change from the caregiver's
history and drop its marker from the Insights before/after panel — the precise
failure FR-018 exists to prevent.

Keeping the two separate also removes the need to filter anything: a correction
creates **no new version**, so nothing about it belongs in the treatment history
to begin with. Clients MAY surface `corrected_at` as quiet provenance on the
version it amended; they MUST NOT render it as a treatment change.

### `DELETE /v2/patients/{rettxid}/pulse/medications/{medication_id}`

Hard-deletes the medication and **all** its versions (caregiver data ownership,
Principle I; consistent with Pulse entry hard delete). Requires `If-Match`.
Existing `medication-exception` entries that reference it are **not** deleted —
they render with a neutral fallback label (spec edge case).

## Exception events (no new endpoint)

Missed / extra / changed / rescue doses are ordinary Pulse **tracker entries**
under the new `medication-exception` metric definition, created through the
existing `POST /v2/patients/{rettxid}/pulse/entries`. They therefore appear on
the calendar, day view, timeline, metric history, filters and the daily-activity
rollup with no new read path. `rescue-dose` covers medication given outside the
plan (an as-needed rescue), which is an event rather than a deviation from a
scheduled slot.

```jsonc
{
  "entry_date": "2026-07-28",
  "measurements": [
    { "metric_code": "medication-exception", "field_key": "exception-type",
      "primitive": "category", "category_value": "missed-dose" },
    { "metric_code": "medication-exception", "field_key": "medication-ref",
      "primitive": "short-text", "short_text_value": "med-7f3a1c" },
    { "metric_code": "medication-exception", "field_key": "regimen-version",
      "primitive": "count", "count_value": 3 }
  ],
  "notes": "refused it, very unsettled"
}
```

`medication-ref` carries the **opaque `medication_id`**, never the drug name —
so the existing PHI rule (free-text values are excluded from analytics exports)
does the right thing automatically. The client resolves the id to a name via the
regimen read.

## New Pulse primitive and presets

### `quantity` primitive

```jsonc
{ "primitive": "quantity", "quantity_value": { "amount": 28.4, "unit": "kg" } }
{ "primitive": "quantity", "quantity_value": { "amount": 132.5, "unit": "cm" } }
```

Decimal amount + unit. Required because `count` is an integer with no unit.
`PrimitiveConfig` gains `allowed_units`, `amount_min`, `amount_max`.

### `weight` and `height` seed presets

| Preset | Field | Primitive | Notes |
|---|---|---|---|
| `weight` | `weight` | `quantity` | required, unit `kg`, sane min/max bounds |
| `weight` | `note` | `note` | optional |
| `height` | `height` | `quantity` | required, unit `cm`, sane min/max bounds |
| `height` | `note` | `note` | optional |

rettX stores and charts these values. It does **not** derive BMI, centiles or
growth velocity — those are clinical interpretations (Principle IV).

### `medication-exception` seed preset

| Field | Primitive | Notes |
|---|---|---|
| `exception-type` | `category` | required — `missed-dose` \| `extra-dose` \| `changed-dose` \| `rescue-dose` |
| `medication-ref` | `short-text` | required — the opaque `medication_id` |
| `regimen-version` | `count` | optional |
| `dose` | `dose` | optional — the amount actually given, for `changed-dose` and `rescue-dose` |
| `note` | `note` | optional |

## Retiring the `medication` definition

Not part of this contract, and **not a code change**: it is a runtime
`PATCH /admin/pulse/catalog/metric-definitions/medication` with
`{"is_retired": true}`, performed per environment **after** the regimen surface
is live there (spec FR-011, Risk R4). Retired definitions still resolve, so
previously logged medication entries keep rendering everywhere.

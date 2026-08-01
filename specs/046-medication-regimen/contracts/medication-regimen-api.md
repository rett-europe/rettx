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

> **Open decision O5** — whether a regimen row may additionally carry a caregiver
> clock time (e.g. `08:00`) alongside the named slot is still open in spec 046.
> If it lands, `SlotDose` gains an optional `time` field; the named slot stays
> the primary key of the map, so the shareable sheet's five fixed columns and
> every existing document remain valid. Implement the named-slot form first.

**Dose units** (reuse the existing medication dose unit set):

```
mcg | mg | g | ml | drop | sachet | tablet | capsule | puff | IU
```

Units are **advisory, not clinically validated** — rettX does not judge doses.

**Change reasons** (why a new version exists):

```
started | dose-changed | stopped | restarted | corrected
```

`corrected` is the only reason that means "the previous version was wrong",
as opposed to "the treatment changed". Clients MUST surface the difference
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
    "morning":  { "amount": 50,   "unit": "mg" },
    "evening":  { "amount": 62.5, "unit": "mg" }
  },
  "instructions": null,                  // free text — POTENTIAL PHI (FR-014)
  "valid_from": "2026-07-20",           // REQUIRED
  "valid_to": null,                      // null = still taking
  "change_reason": "dose-changed",
  "is_current": true,                    // latest version for this medication_id
  "superseded_by": null,                 // version number, when superseded
  "created_at": "2026-07-20T09:14:00Z",
  "created_by": "<principal-id>",
  "_etag": "\"0x8DC...\""
}
```

### `SlotDose`

```jsonc
{ "amount": 12, "amount_max": 15, "unit": "drop" }   // a range: 12–15 drops
{ "amount": 0.25, "unit": "tablet" }                  // ¼ tablet
```

`amount` is a decimal. `amount_max` is optional and, when present, MUST be
greater than `amount`. Clients render locale-aware decimal separators and MAY
offer fraction shortcuts (¼ ½ ¾) over the decimal value.

## Endpoints

Base: `/v2/patients/{rettxid}/pulse/medications`

| Method | Path | Purpose |
|---|---|---|
| GET | `` | List the regimen **as of a date** (default today) |
| GET | `?include=all` | List every medication ever recorded (current version each) |
| GET | `/{medication_id}` | One medication, current version |
| GET | `/{medication_id}/history` | All versions, newest first |
| POST | `` | Add a medication (creates `version: 1`) |
| POST | `/{medication_id}/versions` | Record a change → new version |
| PATCH | `/{medication_id}/versions/{version}` | **Correct** an existing version in place |
| DELETE | `/{medication_id}` | Hard-delete a medication and all its versions |

### `GET /v2/patients/{rettxid}/pulse/medications`

Query: `as_of` (ISO date, default today) · `include` (`current` default | `all`)

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

- Ordering: `name` ascending, `as_needed` rows last (they print as a block).
- A patient with no medications returns `"medications": []` and HTTP 200 — never
  404.
- `latest_weight` / `latest_height` are `null` when no such entry exists. The
  client renders the date alongside the value; rettX never warns that a
  measurement is stale.

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

No clinical validation of any kind.

### `PATCH .../versions/{version}`

Corrects a mistake **in place** (`change_reason` becomes `corrected`). Requires
`If-Match` with the version's `_etag`. This is the only write that changes an
existing version's values, and clients MUST present it distinctly from a
clinical change (FR-018).

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

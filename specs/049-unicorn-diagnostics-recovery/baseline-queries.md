# Baseline queries — spec 049

The Success Criteria in `spec.md` are only meaningful if the 30-day review
re-runs **the same measurement** that produced the baseline. These are those
queries.

Rules for using this file:

- Freeze the baseline **before** any implementation merges. Shipping the
  canonical `unicorn_shown` event changes the telemetry shape, and once it
  changes the before/after comparison cannot be reconstructed.
- Re-run these verbatim at the 30-day review. If a query has to change, record
  *why* and treat the comparison as broken until the change is justified.
- Record the run date and the exact window with every result. "30 days" moves.

Source: Azure Application Insights, rettxweb. Window used for the recorded
baseline: **30 days to 2026-08-04**.

## KQL gotchas hit while writing these

- `kind` and `views` are **reserved words**. Use `k`, `pvCount` or similar.
- `session_Id` is empty on some rows; guard with `isnotempty()` before counting
  distinct sessions, or the count silently inflates.
- Raw page-view counts are **not** incidence counts. See B2 — bursts inflate
  them, which is why SC-5 exists.

---

## B1 — Unicorn reach: sessions and page views

Baseline result: **64 distinct sessions, 197 page views.**

```kql
pageViews
| where timestamp > ago(30d)
| where url has "/global-error" or name has "global-error"
| summarize pvCount = count(), sessions = dcountif(session_Id, isnotempty(session_Id))
```

## B2 — Burst shape (why page views ≠ incidents)

Baseline result: bursts of **4 in 0.500s, 3 in 0.504s, 3 in 0.498s, 6 in 3.4s**;
**3.1** page views per session on average.

```kql
pageViews
| where timestamp > ago(30d)
| where url has "/global-error" or name has "global-error"
| where isnotempty(session_Id)
| summarize pvCount = count(), firstSeen = min(timestamp), lastSeen = max(timestamp)
    by session_Id
| extend spanSeconds = datetime_diff('millisecond', lastSeen, firstSeen) / 1000.0
| where pvCount > 1
| order by pvCount desc
```

## B3 — Cause split from tracked errors

Baseline result: **53** tracked errors — auth/session **28**, untagged "other"
**19**, stale-deploy chunk **5** (desktop only), resolver/network **1**.

Note the shape problem this exposes: `GlobalErrorHandler` emits an **exception**
while `patients.resolver` emits a **trace**, so neither row type alone sees every
unicorn. That split is the reason for the canonical event (D1) and the reason
SC-1 exists.

```kql
exceptions
| where timestamp > ago(30d)
| extend src = tostring(customDimensions.source)
| extend msg = tolower(strcat(tostring(outerMessage), " ", tostring(innermostMessage)))
| extend k = case(
    msg has "chunk" or msg has "dynamically imported module" or msg has "failed to fetch", "stale-build",
    msg has "login" or msg has "token" or msg has "auth" or msg has "consent", "auth",
    msg has "timeout" or msg has "network" or msg has "http", "network",
    "other")
| summarize errors = count(), sessions = dcountif(session_Id, isnotempty(session_Id)) by k
| order by errors desc
```

## B4 — Attribution gaps (route name and app version)

Baseline result: **187 of 197** page views carry the default document title
`rettX`, i.e. no titled route had resolved. Some rows carry a **blank**
`appVersion`.

```kql
pageViews
| where timestamp > ago(30d)
| where url has "/global-error" or name has "global-error"
| summarize pvCount = count()
    by name, appVersionPresent = isnotempty(appVersion)
| order by pvCount desc
```

## B5 — Time trapped (SC-6)

Baseline result: worst observed **31 minutes**, with further sessions at **15**
and **11** minutes.

Measured as the interval from the first unicorn page view to the next successful
route activation in the same session, or to the last activity in that session
where no such activation follows.

```kql
let unicorn =
    pageViews
    | where timestamp > ago(30d)
    | where url has "/global-error" or name has "global-error"
    | where isnotempty(session_Id)
    | summarize trappedAt = min(timestamp) by session_Id;
let escaped =
    pageViews
    | where timestamp > ago(30d)
    | where not(url has "/global-error" or name has "global-error")
    | where isnotempty(session_Id)
    | project session_Id, timestamp;
unicorn
| join kind=leftouter escaped on session_Id
| where isnull(timestamp) or timestamp > trappedAt
| summarize escapedAt = min(timestamp) by session_Id, trappedAt
| extend trappedMinutes = iff(isnull(escapedAt), real(null),
    datetime_diff('second', escapedAt, trappedAt) / 60.0)
| order by trappedMinutes desc
```

## B6 — Auth cause dump (NOT YET RUN)

This one is outstanding and it **decays**: once the auth classifier and the
canonical event ship, the message shapes change and this specific view of the
current failure population cannot be recovered.

It exists to answer whether the 28 auth/session errors are dominated by a small
number of message shapes — which would tell us whether the classifier's coverage
is the right fix, rather than assuming it.

```kql
exceptions
| where timestamp > ago(30d)
| extend msg = tolower(strcat(tostring(outerMessage), " ", tostring(innermostMessage)))
| where msg has "login" or msg has "token" or msg has "auth" or msg has "consent"
| extend normalised = replace_regex(msg, @"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", "<uuid>")
| summarize hits = count(), sessions = dcountif(session_Id, isnotempty(session_Id))
    by normalised
| order by hits desc
| take 40
```

---

## Post-rollout queries

These do not run until the canonical event exists. They are written now so the
review is not designed after the fact by whoever wants a particular answer.

### SC-1 / SC-2 — cause coverage and build identity

```kql
customEvents
| where timestamp > ago(30d)
| where name == "unicorn_shown"
| extend cause = tostring(customDimensions.cause)
| summarize
    total = count(),
    tagged = countif(isnotempty(cause) and cause != "unknown"),
    withBuild = countif(isnotempty(tostring(customDimensions.buildId))),
    withStaleness = countif(isnotempty(tostring(customDimensions.stale)))
| extend causeCoveragePct = round(100.0 * tagged / total, 1),
         buildCoveragePct = round(100.0 * withBuild / total, 1),
         stalenessCoveragePct = round(100.0 * withStaleness / total, 1)
```

### SC-4 — recovery effectiveness, per cause

The headline criterion. Stale-build must reach **≥90%**; other causes get
targets set at the review, from this output.

```kql
customEvents
| where timestamp > ago(30d)
| where name in ("unicorn_recovery_attempted", "unicorn_recovery_outcome")
| extend cause = tostring(customDimensions.cause),
         outcome = tostring(customDimensions.outcome)
| summarize
    attempts = countif(name == "unicorn_recovery_attempted"),
    succeeded = countif(name == "unicorn_recovery_outcome" and outcome == "recovered")
    by cause
| extend successPct = round(100.0 * succeeded / attempts, 1)
| order by attempts desc
```

### SC-5 — one event per incident

Target: **≤1.2** page views per session and **zero** bursts of more than one
`unicorn_shown` inside a 5-second window.

```kql
customEvents
| where timestamp > ago(30d)
| where name == "unicorn_shown"
| where isnotempty(session_Id)
| summarize eventCount = count() by session_Id, bin(timestamp, 5s)
| where eventCount > 1
```

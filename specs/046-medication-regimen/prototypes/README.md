# Spec 046 — hi-fi prototypes

Design references attached during the authoring of
[spec 046](../spec.md), reproduced here so the fanned-out squads see the same
picture the spec was written against.

**These are references, not specifications.** Where a prototype and the spec
disagree, **the spec wins** — and they do disagree in four specific places,
listed under [Not adopted](#not-adopted) below. Read that section before
building from these images.

All data shown is **synthetic**. "Amélie R.", "Sara" and the MECP2 variant are
invented; no real patient, caregiver or regimen appears in any of these images.

## Mobile

| File | Screen | Notes |
|---|---|---|
| [`mobile-1-pulse-calendar-entry-point.png`](mobile-1-pulse-calendar-entry-point.png) | Pulse → Calendar | The entry point into the medication surface: an *"On treatment · 3 medications"* card above the tab strip. This is the origin of **FR-015a**. Note the month-totals row already reads **Exceptions**, not *Doses* (**FR-021a**). |
| [`mobile-2-treatment-plan.png`](mobile-2-treatment-plan.png) | Treatment plan | The **treatment timeline** (rows = medications, columns = days) plus the before/after panel (**FR-016**, **FR-023a**). The *"A pattern, not a medical conclusion"* line is exactly the framing Principle IV requires. |
| [`mobile-3-add-medication.png`](mobile-3-add-medication.png) | Add medication | Dose + unit, a schedule chip row, `Started on`, and an optional end date. The *"Grid fills from 1 Aug onwards, until you stop it"* hint is good teaching copy. The mixed slot/clock chip row is the subject of **O5**. |
| [`mobile-4-medication-detail.png`](mobile-4-medication-detail.png) | Medication detail | Current version, **treatment history** (the version chain, rendered as a story), logged exceptions, and *Stop this medication*. The single edit affordance is why **O3** is still open — there is no visible distinction between *"the treatment changed"* and *"I typed it wrong"*. |
| [`mobile-5-log-sheet.png`](mobile-5-log-sheet.png) | Quick-log sheet | Medication has left the daily-logging list; what remains is **Exception dose** ("Missed, extra or different"). |
| [`mobile-6-exception-dose-sheet.png`](mobile-6-exception-dose-sheet.png) | Exception dose | The four exception types, which is where `rescue-dose` ("Given outside the plan") came from. *"All details are optional"* matches the low-friction rule in **FR-020**. |

## Desktop

| File | Screen | Notes |
|---|---|---|
| [`desktop-1-treatment-tab.png`](desktop-1-treatment-tab.png) | Pulse → Treatment | Treatment grid with a 1/3/6-month range selector (**FR-016c**), *Current treatment* and *No longer taken* lists, cross-medication *Regimen changes* with reasons, and an *Exceptions* panel (**FR-016**). The explanatory banner — *"Medication is never logged daily. The grid fills itself from these dates — only log an entry when something differs from the plan."* — is adopted verbatim as **FR-021b**. |

## Not adopted

Four things in these mocks are **deliberately not** what the spec asks for.

1. **"Taken as prescribed"** (legend, both timelines) — **do not build this.**
   rettX knows what was *prescribed* and what a caregiver *reported*; it has no
   knowledge of administration. A day with no logged exception means
   *"on treatment, nothing reported"*. Rendering it as adherence — on a document
   that then gets handed to a clinician — is a clinical claim rettX cannot
   support. See **FR-016b**, **SC-011**, and ADR 0015 §11.
2. **"Share with clinician"** (desktop, top right) — the sheet is equally for
   schools and respite carers, and rettX does not *send* anything: the file is
   generated on-device and handed to the OS share sheet. Use a recipient-neutral
   label. See **FR-019d**.
3. **Treatment as the first and active tab** (desktop) — adding the tab is fine;
   making it the default landing view would change shipped behaviour, which
   **D12** rules out. Also unverified: five intrinsic-width tabs at exactly
   1024px in German or French.
4. **"Pulse — Amélie's private tracker"** as a *mobile* title row — this chrome
   does not exist on mobile today (it is the desktop `PULSE.DESKTOP.HEADER.*`
   identity block; the string *"private tracker"* appears nowhere in `rettxweb`).
   Adding it costs ~44px, and measured against the calendar stylesheet that is
   the difference between the month grid fitting above the fold at 360×640 and
   being clipped. See **FR-015a** for the three measured thresholds.

## What is missing from the mocks

The **slot grid** — rows × the five fixed time-of-day slots — is not drawn in any
of these screens, and it is the artefact the entire spec started from: the paper
sheet caregivers already keep and hand to schools. It is the layout of the
**shareable sheet**, not an in-app screen (**FR-016a**, **D11**). The prototypes
show only the in-app treatment timeline, which answers *"what has been running,
and since when"* — not *"what do I give, and when"*.

The original photograph of the paper sheet that prompted this spec is
**intentionally not stored here**: it is a real medication list for a real child.

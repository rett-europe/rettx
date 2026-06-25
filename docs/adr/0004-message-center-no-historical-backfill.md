# ADR 0004 — Message Center launches with no historical backfill

- **Status**: Accepted
- **Date**: 2026-06-24
- **Decision-makers**: rettX maintainers
- **Relates to**: [`specs/032-message-center/`](../../specs/032-message-center/),
  [ADR 0003](0003-message-channel-content-model.md) (channel content model)

## Context

The caregiver Message Center (`specs/032-message-center/`) is feature-complete and
signed off for go-live. The in-app inbox is backed by a new store in `rettxapi`: each
message is an **immutable per-recipient content snapshot** (SC-008) carrying a clean
`in_app_body`, a controlled `category_code` (`MessageCategory`, exactly 10 values), a
`recipient_principal_id`, timestamps, and read / archive state.

Before this feature existed, the platform already communicated with caregivers — most
notably the **welcome email** and other transactional sends — delivered as **emails**
through the templates repo (`c:\rettx\templates`) and `rettxapi`'s `EmailServices`.
Those historical sends were **never persisted as in-app message snapshots**; they only
ever existed as email.

At go-live we must decide whether to **backfill** those historical sends into the new
message container so they appear retroactively in each caregiver's inbox, or **start
fresh** with an empty inbox that fills only from new sends going forward.

## Decision

**Start fresh. The Message Center launches with no historical backfill.** The caregiver
inbox begins empty for every user and populates only from messages sent **after**
go-live through the new pipeline. No migration job runs against historical email sends.

This is a `rettxapi` data decision; per the control-plane cross-repo rules it is
**captured here** and the API lane executes (or, in this case, deliberately does not
execute) the corresponding migration. No code in any consumer repo changes.

## Rationale

1. **No in-app snapshot exists for historical sends.** Old messages went out as email
   only. A backfill would have to **re-derive** `in_app_body` from stored email HTML —
   exactly the path that produced the CSS-leak defect fixed in ADR 0003 / rettxapi #305.
   Reconstructing snapshots from legacy HTML re-introduces that risk for the lowest-value
   content.
2. **Read / archive state is unknown.** Historical items would import as **unread**,
   confronting every caregiver with a wall of unread badges (e.g. "47 unread") on first
   open — a poor first impression that could also re-trigger unread-count side effects.
3. **No `category_code`.** The frozen contract requires it, but pre-feature sends predate
   the controlled vocabulary, so nearly everything maps to `DEFAULT` ("Notification") —
   low value and visibly unfinished.
4. **Nothing is lost.** The historical emails still live in recipients' own email
   inboxes. Starting fresh destroys no record; it simply declines to retro-fit them into
   a surface they were never authored for.
5. **Effort vs. value.** Reconstituting recipient lists, content, timestamps, and state
   for a clean import is non-trivial, while caregivers do not expect old transactional
   emails to retroactively appear in a brand-new inbox.

## Alternatives considered

### A. Full backfill of all historical sends
Rejected. Maximises every risk above (legacy-HTML re-derivation, all-unread flood,
`DEFAULT` category sprawl) for content users don't expect to see in-app.

### B. Narrow curated backfill (e.g. welcome message per active caregiver)
Considered and **deferred, not adopted**. A tightly scoped import — only the welcome
message, marked **already-read**, category `onboarding`, body produced via the clean
ADR 0003 `inapp` derivation rather than legacy HTML — would avoid the unread flood and
the CSS-leak path while giving the inbox a non-empty "here's your history" feel. It was
set aside to keep go-live clean and unblocked. It remains the obvious first step **if**
a future need for in-app message history arises (see Follow-ups), and this ADR can be
revisited rather than re-litigated.

## Consequences

### Positive
- Cleanest, lowest-risk launch: no migration job, no legacy-HTML re-derivation, no
  day-one unread flood.
- The inbox only ever shows content authored for the in-app channel under the frozen
  contract — consistent category and clean body for every item.

### Negative
- Caregivers see **no history** at launch; the inbox is empty until the first new send.
  Early adopters may briefly perceive the feature as "empty".

### Neutral
- Reversible in spirit: a future curated backfill (Alternative B) can still be run later
  without conflicting with anything decided here.
- No consumer-repo (`rettxweb` / `rettxadmin`) impact; this is purely a `rettxapi`
  data-population decision.

## Follow-ups

- `rettxapi`: **no** backfill/migration script for go-live (explicit non-action).
- If in-app message **history** is later desired, implement Alternative B as a scoped,
  idempotent, already-read import using the ADR 0003 `inapp` derivation — not a raw
  legacy-HTML re-derivation — and revisit this ADR's status.
- Consider a first-run **empty-state** treatment in `rettxweb` that frames an empty inbox
  positively ("You're all caught up — new messages will appear here") so the fresh start
  reads as intentional rather than broken.

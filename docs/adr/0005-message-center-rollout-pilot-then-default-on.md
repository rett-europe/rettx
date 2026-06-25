# ADR 0005 — Message Center rollout: per-user pilot, then default-on for all

- **Status**: Accepted — implemented 2026-06-25
- **Date**: 2026-06-24 (implementation outcome appended 2026-06-25)
- **Decision-makers**: rettX maintainers
- **Relates to**: [`specs/032-message-center/`](../../specs/032-message-center/),
  [ADR 0004](0004-message-center-no-historical-backfill.md) (no historical backfill)

## Context

The caregiver Message Center is deployed to **production but dark** — the caregiver
in-app feature is gated behind a feature flag named **`messages`** that defaults **off**.
The caregiver web app (`rettxweb`) gates content on this flag
(`featureMatchGuard('messages')` / `isMessagesContentEnabled`); the flag's real value is
per-user, sourced from the user's profile/entitlements via `rettxapi`.

Two things need to happen for go-live, and they happen at **different times**:

1. We want to **pilot** with a small number of real caregivers in production before
   exposing the feature broadly.
2. Once the pilot looks good, we want the feature **on by default for everyone**.

At the moment, neither is operable: the `messages` flag is **not surfaced in the
rettxadmin Users screen**, so an admin cannot enable it for even a single pilot user.

## Decision

Roll out in **two explicit phases**, and build only Phase A now.

### Phase A — per-user pilot (now)
- Surface the `messages` feature flag as a **per-user toggle in the rettxadmin Users
  screen**, writing through to the same store the caregiver app reads.
- The global default stays **off**. Pilot caregivers are enabled **individually** by an
  admin.
- This is the immediate go-live-blocker fix and is owned by the `rettxadmin` lane (with
  an `rettxapi` change only if the per-user flag field does not already exist
  server-side).

### Phase B — default-on for all (later, on explicit maintainer go)
- Once the pilot is validated, flip the feature to **on by default for all users** with a
  **single, low-risk switch** — effectively ungating the feature.
- **No per-user exceptions are required after the global flip.** Once it is on for all, it
  is on for everyone. We therefore do **not** build tri-state / "explicit-off-wins"
  override semantics; the per-user flag exists only to drive the pilot.
- The exact location of the Phase-B switch (the `rettxweb` gate defaulting to
  true / being removed, **or** `rettxapi` resolving `messages` to true by default) is to
  be **identified and documented during Phase A** so the flip is a known one-liner, not a
  rebuild. If it lives in `rettxapi`, that change is routed when the maintainer calls the
  global go.

## Flag-key consistency (non-negotiable)

The caregiver app reads a flag literally named **`messages`**. Every layer — admin write,
storage, caregiver read — must use this **same key** end to end. A mismatch (e.g. admin
writes `message_center`, web reads `messages`) silently no-ops the toggle. Phase A must
verify the full path before sign-off.

## Implementation outcome (2026-06-25)

Both phases shipped; the cutover is **live in production**.

**Phase A — done.** The per-user `messages` toggle was added to the rettxadmin Users
screen (`rettxadmin` PR #50: one entry in `AVAILABLE_FEATURES`). The flag-key path was
verified end to end — admin writes `app_metadata.features.messages` via
`PATCH /admin/principals/{id}/features`; the caregiver app reads the **same key** off the
resolved profile. No `rettxapi` change was needed for Phase A. Pilot caregivers were
enabled individually and the pilot was validated.

**Phase B — done, as a single `rettxapi` resolution switch.** On the maintainer's explicit
go, `messages` was made **on for all caregivers**:

- The switch lives in `rettxapi`, **not** `rettxweb` — the caregiver app reads
  `app_metadata.features.messages` off the resolved profile, so defaulting it server-side
  lights up both `rettxweb` gates (route guard + unread badge) with **no web redeploy** and
  no dead frontend code. A frontend ungate (`rettxweb` PR #169) was prepared as a fallback
  and **closed unused** once the read path was confirmed to be API-resolved (no Auth0/JWT
  claim source).
- First cut (`rettxapi` PR #306) defaulted `messages` to `true` **only when unset**. This
  proved **insufficient**: pilot/admin-touched accounts carried an **explicit stored
  `messages: false`** — the rettxadmin Users screen PATCHes the full known-flag map with
  replace semantics, so saving a user while the toggle was off persisted `false`. Those
  accounts stayed dark.
- Final cut (`rettxapi` PR #307, **supersedes #306**) **forces `messages = true`
  regardless of the stored value**, realising this ADR's "no per-user exceptions". It is
  applied at the response builder
  (`principal_profile_services._map_principal_to_response`), the single funnel for
  `GET`/`PATCH /user/profile`. Deliberately **not** at the `FeaturesFlags` model level: the
  per-request `update_last_seen_at` full-document upsert would have stealth-migrated
  `messages: true` into stored docs. The response-layer override applies **on read only —
  non-destructive, no data migration**. One-line revert: delete
  `features_dict["messages"] = True`.

**Consequence — admin toggle retired.** Because caregiver visibility is now forced on
server-side, the rettxadmin Messages toggle is a no-op and is being **removed** (revert of
PR #50). Stored `messages` values are left as-is (harmless; overridden on read). Re-adding
the toggle entry is how a per-user switch would be restored if force-on is ever reverted.

This is consistent with the original decision (single low-risk switch, no migration, no
per-user exceptions); the only refinement is that realising "on for everyone" required
**force-true**, not merely default-when-unset, because explicit `false` values already
existed in the pilot cohort.

## Alternatives considered

### A. Skip the pilot — flip default-on at launch
Rejected. The feature is new and clinically adjacent; a controlled pilot with real users
in production de-risks content, i18n drafts (per ADR-adjacent i18n decision: go live on
machine-translated drafts with native review in parallel), and UX before broad exposure.

### B. Tri-state flag with per-user override that survives the global flip
Considered and **not adopted**. It would let an admin force specific users off even after
default-on. The maintainer confirmed this is unnecessary — once on for all, it is on for
everyone — so the simpler per-user-flag-for-pilot model is chosen to avoid building and
maintaining override-resolution logic.

### C. Bulk-set `messages = true` on every user row at Phase B
Rejected as the mechanism. Mutating every user record is messier and less reversible than
a single default/gate switch. Phase B should be one switch, not a data migration.

## Consequences

### Positive
- Safe, staged exposure: a few real users first, broad rollout second.
- Phase A unblocks enablement immediately (admin can flip pilot users).
- Phase B is deliberately kept to a single, documented, low-risk change.
- The simplified (no-exception) model avoids override-resolution complexity.

### Negative
- The feature reaches all users in **two steps** with a manual maintainer decision
  between them, rather than at a single launch moment.
- Until Phase B, enablement is manual and per-user (fine for a small pilot, not for
  scale — which is exactly why Phase B exists).

### Neutral
- This ADR governs **enablement/cutover only**; content behaviour, contracts, and the
  no-backfill decision (ADR 0004) are unchanged.
- Phase B's go is a separate, explicit maintainer instruction; nothing here authorises an
  automatic global flip.

## Follow-ups

- `rettxadmin`: ~~surface the per-user `messages` toggle in the Users screen (Phase A)~~
  **done (PR #50)**; key path verified. **Pending:** remove the now-redundant Messages
  toggle entry (revert of PR #50) since Phase-B force-on makes it a no-op.
- `rettxweb`: ~~confirm the gate is the single place a flip would touch~~ **done** — gates
  are `featureMatchGuard('messages')` + `isMessagesContentEnabled`, both reading the
  resolved profile; the Phase-B switch landed in `rettxapi` instead, so no `rettxweb`
  change shipped (fallback PR #169 closed unused).
- ~~When the maintainer calls the global go, route the Phase-B switch~~ **done** — Phase B
  shipped via `rettxapi` PR #306 → #307 (force-on); deployed to production 2026-06-25.

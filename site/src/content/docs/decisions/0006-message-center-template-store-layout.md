---
title: "ADR 0006 — Message Center template store: multi-channel layout & naming"
description: "Message Center template store: multi-channel layout & naming"
sidebar:
  order: 7
---

- **Status**: Accepted (2026-07-11)
- **Date**: 2026-07-11
- **Decision-makers**: rettX maintainers
- **Relates to**: [ADR 0003](https://github.com/rett-europe/rettx/blob/main/docs/adr/0003-message-channel-content-model.md) (channel
  content model), [`specs/032-message-center/`](https://github.com/rett-europe/rettx/blob/main/specs/032-message-center/spec.md),
  [`specs/033-message-center-push/`](https://github.com/rett-europe/rettx/blob/main/specs/033-message-center-push/spec.md)
  (push channel), [`patterns.md` §1 *Content* / §5](https://github.com/rett-europe/rettx/blob/main/.specify/memory/patterns.md)

## Context

The `templates` content repo (`rett-europe/templates`) holds the per-locale
Message Center message templates. They live in a top-level folder called
**`emails/`**, one subfolder per message type:

```
emails/welcome/
  en.html                 ← branded HTML email body
  en.subject.txt          ← email subject
  en.inapp.txt            ← (optional, ADR 0003) dedicated in-app body
  en.push.subject.txt     ← (new, spec 033) push title
  en.push.txt             ← (new, spec 033) push body
```

When the folder was created (spec 032) it held only email content, so `emails/`
was an accurate name. It has since become the store for **all three Message
Center channels** — email, in-app (ADR 0003), and now Android **push** (spec
033). The folder name `emails/` is therefore now a **misnomer**: it holds
multi-channel message content, not just emails. The same is true of the blob
**container** it deploys to, `email-templates`.

This ADR exists because that misnomer surfaced during the push rollout and
raised a fair question: *should the template store be refactored?* Before
answering, it is essential to separate what is **cosmetic** from what is
**load-bearing**, because they carry very different migration cost and risk.

### What is actually coupled (and what is not)

The deploy is a **full sync with delete**
(`templates/.github/workflows/deploy-email-templates.yml`):

```
az storage blob sync --source ./emails --container email-templates \
    --delete-destination true
```

- The **`emails/` prefix is stripped at deploy.** `emails/welcome/en.html`
  becomes blob `welcome/en.html`. The source folder name **never reaches the
  blob store or `rettxapi`** — it is a pure repo-local label.
- **`rettxapi` reads from the blob container** (`email-templates`, configured via
  env `RETTX_STORAGE_EMAIL_TEMPLATE_CONTAINER`) by the path convention
  `<type>/<locale>.<suffix>`. It has no knowledge of the `emails/` folder.
- Because the sync uses `--delete-destination true`, **the container mirrors the
  source exactly**: any change to the *blob path layout* (not just the folder
  name) is applied destructively — old paths are deleted on the next deploy.

This gives three distinct levers, in ascending order of cost:

| Lever | What changes | Touches `rettxapi`? | Blob paths change? | Risk |
|---|---|---|---|---|
| **(a)** Source folder `emails/` → e.g. `messages/` | repo label + deploy `--source` path + `deploy.ps1` | No | No (prefix stripped either way) | Trivial |
| **(b)** File-naming convention (e.g. group by channel) | blob paths + `rettxapi` resolver | **Yes** | **Yes** | High (see migration hazard) |
| **(c)** Blob container `email-templates` → e.g. `message-templates` | container + `rettxapi` env in every environment + data migration | **Yes** | n/a | High (cross-repo, multi-env) |

### Migration hazard (why (b)/(c) are not free)

`--delete-destination true` means a blob-path restructure is **not** additive: on
the first deploy after the change, the *old* paths are deleted while `rettxapi`
in production still expects them. Any restructure of blob paths or the container
name therefore requires a **coordinated cutover** — `rettxapi` must be able to
read the new layout **before** the templates repo deploys it — or a dual-read /
dual-write window. This is the core reason the current flat `<type>/<locale>.<suffix>`
convention is worth preserving unless there is a strong driver to change it.

## Decision drivers

- **Clarity** — a newcomer should not read `emails/` and assume it is email-only.
- **Low migration risk** — avoid destructive, cross-repo, multi-environment
  changes for cosmetic gain, especially mid-pilot.
- **Channel-extensibility** — the scheme should absorb a *fourth* channel later
  without another migration. (It already absorbed push cleanly via the
  `.push.` infix.)
- **Backward compatibility** — the push fix (spec 033) just shipped under the
  current convention; a refactor must not regress it.
- **Consistency with governance** — `templates` is now a first-class routable
  repo (`patterns.md` §1 *Content*); changes to its contract flow through spec +
  ADR, not ad-hoc renames.

## Options

### Option 0 — Status quo (keep `emails/` + flat suffix convention)
No change. `emails/` stays a mild misnomer; the flat `<type>/<locale>.<suffix>`
convention (with `.subject.txt`, `.inapp.txt`, `.push.subject.txt`, `.push.txt`
infixes) continues. Zero risk, zero clarity gain.

### Option 1 — Rename the source folder only (`emails/` → `messages/`) **[recommended]**
Rename the repo folder and update `--source ./emails` (deploy workflow) and
`deploy.ps1`. Blob paths and the container name are **unchanged** (prefix is
stripped), so `rettxapi` is untouched and there is no cutover. Pure clarity win;
the folder name finally reflects "multi-channel Message Center message content".
Optionally add a repo `README` documenting the per-channel file convention.

### Option 2 — Restructure to a channel-grouped layout
e.g. `<type>/<locale>/{email.html,email.subject.txt,inapp.txt,push.title.txt,push.body.txt}`.
Cleaner mental model, but changes **blob paths** → requires a `rettxapi` resolver
change and a coordinated destructive cutover (see hazard). Higher value, much
higher cost; only justified if the flat convention becomes genuinely unwieldy.

### Option 3 — Rename the blob container (`email-templates` → `message-templates`)
The most "correct" rename, but the most expensive: container migration plus
`rettxapi` env changes across dev/pre/prod and a redeploy. Low ROI for a name
that is invisible to end users.

## Recommendation

Adopt **Option 1 now** (rename the source folder to `messages/`, container and
blob layout unchanged) as a cheap, zero-risk clarity fix, and **defer Options 2
and 3** unless a concrete need arises. Keep the flat `<type>/<locale>.<suffix>`
file convention: it is channel-extensible (it absorbed push without a migration)
and avoids the sync-with-delete cutover hazard. Record the per-channel file
convention explicitly (this ADR + a `templates` README + `patterns.md` §5) so the
naming is self-documenting regardless of the folder label.

> This ADR is **Accepted** (2026-07-11). The `patterns.md` convention/`messages/`
> documentation lands with this ADR (control-plane PR #27); the folder rename
> itself is executed as a `templates` repo slice (its own PR) — the container and
> blob paths are unchanged, so `rettxapi` needs no change.

## Consequences

### Positive
- The store name reflects reality (multi-channel), removing the `emails/`
  misnomer with no runtime risk.
- The load-bearing coupling (blob container + flat path convention consumed by
  `rettxapi`) is preserved, so nothing has to be re-authored or migrated.
- The per-channel file convention becomes documented and self-explanatory.

### Negative
- A folder rename touches every path in the `templates` repo's deploy config and
  any local tooling that hard-codes `emails/` (small, contained).
- The container name `email-templates` remains a residual misnomer (accepted;
  Option 3 deferred).

### Neutral
- No `rettxapi` change and no blob migration under the recommended option.
- Options 2/3 remain available later behind a proper coordinated cutover if the
  flat convention or container name ever becomes a real pain point.

## Follow-ups (on acceptance)
- **`templates`** — rename `emails/` → `messages/`; update
  `deploy-email-templates.yml` (`--source`) and `deploy.ps1`; add a `README`
  documenting the `<type>/<locale>.<suffix>` per-channel convention
  (`.html`, `.subject.txt`, `.inapp.txt`, `.push.subject.txt`, `.push.txt`).
- **`patterns.md`** — §1 *Content* / §5: note the folder is `messages/` and
  record the per-channel file-suffix convention explicitly.
- **`rettxapi`** — no change required under Option 1 (documentation cross-link
  only). If Options 2/3 are ever adopted, that work is gated on a coordinated
  resolver/env cutover captured in a superseding ADR.

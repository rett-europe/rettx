---
title: "ADR 0008 — Retire the autonomous Squad/Ralph agent system"
description: "Retire the autonomous Squad/Ralph agent system"
sidebar:
  order: 9
---

- **Status**: Accepted (2026-07-11)
- **Date**: 2026-07-11
- **Decision-makers**: rettX maintainers
- **Relates to**: [ADR 0002](https://github.com/rett-europe/rettx/blob/main/docs/adr/0002-cross-cutting-gap-analysis-pipeline.md)
  (gap-analysis → umbrella spec → `spec-fanout` orchestration pipeline),
  [`patterns.md` §6](https://github.com/rett-europe/rettx/blob/main/.specify/memory/patterns.md) (issue routing labels)

## Context

Each downstream execution repo (`rettxapi`, `rettxweb`, `rettxadmin`) shipped a
self-contained **Squad** toolkit — colloquially "Ralph" — that let a set of
autonomous agents act on issues without a human in the loop. It consisted of:

- Four GitHub Actions workflows: `squad-heartbeat.yml`, `squad-issue-assign.yml`,
  `squad-triage.yml`, and `sync-squad-labels.yml`.
- A `.squad/` directory holding Star-Wars-named agent **charters**, **ceremonies**,
  **routing** rules, and **config** that told those agents how to self-assign,
  triage, and begin work.

The system watched for issues labelled `squad` (the fan-out inbox label applied by
the control-plane `spec-fanout` workflow) and would auto-assign, triage, and start
work on them. Its heartbeat and triage jobs ran on **every PR and push**, producing
a steady stream of CI noise and bot chatter that was disproportionate to the value
it delivered. In practice the autonomous behaviour was hard to reason about: two
overlapping coordination models (autonomous Squad vs. human orchestration) existed
side by side, and the Squad path frequently acted on issues in ways a maintainer
then had to correct.

Meanwhile the program adopted a **session-based orchestration** model. Under
[ADR 0002](https://github.com/rett-europe/rettx/blob/main/docs/adr/0002-cross-cutting-gap-analysis-pipeline.md), cross-cutting work is
gap-analysed and specced in the control plane, then fanned out; a human coordinator
opens the resulting issues/specs and **spawns one working session per repo**, each
landing its own PR. That model already covers everything the Squad system was meant
to do — and does it with a clear, auditable, one-session-one-branch-one-PR shape —
so the autonomous layer became redundant overhead.

## Decision

**Retire the autonomous Squad/Ralph system.**

- **Delete** the four `squad-*.yml` workflows (`squad-heartbeat.yml`,
  `squad-issue-assign.yml`, `squad-triage.yml`, `sync-squad-labels.yml`) and the
  `.squad/` directory from every downstream repo that carried them. The removal
  also sweeps up the **companion artifacts** the toolkit installed: the Squad
  **Coordinator** agent (`.github/agents/squad.agent.md`) and, in `rettxweb` and
  `rettxadmin`, the six Squad-coupled Copilot skills under `.copilot/skills/`.
- **Keep the `squad` GitHub label.** It is unchanged as a routing artifact: the
  control-plane `spec-fanout` workflow still applies it to each `[spec/<slug>]`
  downstream issue. What changes is that the label **no longer triggers any
  automation**. It is now purely the **fan-out inbox** marker — a human/orchestrated
  working session picks the issue up rather than an autonomous agent.
- **Retain the spec-kit workflows.** The control-plane pipeline
  (`issue-to-spec` / `spec-to-branch` / `spec-pr-guard`, and the `spec-fanout`
  fan-out itself) is unaffected. Downstream repos keep their local spec-kit
  commands; only the autonomous Squad layer on top of them is removed.

### Scope

Repos cleaned up by this decision:

- `rettxapi`
- `rettxweb`
- `rettxadmin`

`rettxid`, `rettxmutation`, and `templates` never carried the Squad toolkit, so
there is nothing to remove there.

Implementation PRs:

- `rettxapi` — [rett-europe/rettxapi#312](https://github.com/rett-europe/rettxapi/pull/312)
- `rettxweb` — [rett-europe/rettxweb#182](https://github.com/rett-europe/rettxweb/pull/182)
- `rettxadmin` — [rett-europe/rettxadmin#55](https://github.com/rett-europe/rettxadmin/pull/55)

## Consequences

### Positive

- **Less CI noise.** The heartbeat/triage jobs no longer run on every PR and push.
- **One coordination model.** Session-based orchestration (ADR 0002) is now the
  single way cross-cutting work is picked up and executed — no competing autonomous
  path.
- **Simpler mental model.** A maintainer reads a `squad`-labelled issue as an inbox
  item to pick up, not as something a bot may already be acting on.

### Negative / neutral

- **No more auto-assignment or auto-triage** in the downstream repos; a human must
  now spawn a session to act on a `squad` issue.
- The `squad:<member>` **sub-labels become orphaned metadata** — they no longer map
  to any active agent. They can be pruned opportunistically; leaving them in place
  is harmless.
- Downstream `squad` issues now **require a human/orchestrated session** to move
  forward. This is intentional: the pickup is deliberate and auditable rather than
  automatic.

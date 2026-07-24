---
title: Architecture decision records
description: Why we built rettX the way we did.
sidebar:
  order: 1
---

An **architecture decision record** (ADR) captures a significant
decision, the alternatives we considered, and why we chose what we
chose. ADRs are immutable once merged — if we change our mind, we
write a new ADR that supersedes the old one.

ADRs live under
[`docs/adr/`](https://github.com/rett-europe/rettx/tree/main/docs/adr)
in the source tree.

## Currently merged ADRs

| # | Title | Status |
|---|---|---|
| [0001](/decisions/0001-control-plane-repo/) | rettx is the rettX control-plane repo | Accepted |
| [0002](/decisions/0002-cross-cutting-gap-analysis-pipeline/) | Gap-analysis-first pipeline for cross-cutting work | Accepted |
| [0003](/decisions/0003-message-channel-content-model/) | In-app vs email content model for the Message Center | Accepted |
| [0004](/decisions/0004-message-center-no-historical-backfill/) | Message Center launches with no historical backfill | Accepted |
| [0005](/decisions/0005-message-center-rollout-pilot-then-default-on/) | Message Center rollout: per-user pilot, then default-on for all | Accepted — implemented 2026-06-25 |
| [0006](/decisions/0006-message-center-template-store-layout/) | Message Center template store: multi-channel layout & naming | Accepted (2026-07-11) |
| [0007](/decisions/0007-ai-code-review-custom-instructions/) | AI code-review custom instructions across the ecosystem | Accepted (2026-07-11) |
| [0008](/decisions/0008-retire-autonomous-squad-agent-system/) | Retire the autonomous Squad/Ralph agent system | Accepted (2026-07-11) |
| [0009](/decisions/0009-pulse-menstrual-period-duration-model/) | Pulse menstrual period modelled as start + duration | Proposed (2026-07-22) |
| [0010](/decisions/0010-pulse-sleep-entry-duration-quality-model/) | Pulse sleep entry: total duration + quality, with input-only bedtime/wake | Proposed (2026-07-22) |

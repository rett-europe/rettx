---
title: Development decision archive
description: Historical product, architecture, and development decisions for contributors.
sidebar:
  order: 1
---

This archive is for contributors looking for the reasoning behind a past
decision. It includes product design, architecture, and software delivery
processes; it is not an introduction to the registry or a statement of
patient data governance.

For the current system, start with [how rettX works](/architecture/overview/)
and [security and privacy](/architecture/security/). Historical decisions
may describe proposals, pilots, or behaviour that has since changed.
Their status does not by itself mean a feature is available today.

An **architecture decision record** (ADR) captures a significant
decision, the alternatives we considered, and why we chose what we
chose. ADRs are immutable once merged — if we change our mind, we
write a new ADR that supersedes the old one.

The site publishes a selection of these records; records about
unpublished prototypes are not included.

## Currently merged ADRs

| # | Title | Status |
|---|---|---|
| [0001](/decisions/0001-control-plane-repo/) | rettx is the rettX control-plane repo | Accepted; scope superseded by ADR 0019 (2026-11-28) |
| [0002](/decisions/0002-cross-cutting-gap-analysis-pipeline/) | Gap-analysis-first pipeline for cross-cutting work | Accepted |
| [0003](/decisions/0003-message-channel-content-model/) | In-app vs email content model for the Message Center | Accepted |
| [0004](/decisions/0004-message-center-no-historical-backfill/) | Message Center launches with no historical backfill | Accepted |
| [0005](/decisions/0005-message-center-rollout-pilot-then-default-on/) | Message Center rollout: per-user pilot, then default-on for all | Accepted — implemented 2026-06-25 |
| [0006](/decisions/0006-message-center-template-store-layout/) | Message Center template store: multi-channel layout & naming | Accepted (2026-07-11) |
| [0007](/decisions/0007-ai-code-review-custom-instructions/) | AI code-review custom instructions across the ecosystem | Accepted (2026-07-11) |
| [0008](/decisions/0008-retire-autonomous-squad-agent-system/) | Retire the autonomous Squad/Ralph agent system | Accepted (2026-07-11) |
| [0012](/decisions/0012-admin-rbac-entra-app-roles/) | Admin RBAC: Entra App Roles for membership + super_admin-configurable capabilities | Proposed (2026-07-26) |
| [0014](/decisions/0014-ios-app-via-capacitor-github-actions/) | iOS app via Capacitor, built on GitHub Actions macOS runners | Proposed (2026-07-28) |
| [0016](/decisions/0016-infrastructure-as-code-private-repo/) | Infrastructure as code in a dedicated private repository (rettxinfra) | Accepted (2026-11-13); scope of third-party services amended |
| [0019](/decisions/0019-split-initiative-home-and-engineering-hub/) | Split the initiative home (rettx) from the engineering hub (rettx-engineering) | Accepted (2026-11-28) |

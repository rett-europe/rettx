---
title: "ADR 0019 — Split the initiative home (rettx-initiative) from the engineering hub (rettx-engineering)"
description: "Split the initiative home (rettx-initiative) from the engineering hub (rettx-engineering)"
sidebar:
  order: 20
---

- **Status**: Accepted (2026-11-28); amended 2026-11-28 (see the Amendment section)
- **Date**: 2026-11-28
- **Decision-makers**: rettX maintainers
- **Supersedes**: the scope of [ADR 0001](/decisions/0001-control-plane-repo/). Its
  engineering mechanics (Iris, `/route confirm`, spec fan-out, the
  `rettx-iris` identity and the permission model) remain in force for the
  engineering hub.
- **Relates to**: [program constitution](https://github.com/rett-europe/rettx-engineering/blob/main/.specify/memory/constitution.md)
  (redefined by this decision as the engineering constitution, version 2.0.0),
  [`patterns.md`](https://github.com/rett-europe/rettx-engineering/blob/main/.specify/memory/patterns.md) §1,
  ADR 0018 (the rettX
  dataset agreed with Working Group 6).

## Context

ADR 0001 made this repository the public control plane for the rettX
*software*: the constitution, cross-cutting specs, ADRs, Iris intake and the
`docs.rettx.eu` site. Since then rettX has grown into a wider initiative led
by Rett Syndrome Europe. It now covers a common dataset agreed with clinicians
and institutions (Working Group 6), and companion work on identity, data
exchange and trust between registries. Its audience includes families,
clinicians, partners and funders, not only contributors.

One repository now serves two different readers:

- people who want to understand what the rettX initiative is, why it exists
  and how it is governed, in plain language; and
- people who build and operate the software, who need specs, ADRs, routing
  automation and delivery accounting.

Mixing the two makes each worse. The initiative's story is buried under
engineering material, and the engineering hub's conventions (spec numbering,
fan-out, Iris labels) leak into content meant for non-technical readers. The
initiative also needs a governance home that is not defined by the software:
its steering group sets its direction, and the software implements it.

## Decision

1. **Two repositories, two public sites.**

   | | `rettx-initiative` (initiative home) | `rettx-engineering` (engineering hub) |
   |---|---|---|
   | Purpose | The rettX initiative: vision, mission, principles, governance, roadmap, and the initiative specifications (Identity, Data Standard, Exchange, Trust) | All rettX software: today's apps, API, libraries and infrastructure, and future software such as federation pipelines or identity services |
   | Holds | Plain-language pages for families, clinicians, partners and funders | Engineering constitution, `patterns.md`, cross-cutting specs, ADRs, Iris intake and routing, delivery accounting |
   | Site | `docs.rettx.eu` | `engineering.rettx.eu` |
   | Repository | Private | Public |
   | Site visibility | Public | Public |

   This repository becomes `rettx-engineering` by renaming, so its history,
   issues, Iris installation and secrets are kept.

   The initiative home is the `rettx-initiative` repository. It stays
   private and keeps its name; only its site at `docs.rettx.eu` is public.
   The site is the public record of the initiative.

   No repository takes the name `rettx` after the rename. That way GitHub
   keeps sending old `rett-europe/rettx` links to `rettx-engineering`.

2. **Boundary.** The initiative home states *what* the initiative agrees and
   *why*. The engineering hub decides *how* software delivers it. An
   engineering spec that implements an initiative specification cites it.
   Hand-offs between the two are manual; there is no automated fan-out from
   the initiative home.

3. **What stays out of the initiative home.** No Iris, Spec Kit or delivery
   ledger. Software issues raised there are transferred to
   `rettx-engineering`. Only agreed Working Group 6 decisions are presented
   as agreed; companion specifications are marked as proposals. The Data
   Standard is published only once agreed and its licence reviewed. No
   patient data.

4. **Code stays where it is.** Application, library and infrastructure code
   remains in its own repositories. Repository visibility does not change.

5. **Governance.** The program constitution becomes the engineering
   constitution for all rettX software (version 2.0.0). Its non-negotiable
   principles I–III are unchanged. It defers to the initiative's principles
   only once the initiative's steering group adopts them; until then it
   stands as written.

6. **Domains.** `rettx.eu` (the public website) and `app.rettx.eu` are not
   affected. `docs.rettx.eu` moves to the initiative home at cutover; the
   engineering site moves to `engineering.rettx.eu`. Old `docs.rettx.eu`
   engineering links are sent to `engineering.rettx.eu` from the initiative
   home's not-found page.

7. **Sequence.** This ADR records the decision only. Building the initiative
   home, the cutover changes in this repository (automation, links, site
   domain) and its rename follow as separate, reviewed steps. Before any
   subdomain moves, the `rettx.eu` domain is verified for the organisation
   so no subdomain can be taken over in transit.

## Consequences

### Positive

- Families, clinicians, partners and funders get a plain-language home that
  leads with the initiative, not with its software.
- The engineering hub keeps its full history and automation unchanged in
  substance.
- The initiative's direction is governed by its steering group, not implied
  by software decisions.

### Negative

- Two repositories and two sites to maintain.
- Local clones need their remote updated after the rename. Old GitHub links
  keep working only while no repository is created with the name `rettx`.
- The initiative's source is not open to public review; readers see the
  published site, not the drafts behind it.
- Hand-offs between initiative and engineering are manual and need discipline.

### Neutral

- Downstream repositories keep their own constitutions. Their back-links move
  to `rettx-engineering` through a follow-up spec after cutover.

## Alternatives considered

### Keep one repository, add an initiative section to the site

Rejected. The audiences, tone and governance differ. The engineering
conventions would keep shaping the initiative content, and the initiative
would have no governance home independent of the software.

### Move the initiative content to the public website (`rettx.eu`)

Rejected. The public website is the patient-facing landing and follows its own
publishing process. Initiative specifications and governance need versioned,
reviewable source and a site of their own.

### Create a new engineering repository and keep this one as the initiative home

Rejected. All engineering history, issues, Iris installation and secrets live
here. Moving them is riskier than renaming, and the initiative home benefits
from a clean history.

## Amendment (2026-11-28)

The original decision made the initiative repository public and renamed it
`rettx` at cutover. That is changed:

- The initiative repository stays **private** and keeps the name
  **`rettx-initiative`**. Only its site at `docs.rettx.eu` is public.
- No repository is created with the name `rettx`. This keeps GitHub's
  redirect from `rett-europe/rettx` to `rettx-engineering` working, so
  existing links to the engineering hub do not break.

The boundary, governance, domains and sequence are otherwise unchanged.

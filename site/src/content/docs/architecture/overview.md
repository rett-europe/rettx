---
title: Architecture overview
description: A high-level view of how the rettX patient registry is built.
sidebar:
  order: 1
---

This page is a high-level orientation. Deeper dives live alongside it
under the **Architecture** section as they are written.

## Layers

rettX is intentionally small for a healthcare system. There are three
runtime layers and two supporting libraries:

```mermaid
flowchart TD
    Caregivers(["👤 Caregivers"]):::actor
    Admins(["🏥 Admins / clinicians"]):::actor

    rettxweb["**rettxweb**<br/>Angular PWA<br/><sub>app.rettx.eu</sub>"]:::surface
    rettxadmin["**rettxadmin**<br/>web app"]:::surface

    rettxapi["**rettxapi**<br/>Python service<br/><sub>registry data · consent · access control</sub>"]:::backend

    rettxmutation[["**rettxmutation**<br/><sub>PyPI · HGVS parsing</sub>"]]:::lib
    rettxid[["**rettxid**<br/><sub>PyPI · pseudonymous IDs</sub>"]]:::lib

    Caregivers --> rettxweb
    Admins --> rettxadmin
    rettxweb --> rettxapi
    rettxadmin --> rettxapi
    rettxapi --> rettxmutation
    rettxapi --> rettxid

    classDef actor fill:#f2f2f2,stroke:#8b4ea6,stroke-width:1.5px,color:#333
    classDef surface fill:#fdf0f7,stroke:#ed3385,stroke-width:1.5px,color:#333
    classDef backend fill:#f3e8f7,stroke:#8b4ea6,stroke-width:2px,color:#333
    classDef lib fill:#eaeaff,stroke:#4e4bbf,stroke-width:1.5px,color:#333
```

## Trust boundaries

- The **caregiver app** and the **admin app** never see another
  patient's data. All authorisation is enforced server-side in
  `rettxapi`.
- `rettxapi` is the only component that touches identifiable data at
  rest. Pseudonymous identifiers come from `rettxid`; mutation strings
  are normalised through `rettxmutation`.
- The **docs site** (this site) and the **WordPress landing site** at
  `rettx.eu` are static and have no access to patient data.

## How changes flow

For anything that crosses a trust boundary or affects more than one
component, we write a **specification** in
[`specs/`](https://github.com/rett-europe/rettx/tree/main/specs)
before any code is written. The spec must pass a constitution check
(see [governance](/governance/constitution/)) before tasks are fanned
out to the relevant repositories.

## What lives where

See the [ecosystem map](/welcome/ecosystem/) for which repository
holds what, and which are public versus private.

## More to come

This section will grow as we publish ADRs and architecture deep dives.
Watch the [decisions](/decisions/) section for newly-merged ADRs.

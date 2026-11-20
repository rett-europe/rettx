---
title: Architecture overview
description: A high-level view of how the rettX patient registry is built.
sidebar:
  order: 1
---

rettX has a caregiver app, a local tool for RSE administrators, and an API
that enforces access to registry data. This page explains how those
components fit together; the [security and privacy overview](/architecture/security/)
describes the controls in more detail.

## Layers

rettX is intentionally small for a healthcare system. There are three
runtime layers and two supporting libraries:

```mermaid
flowchart TD
    Caregivers(["👤 Caregivers"]):::actor
    Admins(["🏥 RSE admins"]):::actor

    rettxweb["rettxweb<br/><small>Angular PWA · app.rettx.eu</small>"]:::surface
    rettxadmin["rettxadmin<br/><small>admin web app · local only</small>"]:::surface

    rettxapi["rettxapi<br/><small>Python service · consent · access control</small>"]:::backend

    rettxmutation[["rettxmutation<br/><small>PyPI · HGVS parsing</small>"]]:::lib
    rettxid[["rettxid<br/><small>PyPI · pseudonymous IDs</small>"]]:::lib

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

- **Caregivers** can access only the patient records explicitly granted
  to them. **RSE administrators** have role-scoped permissions for registry
  operations. All authorisation is enforced server-side in `rettxapi`.
- The **admin app** runs locally and is not publicly deployed.
  It is available only to RSE administrators, not clinicians.
  Local operation does not replace authentication or API permission checks.
- `rettxapi` is the only component that touches identifiable data at
  rest. Pseudonymous identifiers come from `rettxid`; mutation strings
  are normalised through `rettxmutation`.
- The **docs site** (this site) and the **WordPress landing site** at
  `rettx.eu` are static and have no access to patient data.

## From caregiver to registry

Caregivers register a person, upload diagnosis documents, respond to
requests for more information, and receive messages from the registry.
RSE administrators review those submissions through their separate tool.
Both surfaces use the API; they do not communicate directly with each other.

The API checks the caller's identity and permissions before providing
access to records. Supporting libraries normalise genetic variant
descriptions and generate pseudonymous registry identifiers.

## What lives where

See the [ecosystem map](/welcome/ecosystem/) for which repository
holds what, and which are public versus private.

---
title: The rettX ecosystem
description: The seven repositories that make up rettX, their roles, and their visibility.
---

rettX is a small constellation of repositories. Each has a clear job;
each follows the same program constitution.

## Repository map

| Repository | Visibility | Role |
|---|---|---|
| `rettx` (this one) | 🌍 Public | **Control plane.** Constitution, cross-cutting specs, ADRs, this docs site, issue intake/triage, brand assets. |
| `rettxweb` | 🔒 Private | **Caregiver web app.** Angular PWA served at `app.rettx.eu`. The primary surface for caregivers entering registry data. |
| `rettxadmin` | 🔒 Private | **Admin web app.** Internal tooling for Rett Syndrome Europe (RSE) administrators only, not clinicians. It runs locally and is not publicly deployed. |
| `rettxapi` | 🔒 Private | **Backend API.** Python service that owns the registry data model, consent state, and access controls. |
| `rettxmutation` | 🌍 Public | **Library.** HGVS-aware mutation parsing and normalisation, published to PyPI; consumed by `rettxapi`. |
| `rettxid` | 🌍 Public | **Library.** Pseudonymous registry identifier generator, published to PyPI; consumed by `rettxapi`. |
| `rettxinfra` | 🔒 Private | **Infrastructure.** Azure infrastructure as code: the resources, environments, identities and permissions the other repositories deploy into. |

Application repositories that handle patient data (`rettxweb`,
`rettxadmin`, `rettxapi`) are private. We treat patient data as the
asset most worth protecting; locking down the surfaces that touch it
is part of that protection.

`rettxinfra` is private for a different reason: a description of how
the platform is built and secured is also a map of its attack surface.
The decision is recorded in
[ADR 0016](/decisions/0016-infrastructure-as-code-private-repo/).

The two libraries are public because they encapsulate generally useful
domain logic with no patient context, and publishing them on PyPI
makes our quality and security posture inspectable by the wider
community.

## Where does code live?

This repository (`rettx`) **does not contain application code**. Its
job is to coordinate the others.

When a feature needs work in more than one place — for example, a new
field that has to appear in the caregiver app, the admin tool, and the
API — we write a single specification here, then fan it out as tracked
issues in each downstream repository.

Development workflows are documented separately in the
[contributing guide](/governance/contributing/).

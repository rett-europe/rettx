---
title: The rettX ecosystem
description: The six repositories that make up rettX, their roles, and their visibility.
---

rettX is a small constellation of repositories. Each has a clear job;
each follows the same program constitution.

## Repository map

| Repository | Visibility | Role |
|---|---|---|
| `rettx` (this one) | 🌍 Public | **Control plane.** Constitution, cross-cutting specs, ADRs, this docs site, issue intake/triage, brand assets. |
| `rettxweb` | 🔒 Private | **Caregiver web app.** Angular PWA served at `app.rettx.eu`. The primary surface for caregivers entering registry data. |
| `rettxadmin` | 🔒 Private | **Admin web app.** Internal tooling for registry administrators and clinical partners. |
| `rettxapi` | 🔒 Private | **Backend API.** Python service that owns the registry data model, consent state, and access controls. |
| `rettxmutation` | 🌍 Public | **Library.** HGVS-aware mutation parsing and normalisation, published to PyPI; consumed by `rettxapi`. |
| `rettxid` | 🌍 Public | **Library.** Pseudonymous registry identifier generator, published to PyPI; consumed by `rettxapi`. |

Application repositories that handle patient data (`rettxweb`,
`rettxadmin`, `rettxapi`) are private. We treat patient data as the
asset most worth protecting; locking down the surfaces that touch it
is part of that protection.

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

## How does work flow in?

1. Anyone can open an issue in `rettx` describing a bug or proposing a
   change.
2. The **Iris** automation classifies the issue and labels it with the
   target route (`route:web`, `route:admin`, `route:api`,
   `route:mutation`, `route:id`, or `cross-cutting`).
3. A maintainer with `write` permission or above confirms the routing
   with a `/route confirm` comment.
4. For point fixes, Iris opens a linked issue in the target
   repository. For cross-cutting changes, a specification is written
   here first and then fanned out on merge.

See the [contributing guide](https://github.com/rett-europe/rettx/blob/main/CONTRIBUTING.md)
for the human-facing version of this flow.

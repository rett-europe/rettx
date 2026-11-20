<!--
  Frontmatter below is machine-read by .github/workflows/spec-fanout.yml when
  this spec is merged into main. Fanout only runs when status is `ready` or
  `accepted`. Merging a `draft` is safe and fans out nothing.

  Allowed fanout repos: rettxweb, rettxadmin, rettxapi, rettxmutation, rettxid, templates, rettxinfra.

  STACK & DELIVERY PRE-FLIGHT (patterns.md §1 / §7): rettxweb is an Angular PWA
  wrapped with Capacitor as a NATIVE MOBILE SURFACE. Android and iOS builds are
  produced and published by pipelines that live in rettxweb and keep living
  there: they build the app, so they belong beside its code. rettxinfra
  (ADR 0016) owns the cloud resources, identities and permissions those
  pipelines depend on. No rettxapi, rettxadmin, rettxmutation, rettxid or
  `templates` slice.

  IMPORTANT: OUTCOMES ONLY. `rettx` is a PUBLIC repo. Secret names, account
  and project identifiers, signing material, track ids and per-store
  configuration stay in the private repos.
-->
---
spec_id: "057"
slug: "mobile-release-pipeline"
title: "A repeatable, documented release path for the native mobile apps"
status: ready   # draft | ready | accepted | superseded
authored: "2026-11-19"
author: "perocha"
source_issue: ""
relates_to: "specs/045-ios-app/ (introduced the iOS target and its pipeline); docs/adr/0014-ios-app-via-capacitor-github-actions.md; docs/adr/0016-infrastructure-as-code-private-repo.md; specs/052-rettxinfra/; specs/033-message-center-push/"
fanout:
  - repo: rettxweb
    summary: |
      PRIMARY IMPLEMENTER. Android and iOS builds now install and receive push
      from automated pipelines, but the path from merged code to a tester's
      phone is only partly written down and only partly protected. Make that
      path a first-class, documented, verified part of the product.

      Outcomes:
      (1) ONE END-TO-END RELEASE GUIDE. A maintainer who has never shipped the
      app can go from "merged to main" to "in testers' hands on both platforms"
      by following a single document, including how a release is promoted from
      testing to production and who approves each step. Per-platform detail may
      live in separate pages, but the guide is the entry point and nothing a
      release needs is discoverable only from tribal knowledge.
      (2) NATIVE BREAKAGE IS CAUGHT BEFORE RELEASE DAY. A change that breaks the
      native build on either platform is detected on the pull request that
      introduces it (or, where platform cost makes that impractical, on a
      regular schedule well inside a release cycle), not first discovered when
      a release is cut.
      (3) PROMOTION IS EXPLICIT AND GATED. Nothing reaches real caregivers
      without a named human approval. The default outcome of an automated
      release is "available to testers, not yet to the public".
      (4) A KNOWN ROLLBACK AND HOTFIX PATH exists and is documented for both
      stores, including what to do when a release is already live.
      (5) RELEASE METADATA CANNOT DRIFT SILENTLY. Release notes and tester
      notes are validated before a build spends time, for both platforms, so a
      missing or invalid note fails fast.
      (6) A SINGLE VERSION SOURCE. The app version has one authoritative origin
      that web, Android and iOS all derive from.
      (7) SECRET HYGIENE IS VISIBLE. There is a maintained register of every
      credential the pipelines need: what it is for, who owns it, when it
      expires and how to rotate it. No credential is committed or logged.
      Values are never recorded in this register, only the facts above.
      The register itself is kept in a private location.
      (8) HOUSEKEEPING OF RECORD. The decision record and spec for the iOS
      target reflect that the work shipped.

  - repo: rettxinfra
    summary: |
      SUPPORTING. The mobile pipelines depend on cloud-side resources that
      today were created by hand. Bring those that can sensibly be managed as
      code under the infrastructure repo, and record the rest as a runbook.

      Outcomes:
      (1) The push-messaging project and its Android and iOS app registrations
      are reproducible and owned in one place, with their ownership and
      recovery path documented.
      (2) The identity the Android pipeline uses to reach the store's publishing
      API is defined with least privilege, with its rotation and expiry tracked
      alongside the other programme credentials.
      (3) Anything that cannot be managed as code (store console setup, app
      records, store API keys, tester groups) is captured as an ordered,
      repeatable runbook so the programme can be rebuilt after losing an
      account owner.
      (4) The credential register's infra-owned entries are kept current and
      feed the existing credential-expiry monitoring where that applies.
      Nothing about this slice changes how the app is built.
---

# A repeatable, documented release path for the native mobile apps

## Why

The native apps work. A caregiver can install them, sign in and receive push
notifications on both platforms. What does not yet exist is a release process
the programme can rely on when the person who built it is unavailable: the steps
are spread across several documents, native breakage is only found when a
release is attempted, promotion to the public has no written gate, and the
credentials that make it all work are tracked informally.

## Goals

- A release is a routine, low-risk event that any maintainer can run.
- Breakage is found early and cheaply.
- Nothing reaches the public by accident.
- Losing a person or a credential is a documented, recoverable event.

## Non-goals

- Changing the app's features, design or push behaviour.
- Moving the build pipelines out of the app's repository.
- Automating steps that the app stores do not allow to be automated.
- Choosing tools. How each repo achieves these outcomes is its own decision.

## Responsibilities

| Concern | Owner |
| --- | --- |
| Building, signing and publishing the apps; release guide; PR-time native checks; promotion gates | rettxweb |
| Cloud resources and identities the pipelines rely on; runbook for non-codeable setup | rettxinfra |
| Cross-cutting outcomes and the split above | this spec |

## Acceptance

- A maintainer unfamiliar with the process completes a testing release on both
  platforms using only the guide.
- A deliberately broken native change is caught before release day.
- A release cannot reach the public without a recorded human approval.
- The rollback/hotfix path has been walked through once and found workable.
- Every credential the pipelines use appears in the register with an owner and
  an expiry.

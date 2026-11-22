<!--
  Frontmatter below is machine-read by .github/workflows/spec-fanout.yml when
  this spec is merged into main. Fanout only runs when status is `ready` or
  `accepted`. Merging a `draft` is safe and fans out nothing.

  Allowed fanout repos: rettxweb, rettxadmin, rettxapi, rettxmutation, rettxid, templates, rettxinfra.

  IMPORTANT: OUTCOMES ONLY. `rettx` is a PUBLIC repo. Endpoint names, code
  locations, credential names and project identifiers stay in the private repos.
-->
---
spec_id: "059"
slug: "store-listing-as-code"
title: "App store listings kept as versioned, reviewed content"
status: draft   # draft | ready | accepted | superseded
authored: "2026-11-22"
author: "perocha"
source_issue: ""
relates_to: "specs/057-mobile-release-pipeline/ (release path, release notes, store runbook); docs/adr/0016-infrastructure-as-code-private-repo.md (app-store scope, amendment proposed with this spec)"
fanout:
  - repo: rettxweb
    summary: |
      PRIMARY IMPLEMENTER. Today everything a caregiver sees about rettX in
      the two app stores is typed into the store consoles by hand. That covers
      names, descriptions, keywords, links, screenshots and previews, and the
      privacy, accessibility, content-rating, compliance and review
      declarations. It has no history, no review and no second copy. Make the
      app repository the source of truth for that content, as it already is
      for release notes.

      Outcomes:
      (1) ONE REVIEWED SOURCE. Store listing content for both stores and every
      supported locale is versioned in the repository. A change is made by
      pull request and reviewed like code. The store console is not where
      listing content is edited.
      (2) PREVIEW BEFORE APPLY. Before anything is written to a store, a
      maintainer can see exactly what would change compared with what is live,
      per store, per locale and per field.
      (3) APPLYING NEVER SUBMITS OR RELEASES. Applying listing content updates
      content only. It never submits a version for review, releases or
      promotes a build, or changes testers, pricing or availability.
      Promotion stays the explicit, gated step defined in spec 057. Applying
      to the production listing needs the same named human approval as a
      release.
      (4) DRIFT IS VISIBLE. A check, run on demand and on a schedule, reports
      every field where a store differs from the repository. A console edit
      shows up as drift to be reconciled, not as a silent new truth.
      (5) THE BOUNDARY IS WRITTEN DOWN. Every section of each store's listing
      and app configuration is classified as either managed from the
      repository or manual. Manual sections have an owner, the reason they
      are manual, and the steps to update and verify them. They live in the
      release guide from spec 057, and nothing is left unclassified.
      (6) SUPPORTED, NON-PERSONAL ACCESS ONLY. Automation uses only interfaces
      the store supports for automated access, through the programme's
      service identities. Anything that needs a person's own store login, or
      an unsupported interface, stays manual under (5).
      (7) SCREENSHOTS AND PREVIEWS ARE REPRODUCIBLE AND SYNTHETIC. Store media
      can be regenerated from the app for every required device class and
      locale. It shows synthetic data only. No real caregiver, patient or
      staff data ever appears in store media or in the repository.
      (8) LOCALES ARE CONSISTENT. Store locales are derived from the app's
      supported languages through one mapping that release notes, tester notes
      and listing content all share. Each store's primary locale is always
      populated, so no store falls back to an empty field.
      (9) CAREFUL CLAIMS. Listing text follows the programme's rule that rettX
      makes no medical claims. Clinically worded content is reviewed before it
      reaches a store, in every locale.

  - repo: rettxinfra
    summary: |
      SUPPORTING. Listing automation needs store access beyond what the release
      pipeline holds today, and moves the line between "managed" and "manual"
      in the store runbook from spec 057.

      Outcomes:
      (1) The identity that writes listing content has the narrowest permission
      each store offers for that job, separate from release permissions where
      the store allows it. Its rotation and expiry are tracked in the
      credential register.
      (2) The store runbook from spec 057 reflects the new boundary. Account
      ownership, agreements, team roles, store API keys and tester groups stay
      in the runbook. Anything now managed from the app repository is removed
      from it and points to the release guide instead.
---

# App store listings kept as versioned, reviewed content

## Why

The apps are now built and shipped by pipeline (spec 057), and their release
notes are versioned and validated. Everything else a caregiver sees in the
stores is still edited by hand in two consoles. That includes the app's name
and description, screenshots, privacy and accessibility declarations, content
rating and the information given to store reviewers. As a result:

- There is no history. Nobody can say what the listing said last month, or who
  changed it.
- There is no review. A typo, a broken link or a clinically careless sentence
  goes straight to the public.
- Nine locales across two stores multiply every edit. They drift apart, and
  gaps such as an empty primary-locale field go unnoticed.
- Losing the person who knows the consoles means rebuilding the listing from
  memory. That contradicts constitution VIII.

The production App Store listing has not been published yet. This is the
cheapest moment to set it up from a reviewed source rather than migrate later.

## Goals

- The store listing is as reviewable and recoverable as the app itself.
- Nothing reaches a public listing without review, and nothing is submitted or
  released as a side effect of updating content.
- The parts that cannot be automated are known, owned and documented, not
  rediscovered at each release.

## Non-goals

- Automating store account set-up, agreements, team roles, tax, banking or
  trader-status declarations.
- Automating submission for review or promotion. Spec 057 keeps those as the
  explicit, gated step.
- Using interfaces the stores do not support for automation.
- Choosing tools or file formats. How each repo meets these outcomes is its own
  decision.

## Decision record

This spec depends on a proposed amendment to
[ADR 0016](../../docs/adr/0016-infrastructure-as-code-private-repo.md). Today
that ADR keeps app stores **documented, not managed**. The amendment brings
store listing content under management by the app repository, and leaves store
accounts and access documented. The amendment is proposed with this draft and
is ratified when this spec moves to `ready`.

## Responsibilities

| Concern | Owner |
| --- | --- |
| Listing content, media, declarations, preview, apply, drift check, boundary list | rettxweb |
| Least-privilege store identity for listing writes; runbook boundary update | rettxinfra |
| Cross-cutting outcomes; ADR 0016 app-store scope | this spec |

## Acceptance

- A wording change to one locale's description is made by pull request. Its
  preview shows that single field changing, and once applied the store shows
  it.
- Applying listing content to a version that is ready for submission does not
  submit it.
- An edit made directly in a store console is reported by the next drift check.
- Every listing section of both stores appears in the boundary list as managed
  or manual. Each manual section has an owner and steps.
- Store media can be regenerated for every required device class and locale,
  and shows synthetic data only.
- No store's primary locale has an empty listing, release note or tester note.

## Open questions

- Which declarations each store exposes through a supported automated interface
  today. The answer sets the initial managed/manual boundary, which is expected
  to move as stores add support.
- Whether drift is corrected automatically on the next approved apply, or must
  first be adopted back into the repository by pull request.
- Who gives the clinical-wording review for listing text in each locale.

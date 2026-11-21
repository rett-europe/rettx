<!--
  Frontmatter below is machine-read by .github/workflows/spec-fanout.yml when
  this spec is merged into main. Fanout only runs when status is `ready` or
  `accepted`. Merging a `draft` is safe and fans out nothing.

  Allowed fanout repos: rettxweb, rettxadmin, rettxapi, rettxmutation, rettxid, templates, rettxinfra.

  IMPORTANT: OUTCOMES ONLY. `rettx` is a PUBLIC repo. Endpoint names, code
  locations, credential names and project identifiers stay in the private repos.
-->
---
spec_id: "058"
slug: "push-delivery-self-test"
title: "A safe way to prove a push notification reaches a real device"
status: ready   # draft | ready | accepted | superseded
authored: "2026-11-21"
author: "perocha"
source_issue: ""
relates_to: "specs/057-mobile-release-pipeline/ (release validation); specs/033-message-center-push/ (push delivery)"
fanout:
  - repo: rettxapi
    summary: |
      PRIMARY IMPLEMENTER. Today the only way to send a native push from the
      production service is an ordinary Message Center send. It records a real
      message, also attempts an email, and pushes to every device the recipient
      has registered. That makes it unsuitable as a release check. Provide a
      dedicated, push-only self-test.

      Outcomes:
      (1) PUSH ONLY. A self-test sends a notification and nothing else. It
      creates no Message Center message, sends no email and triggers no other
      channel.
      (2) ONE DEVICE. The test targets exactly one device registration, chosen
      by the person running it. It never fans out to other devices of the same
      person or to anyone else.
      (3) SELF-SERVICE AND BOUNDED. A signed-in user can test only devices they
      registered themselves. Any staff-initiated variant needs an explicit
      permission and is audited. Repeated use is rate-limited.
      (4) FIXED, NON-SENSITIVE CONTENT. Test notifications carry
      programme-defined, non-clinical text that is clearly labelled as a test.
      No free-form content.
      (5) HONEST RESULT. The response distinguishes "the push provider accepted
      it" from "the push provider rejected it", gives a reason category, and
      never claims the notification was displayed. Results are observable in
      telemetry without device tokens, personal data or credentials.
      (6) WORKS FOR EVERY SUPPORTED PLATFORM: native Android, native iOS and,
      where still supported, browser push.

  - repo: rettxweb
    summary: |
      SUPPORTING. Make the self-test usable from the apps and part of release
      validation.

      Outcomes:
      (1) A signed-in user can send a test notification to the device they are
      holding, from the notification settings, and sees the service's result.
      (2) The existing test button that only shows a local notification is
      either removed or clearly described as local-only, so nobody mistakes it
      for proof of delivery.
      (3) The release guide from spec 057 includes a push-delivery check on a
      maintainer-owned device for each platform as a step before promotion,
      with a pass/fail record.
---

# A safe way to prove a push notification reaches a real device

## Why

The native apps can register for push, and the service can send to the push
provider. But there is no safe way to prove the whole chain works: service,
provider, device. The apps can only show that a device registered. The only way
the service can send a native push is a normal Message Center send, which has
side effects: it records a message, sends an email, and reaches every device
the recipient has registered. It cannot be used as a routine release check.

Without a real delivery check, broken push is found by caregivers. For example,
an expired platform key or a mismatched app registration.

## Goals

- Any maintainer can prove end-to-end delivery to their own device in under a
  minute, on each platform, with no side effects.
- Release validation (spec 057) includes that proof before promotion.

## Non-goals

- Changing how real messages are composed, targeted or delivered.
- Guaranteeing that a notification was displayed. Operating systems do not
  report that reliably. A human confirms it on the device.
- Choosing mechanisms. How each repo meets these outcomes is its own decision.

## Responsibilities

| Concern | Owner |
| --- | --- |
| Push-only, single-device, bounded self-test and its telemetry | rettxapi |
| In-app trigger; clarifying the local-only button; release-guide step | rettxweb |
| Cross-cutting outcomes and the split above | this spec |

## Acceptance

- A maintainer sends a test push to one Android device and one iOS device that
  they own. Each arrives, and no message, email or other device notification
  results.
- A user cannot target a device they did not register.
- A rejected send (for example, an unregistered device) returns a clear
  rejection, not a success.
- The spec 057 release guide lists the delivery check as a required step before
  promotion.
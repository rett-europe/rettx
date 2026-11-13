<!--
  Frontmatter below is machine-read by .github/workflows/spec-fanout.yml when
  this spec is merged into main. The `fanout` array drives which downstream
  repos get a `[spec/<slug>] <title>` issue with the `squad` label. Set
  `status: ready` when this spec should fan out on merge — drafts will not.

  Allowed fanout repos: rettxweb, rettxadmin, rettxapi, rettxmutation, rettxid, templates.

  BLOCKER BEFORE `ready`: `rettxinfra` is NOT yet in the allow-list above, and
  it does not exist yet. ADR 0016's follow-ups must land first: create the repo,
  register it in patterns.md §1 and §7, and add it to the fan-out, routing and
  triage workflows. If this spec is flipped to `ready` before then, the
  `rettxinfra` slice — the main one — is silently skipped.

  STACK & DELIVERY PRE-FLIGHT (patterns.md §1 / §7): `rettxapi`, `rettxweb`,
  `rettxadmin` and `templates` each deploy their own artefact into Azure today,
  and keep doing so. Their slices only make that deploy target a *named
  environment* that `rettxinfra` provides. `rettxadmin` has no hosting yet, and
  gains it here. `rettxmutation` and `rettxid` publish to PyPI and deploy
  nothing to Azure, so they get no slice.

  IMPORTANT: this spec is OUTCOMES ONLY. `rettx` is a PUBLIC repo. The as-is
  inventory, resource and identity names, role assignments, network posture,
  secret names, per-resource cost and the hardening backlog all live in the
  private `rettxinfra` repo (constitution VII, "posture vs. gaps").
-->
---
spec_id: "052"
slug: "rettxinfra"
title: "Infrastructure as code for rettX (rettxinfra)"
status: draft   # draft | ready | accepted | superseded  -- KEEP as draft so it does NOT fan out until a maintainer flips it to ready
authored: "2026-11-13"
author: "perocha"
source_issue: ""
relates_to: "docs/adr/0016-infrastructure-as-code-private-repo.md (the decision this spec implements); specs/047-credential-expiry-monitor/ (unchanged; keeps its own home)"
fanout:
  - repo: rettxinfra
    summary: |
      Own rettX's Azure infrastructure as code, per ADR 0016. Phase 1 —
      adopt: describe production exactly as it runs today, under its current
      names, proven by a preview that reports no changes against production.
      Every infrastructure change is previewed on its pull request, and a
      production apply needs the lead maintainer's approval. Provide
      maintainer-triggered "create test environment" and "destroy test
      environment" operations for an isolated environment, named from a fixed
      set, holding synthetic data only. By default it contains only what the
      core flows need, on the lowest viable tiers, and other areas are
      optional. Own the identities, role assignments and deploy federation that
      let each app repo deploy into a named environment, and publish what
      those repos need to find their target. Document the architecture, the
      secrets inventory (by name, never values), recovery and runbooks.
      Includes a subscription budget alert, the admin dashboard's hosting, a
      private break-glass log, and a private checklist of removed deploy
      credentials.
      Phase 2 (hardening) is tracked privately here and is not part of this
      slice's acceptance.
  - repo: rettxapi
    summary: |
      Deploy the backend into a **named environment** chosen at deploy time
      (production, or a test environment by name), using the identity and
      target that `rettxinfra` publishes. Stop owning the creation or
      configuration of cloud resources: anything the API needs to exist is
      declared in `rettxinfra`. Production deploy behaviour is otherwise
      unchanged. Once deploying through federation, remove the superseded
      stored deploy credentials and confirm a deploy still works.
  - repo: rettxweb
    summary: |
      Deploy the caregiver web app into a **named environment** chosen at
      deploy time, using the hosting target and identity `rettxinfra`
      publishes. A build for a test environment talks to that environment's
      backend, never to production. Native store builds are unaffected and
      remain production-only. Once deploying through federation, remove the
      superseded stored deploy credentials and confirm a deploy still works.
  - repo: rettxadmin
    summary: |
      Gain a deploy pipeline for the admin dashboard into a **named
      environment** (test or production), targeting the hosting `rettxinfra`
      provides. A build for a test environment talks to that environment's
      backend, never to production. Deploys use federated credentials from
      the start.
  - repo: templates
    summary: |
      Deploy content into a **named environment** chosen at deploy time, so a
      test environment can be seeded with the same templates as production.
      The production deploy behaviour (full sync on merge to main) is
      unchanged. Once deploying through federation, remove the superseded
      stored deploy credentials and confirm a deploy still works.
---

# Feature Specification: Infrastructure as code for rettX (rettxinfra)

**Feature Branch**: `052-rettxinfra`
**Created**: 2026-11-13
**Status**: Draft
**Input**: "I want to automatize and document the Azure infrastructure we have
in rettX. The starting point is the infra we have running in Azure for
production, there's no test or pre-prod environment. The current environment
was deployed and configured manually. … have a dedicated private repository
for all infrastructure setup, configuration, deployment CI/CD, etc."

---

## Why this exists

rettX has **one** environment, production, and it was built by hand. That
has three consequences:

- **Nobody can rebuild it from a repo.** How production fits together is only
  known by inspecting it, which contradicts constitution VIII.
- **Infrastructure changes are not reviewed.** They are applied directly, with
  no preview and no second pair of eyes.
- **There is nowhere safe to try a change.** Every infrastructure change, and
  every app change that depends on one, is first exercised where caregivers
  are.

ADR 0016 decides the approach: a dedicated private `rettxinfra` repo,
declarative Azure-native infrastructure as code, and phased adoption. This
spec states what must be true once that is done.

### Baseline assessed on 2026-11-13

A read-only assessment of production produced a full inventory and a list of
findings. **It is deliberately not reproduced here.** `rettx` is public, and
that inventory is a map of the estate and its weak points. It becomes the
starting document in `rettxinfra`.

In outline, without the inventory:

| Area | Baseline |
|---|---|
| Definition | Entirely hand-built; no infrastructure code exists |
| Environments | Production only |
| App deploys | Each app repo deploys its own code; no repo owns the resources |
| Admin dashboard | No hosting yet |
| Hardening | Gaps found; tracked privately, delivered in Phase 2 |

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Production is described by code (P1)

As a maintainer, I can read how production is built in one private repo, and
a preview of that code against production reports **no changes**.

**Why this priority**: everything else builds on it. Until production matches
the code, every apply risks changing something nobody intended.

**Independent test**: run the infrastructure preview against production from
`rettxinfra`'s main branch.

**Acceptance scenarios**:
1. **Given** adoption is complete, **When** the preview runs against
   production, **Then** it reports no creates, no deletes and no modifications.
2. **Given** someone changes production by hand afterwards, **When** the
   preview next runs, **Then** the change shows up as drift.

---

### User Story 2 — Infrastructure changes are reviewed (P1)

As a maintainer proposing an infrastructure change, I open a pull request and
see exactly what it will change in production before anything is applied.

**Independent test**: open a pull request that changes one setting.

**Acceptance scenarios**:
1. **Given** an infrastructure pull request, **When** it is opened or updated,
   **Then** a preview of its effect on production is attached to it.
2. **Given** a merged change, **When** it is applied to production, **Then**
   the apply waits for explicit approval from a maintainer.
3. **Given** a change to one area (for example monitoring), **When** it is
   previewed, **Then** unrelated areas are not touched.

---

### User Story 3 — A test environment on demand (P1)

As a maintainer, I create a named test environment, deploy the apps into it,
try a change with synthetic data, and destroy it when I'm done.

**Why this priority**: it is the first safe place to try anything, and the
originating need.

**Independent test**: create an environment, deploy each app into it, sign in,
exercise a core caregiver flow, destroy it.

**Acceptance scenarios**:
1. **Given** a maintainer triggers "create" with a name, **When** it completes,
   **Then** an isolated environment exists that is functionally equivalent to
   production for the core caregiver and admin flows.
2. **Given** a test environment, **When** each app repo deploys to it by name,
   **Then** the app runs there and talks only to that environment.
3. **Given** a maintainer triggers "destroy", **When** it completes, **Then**
   nothing that was created for that environment remains or keeps costing.
4. **Given** any test environment, **When** its data is inspected, **Then** it
   holds synthetic data only.

---

### User Story 4 — Production can be recovered (P2)

As a maintainer handling an incident, I follow a documented runbook to
restore production, or a part of it, from the repo and from backups, without
relying on anyone's memory.

**Acceptance scenarios**:
1. **Given** the runbooks, **When** a maintainer other than the original
   builder follows them, **Then** they can identify every component, its
   backup position and its owner.
2. **Given** a secret needs rotating, **When** the maintainer consults the
   secrets inventory, **Then** they find where it is stored, who consumes it,
   and how to rotate it.

---

### User Story 5 — Cost stays visible (P2)

As a maintainer, I am warned before infrastructure spend exceeds the agreed
monthly budget, including spend from test environments someone forgot to
destroy.

**Acceptance scenarios**:
1. **Given** a monthly budget, **When** forecast spend crosses its threshold,
   **Then** maintainers are notified.

---

### Edge cases

- **Per-subscription plan limits.** Some managed services allow only one
  free or discounted instance per subscription, and production already uses
  it. Test environments use an equivalent plan instead, which is why they are
  *functionally equivalent*, not identical.
- **Sign-in in a test environment.** Test environments have their own
  addresses, and the identity providers must accept them without opening
  production sign-in to arbitrary addresses. That is why test environment
  names come from a fixed set whose addresses are pre-registered in separate
  test identity configurations.
- **An optional area is needed.** A change that touches edge or AI is tried in
  a test environment created with that area switched on.
- **A forgotten test environment.** There is no automatic clean-up, by
  choice. The budget alert is the safety net.
- **Things outside the subscription.** Third-party services (identity
  provider, email, push, app stores, DNS) are documented, not managed. A test
  environment that needs them uses separately registered test
  configurations, never production ones.
- **Two test environments at once.** Names keep them isolated from each other.

---

## Requirements *(mandatory)*

### Shared

- **FR-001** rettX's Azure infrastructure MUST be declared as code in the
  private `rettxinfra` repo (ADR 0016). Nothing in rettX's scope is created or
  changed by hand once it has been adopted.
- **FR-002** The code MUST reproduce production as it runs today, under its
  current names, with a preview that reports no changes (Phase 1 exit).
- **FR-003** Infrastructure MUST be split into areas that can be previewed
  and applied independently, so a change to one area cannot alter another.
- **FR-004** Every infrastructure pull request MUST show its effect on
  production before merge. Every production apply MUST wait for approval from
  the lead maintainer, as a required reviewer.
- **FR-005** A maintainer MUST be able to create and destroy a test
  environment on demand, using a name from a fixed set. Test environments MUST
  be isolated from production — no shared data stores and no access to
  production data — and MUST hold synthetic data only (constitution II). By
  default a test environment contains only what the core caregiver and admin
  flows need, on the lowest viable tiers. Other areas MUST be optional per
  environment.
- **FR-006** Deploy access from CI MUST use short-lived federated credentials,
  not stored long-lived secrets. Each app repo's deploy identity MUST be able
  to reach only its own targets.
- **FR-007** App repos MUST deploy into an environment named at deploy time.
  Production remains the default for releases. `rettxinfra` owns the resources
  and identities; app repos own their code and its deploy.
- **FR-008** Secrets MUST stay in the managed secret store (constitution VI).
  Non-secret configuration MUST be kept in the repo, not in the secret store.
- **FR-009** `rettxinfra` MUST document the architecture, the secrets
  inventory (by name only), backup and recovery, and runbooks for deploy,
  rotation and test-environment use.
- **FR-010** A monthly subscription budget MUST exist. It MUST alert the lead
  maintainer at 80% of forecast spend and at 100% of actual spend. The amount
  is kept in `rettxinfra`'s private configuration.
- **FR-011** The admin dashboard MUST have hosting in both test and production
  environments.
- **FR-012** Sign-in MUST work in each named test environment through identity
  configurations separate from production's. Production sign-in MUST NOT
  accept test addresses. The registration steps MUST be in the runbooks.
- **FR-013** Emergency owner access MUST be held by the lead maintainer only,
  and used only when the pipeline cannot be. Every use MUST be logged privately
  in `rettxinfra`.
- **FR-014** Once a repo deploys through federation, its superseded stored
  deploy credentials MUST be removed in Phase 1. A deploy MUST be confirmed to
  still work afterwards, and each removal MUST be recorded on a private
  checklist in `rettxinfra`.

### rettxinfra slice

Owns FR-001 – FR-006 and FR-008 – FR-013, publishes what FR-007 needs, and
keeps the FR-014 checklist. Phase 2 hardening is delivered as reviewed changes
afterwards, and tracked privately.

### rettxapi, rettxweb, rettxadmin, templates slices

Each implements FR-007 for its own artefact, FR-006 for its own deploy
identity, and FR-014 for its own superseded deploy credentials. Builds for a
test environment MUST NOT reach production.

### Explicitly out of scope

- Other Rett Syndrome Europe properties that share the subscription.
- Managing third-party services as code (identity provider, email, push, app
  stores, DNS). They are documented only.
- Renaming resources or consolidating regions. That is a later decision, if
  it is ever worth the migration cost.
- Automatic expiry or scheduled clean-up of test environments.
- A separate subscription for test (ADR 0016, option F).
- Changing the credential expiry monitor (spec 047).

---

## Success Criteria *(mandatory)*

- **SC-001** A preview of `rettxinfra`'s main branch against production reports
  zero changes.
- **SC-002** 100% of infrastructure changes after adoption arrive through a
  reviewed pull request with an attached preview.
- **SC-003** A maintainer can go from nothing to a working test environment
  with all four deployable artefacts running in it, and back to nothing, using
  only the documented operations.
- **SC-004** After "destroy", no resources from that test environment remain.
- **SC-005** No CI deploy in rettX's scope uses a stored long-lived cloud
  credential. Every superseded credential's removal is recorded.
- **SC-006** A maintainer who did not build production can follow the
  recovery runbook end to end.

---

## Assumptions

- Test environments live in the same subscription as production, one isolated
  group per environment (ADR 0016).
- Test environments are created rarely and destroyed promptly, so their cost
  is small. The budget alert covers the exception. CI spend must stay modest:
  no always-on environments, and no scheduled environment jobs.
- Phase 1 changes nothing that caregivers or admins can see.

### Resolved questions (2026-11-13)

1. **Test environment sizing.** A test environment contains only what the
   core caregiver and admin flows need, on the lowest viable tiers. Other
   areas, such as edge and AI, can be opted into per environment and are off
   by default (FR-005).
2. **Test sign-in.** Test environments use a small, fixed set of names. Each
   name's sign-in addresses are registered once, by hand, in identity
   configurations kept separate from production's. The lead maintainer owns
   this, and the runbook records it (FR-012).
3. **Production approval.** The lead maintainer is the required approver for
   every production apply. A second approver can be added later without
   changing this spec (FR-004).
4. **Budget.** The monthly amount is kept in `rettxinfra`'s private
   configuration, not here. Alerts fire at 80% of forecast spend and at 100%
   of actual spend, and go to the lead maintainer (FR-010).
5. **Break-glass access.** The lead maintainer keeps standing owner access
   for emergencies only. Every use is logged privately in `rettxinfra`.
   Day-to-day changes go through the pipeline (FR-013).
6. **Deploy credential clean-up.** Each app repo does this in Phase 1, once
   it deploys through federation. It removes its superseded stored deploy
   credentials, confirms a deploy still works, and is ticked off a private
   checklist in `rettxinfra` (FR-014).

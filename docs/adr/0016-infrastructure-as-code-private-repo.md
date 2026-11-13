# ADR 0016 — Infrastructure as code in a dedicated private repository (`rettxinfra`)

- **Status**: Proposed (2026-11-13)
- **Date**: 2026-11-13
- **Decision-makers**: rettX maintainers
- **Relates to**: [ADR 0001](0001-control-plane-repo.md) (control plane &
  per-repo ownership), [spec 052](../../specs/052-rettxinfra/spec.md) (this
  decision's implementation spec), [spec 047](../../specs/047-credential-expiry-monitor/spec.md)
  (credential expiry monitor — unchanged by this decision),
  [program constitution](../../.specify/memory/constitution.md) principles II
  (privacy by design), VI (security baseline), VII (open by default, private
  only when justified) and VIII (sustainability and stewardship).

## Context

rettX runs on Microsoft Azure. The production environment was built and
configured **by hand**, and there is **one** environment: no test or pre-production
environment exists. Three consequences follow:

1. **Knowledge lives in a portal, not in a repo.** How production is put
   together can only be learnt by inspecting it. That contradicts constitution
   VIII ("knowledge MUST live in the repos, not in the heads of individuals").
2. **Changes are unreviewed.** An infrastructure change is a portal click with
   no preview, no second pair of eyes and no history beyond the platform's
   activity log.
3. **There is nowhere safe to try things.** Every infrastructure change, and
   every application change that depends on one, is first exercised in
   production.

The application repos each deploy their own code, but none of them owns the
resources they deploy into. Resource ownership is therefore implicit, and
spread across whoever last touched the portal.

## Decision

Describe and operate rettX's Azure infrastructure **as code**, in a new
**private** repository, **`rettxinfra`**, adopted in phases.

- **Dedicated repository.** Infrastructure definitions, environment
  configuration, the deploy pipeline and the operational documentation
  (architecture, runbooks, recovery, secrets inventory by name) live in
  `rettxinfra`. They do not live in an application repo.
- **Declarative, Azure-native tooling.** Infrastructure is declared with
  **Bicep**. The platform tracks deployed state itself, so there is no
  separate state file to host, lock and protect. Detailed stack choices beyond
  this belong to `rettxinfra`'s own constitution.
- **Ownership split.** `rettxinfra` owns **resources, identities, role
  assignments, and the deploy federation** that lets each application repo
  deploy, and it publishes the outputs those repos need. Application repos
  **keep deploying their own code**, into an environment they name at deploy
  time.
- **Phased adoption.**
  - **Phase 1 — adopt.** Production is described exactly as it is, under its
    current names. Adoption is proven when a preview against production reports
    **no changes**. Nothing is recreated, renamed or moved.
  - **Phase 2 — harden.** Security improvements are then delivered as
    reviewed changes. Their content is tracked privately in `rettxinfra`, per
    constitution VII ("posture vs. gaps").
  - **Later.** Naming and topology changes, if they are ever worth their
    migration cost.
- **Environments.** Production, plus **named test environments** created and
  destroyed **only on explicit request** by a maintainer. They sit in the same
  subscription as production, isolated from it, and hold **synthetic data
  only**. Nothing creates or removes them on a schedule.
- **Scope.** rettX only. Other Rett Syndrome Europe properties that share the
  subscription are out of scope. Third-party services (identity provider,
  email, push, app stores, DNS) are **documented, not managed**.

### Why private (constitution VII record)

- **Rationale**: the definitions name every resource, identity, role
  assignment and network boundary in production. Publishing them would hand an
  attacker a map of the estate, which is the justification constitution VII
  accepts. Public artefacts (this ADR and spec 052) describe the decision and
  the outcomes only.
- **Reviewer**: rettX maintainers, on acceptance of this ADR.
- **Revisit**: 2027-11, or when the other ecosystem repos' visibility is
  revisited, whichever comes first.

## Options considered

- **Option A — dedicated private repo, Bicep, phased adoption (chosen).**
  Gives infrastructure one owner and one history, keeps sensitive detail out
  of the public control plane, and uses the platform's native tooling, which
  needs no state backend (VIII: boring, well-supported).
- **Option B — infrastructure inside the backend repo.** Rejected. It couples
  infrastructure releases to API releases, and it leaves the frontends'
  hosting, shared monitoring and shared identities owned by a repo that
  doesn't use them.
- **Option C — Terraform / OpenTofu.** Rejected for now. It adds a remote
  state backend to host, secure and back up. That state would itself contain
  sensitive values, and the portability it offers doesn't pay off for an
  estate that is entirely Azure.
- **Option D — document the manual setup only.** Rejected. Documentation
  without enforcement drifts, and it gives neither review nor a test
  environment.
- **Option E — rebuild production cleanly instead of adopting it.** Rejected
  for Phase 1. It risks data and downtime on a live patient registry, for a
  benefit (tidier names) that can be weighed separately later.
- **Option F — a separate subscription for test.** Not chosen. It gives
  stronger isolation, but means more billing, access and identity set-up for
  a small team. Separate resource groups with no access to production are
  enough for synthetic-data environments. Revisit if test environments ever
  need production-like data.

## Consequences

### Positive

- Production becomes reviewable, reproducible and recoverable from a repo.
- Every infrastructure change is previewed before it is applied, and
  production applies need explicit approval.
- Application and infrastructure changes can be tried in a disposable
  environment before reaching caregivers.
- The admin dashboard gets a defined hosting target in test and production.

### Negative / cost

- Another private repository to maintain, with its own constitution and
  review rules.
- Every portal change after adoption is drift, and is overwritten or flagged
  on the next deploy. That needs discipline from everyone with portal access.
- Test environments cost money while they exist. Explicit destroy, plus a
  subscription budget alert, keeps the cost visible (VIII). There is no
  automatic clean-up, by choice.
- Some managed-service plans are limited per subscription. Test environments
  are therefore **functionally equivalent** to production, not identical.

### Neutral

- Application code and runtime behaviour do not change in Phase 1.
- Spec 047's credential monitor keeps its current home and scope.

## Follow-ups (on acceptance)

- **Register the new repo kind.** Add `rettxinfra` to `patterns.md` §1 (a new
  *Infrastructure* kind) and to the §7 fan-out allow-list. Reflect the same in
  the fan-out, routing and triage workflows and in the status report. Update
  the private-repo list in constitution VII's *Current state*. This must land
  **before** spec 052 is flipped to `ready`, or its `rettxinfra` slice is
  skipped on fan-out.
- **Create the repository** (private) and its constitution.
- **Flip spec 052 to `ready`** when its open questions are resolved.

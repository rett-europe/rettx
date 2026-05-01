# Tasks: <Concise feature name>

> Companion to `spec.md` and `plan.md` (Spec ID NNNN).
>
> Tasks are grouped by target repo. When this spec PR is merged into
> `main`, the **spec-fanout** workflow opens one issue per target repo
> below, labelled `squad`, with the spec link and that repo's slice of
> acceptance criteria as the body.

## Tasks for `rettxapi`

- [ ] T-API-1 — <task description>
  - Acceptance: ...
- [ ] T-API-2 — ...

## Tasks for `rettxweb`

- [ ] T-WEB-1 — <task description>
  - Acceptance: ...

## Tasks for `rettxadmin`

- [ ] T-ADM-1 — <task description>
  - Acceptance: ...

## Tasks for `rettxmutation` (library)

- [ ] T-MUT-1 — <task description>
  - Acceptance: ...
  - Release: bump version, publish to PyPI, update `rettxapi` pin

## Tasks for `rettxid` (library)

- [ ] T-ID-1 — <task description>
  - Acceptance: ...
  - Release: bump version, publish to PyPI, update `rettxapi` pin

## Tasks for `rettx` (this repo)

- [ ] T-RTX-1 — Update `docs/adr/` with the decision record
- [ ] T-RTX-2 — Update public docs site if patient-visible

## Cross-repo coordination notes

Anything that cannot be sliced cleanly per-repo and requires synchronised
work or feature-flagged rollout.

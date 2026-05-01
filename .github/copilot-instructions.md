# Copilot / agent instructions for `rettx`

This repository is the **rettX control plane**. It is **not** an
application code repository.

## What this repo is for

- Program-level constitution (`.specify/memory/constitution.md`)
- Cross-repository conventions (`.specify/memory/patterns.md`)
- Cross-cutting specifications (`specs/`)
- Architectural Decision Records (`docs/adr/`)
- Public documentation site source (`site/`, Astro Starlight)
- Issue intake & routing automation (`.github/workflows/`)

## What this repo is NOT for

- Application code for the caregiver app, admin dashboard, or backend
  API. Those live in `rettxweb`, `rettxadmin`, and `rettxapi`
  respectively.
- Library code for mutation extraction or rettX ID generation. Those
  live in `rettxmutation` and `rettxid` respectively (released to PyPI,
  consumed by `rettxapi`).
- Per-repo technical decisions. Each downstream repo has its own
  constitution and owns its stack-level choices.
- Storing patient data, credentials, or any non-public material.

## Working in this repo

- Prefer markdown changes over code. The only "code" here is GitHub
  Actions workflows and small helper scripts under `scripts/iris/`.
- When proposing or implementing a cross-cutting feature, scaffold a new
  spec under `specs/NNNN-slug/` based on `specs/template/`.
- When making an architectural decision that affects more than one repo,
  add an ADR under `docs/adr/`.
- When updating the public docs site, edit content under `site/src/content/`.
- Do not invent new labels, routes, or conventions on the fly — extend
  `patterns.md` first, then code.

## Cross-repo work

If a task here implies changes in `rettxweb`, `rettxadmin`, `rettxapi`,
`rettxmutation`, or `rettxid`, **do not edit those repos directly from
this repo's context**. Instead:

1. Capture the change in a cross-cutting spec under `specs/`.
2. Once merged, the `spec-fanout` workflow opens scoped issues in the
   affected repos (label: `squad`).
3. Each downstream repo's own agents / squad pick up the work there.

## Style

- British or American English; be consistent within a document.
- Avoid medical claims; rettX is not a medical device. Phrase clinical
  content carefully and link to clinically reviewed sources.
- Never include patient or personal data in examples; use synthetic
  identifiers.

## Constitution check

Before merging any non-trivial change, verify alignment with the
program constitution. NON-NEGOTIABLE principles (I, II, III) cannot be
weakened without an explicit, ratified amendment.

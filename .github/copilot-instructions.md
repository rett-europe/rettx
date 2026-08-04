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
- Delivery accounting (`scripts/status.mjs`, `patterns.md` §11)

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
  Actions workflows and small helper scripts under `scripts/`.
- **Ask `scripts/status.mjs` before answering "what's the status?"** It
  reconciles specs here against open squad issues and pull requests in the
  five downstream repos. Do not assemble a programme picture by hand or from
  memory — that is how it goes stale. Output is written to `status.local.md`,
  which is gitignored and must never be committed or quoted here (it contains
  private repo titles). The script refuses to run in CI for the same reason.
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
this repo's context** — and do not run commands inside a downstream
checkout, which may be a live working tree someone is using. Instead:

1. Capture the change in a cross-cutting spec under `specs/`.
2. Once merged, the `spec-fanout` workflow opens scoped issues in the
   affected repos (label: `squad`).
3. A maintainer picks up each fan-out issue by spawning an orchestrated
   working session in that repo (one session → one branch → one PR).

Urgent production breakage does not wait for a spec — that is what the
`incident` lane is for (`patterns.md` §11). It ships without a spec, keeps its
scope at the fix, and is reconciled within 7 days. Do **not** improvise a
different route, and do **not** write a spec afterwards and present existing
work as though the spec had driven it.

## The drill — operational facts, not discoveries

These are settled properties of this repo and its ecosystem. Read them once;
do not rediscover them, and do not report them back as findings.

**`main` is protected here and in every downstream repo.** Rules: `pull_request`
required, `non_fast_forward`, no `deletion` (downstream repos add
`copilot_code_review`). So: branch first, always. A direct commit to `main` is
rejected with `GH013` *after* the work is done and then has to be moved onto a
branch. Run `git checkout -b <name>` before the first edit, never after.

**This repo is PUBLIC. `rettxweb`, `rettxadmin`, `rettxapi`, `rettxmutation`
and `rettxid` are PRIVATE.** Anything that lands here — files, PR bodies, commit
messages, issue comments, and **GitHub Actions logs and job summaries** — is
world-readable. Never paste private-repo issue or PR titles, code, telemetry
output, or infrastructure detail into this repo. Actions logs are the
non-obvious leak: a workflow here that merely *reads* private repos publishes
whatever it prints.

**No CI runs on spec PRs.** Only `iris-route` and `spec-fanout` trigger on
`pull_request`, and neither validates spec content. `gh pr checks` reporting
"no checks reported" is normal, not a failure. Frontmatter correctness is your
responsibility before merge; nothing will catch it for you.

**Fan-out is driven by `status:`.** A spec with `status: draft` fans out
nothing, however finished it looks. Only `ready` or `accepted` opens squad
issues, and only on merge. Merging a draft spec is safe and is the normal way
to iterate in the open.

**Attribute work by declaration, never inference.** Every downstream PR carries
a `Spec:` line (`patterns.md` §11). Do not infer a spec from prose — a passing
mention of "(spec 042)" is not a declaration, and treating it as one mis-files
the work.

## Tooling gotchas that cost time

- **`gh label list --search <term>` returns nothing even when the label
  exists.** Use `gh label list --limit 200 --json name` and filter. A blank
  `--search` result looks exactly like a missing label.
- **Resolve a PR's head before reviewing or reporting on it**:
  `gh pr view <n> --json headRefOid`. Local `HEAD`, the remote branch and the
  PR can all disagree; a report written against a stale head is worse than no
  report.
- **PowerShell has no heredoc.** For multi-line commit messages use a
  single-quoted here-string (`@'` … `'@`) written to a file, then
  `git commit -F <file>`.
- **Verify a mutation actually landed before trusting a test result.** A failed
  string replacement leaves the source unchanged, the suite passes, and the
  "proof" is worthless. Assert the edit is present, then run.

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

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->

# ADR 0002 — Gap-analysis-first pipeline for cross-cutting work

- **Status**: Accepted
- **Date**: 2026-06-22
- **Decision-makers**: rettX maintainers
- **Amends**: [ADR 0001](0001-control-plane-repo.md) (the *cross-cutting* portion of
  its "Spec & issue flow"; single-repo routing is unchanged)

## Context

ADR 0001 established `rettx` as the control plane and defined two flows: a
`/route confirm` fan-out (Iris copies the raw issue body into sub-issues in the
target repos) and a `spec-fanout` for cross-cutting specs. In practice the first
flow was being used for cross-cutting features too — and that exposed two
structural problems, both observed concretely on
[rettx#10](https://github.com/rett-europe/rettx/issues/10) ("rettX Message Center"):

1. **Triage is blind to code.** `iris-triage` classifies from the issue *text*
   only (a GitHub Models call). It has no visibility into the downstream
   codebases, which live in separate repos. So when `/route confirm` fanned #10
   out to `rettxweb`, `rettxadmin`, and `rettxapi`, each repo received the same
   raw brief with no grounding in what already exists there.

2. **The shared boundary landed in a consumer.** Left to execute independently,
   `rettxapi` authored the full umbrella spec *and both API contracts* inside its
   own repo. The contract that `rettxweb` and `rettxadmin` must consume ended up
   hosted in one of the consumers — the opposite of single-source-of-truth — and
   a genuine **cross-repo conflict** (three different language-code conventions
   for the same template-rendering call) went undetected because no one was
   looking at all three repos at once.

The control plane's distinctive value is exactly that holistic view. A blind,
text-only fan-out throws it away at the very moment it is most needed.

## Decision

For **cross-cutting** issues (more than one repo, or crossing a trust boundary),
Iris **no longer auto-fans-out the raw issue**. Instead we insert a
gap-analysis-and-spec step, owned in the control plane, ahead of fan-out:

```
issue opened here
        │
        ▼
  Iris triage → labels (route:* / cross-cutting / needs-spec) → posts recommendation
        │
        ├─ single-repo, no spec needed ─────────────► /route confirm → iris-route
        │                                             (raw sub-issue in the one repo)
        │
        └─ cross-cutting / needs-spec ──────────────► gap analysis (here)
                                                              │
                 read-only orchestrated session per repo,    │
                 reporting file-grounded findings back        ▼
                                              spec authored here in specs/NNNN-slug/
                                              (spec.md + plan.md + research.md +
                                               contracts/ as the single source of truth)
                                                              │
                                                       spec PR merges to main
                                                              │
                                                              ▼
                                              spec-fanout reads the `fanout:` frontmatter
                                              → one grounded [spec/<slug>] squad issue per repo
```

Concretely:

- **`iris-route` (raw `/route confirm` fan-out) is reserved for single-repo,
  no-spec work.** It refuses to run on an issue labelled `cross-cutting` and
  points the maintainer at the spec pipeline instead.
- **`iris-triage`** still classifies and labels, but its recommendation comment
  is branched: for cross-cutting / needs-spec issues it recommends the
  gap-analysis → spec route and does **not** offer `/route confirm`.
- **Gap analysis** is performed from the control plane via **read-only
  orchestrated sessions, one per affected repo**, each reporting file-grounded
  findings (what exists, what's missing, where new code lands, effort, and any
  cross-repo conflicts). The findings inform the umbrella spec.
- **The umbrella spec is authored here** and **hosts the shared API contract**
  under `specs/NNNN-slug/contracts/`. `rettxapi` *implements and versions* the
  contract; it does not own its location. The spec's machine-read `fanout:`
  frontmatter carries a per-repo, gap-informed brief.
- **`spec-fanout`** (unchanged mechanism) opens the grounded squad issues on
  merge — but only when the spec's `status` is `ready` or `accepted`, so a
  `draft` umbrella spec never fans out prematurely.

### Prerequisite — target repos must be main-checkout projects

Gap analysis spawns a session per repo. A session created against a
**worktree-backed** project fails at creation (`os error 267`, "The directory
name is invalid"). Every repo that needs gap analysis must therefore be
registered as a normal **main-checkout** project (e.g. `C:\rettx\rettxadmin`)
before the orchestration runs. This bit us on the first run (`rettxadmin` had to
be re-registered) and is now a documented precondition.

## Alternatives considered

### A. Keep the raw `/route confirm` fan-out for everything

Rejected. It is fast but produces ungrounded sub-issues and, as #10 showed, lets
the shared contract and cross-repo conflicts fall through the cracks. It defeats
the control plane's reason to exist.

### B. Make `iris-triage` read the downstream code directly

Rejected for now. The triage Action would need cross-repo read tokens and a much
larger model budget, and it still wouldn't match the depth of a per-repo session
that can run tools and cite files. The orchestrated-session approach keeps triage
cheap and puts the deep analysis where the code is.

### C. Author the umbrella spec without a gap-analysis step

Rejected. Without first reading each repo, the umbrella spec repeats the original
mistake — plausible on paper, wrong in detail (e.g. it would not have caught the
language-code conflict or the absence of durable async infrastructure in
`rettxapi`).

## Consequences

### Positive

- Cross-cutting fan-out is **grounded**: each squad issue reflects what actually
  exists in its repo.
- The shared contract has a single, neutral home in the control plane; consumers
  stop redefining it.
- Cross-repo conflicts surface **before** the lanes diverge, when they are cheap
  to resolve.
- `draft` umbrella specs cannot fan out by accident.

### Negative

- Cross-cutting work has a heavier front end (gap analysis + spec authoring)
  before any downstream issue exists.
- Requires the main-checkout-project precondition to be satisfied for every
  target repo before orchestration.

### Neutral

- Single-repo issues are unaffected: `/route confirm` → `iris-route` still works
  exactly as in ADR 0001.
- The `spec-fanout` workflow itself is unchanged; only *when* we rely on it
  (after gap analysis, never after a raw fan-out) changes.

## Follow-ups

- Reflected in `patterns.md` §6 (routing labels) and §7 (spec authoring).
- Resolve the language-code conflict (decision D1) surfaced by the #10 gap
  analysis as part of `specs/032-message-center/`.
- Consider a lightweight `needs-spec` label so triage can mark the gap-analysis
  path explicitly.

# Plan: <Concise feature name>

> Companion to `spec.md` (Spec ID NNNN). The plan describes *how* the spec
> will be realised, across the affected repos.

## 1. Architecture overview

A short description of the technical approach. Diagram if helpful.

## 2. Affected components

| Repo | Components touched | Notes |
|---|---|---|
| `rettxapi` | endpoints, services, models | new endpoints? schema change? |
| `rettxweb` | components, services | UI changes |
| `rettxadmin` | components, services | UI changes |
| `rettxmutation` | extraction agent, validators | library change → triggers PyPI release + `rettxapi` pin bump |
| `rettxid` | format / generation | library change → triggers PyPI release + `rettxapi` pin bump |
| `rettx` (this) | docs/adr | cross-cutting ADR if applicable |

## 3. API contract changes

- New / modified endpoints:
  - `POST /...` — request / response schema
- Backward-compatible? If not, migration plan?
- OpenAPI documentation update committed in the same PR cycle.

## 4. Data model changes

- New entities, fields, indexes.
- Migration / backfill strategy.
- Privacy review per program constitution principle II.

## 5. Sequencing across repos

In what order must changes ship? Are there feature flags?

1. Step 1 — repo X
2. Step 2 — repo Y
3. Step 3 — repo Z

## 6. Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| ... | ... | ... |

## 7. Rollback plan

How do we back out if this goes wrong in production?

## 8. Observability

What new logs / metrics / traces will tell us this is working?

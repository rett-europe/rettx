# ADR 0013 — Admin-domain data lives in a dedicated Cosmos database (`rettxadmindb`)

- **Status**: Proposed (2026-07-26)
- **Date**: 2026-07-26
- **Decision-makers**: rettX maintainers (Pedro)
- **Relates to**: [spec 043 — Admin RBAC MVP](../../specs/043-admin-rbac-mvp/spec.md)
  (the first admin container — `admin_role_capabilities` — lands here), the
  upcoming **spec 044** (admin audit trail + admin data-model containers, which
  MUST also live here), [ADR 0012](0012-admin-rbac-entra-app-roles.md) (the admin
  RBAC model whose config store this database hosts), and
  [patterns.md §1/§2](../../.specify/memory/patterns.md) (data topology).

## Context

`rettxapi` runs its Cosmos containers inside a **single database**
(`RETTX_DATABASE_NAME`, "rettxdb") on **shared (database-level) throughput**.
Azure Cosmos DB caps a **shared-throughput database at 25 containers**. rettxdb
is already at or near that ceiling — it holds roughly **two dozen** containers
today. Grounded in `app/core/config.py` on `main`, the Cosmos containers include:

- Patient / identity / access: `patient`, `principals_v2`, `patient_access`,
  `identity_lock` (identity index), `master_data`.
- Surveys: `survey`, `survey_data`, `survey_response` (and the survey submission
  store).
- Pulse: `pulse_entries`, `pulse_patient_storage`, `pulse_metric_definitions`,
  `pulse_catalog_definitions`, and the legacy `pulse_episodes` (left in place).
- Care profile: `careprofile_drafts`, `careprofile_snapshots`,
  `careprofile_tokens`.
- Comms / compliance / misc: `messages`, `bulk_email_campaigns`,
  `notifications`, `device_token`, `audit_events`, `compliance_doc`,
  `compliance_tracking`, `mutation`.

That is ~24 containers in one shared-throughput database — effectively **at the
hard 25-container ceiling**. The admin maturity program adds more admin-domain
containers imminently: the **role→capability config** store now (spec 043,
`admin_role_capabilities`) and the **admin audit trail + admin data-model**
containers next (spec 044). Adding these to rettxdb would breach the 25 limit.

There is also a **privacy-segregation** motivation: staff/admin operational data
is a different data class from patient/caregiver domain data, and keeping the two
in separate databases gives a cleaner trust and blast-radius boundary
(Constitution Principle II — privacy by design; Principle VI — security
baseline).

## Decision

**All new admin-domain Cosmos containers live in a dedicated database,
`rettxadmindb`, inside the EXISTING Cosmos account** (same account, same keys),
with its **own throughput**. `rettxdb` is reserved for patient / caregiver /
domain data and is not extended with admin containers.

Specifics:

1. **Same account, new database.** `rettxadmindb` is provisioned in the current
   Cosmos account — no new account, no new credentials/secrets. It carries its
   own throughput (its own 25-container budget), independent of rettxdb.
2. **New config + client handle.** Add a `RETTX_ADMIN_DATABASE_NAME` setting and
   an **admin Cosmos database handle** (a second `database` client obtained from
   the same `CosmosClient`/account). Admin repositories target this handle.
3. **Admin containers land here.** Spec 043's `admin_role_capabilities` container
   is created in `rettxadmindb`; spec 044's admin audit + admin data-model
   containers will be created here too.
4. **No cross-database joins.** Cosmos has no cross-database queries anyway, and
   admin data does not need to join patient/domain data — admin flows resolve
   identities by id, not by cross-container joins. The separation is therefore
   free of query cost.
5. **Provisioning/IaC creates it.** The infrastructure that creates rettxdb is
   extended to create `rettxadmindb` and its containers, so environments are
   reproducible.

## Consequences

**Positive**

- **Escapes the 25-container ceiling cleanly.** rettxdb stops accumulating admin
  containers; `rettxadmindb` starts with its own fresh budget, so both the RBAC
  config now and the spec 044 admin containers fit without pressure.
- **Privacy / blast-radius separation.** Staff/admin operational data is
  physically separated from patient/caregiver data at the database boundary — a
  cleaner trust boundary and easier to reason about for access and incident
  scope.
- **Low ops delta.** Same account and secrets; only a new database name + a
  second database handle. No new Cosmos account to secure, key-rotate, or
  network-configure.
- **Independent scaling.** Admin throughput can be tuned without affecting
  patient-facing workloads.

**Negative / costs**

- **A second database handle** must be wired through config and the Cosmos client
  bootstrap; admin repositories must target it (a small, one-time plumbing
  change). Getting a container's database wrong is a latent bug class, so the
  handle boundary must be explicit.
- **A second shared-throughput floor.** `rettxadmindb` carries its own minimum
  RU/s, a small additional baseline cost versus packing everything into one
  database (but far cheaper than per-container dedicated throughput — see
  alternatives).
- **Provisioning/IaC and every environment** (local, test, prod) must create and
  configure the new database, and `RETTX_ADMIN_DATABASE_NAME` becomes required
  config.

## Alternatives considered

- **Per-container DEDICATED throughput inside rettxdb.** Containers with their own
  dedicated throughput do **not** count against the 25-container shared-database
  limit, so this would technically make room. *Rejected:* dedicated throughput
  has a **higher minimum RU/s per container** (materially more expensive as admin
  containers multiply), and it provides **no clean separation / blast-radius
  boundary** between admin and patient data — everything still shares one
  database.
- **A separate Cosmos ACCOUNT for admin data.** *Rejected:* strongest isolation,
  but heavier ops and cost — a second account to provision, secure, key-manage,
  network-configure, and monitor, plus extra secrets. Overkill for the MVP; a
  dedicated **database** in the same account gives most of the separation benefit
  at a fraction of the cost.
- **Keep adding containers to rettxdb.** *Rejected:* hits the hard **25-container
  shared-throughput ceiling** imminently (rettxdb is already at ~24), and mixes
  admin and patient data with no separation.

## Cross-links

- [spec 043 — Admin RBAC MVP](../../specs/043-admin-rbac-mvp/spec.md)
  (`admin_role_capabilities` lands in `rettxadmindb`)
- **spec 044** (future) — admin audit trail + admin data-model containers, also
  in `rettxadmindb`
- [ADR 0012 — Admin RBAC via Entra App Roles + configurable capabilities](0012-admin-rbac-entra-app-roles.md)
- [patterns.md §1/§2 — data topology](../../.specify/memory/patterns.md)

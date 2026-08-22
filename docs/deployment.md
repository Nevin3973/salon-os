# Deployment

## How it works

```
  push / PR ──▶ CI (GitHub Actions)
                 builds the DB from migrations, seeds, typechecks, tests, builds

  manual  ──▶ Deploy (GitHub Actions)
                 build image ──▶ push to DOCR ──▶ trigger App Platform
                                                        │
                                                        ├─ PRE_DEPLOY job:
                                                        │    prisma migrate deploy
                                                        └─ then the new version
                                                           goes live
```

Deploys are **manual** (`workflow_dispatch`), not automatic on merge. Nine salons
trade on this; releasing should be a decision someone makes, not a side effect of
merging a branch.

## Why migrations run inside App Platform, not in CI

The database firewall admits exactly one source: the app. A GitHub runner gets a
different address on every run, so letting CI reach the database would mean
opening it far wider than it is now — for a few seconds of convenience per
release.

An App Platform **pre-deploy job** already runs inside that trust boundary. It
executes before the new version receives traffic, so the schema is always ready
before the code that depends on it is live.

Add this to the app spec (`doctl apps spec get <APP_ID>` to fetch, edit, then
`doctl apps update <APP_ID> --spec spec.yaml`):

```yaml
jobs:
  - name: migrate
    kind: PRE_DEPLOY
    image:
      registry_type: DOCR
      registry: infynix-salonos
      repository: salon-os
      tag: latest
    run_command: npx prisma migrate deploy
    instance_size_slug: apps-s-1vcpu-0.5gb
    envs:
      - key: DIRECT_URL
        scope: RUN_TIME
        value: ${salonos-pg-blr.DATABASE_URL}
      - key: DATABASE_URL
        scope: RUN_TIME
        value: ${salonos-pg-blr.DATABASE_URL}
```

`DIRECT_URL` matters: `prisma.config.ts` reads it first and only falls back to
`DATABASE_URL`. Setting just `DATABASE_URL` in an environment that has a stale
`DIRECT_URL` will migrate the wrong database — which is not a hypothetical, it
happened during setup and reported itself as `type "LocationType" already
exists`.

## Required secrets

In the repository (Settings → Secrets and variables → Actions):

| Secret | Purpose |
|---|---|
| `DIGITALOCEAN_ACCESS_TOKEN` | Registry push and triggering the deployment. Needs read/write on the container registry and App Platform. |

CI needs no secrets — it builds its own throwaway database.

## One-time setup, already done

The migration history was **baselined** on 22 Aug 2026. Before that it could not
rebuild the database: the original init created 14 tables while the database had
27, because the entire retail side — `Sale`, `SaleItem`, `Customer`,
`BranchStock`, `InvoiceSeries`, `Staff` — had been created with `prisma db push`,
which applies a schema without recording how it got there.

That gap is invisible until the day it matters, and then it matters completely:
the repo could not reconstruct the schema, so a fresh environment or a recovery
would have produced a half-built database. Backups covered the data; nothing
covered the structure.

`20260822000000_baseline` squashes the live schema, including every row-level
security policy — Prisma does not manage policies, so a schema regenerated
without them would rebuild every table with no tenant isolation at all.

It is marked as already applied on the existing databases, so `migrate deploy`
skips it there and runs only what comes after.

## Rules from here

**Never run `prisma db push` against production.** That is what caused the drift.
Schema changes go through `prisma migrate dev` locally, which writes a migration
file, and reach production through `migrate deploy`.

CI enforces this: it rebuilds the database from migrations on every run, so drift
fails a pull request instead of surfacing during an incident.

## Rolling back

Images are tagged by commit SHA, so a previous build can be redeployed by
pointing the app's tag at it. Note that **migrations do not roll back** — write
them additively, and prefer two deploys (add the column, then start using it)
over one that has to be undone.

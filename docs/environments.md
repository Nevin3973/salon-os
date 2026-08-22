# Environments

| | Dev | Staging | Production |
|---|---|---|---|
| Runs on | your machine | App Platform | App Platform |
| Database | local container | `salonos_staging` in the shared cluster | `defaultdb` in the same cluster |
| Postgres | 17 | 17 | 17 |
| Instances | — | 1 × 0.5 GB | 2 × 1 GB |
| Deploys | — | automatically, after CI passes on `main` | manually, by promoting a staging build |
| Data | seeded, disposable | seeded, disposable | real |
| Extra cost | none | one small app instance | — |

Staging uses a **second database in the existing cluster**, not a second cluster.
A separate cluster would roughly double the database bill to isolate data that is
disposable by design. The cluster firewall already admits App Platform apps, so
staging needs no new rule.

## Why the versions are pinned to each other

They were not, and it cost us. Production moved to Postgres 17 while the local
container stayed on 16, and nothing recorded the mismatch. The consequence
surfaced only during a restore drill: every production dump was unreadable
locally with `unsupported version (1.16) in file header`. The backups were
sound; the ability to use them was not.

Dev, CI and staging now all pin the same major version as production. When
production upgrades, they change in the same commit.

## Dev

```bash
docker compose up -d
npx prisma migrate deploy
npx prisma db seed
npm run dev
```

`docker-compose.yml` replaces the hand-run container that used to back local
work. That container had no recorded definition, which is how it drifted a major
version behind without anyone noticing, and it needed restarting by hand every
time Docker Desktop stopped. It now restarts itself.

**Moving from the old container:** local data is seeded and disposable, so the
simplest path is to discard it.

```bash
docker rm -f salonos-postgres
docker compose up -d
npx prisma migrate deploy && npx prisma db seed
```

## Staging

One-time setup:

1. **Create the database** in the existing cluster (Databases → salonos-pg-blr →
   Users & Databases), named `salonos_staging`.
2. **Fill in the secrets** in `.do/staging.app.yaml` — placeholders are marked
   `REPLACE_WITH_…`. Do not commit real values.
3. **Create the app:** `doctl apps create --spec .do/staging.app.yaml`
4. **Apply the schema:** the app's `PRE_DEPLOY` job runs `prisma migrate deploy`
   on every deploy, so the first deploy builds the schema from nothing. This is
   only possible because the migration history was baselined — before that, the
   repo could not rebuild the database.
5. **Seed it** once, so there is something to look at.

After that it looks after itself: merge to `main` → CI → staging deploys.

## Releasing

```
merge to main ─▶ CI ─▶ staging (automatic)
                          │
                          └─▶ "Promote to production" (manual, names a SHA)
```

Production **promotes the exact image staging ran** by retagging it. It does not
rebuild. A rebuild from the same commit produces a different image — different
base-layer patches, different transitive dependencies — and whatever staging
proved would not strictly apply to what production runs.

The promote workflow is attached to a GitHub Environment named `production`.
Adding required reviewers there means a release needs a second person's
approval; without them the label does nothing.

## Rules

**Never `prisma db push` against staging or production.** It applies a schema
without recording how, which is what left the repo unable to rebuild its own
database. Schema changes go through `prisma migrate dev` locally and reach
deployed environments through `migrate deploy`.

**Staging must not be able to reach real customers.** Email is pointed at an
invalid sender by default. Anything added later that contacts the outside world
— SMS, payment webhooks, the Tally connector — needs the same treatment.

**Test restores against staging, not a laptop.** It runs the same Postgres major
version as production, which a workstation may not.

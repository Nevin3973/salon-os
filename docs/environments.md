# Environments

| | Dev | Staging | Production |
|---|---|---|---|
| Runs on | your machine | Render (free) | DigitalOcean App Platform |
| Database | local container | Neon (free) | `salonos-pg-blr` cluster |
| Postgres | 17 | 17 | 17 |
| Instances | — | 1, sleeps when idle | 2 × 1 GB |
| Deploys | — | automatically from `main` | manually, promoting a built image |
| Data | seeded, disposable | seeded, disposable | real |
| Cost | — | $0 | — |
| Public URL | no | yes | yes |

Staging is hosted rather than local because the Tally partner's connector needs
a real URL to poll.

## Postgres versions are pinned to each other

They were not, and it cost us. Production moved to 17 while the local container
stayed on 16, and nothing recorded the mismatch. It surfaced only during a
restore drill: every production dump was unreadable locally with
`unsupported version (1.16) in file header`. The backups were sound; the ability
to use them was not.

Dev, CI and staging now pin production's major version. When production
upgrades, they change in the same commit.

## Dev

```bash
docker compose up -d
npx prisma migrate deploy
npx prisma db seed
npm run dev
```

`docker-compose.yml` replaces a hand-run container that had no recorded
definition — which is how it drifted a major version behind unnoticed, and why
it needed restarting by hand whenever Docker Desktop stopped. It now restarts
itself.

**Coming from the old container** — local data is seeded and disposable:

```bash
docker rm -f salonos-postgres
docker compose up -d
npx prisma migrate deploy && npx prisma db seed
```

## Staging

### One-time setup

1. **Create a free Neon project** at console.neon.tech, Postgres 17, in the
   region closest to Singapore. Copy its connection string.
2. **Create the app role.** Staging must not connect as the database owner —
   owners carry `BYPASSRLS` and step straight over every tenant policy, so a
   bug that would leak across salons in production would appear to work fine in
   staging.
   ```bash
   psql "<neon-url>" -f scripts/provision-app-role.sql
   ```
3. **Render dashboard → New → Blueprint**, point it at this repo. It reads
   `render.yaml` and prompts for the values marked `sync: false`.
4. **Set the secrets** it asks for: `DATABASE_URL` and `DIRECT_URL` (both the
   Neon URL, using the app role), a **freshly generated** `AUTH_SECRET`, and the
   two Cloudinary values.
5. **Seed it once**, so there is something to look at:
   ```bash
   DIRECT_URL="<neon-url>" DATABASE_URL="<neon-url>" npx prisma db seed
   ```

Migrations run on container start, so the schema builds itself on first deploy.

### Things to know

**It sleeps.** A free Render service spins down after ~15 minutes idle and takes
roughly 50 seconds to answer the next request. Tell the Tally partner, or they
will report the first call of the day as a timeout.

**Email is disabled** — `EMAIL_FROM` points at an invalid domain. A staging
environment that can reach real customers eventually does.

**`RESEND_API_KEY`, `SENTRY_DSN` and the `UPSTASH_*` pair are unset** on
purpose. Each degrades safely: email is skipped, errors go unreported, rate
limiting falls back to in-memory. None should share production's account. Add
one in the dashboard only if a specific test needs it.

**Auth secret must be fresh.** Reusing production's would let a session minted on
staging be presented to production.

## Releasing

```
merge to main ─▶ CI ─▶ build image (SHA tag)
                  └──▶ Render rebuilds staging from source, automatically
                            │
                            └─▶ "Promote to production" (manual, names a SHA)
```

Production promotes an image built by CI, by retagging it as `:latest`. It never
rebuilds, so the thing that ships is the thing that was built and pushed.

**One honest gap:** Render builds staging from source rather than pulling the
registry image, so staging and production run *equivalent* builds — same
Dockerfile, same commit — rather than identical bytes. Keeping them identical
would need a host that can pull from a private registry, which is not free. The
failures staging exists to catch — a broken migration, a missing variable, a
route that 500s — are all reproduced faithfully by an equivalent build.

The promote workflow is attached to a GitHub Environment named `production`.
Adding required reviewers there makes a release need a second approval; without
them the label does nothing.

## Rules

**Never `prisma db push` against staging or production.** It applies a schema
without recording how, which is what left the repo unable to rebuild its own
database. Changes go through `prisma migrate dev` locally and reach deployed
environments through `migrate deploy`.

**Staging never connects as a database owner.** See step 2 above.

**Test restores against staging, not a laptop** — it runs production's Postgres
major version, which a workstation may not.

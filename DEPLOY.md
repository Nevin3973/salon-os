# Deploying & operating Salon OS

## Environments

| Lane | Git branch | Vercel | Database |
|------|-----------|--------|----------|
| **Production** | `main` | Production (auto-deploy on push) | Neon **main** |
| **Staging** | `staging` | Preview (SSO-protected) | Neon **`staging`** branch |
| **PR checks** | `feature/*` | Preview | Neon `staging` branch |

Env vars are scoped in Vercel: **Production** → Neon main; **Preview** → Neon `staging`
(its own `DATABASE_URL`/`DIRECT_URL`, a separate `AUTH_SECRET`, public Cloudinary vars;
email is intentionally unset on Preview so it no-ops). Auth works on previews via
`trustHost: true`, so no per-URL `AUTH_URL` is pinned outside Production.

## The database wall (read this before touching the DB)

Multi-tenancy is shared-schema with an `orgId` column plus **Postgres row-level
security**. The app connects as the non-privileged **`salonos_app`** role, which is
subject to RLS; migrations and the seed connect as the **owner** (`DIRECT_URL`).

On Neon the owner is *also* subject to `FORCE` RLS (unlike a local Docker superuser,
which bypasses it). That means a naive reseed can't clear or refill the protected
tables. The seed handles this itself now:

- `prisma/seed.ts` **pauses RLS** on every tenant table, wipes + repopulates, and
  **always restores `ENABLE` + `FORCE`** in a `finally` block. Policies are never
  dropped, so restoring is just a re-enable. A reseed is one command again.

## Common commands

```bash
# Local (Docker Postgres running):
npm run db:push        # sync schema
npm run db:seed        # wipe + seed demo data (self-manages RLS)

# Reseed a hosted environment (staging/production) — owner connection required:
U="$(npx neonctl connection-string --branch <staging|main> --role-name neondb_owner \
      --org-id org-soft-sun-99827661 --project-id solitary-sea-56799093 \
      --database-name neondb)"
SEED_ALLOW_REMOTE=yes DATABASE_URL="$U" DIRECT_URL="$U" npm run db:seed
```

The seed refuses a non-localhost database unless `SEED_ALLOW_REMOTE=yes` — a guard
against wiping production by muscle memory. **Always reseed `staging` first** and
verify before doing production.

## CI

`.github/workflows/ci.yml` runs on every push/PR to `main`/`staging`: it stands up a
Postgres service, applies the schema + RLS migrations + the app role + a seed, then
runs lint, type-check, the full test suite (**including the row-level-security
integration tests**, which need the restricted role to be meaningful), and a build.
CI does **not** deploy — Vercel's git integration owns deployment.

## Known follow-up: migrations as the source of truth

Today schema changes are applied with `prisma db push`, and RLS lives in
`prisma/migrations/*/migration.sql` applied by hand / by CI. The migration files have
drifted behind `schema.prisma` (retail + cashier changes went in via `db push`). The
target state is `npm run db:migrate` (`prisma migrate deploy`) applying schema **and**
RLS together, so a new tenant table can never ship without its wall. Doing that
requires generating a migration that captures the current drift and baselining the
existing databases with `prisma migrate resolve --applied` — **rehearse it on the
`staging` Neon branch before production.**

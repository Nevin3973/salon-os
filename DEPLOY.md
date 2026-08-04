# Deploying & operating Salon OS

## Hosting: nothing here is tied to Neon or Vercel

The app talks to **plain PostgreSQL 14+ over a standard connection string**. There
is no Neon driver, no Vercel SDK, no serverless-only API — `grep -ri neon src/`
returns a single code comment. Moving hosts means changing two environment
variables, nothing else.

| Where you host | What to set |
|---|---|
| **Supabase / Railway / Render** | `DATABASE_URL` = pooled URL, `DIRECT_URL` = direct URL |
| **AWS RDS / Azure / Cloud SQL** | Both to the same instance (add PgBouncer later if needed) |
| **Your own server / Docker** | Both to `postgresql://user:pass@host:5432/db` |

The app itself runs anywhere Node 20 does: `npm run build && npm start` behind a
reverse proxy, or the included `Dockerfile` (`npm run docker:build`). Off Vercel,
set `AUTH_URL` to the public origin and keep `AUTH_SECRET` stable across restarts.

**Whatever host you pick, do these two things:**
1. Run `scripts/provision-app-role.sql` as the DB owner to create the restricted
   `salonos_app` role, and point `DATABASE_URL` at it. The tenant wall depends on
   the app *not* connecting as the owner.
2. Apply the schema and every RLS migration (see *Common commands*).

## Starting a real customer — no demo data

`prisma/seed.ts` invents fictional salons and is for development and CI only.
**Never run it against a customer's database.** To start a live workspace:

```bash
npm run org:bootstrap -- \
  --org "Bloom Salon Group" --gstin 29ABCDE1234F1Z5 \
  --admin-name "Priya Nair" --admin-email priya@bloomsalon.in \
  --warehouse "Central Store" --branch "Indiranagar" --branch "Koramangala"
```

That creates the org, its warehouse, its branches (each with an invoice prefix and
a purchase authorization code) and one Super Admin — and nothing else. It prints
the admin's one-time password and the branch codes **once**; they are stored hashed
and cannot be recovered. The admin then adds staff under **Team**, and products and
prices under **Products**.

To clear demo workspaces out of a database that already has them:

```bash
npm run demo:purge            # dry run — shows exactly what would go
npm run demo:purge -- --yes   # actually removes them
```

## Handing figures to an accountant

- **Tally** — `/api/exports/tally?from=&to=` produces a Tally Prime/ERP 9 voucher
  XML (sales + credit notes, with CGST/SGST and round-off ledgers) that imports
  directly. Tally matches **ledger and company names**, so confirm the client's
  chart of accounts uses `Cash`, `Card Receipts`, `UPI Receipts`, `Sales Accounts`,
  `CGST`, `SGST`, `Round Off` — or pass `?company=` and adjust `DEFAULT_LEDGERS`
  in `src/lib/tally.ts` to match theirs. Every voucher is balanced before it ships.
- **GSTR-1** — `/api/exports/hsn` gives the HSN-wise summary table, net of returns.
- Both are on **Salon → Sales report**, alongside the raw CSV.

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

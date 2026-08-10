# Moving to DigitalOcean, Bangalore

Why: the app was routed through Mumbai but executed next to its database in the
US, which put roughly 350ms in front of every action a cashier took. A checkout
is about six round trips, so that is over two seconds of waiting per bill. App
and database now sit together in `blr1`, a few milliseconds from the counter.

App Platform (`basic-xs`, ~$12/mo) + Managed Postgres (~$15/mo) ≈ **$27/mo** for
all seven salons — cheaper than the Vercel + Neon setup it replaces.

## Before you start

- `doctl` installed and authenticated (`doctl auth init`)
- A current dump of the Neon database (`./scripts/backup.sh`)
- The domain's DNS reachable — `beyonddemands.in` is currently a **parked page
  on Hostinger** and must be repointed, or certificate issuance will hang

## 1. Create the database

```bash
doctl databases create salonos-pg-blr --engine pg --version 17 --region blr1 --size db-s-1vcpu-1gb --wait
```

**Version 17 matters.** Neon runs Postgres 17, and `pg_restore` will not load a
dump from a newer server into an older one — a cluster created as 16 simply
cannot accept the data. Check the source before creating the target:

```bash
psql "<neon-url>" -tAc "SHOW server_version;"
```

`--wait` blocks until the cluster is actually online, so a later command cannot
fail with a confusing "cluster not found" while provisioning is still running.

Note the connection string it prints. DigitalOcean requires TLS, so the URI ends
with `?sslmode=require` — keep that. Without it the connection is refused
outright rather than quietly downgraded, which is the behaviour you want.

## 2. Move the data

The restore script is the tool here, and it has been rehearsed. Restore the
Neon dump straight into the new cluster:

```bash
RESTORE_URL="postgresql://doadmin:...@...blr1...ondigitalocean.com:25060/defaultdb?sslmode=require" \
  ./scripts/restore.sh backups/salonos-<timestamp>.dump
```

It reports the table and row counts it restored and exits non-zero if the target
came back empty, so a silent half-migration is not possible. The dump carries
the row-level-security policies with it.

## 3. Create the restricted application role — do not skip this

The restore leaves you connected as `doadmin`. **The app must not run as that
role.**

Every tenant table has `FORCE ROW LEVEL SECURITY`, which is what stops one
salon group reading another's customers. That protection is only as good as the
role the app connects with: a role with `BYPASSRLS`, or ownership that escapes
the policy, sees everything regardless of what the application code intends.
The whole tenancy model rests on connecting as the restricted role.

```bash
psql "$RESTORE_URL" -f scripts/provision-app-role.sql
```

Then point `DATABASE_URL` at `salonos_app`, not `doadmin`. Keep the `doadmin`
URI only for `DIRECT_URL` (migrations and backups, which must read past RLS).

Verify rather than assume:

```bash
DATABASE_URL="postgresql://salonos_app:...?sslmode=require" \
DIRECT_URL="postgresql://doadmin:...?sslmode=require" \
  npm test -- tests/rls.test.ts
```

Those tests plant a row under one tenant and prove the other cannot count it,
read it by id, or write under its org. If they pass against DigitalOcean, the
wall survived the move.

## 4. Create the app

```bash
doctl apps create --spec .do/app.yaml
```

Then set the encrypted secrets in the console — `AUTH_SECRET` (generate a fresh
one; do not reuse the Vercel value), `RESEND_API_KEY`, the two Upstash keys, and
`SENTRY_DSN`.

App Platform will not send traffic to a new deployment until `/api/health`
passes, and that endpoint checks the database rather than merely answering. A
broken build cannot take billing down.

## 5. Point the domain

In Hostinger, replace the parked-page records with what App Platform shows under
Settings → Domains. Certificates are issued automatically once DNS resolves.

Until that propagates the app is reachable at its
`*.ondigitalocean.app` hostname, which is a good place to do step 6.

## 6. Verify before switching anyone over

```bash
curl -s https://<app>.ondigitalocean.app/api/health
```

Expect `status: "ok"`, `database.ok: true`, and a `latencyMs` in the low tens —
if it is in the hundreds, the app and database are not in the same region and
the entire point of the move has been missed.

Then sign in, ring up one real sale, and print one receipt. The printing path
has never met a physical thermal printer; that is the last untested surface.

## Schema changes from here

There is known debt: migrations drifted behind `schema.prisma` because `db push`
was used, so `prisma migrate deploy` is **not** currently a safe deploy step and
deliberately is not wired into the app spec. Schema changes are applied
manually against `DIRECT_URL` for now:

```bash
DIRECT_URL="postgresql://doadmin:...?sslmode=require" npx prisma db push
DIRECT_URL="..." npx prisma db execute --schema prisma/schema.prisma \
  --file prisma/migrations/<name>/migration.sql   # RLS for any new tenant table
```

Resolving that drift — squashing to a baseline migration and moving to
`migrate deploy` — is worth its own session, rehearsed against a scratch
database first.

## Rolling back

App Platform keeps previous deployments; roll back from the Activity tab. The
database does not roll back with it, so a schema change that has already been
applied stays applied. Take a dump before any schema change:

```bash
DIRECT_URL="postgresql://doadmin:...?sslmode=require" ./scripts/backup.sh
```

## What this does not solve

If a salon's internet drops, billing stops — the app is server-rendered and has
no offline mode. Budget a 4G backup connection per branch; across seven salons
that costs about as much as the entire cloud bill.

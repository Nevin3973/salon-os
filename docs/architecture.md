# Architecture

Salon OS is a multi-tenant retail and inventory system for salon groups: one
warehouse supplies several branches, each branch sells to walk-in customers
under GST, and head office sees all of it.

Next.js 15 (App Router) · TypeScript · Prisma · PostgreSQL 17 · NextAuth v5.
About 16,000 lines across 33 pages, 6 API routes and 8 server-action modules.

## The tenancy model, and why it is the way it is

Every tenant table carries an `orgId` and is protected by Postgres row-level
security with **ENABLE + FORCE**. Two independent layers keep tenants apart:

1. **Application** — `getScopedDb(orgId)` wraps Prisma and injects the org
   filter into every read, write, count and aggregate, including calls that
   pass no `where` at all.
2. **Database** — the same operation is re-dispatched inside a transaction that
   sets `app.org_id`, which the RLS policies check. If layer 1 ever has a bug,
   layer 2 returns nothing rather than leaking.

The second layer is not belt-and-braces theatre. It has already caught a real
mistake: staff-credit validation was written against the bare Prisma client,
and RLS turned what would have been a cross-tenant read into an empty result
and a visible error.

**Two tables are deliberately exempt**, for the same structural reason — they
are how a caller's org is *discovered*, so they cannot be gated on already
knowing it:

| Table | Read by | Why exempt |
|---|---|---|
| `Membership` | `requireVerifiedSession` | Resolves which org the caller belongs to |
| `ApiKey` | `resolveOrgContext` | Resolves which org a bearer token belongs to |

Both are bounded in application code instead. `scripts/assert-rls.ts` runs in CI
and fails the build if any *other* table with an `orgId` lacks forced RLS — a
new tenant table shipping without a policy fails silently otherwise, because
the queries simply return everything.

**The app must connect as `salonos_app`.** Managed-database admin roles
(`doadmin`, `neondb_owner`) carry `BYPASSRLS`, which steps straight over all of
the above. `scripts/provision-app-role.sql` creates the restricted role and
ends with `NOBYPASSRLS`.

## Authorisation

Three checks, deliberately different in cost:

- **Reads** use the JWT session — cheap, and a stale role only risks showing a
  page the user no longer needs.
- **Anything that moves money or stock** calls `requireVerifiedSession`, which
  re-reads the live `Membership`. A revoked account stops working immediately
  rather than at next sign-in.
- **Voids and hand adjustments** additionally require the branch's
  authorization code, even for managers. That is segregation of duties: the
  person who can sell is not automatically the person who can un-sell.

Sessions last 12 hours (not NextAuth's 30-day default) because these accounts
move money and often sit on a shared counter device. The till also locks after
five idle minutes and releases on password re-entry, keeping a half-built bill
alive. That lock is a supervision control, not a security boundary — the real
protections are the short session and the live membership re-check.

## Data model, in the shape of the business

**Stock exists at three levels**, which is how a salon actually thinks:

| Level | Where | Model |
|---|---|---|
| Master inventory | Warehouse | `Product.stock` |
| For sale | Branch shelf | `BranchStock` kind `RETAIL` |
| For salon use | Branch back bar | `BranchStock` kind `SALON_USE` |

The POS reads only `RETAIL`, so a cashier can never sell the back bar's open
bottles. Conflating the two pools would make both margin reporting and reorder
points wrong: back bar is a cost of delivering a service, retail is revenue.

**Invoicing follows Indian practice.** A separate series per branch per
financial year (`ROS/25-26/0001`), restarting each April, with the counter row
locked `FOR UPDATE` so concurrent tills cannot produce a gap or a duplicate.
Bills round to the whole rupee and record the adjustment. GST is intra-state
CGST + SGST; discounts reduce the taxable value *before* tax, as the law
requires.

**Returns raise a credit note** (`CN/ROS/25-26/0001`) rather than editing the
invoice — an invoice, once issued, is a tax document and does not change.

**Sale credit is not the same as who billed.** `SaleItem.staffId` points at a
`Staff` record, which is deliberately *not* a `User`: most stylists never sign
in, and crediting them through a login would mean inventing an account for
every one of them. Credit is held per line even though the till currently
picks one person per bill, so per-product credit later is a UI change rather
than a migration of history that cannot be reconstructed. It never appears on
the customer's invoice.

## Concurrency

Two tills at one branch can sell the last unit simultaneously. `bumpBranchStock`
locks the shelf row `FOR UPDATE`, then computes the target **under the lock** —
so an absolute "set to N" cannot be corrupted by a sale landing between the
caller's read and the write. The lock includes `kind`, or a retail sale could
spend salon-use stock.

## Operational posture

`GET /api/health` is public (an uptime monitor cannot authenticate) and reports
posture rather than secrets: database reachability and latency, whether the
rate limiter is genuinely shared, whether error reporting is configured, and
whether email can reach anyone but the account owner. It is cached for five
seconds so it cannot be used to exhaust the connection pool.

It reports `errorReporting.configured`, not `enabled`, because all it can see is
that a DSN exists — whether any code path calls `reportError` is a property of
the code, and claiming otherwise would make the endpoint reassuring rather than
useful.

The rate limiter uses Upstash Redis when configured and an in-process Map
otherwise. That distinction matters: on serverless, an in-memory limit is
really "N attempts per instance", which looks like protection and is not.

## Deployment

DigitalOcean App Platform in `blr1`, two instances, built from the repository's
Dockerfile on push to `main`. The managed Postgres cluster sits in the same
region — app and database were previously a continent apart, which put ~350ms
in front of every action a cashier took; co-locating them took database round
trips to single-digit milliseconds.

App Platform will not shift traffic to a new deployment until `/api/health`
passes, so a broken build cannot take billing down.

Nothing in the codebase is specific to a host: no `@vercel/*` or
`@neondatabase/*` packages, no edge runtime, and the Dockerfile runs anywhere.
Moving the database is two environment variables.

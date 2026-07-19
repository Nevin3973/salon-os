# Velvet — Architecture

Velvet is a multi-tenant SaaS platform for salon supply management. One
product, three surfaces:

| Surface | Users | Product feel |
|---|---|---|
| **Storefront** (`/purchase-manager/*`) | Partner salons (Purchase Managers) | Premium e-commerce store: catalogue, cart, checkout, account, addresses, order & delivery tracking |
| **Ops console** (`/warehouse/*`) | Warehouse managers | Inventory/operations software: queue, staged dispatch, outstanding supplies, stock, imports, movement log |
| **Analytics/admin** (`/admin/*`) | Org super admins | Analytical dashboard + management: KPIs, products, users, authorization codes, audit |

## Topology: modular monolith, split-ready

Velvet deliberately ships as **one deployable Next.js application** with strict
internal module boundaries rather than as physical microservices:

- At the current scale (dozens–hundreds of tenant orgs, human-driven traffic),
  network-partitioned services would add latency, distributed-transaction
  complexity, and operational overhead with no throughput benefit. The
  concurrency-critical paths (order placement, dispatch) rely on **single-database
  row locking** for correctness — the strongest, simplest tool available while
  the data lives together.
- Scalability is achieved the boring, proven way: the app is **stateless**
  (JWT sessions, no in-process state), so it scales horizontally behind a load
  balancer; Postgres scales up + read replicas; heavy async work (imports,
  notifications) can move to a queue worker without changing module boundaries.
- The module boundaries below are the future service seams. Any module can be
  extracted into its own service later by (1) giving it its own deployment,
  (2) swapping direct function calls for HTTP/queue calls at the boundary, and
  (3) moving its tables — the code dependency direction already permits this.

## Module boundaries

```
src/
  auth.ts, auth.config.ts      # identity: NextAuth v5, JWT claims {org, role, location}
  middleware.ts                # edge role-routing (UX only, not the security boundary)
  lib/
    db.ts                      # Prisma singleton
    tenant.ts                  # THE tenancy choke point: getScopedDb(orgId), requireSession(role)
    audit.ts                   # logAudit(tx, …) — audit rows written inside the same transaction
    stock.ts                   # derived reserved/available computation
    actions/                   # web adapters (Server Actions), one file per domain
      cart.ts orders.ts dispatch.ts inventory.ts account.ts admin.ts
  server/
    api/                       # machine adapters for the REST API
      auth.ts                  # session-or-API-key resolution → OrgContext
      serialize.ts             # stable public JSON shapes (never leak Prisma rows)
  app/
    api/v1/…                   # versioned REST endpoints (interoperability surface)
    (dashboard)/…              # the three UI surfaces
```

**Domain modules** (logical, enforced by review + import direction):

- **identity** — users, memberships, sessions, password lifecycle. Owner of `User`, `Membership`.
- **catalog** — products, categories, activation. Owner of `Product`.
- **ordering** — cart, orders, items, deliveries, authorization codes, addresses.
  Owner of `CartItem`, `Order*`, `AuthorizationCode`, `Address`.
- **inventory** — stock levels, movements, imports, outstanding fulfilment. Owner of `StockMovement`, `Product.stock` mutations.
- **audit** — append-only audit trail. Owner of `AuditLogEntry`. Every domain writes through `logAudit`.

Rules:
1. UI components never touch Prisma — they call Server Actions or read via
   page-level loaders that use `getScopedDb`.
2. **All tenant data access goes through `getScopedDb(orgId)`** (auto-injects
   the org filter on every operation) or through transactions that filter by
   `orgId` explicitly alongside `FOR UPDATE` locks. `orgId` always comes from
   the server-side session/API key — never from client input.
3. Cross-module writes that must be atomic (dispatch = ordering + inventory +
   audit) run in a single Prisma interactive transaction.
4. Public API responses go through `server/api/serialize.ts` — internal schema
   changes never leak into the versioned contract.

## Interoperability: REST API v1

Versioned under `/api/v1`. Two authentication modes:

- **Session cookie** — the logged-in browser (same guards as the UI).
- **API key** — `Authorization: Bearer vlvt_<key>` for integrations (ERP sync,
  BI tools). Keys are org-scoped, stored hashed (SHA-256), shown once at
  creation, revocable, `lastUsedAt` tracked. Managed by Super Admins.

Initial surface (read-first; writes are added per-integration need):

| Endpoint | Description |
|---|---|
| `GET /api/v1/products` | Org catalogue with stock/available. Filters: `category`, `active`, `q` |
| `GET /api/v1/orders` | Orders with status/branch filters, cursor pagination |
| `GET /api/v1/orders/{id}` | Full order: items, deliveries, outstanding, address |

Conventions: JSON only; ISO-8601 timestamps; cursor pagination
(`?cursor=&limit=`); errors as `{ "error": { "code", "message" } }`; additive
changes only within v1 — breaking changes get `/api/v2`.

## Multi-tenancy & security

- Shared schema, `orgId` on every tenant table; app-layer scoping via the
  Prisma extension in `tenant.ts` (see rule 2 above).
- **Postgres Row-Level Security (implemented)**: fail-closed policies on every
  tenant table (`prisma/migrations/*_rls`) checked against `app.org_id`, which
  `withOrg`/`getScopedDb` set per transaction. The app connects as the
  non-privileged `salonos_app` role (`scripts/provision-app-role.sql`) because
  owners/superusers bypass RLS; migrations and the dev seed use the owner
  connection (`DIRECT_URL`). Deliberately exempt: `User`, `Membership`, `Org`
  (needed at login before an org context exists) and `ApiKey` (looked up by
  prefix to discover the org). Covered by integration tests in `tests/rls.test.ts`.
- **Rate limiting (implemented)**: sliding-window limiter (`lib/rate-limit.ts`)
  on login (5/10min per account) and purchase-code attempts (10/10min per
  user); in-memory per instance — swap the store for Redis when scaling out.
- **Forced password rotation (implemented)**: users created with a one-time
  password are gated to `/change-password` (checked against the DB, not the
  JWT) until they set their own.
- Security response headers set in `next.config.ts` (frame-deny, nosniff,
  referrer policy, permissions policy).
- Passwords: bcrypt (cost 10+); purchase authorization codes: bcrypt, rotation
  invalidates immediately; API keys: SHA-256 (high-entropy input, no need for
  slow hashing on every request).
- Order/dispatch correctness under concurrency: interactive transactions +
  `SELECT … FOR UPDATE` on products/orders; reserved stock is **derived**
  (`Σ requested − delivered` over open orders), never a second mutable counter.

## Data lifecycle

- Products are deactivated, never deleted — history stays intact; inactive
  products vanish from storefronts and cannot be requested.
- Orders: `PENDING → PROCESSING → COMPLETED | PARTIALLY_FULFILLED`, or
  `CANCELLED` while pending. Partially-fulfilled lines carry reason/ETA and are
  fulfil-able later from the ops console ("pending supplies").
- Every stock change writes a `StockMovement` (prev → new, actor, cause);
  every meaningful action writes an `AuditLogEntry` in-transaction.

## Environments & deployment

- Dev: local Postgres (Docker), `prisma db push`, seeded demo orgs.
- Production: Vercel (or any Node host) + managed Postgres (Neon/RDS);
  pooled connection string for the app, direct URL for migrations;
  `prisma migrate deploy` with a consolidated migration history (generated at
  deploy-prep). Static assets on the platform CDN.
- Observability path: structured request logging, Prisma query metrics, and
  error tracking (Sentry) hook in at `lib/db.ts` and a root `instrumentation.ts`.

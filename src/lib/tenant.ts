import { Prisma, type Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

/**
 * Models that carry `orgId` directly and are scoped automatically by
 * `getScopedDb`. OrderItem / OrderItemDelivery / SaleItem do NOT have their
 * own orgId — they must only ever be reached through an already-orgId-checked
 * parent (Order / Sale)
 * (e.g. `scoped.order.update({ where: { id }, data: { items: { ... } } })`
 * or inside a transaction that has already verified the parent Order's
 * orgId). Never query them by a bare id supplied from the client.
 */
const SCOPED_MODELS = [
  "location",
  "product",
  "stockMovement",
  "order",
  "cartItem",
  "address",
  "authorizationCode",
  "auditLogEntry",
  "membership",
  "branchStock",
  "branchStockMovement",
  "sale",
  "invoiceSeries",
  "saleReturn",
] as const;

/**
 * Runs `fn` inside a transaction whose Postgres session carries the caller's
 * org (`app.org_id`). The database's row-level-security policies check that
 * setting, so even a query with a missing/buggy org filter cannot see or
 * write another tenant's rows. Every manual transaction that touches tenant
 * tables must go through this (or replicate the set_config line).
 */
export async function withOrg<T>(
  orgId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await setOrgConfig(tx, orgId);
    return fn(tx);
  });
}

/** Sets the RLS org context on an already-open transaction. */
export async function setOrgConfig(tx: Prisma.TransactionClient, orgId: string) {
  await tx.$executeRaw`SELECT set_config('app.org_id', ${orgId}, true)`;
}

/**
 * Returns a Prisma client scoped to a single org, enforced twice:
 *  1. App layer — every read gets `orgId` AND-ed into its `where`; every
 *     create gets `orgId` stamped into its data.
 *  2. Database layer — the operation is re-dispatched inside a transaction
 *     that sets `app.org_id`, which Postgres RLS policies verify. If layer 1
 *     ever has a bug, layer 2 still returns nothing rather than leaking.
 *
 * `orgId` must come from the caller's server-side session — never from
 * client input or a URL param.
 */
export function getScopedDb(orgId: string) {
  return prisma.$extends({
    name: "org-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const modelKey = model ? (model.charAt(0).toLowerCase() + model.slice(1)) : "";
          if (!SCOPED_MODELS.includes(modelKey as (typeof SCOPED_MODELS)[number])) {
            return query(args);
          }

          // `args` can be undefined entirely (e.g. `findMany()` / `count()`),
          // so normalize first — every operation below must still get scoped.
          const a = (args ?? {}) as Record<string, unknown>;

          if (operation === "create") {
            a.data = { ...(a.data as object), orgId };
          } else if (operation === "createMany" && Array.isArray(a.data)) {
            a.data = (a.data as Record<string, unknown>[]).map((d) => ({ ...d, orgId }));
          } else if (operation === "upsert") {
            a.where = { ...((a.where as object) ?? {}), orgId };
            a.create = { ...(a.create as object), orgId };
          } else {
            // Reads, updates, deletes, counts, aggregates, groupBy: AND the
            // org filter in unconditionally — including when no `where` was
            // passed at all. (Prisma's extended where-unique allows extra
            // filter fields alongside unique ones on findUnique/update/delete.)
            a.where = { ...((a.where as object) ?? {}), orgId };
          }

          // Re-dispatch on a transaction that carries the RLS org context.
          return withOrg(orgId, async (tx) => {
            const delegate = (tx as unknown as Record<string, Record<string, (args: unknown) => Promise<unknown>>>)[modelKey];
            return delegate[operation](a);
          });
        },
      },
    },
  });
}

export type ScopedDb = ReturnType<typeof getScopedDb>;

type RequiredSession = {
  userId: string;
  name: string;
  email: string;
  orgId: string;
  role: Role;
  locationId: string | null;
};

/**
 * Server Action / Server Component guard: verifies a session exists, an
 * active org has been chosen, and (optionally) that the session's role
 * matches. Redirects rather than throws for the missing-session/org cases
 * since those are normal navigation states; throws for a role mismatch
 * since that indicates either a UI bug or a tampered request.
 *
 * This trusts the JWT claim (cheap, no DB) — fine for reads. Mutations that
 * move money or stock use `requireVerifiedSession` instead, which additionally
 * re-checks the live membership.
 */
export async function requireSession(role?: Role | Role[]): Promise<RequiredSession> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.activeOrgId || !session.activeRole) redirect("/select-org");
  if (role) {
    const allowed = Array.isArray(role) ? role : [role];
    if (!allowed.includes(session.activeRole)) {
      throw new Error(`Expected role ${allowed.join("|")}, session has ${session.activeRole}`);
    }
  }
  return {
    userId: session.user.id,
    name: session.user.name,
    email: session.user.email,
    orgId: session.activeOrgId,
    role: session.activeRole,
    locationId: session.activeLocationId,
  };
}

/**
 * Thrown when a request's JWT claim no longer matches a live membership — the
 * person was removed from the org, or their role/branch was changed, after the
 * token was minted. Server actions surface it as a "session changed" message.
 */
export class StaleSessionError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "StaleSessionError";
  }
}

/** True for the error above — lets action `catch` blocks show a specific message. */
export function isStaleSession(e: unknown): e is StaleSessionError {
  return e instanceof StaleSessionError;
}

/**
 * Stricter guard for actions that move money or stock, or change privileged
 * settings. On top of the JWT checks, it confirms the claimed org/role/branch
 * still matches a live Membership row (one indexed lookup on the RLS-exempt
 * Membership table) — so a revoked or re-roled account cannot act on a token
 * that was valid when they signed in. Throws `StaleSessionError` on a mismatch
 * rather than redirecting, because an action is a point operation, not a
 * navigation; the caller returns a friendly result and the next page load
 * naturally routes the user back to sign in.
 */
export async function requireVerifiedSession(role?: Role | Role[]): Promise<RequiredSession> {
  const s = await requireSession(role);
  const membership = await prisma.membership.findFirst({
    where: { userId: s.userId, orgId: s.orgId },
    select: { role: true, locationId: true },
  });
  if (!membership) throw new StaleSessionError("Your access to this workspace has changed.");
  if (membership.role !== s.role) throw new StaleSessionError("Your role has changed.");
  if ((membership.locationId ?? null) !== (s.locationId ?? null)) {
    throw new StaleSessionError("Your assigned location has changed.");
  }
  return s;
}

/** Convenience: verified session + a db client pre-scoped to the session's org. */
export async function requireVerifiedScopedSession(role?: Role | Role[]) {
  const session = await requireVerifiedSession(role);
  return { session, db: getScopedDb(session.orgId) };
}

/** Convenience: session + a db client pre-scoped to the session's org. */
export async function requireScopedSession(role?: Role | Role[]) {
  const session = await requireSession(role);
  return { session, db: getScopedDb(session.orgId) };
}

/** Active org name for chrome, resolved from the session's memberships. */
export async function activeOrgName(): Promise<string> {
  const session = await auth();
  const m = session?.memberships.find((x) => x.orgId === session.activeOrgId);
  return m?.orgName ?? "";
}

/** Active location (branch/warehouse) name for chrome. */
export async function activeLocationName(): Promise<string | null> {
  const session = await auth();
  const m = session?.memberships.find((x) => x.orgId === session.activeOrgId);
  return m?.locationName ?? null;
}

export { Prisma };

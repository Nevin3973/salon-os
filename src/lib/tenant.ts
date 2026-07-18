import { Prisma, type Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

/**
 * Models that carry `orgId` directly and are scoped automatically by
 * `getScopedDb`. OrderItem / OrderItemDelivery do NOT have their own orgId —
 * they must only ever be reached through an already-orgId-checked Order
 * (e.g. `scoped.order.update({ where: { id }, data: { items: { ... } } })`
 * or inside a transaction that has already verified the parent Order's
 * orgId). Never query them by a bare id supplied from the client.
 */
const SCOPED_MODELS = [
  "location",
  "product",
  "stockMovement",
  "order",
  "authorizationCode",
  "auditLogEntry",
  "membership",
] as const;

/**
 * Returns a Prisma client scoped to a single org: every read on a
 * tenant-scoped model gets `orgId` AND-ed into its `where`, and every create
 * gets `orgId` stamped into its `data`. `orgId` must come from the caller's
 * server-side session — never from client input or a URL param — so this
 * function's own contract requires an explicit orgId argument rather than
 * reading one implicitly, to keep that requirement visible at every call site.
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

          const a = args as Record<string, unknown>;

          if (operation === "create") {
            a.data = { ...(a.data as object), orgId };
          } else if (operation === "createMany" && Array.isArray((a.data as unknown[]))) {
            a.data = (a.data as Record<string, unknown>[]).map((d) => ({ ...d, orgId }));
          } else if (
            operation === "findUnique" ||
            operation === "findUniqueOrThrow"
          ) {
            // findUnique only accepts unique-field where clauses; re-run as
            // findFirst so we can safely AND-in the org filter.
            const where = { ...(a.where as object), orgId };
            return (query as unknown as (args: unknown) => Promise<unknown>)({
              ...a,
              where,
            });
          } else if ("where" in a) {
            a.where = { ...(a.where as object), orgId };
          } else if (operation === "aggregate" || operation === "groupBy" || operation === "count") {
            a.where = { ...((a.where as object) ?? {}), orgId };
          }

          return query(a as never);
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
 */
export async function requireSession(role?: Role): Promise<RequiredSession> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.activeOrgId || !session.activeRole) redirect("/select-org");
  if (role && session.activeRole !== role) {
    throw new Error(`Expected role ${role}, session has ${session.activeRole}`);
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

/** Convenience: session + a db client pre-scoped to the session's org. */
export async function requireScopedSession(role?: Role) {
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

import type { Prisma, PrismaClient } from "@prisma/client";
import { withOrg } from "@/lib/tenant";

type AuditInput = {
  orgId: string;
  userId?: string | null;
  userName?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Writes an audit entry. Pass the transaction handle when logging inside a
 * mutation's transaction (an audit entry should never exist for a mutation
 * that rolled back). When handed the root client instead, it opens its own
 * org-scoped transaction so the write passes row-level security.
 */
export async function logAudit(
  client: Prisma.TransactionClient | PrismaClient,
  input: AuditInput
) {
  const isRootClient = typeof (client as PrismaClient).$transaction === "function";
  if (isRootClient) {
    return withOrg(input.orgId, (tx) => write(tx, input));
  }
  return write(client as Prisma.TransactionClient, input);
}

async function write(
  tx: Prisma.TransactionClient,
  { orgId, userId, userName, action, entityType, entityId, metadata }: AuditInput
) {
  await tx.auditLogEntry.create({
    data: {
      orgId,
      userId: userId ?? null,
      userName: userName ?? null,
      action,
      entityType,
      entityId,
      metadata: metadata as Prisma.InputJsonValue | undefined,
    },
  });
}

import type { Prisma } from "@prisma/client";

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
 * Writes an audit entry. Takes a Prisma client/transaction handle so callers
 * can log inside the same transaction as the mutation being recorded —
 * an audit entry should never exist for a mutation that got rolled back.
 */
export async function logAudit(
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

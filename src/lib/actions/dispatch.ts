"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { orderCode, fmtDate } from "@/lib/format";

export type DispatchResult = { ok: true } | { ok: false; error: string; itemId?: string };

export async function startProcessing(input: { orderId: string }): Promise<DispatchResult> {
  const { orderId } = z.object({ orderId: z.string().min(1) }).parse(input);
  const session = await requireSession("WAREHOUSE_MANAGER");

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} AND "orgId" = ${session.orgId} FOR UPDATE`;
      const order = await tx.order.findFirst({ where: { id: orderId, orgId: session.orgId } });
      if (!order) throw new Error("NOT_FOUND");
      if (order.status !== "PENDING") throw new Error("NOT_PENDING");
      await tx.order.update({ where: { id: order.id }, data: { status: "PROCESSING" } });
      await logAudit(tx, {
        orgId: session.orgId,
        userId: session.userId,
        userName: session.name,
        action: `Started processing ${orderCode(order.orderNo)}`,
        entityType: "Order",
        entityId: order.id,
      });
    });
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
  revalidatePath("/warehouse/queue");
  revalidatePath("/warehouse/inventory");
  return { ok: true };
}

const lineSchema = z.object({
  orderItemId: z.string().min(1),
  dispatch: z.number().int().min(0).max(1_000_000),
  reason: z.string().max(64).optional(),
  eta: z.string().optional(), // yyyy-mm-dd
  remark: z.string().max(500).optional(),
});
const applySchema = z.object({
  orderId: z.string().min(1),
  closing: z.boolean(),
  lines: z.array(lineSchema),
});

/**
 * Staged / partial dispatch. Mirrors the prototype's applyDispatch:
 * - Each line is hard-clamped server-side to min(remaining, physical stock),
 *   regardless of what the client sent.
 * - `closing` settles the order: any line still short REQUIRES a reason.
 * - Not closing + not fully delivered → order stays PROCESSING (dispatch again later).
 * - Fully delivered → COMPLETED; closed while short → PARTIALLY_FULFILLED.
 *
 * Runs in one transaction with FOR UPDATE locks on the order and its products,
 * re-reading stock inside the lock so concurrent dispatches can't oversell.
 */
export async function applyDispatch(input: {
  orderId: string;
  closing: boolean;
  lines: { orderItemId: string; dispatch: number; reason?: string; eta?: string; remark?: string }[];
}): Promise<DispatchResult> {
  const { orderId, closing, lines } = applySchema.parse(input);
  const session = await requireSession("WAREHOUSE_MANAGER");
  const lineMap = new Map(lines.map((l) => [l.orderItemId, l]));

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} AND "orgId" = ${session.orgId} FOR UPDATE`;

      const order = await tx.order.findFirst({
        where: { id: orderId, orgId: session.orgId },
        include: { items: { include: { product: true } }, branch: { select: { name: true } } },
      });
      if (!order) throw new Error("NOT_FOUND");
      if (order.status !== "PROCESSING") throw new Error("NOT_PROCESSING");

      const productIds = [...new Set(order.items.map((i) => i.productId))];
      if (productIds.length > 0) {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM "Product" WHERE id IN (${Prisma.join(productIds)}) AND "orgId" = ${session.orgId} FOR UPDATE`
        );
      }
      const products = await tx.product.findMany({ where: { id: { in: productIds }, orgId: session.orgId } });
      const origStock = new Map(products.map((p) => [p.id, p.stock]));

      // 1. Pure allocation pass (running per-product stock so shared products are safe).
      const running = new Map(origStock);
      const alloc = order.items.map((it) => {
        const inp = lineMap.get(it.id);
        const remaining = it.requestedQty - it.deliveredQty;
        const avail = running.get(it.productId) ?? 0;
        const q = Math.max(0, Math.min(inp?.dispatch ?? 0, remaining, avail));
        running.set(it.productId, avail - q);
        return { it, q, remainingAfter: remaining - q };
      });

      // 2. Closing requires a reason for every line that will remain short.
      if (closing) {
        for (const a of alloc) {
          if (a.remainingAfter > 0 && !lineMap.get(a.it.id)?.reason) {
            throw new Error(`REASON_REQUIRED:${a.it.id}`);
          }
        }
      }

      // 3. Writes — deliveries, item updates, stock movements.
      const cursor = new Map(origStock);
      let dispatchedNow = 0;
      for (const a of alloc) {
        const inp = lineMap.get(a.it.id);
        if (a.q > 0) {
          dispatchedNow += a.q;
          const prev = cursor.get(a.it.productId)!;
          const next = prev - a.q;
          cursor.set(a.it.productId, next);
          await tx.stockMovement.create({
            data: {
              orgId: session.orgId,
              productId: a.it.productId,
              userId: session.userId,
              prevQty: prev,
              newQty: next,
              action: `Dispatch · ${orderCode(order.orderNo)} → ${order.branch.name}`,
              refOrderId: order.id,
            },
          });
          await tx.orderItemDelivery.create({
            data: { orderItemId: a.it.id, qty: a.q, dispatchedByUserId: session.userId },
          });
        }
        await tx.orderItem.update({
          where: { id: a.it.id },
          data: {
            deliveredQty: a.it.deliveredQty + a.q,
            ...(closing && a.remainingAfter > 0
              ? {
                  outstandingReason: inp?.reason ?? null,
                  outstandingEta: inp?.eta ? new Date(inp.eta) : null,
                  outstandingRemark: inp?.remark ?? null,
                }
              : {}),
          },
        });
      }

      // 4. Persist final stock per product.
      for (const [pid, cur] of cursor) {
        if (cur !== origStock.get(pid)) {
          await tx.product.update({ where: { id: pid }, data: { stock: cur } });
        }
      }

      // 5. Status transition.
      const fullyDelivered = alloc.every((a) => a.remainingAfter <= 0);
      if (closing || fullyDelivered) {
        const status = fullyDelivered ? "COMPLETED" : "PARTIALLY_FULFILLED";
        await tx.order.update({ where: { id: order.id }, data: { status } });
        const shorts = alloc.filter((a) => a.remainingAfter > 0);
        await logAudit(tx, {
          orgId: session.orgId,
          userId: session.userId,
          userName: session.name,
          action: fullyDelivered
            ? `Completed ${orderCode(order.orderNo)} — all items dispatched in full`
            : `Closed ${orderCode(order.orderNo)} — ${shorts
                .map((s) => {
                  const inp = lineMap.get(s.it.id);
                  return `${s.remainingAfter} × ${s.it.product.name} outstanding (${inp?.reason ?? "—"}${
                    inp?.eta ? `, ${fmtDate(new Date(inp.eta))}` : ""
                  })`;
                })
                .join("; ")}`,
          entityType: "Order",
          entityId: order.id,
        });
      } else {
        await logAudit(tx, {
          orgId: session.orgId,
          userId: session.userId,
          userName: session.name,
          action: `Dispatched ${dispatchedNow} unit${dispatchedNow === 1 ? "" : "s"} against ${orderCode(
            order.orderNo
          )} — order stays open`,
          entityType: "Order",
          entityId: order.id,
        });
      }
    });
  } catch (e) {
    const raw = e instanceof Error ? e.message : "";
    if (raw.startsWith("REASON_REQUIRED:")) {
      return { ok: false, error: "Select a reason for every line that will remain short.", itemId: raw.slice(16) };
    }
    return { ok: false, error: msg(e) };
  }

  revalidatePath("/warehouse/queue");
  revalidatePath("/warehouse/outstanding");
  revalidatePath("/warehouse/inventory");
  revalidatePath("/warehouse/log");
  return { ok: true };
}

function msg(e: unknown): string {
  const raw = e instanceof Error ? e.message : "";
  if (raw === "NOT_FOUND") return "Order not found.";
  if (raw === "NOT_PENDING") return "This order is no longer pending.";
  if (raw === "NOT_PROCESSING") return "Start processing the order first.";
  return "Something went wrong. Please try again.";
}

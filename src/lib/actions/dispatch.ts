"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireSession, setOrgConfig } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { orderCode, fmtDate } from "@/lib/format";
import { allocateDispatch } from "@/lib/allocation";
import { notifyDispatch, notifyRejected, notifyReturn } from "@/lib/notify";

export type DispatchResult = { ok: true } | { ok: false; error: string; itemId?: string };

export async function startProcessing(input: { orderId: string }): Promise<DispatchResult> {
  const { orderId } = z.object({ orderId: z.string().min(1) }).parse(input);
  const session = await requireSession("WAREHOUSE_MANAGER");

  try {
    await prisma.$transaction(async (tx) => {
      await setOrgConfig(tx, session.orgId);
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
      await setOrgConfig(tx, session.orgId);
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

      // 1. Pure allocation pass — see lib/allocation.ts (unit-tested).
      const itemById = new Map(order.items.map((it) => [it.id, it]));
      const alloc = allocateDispatch(
        order.items.map((it) => ({
          itemId: it.id,
          productId: it.productId,
          requestedQty: it.requestedQty,
          deliveredQty: it.deliveredQty,
          requestedDispatch: lineMap.get(it.id)?.dispatch ?? 0,
        })),
        origStock
      ).map((r) => ({ it: itemById.get(r.itemId)!, q: r.qty, remainingAfter: r.remainingAfter }));

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

  await notifyDispatch(orderId);

  revalidatePath("/warehouse/queue");
  revalidatePath("/warehouse/outstanding");
  revalidatePath("/warehouse/inventory");
  revalidatePath("/warehouse/log");
  return { ok: true };
}

// ————————————————————————————————————————————————————————
// Rejecting an order
// ————————————————————————————————————————————————————————

const rejectSchema = z.object({
  orderId: z.string().min(1),
  reason: z.string().min(1).max(64),
  note: z.string().max(500).optional(),
});

/**
 * Declines an order outright. Only possible while nothing has been dispatched
 * against it — once stock has physically left the warehouse the order has to
 * be settled through applyDispatch (or brought back through returnOrder), so
 * that the movement log and the branch's records agree.
 *
 * A rejection moves no stock: the reservation simply disappears when the order
 * leaves PENDING/PROCESSING.
 */
export async function rejectOrder(input: {
  orderId: string;
  reason: string;
  note?: string;
}): Promise<DispatchResult> {
  const { orderId, reason, note } = rejectSchema.parse(input);
  const session = await requireSession("WAREHOUSE_MANAGER");

  try {
    await prisma.$transaction(async (tx) => {
      await setOrgConfig(tx, session.orgId);
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} AND "orgId" = ${session.orgId} FOR UPDATE`;

      const order = await tx.order.findFirst({
        where: { id: orderId, orgId: session.orgId },
        include: { items: { select: { deliveredQty: true } } },
      });
      if (!order) throw new Error("NOT_FOUND");
      if (order.status !== "PENDING" && order.status !== "PROCESSING") throw new Error("NOT_OPEN");
      if (order.items.some((it) => it.deliveredQty > 0)) throw new Error("ALREADY_DISPATCHED");

      await tx.order.update({
        where: { id: order.id },
        data: { status: "REJECTED", closureReason: reason, closureNote: note || null },
      });

      await logAudit(tx, {
        orgId: session.orgId,
        userId: session.userId,
        userName: session.name,
        action: `Rejected ${orderCode(order.orderNo)} — ${reason}${note ? ` (${note})` : ""}`,
        entityType: "Order",
        entityId: order.id,
      });
    });
  } catch (e) {
    return { ok: false, error: msg(e) };
  }

  await notifyRejected(orderId);

  revalidatePath("/warehouse/queue");
  revalidatePath("/warehouse/inventory");
  revalidatePath("/purchase-manager/orders");
  return { ok: true };
}

// ————————————————————————————————————————————————————————
// Taking delivered goods back
// ————————————————————————————————————————————————————————

const returnSchema = z.object({
  orderId: z.string().min(1),
  reason: z.string().min(1).max(64),
  note: z.string().max(500).optional(),
  lines: z
    .array(z.object({ orderItemId: z.string().min(1), qty: z.number().int().min(0).max(1_000_000) }))
    .min(1),
});

/**
 * Books delivered units back into stock.
 *
 * A return is the mirror of a dispatch: quantities are clamped server-side to
 * what the branch actually holds (deliveredQty), each one writes a RETURN
 * delivery row and a stock movement, and physical stock goes back up. The
 * order's own history therefore reads forwards and backwards without any row
 * ever being edited away.
 *
 * Returning everything closes the order as RETURNED; returning part of it
 * leaves the order settled-but-short (PARTIALLY_FULFILLED).
 */
export async function returnOrder(input: {
  orderId: string;
  reason: string;
  note?: string;
  lines: { orderItemId: string; qty: number }[];
}): Promise<DispatchResult> {
  const { orderId, reason, note, lines } = returnSchema.parse(input);
  const session = await requireSession("WAREHOUSE_MANAGER");
  const askedFor = new Map(lines.map((l) => [l.orderItemId, l.qty]));

  let returnedUnits = 0;

  try {
    await prisma.$transaction(async (tx) => {
      await setOrgConfig(tx, session.orgId);
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} AND "orgId" = ${session.orgId} FOR UPDATE`;

      const order = await tx.order.findFirst({
        where: { id: orderId, orgId: session.orgId },
        include: { items: { include: { product: true } }, branch: { select: { name: true } } },
      });
      if (!order) throw new Error("NOT_FOUND");
      if (order.status !== "COMPLETED" && order.status !== "PARTIALLY_FULFILLED") {
        throw new Error("NOT_RETURNABLE");
      }

      const productIds = [...new Set(order.items.map((i) => i.productId))];
      if (productIds.length > 0) {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM "Product" WHERE id IN (${Prisma.join(productIds)}) AND "orgId" = ${session.orgId} FOR UPDATE`
        );
      }
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, orgId: session.orgId },
      });
      const stockOf = new Map(products.map((p) => [p.id, p.stock]));

      const detail: string[] = [];
      for (const item of order.items) {
        // Clamp to what the branch actually holds, whatever the client sent.
        const qty = Math.min(Math.max(0, askedFor.get(item.id) ?? 0), item.deliveredQty);
        if (qty === 0) continue;

        returnedUnits += qty;
        const prev = stockOf.get(item.productId)!;
        const next = prev + qty;
        stockOf.set(item.productId, next);

        await tx.orderItemDelivery.create({
          data: { orderItemId: item.id, qty, kind: "RETURN", dispatchedByUserId: session.userId },
        });
        await tx.orderItem.update({
          where: { id: item.id },
          data: { deliveredQty: item.deliveredQty - qty, returnedQty: item.returnedQty + qty },
        });
        await tx.product.update({ where: { id: item.productId }, data: { stock: next } });
        await tx.stockMovement.create({
          data: {
            orgId: session.orgId,
            productId: item.productId,
            userId: session.userId,
            prevQty: prev,
            newQty: next,
            action: `Return · ${orderCode(order.orderNo)} ← ${order.branch.name} (${reason})`,
            refOrderId: order.id,
          },
        });
        detail.push(`${qty} × ${item.product.name}`);
      }

      if (returnedUnits === 0) throw new Error("NOTHING_TO_RETURN");

      // Everything the branch had has come back → the order is a return.
      const stillHeld = order.items.reduce(
        (sum, it) => sum + (it.deliveredQty - Math.min(Math.max(0, askedFor.get(it.id) ?? 0), it.deliveredQty)),
        0
      );

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: stillHeld === 0 ? "RETURNED" : "PARTIALLY_FULFILLED",
          closureReason: reason,
          closureNote: note || null,
        },
      });

      await logAudit(tx, {
        orgId: session.orgId,
        userId: session.userId,
        userName: session.name,
        action: `Return booked against ${orderCode(order.orderNo)} — ${detail.join(", ")} back in stock (${reason})${note ? ` (${note})` : ""}`,
        entityType: "Order",
        entityId: order.id,
      });
    });
  } catch (e) {
    return { ok: false, error: msg(e) };
  }

  await notifyReturn(orderId, returnedUnits);

  revalidatePath("/warehouse/returns");
  revalidatePath("/warehouse/inventory");
  revalidatePath("/warehouse/log");
  revalidatePath("/purchase-manager/orders");
  return { ok: true };
}

function msg(e: unknown): string {
  const raw = e instanceof Error ? e.message : "";
  if (raw === "NOT_FOUND") return "Order not found.";
  if (raw === "NOT_PENDING") return "This order is no longer pending.";
  if (raw === "NOT_PROCESSING") return "Start processing the order first.";
  if (raw === "NOT_OPEN") return "This order is already closed.";
  if (raw === "ALREADY_DISPATCHED") {
    return "Stock has already gone out against this order — close it short, or book a return instead.";
  }
  if (raw === "NOT_RETURNABLE") return "Only a delivered order can have stock returned against it.";
  if (raw === "NOTHING_TO_RETURN") return "Enter how many units are coming back.";
  return "Something went wrong. Please try again.";
}

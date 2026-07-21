"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireSession, withOrg } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { orderCode } from "@/lib/format";
import { reservedByProduct, availableOf } from "@/lib/stock";
import { takeToken, resetTokens } from "@/lib/rate-limit";
import { notifyNewOrder, notifyOrderEdited } from "@/lib/notify";

/**
 * Verifies a branch/org authorization code — the transaction-approval gate.
 * Used both when an order is placed and when a still-pending order is edited,
 * so an amended order carries the same approval as a new one.
 *
 * Returns the matched code's id, or an error message to show the user.
 * Rate-limited per user (10 tries / 10 min) so codes can't be brute-forced.
 */
async function verifyAuthCode(
  session: { userId: string; orgId: string },
  branchId: string,
  rawCode: string
): Promise<{ ok: true; codeId: string } | { ok: false; error: string }> {
  const limiter = takeToken(`authcode:${session.userId}`, { limit: 10, windowMs: 10 * 60 * 1000 });
  if (!limiter.ok) {
    return {
      ok: false,
      error: `Too many tries. Wait about ${Math.max(1, Math.ceil(limiter.retryAfterSec / 60))} minute(s) and try again.`,
    };
  }

  const codes = await withOrg(session.orgId, (tx) =>
    tx.authorizationCode.findMany({
      where: {
        orgId: session.orgId,
        isActive: true,
        OR: [{ locationId: null }, { locationId: branchId }],
      },
    })
  );
  for (const c of codes) {
    if (await bcrypt.compare(rawCode.trim(), c.codeHash)) {
      resetTokens(`authcode:${session.userId}`);
      return { ok: true, codeId: c.id };
    }
  }
  return { ok: false, error: "That authorization code is not valid." };
}

export type PlaceOrderResult =
  | { ok: true; orderId: string; orderNo: number; code: string }
  | { ok: false; error: string };

const placeSchema = z.object({
  authCode: z.string().min(1).max(64),
  shipToAddressId: z.string().min(1),
  deliveryNote: z.string().max(500).optional(),
});

/**
 * Places the current user's cart as an order.
 *
 * - Requires a valid branch/org authorization code (transaction-approval gate).
 * - Every ACTIVE product is orderable. If a line exceeds what's physically
 *   available it is still accepted as a "requirement" (backorder / pending
 *   supply) — the warehouse dispatches what it can and the rest stays
 *   outstanding. Inactive products are rejected.
 * - Order number is drawn atomically from Org.orderSeq inside the transaction
 *   so concurrent checkouts never collide.
 * - Reservation is derived (requested − delivered over open orders); placing
 *   an order does not mutate physical stock — that only happens at dispatch,
 *   where quantities are hard-clamped to what actually exists.
 */
export async function placeOrder(input: {
  authCode: string;
  shipToAddressId: string;
  deliveryNote?: string;
}): Promise<PlaceOrderResult> {
  const parsed = placeSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error:
        first?.path[0] === "shipToAddressId"
          ? "Choose a delivery address."
          : "Enter your authorization code.",
    };
  }

  const session = await requireSession("PURCHASE_MANAGER");
  if (!session.locationId) return { ok: false, error: "Your account is not assigned to a branch." };
  const branchId = session.locationId;

  // The delivery address must be an active address of this branch.
  const address = await withOrg(session.orgId, (tx) =>
    tx.address.findFirst({
      where: {
        id: parsed.data.shipToAddressId,
        orgId: session.orgId,
        locationId: branchId,
        isActive: true,
      },
    })
  );
  if (!address) return { ok: false, error: "Choose a valid delivery address." };

  const verified = await verifyAuthCode(session, branchId, parsed.data.authCode);
  if (!verified.ok) return { ok: false, error: verified.error };
  const matchedCodeId = verified.codeId;

  try {
    const result = await withOrg(session.orgId, async (tx) => {
      const cart = await tx.cartItem.findMany({
        where: { orgId: session.orgId, userId: session.userId },
        include: { product: true },
        orderBy: { createdAt: "asc" },
      });
      if (cart.length === 0) throw new Error("EMPTY_CART");

      // Guard: every product must belong to this org and be active.
      for (const line of cart) {
        if (line.product.orgId !== session.orgId) throw new Error("CROSS_TENANT");
        if (!line.product.active) throw new Error(`INACTIVE:${line.product.name}`);
      }

      const org = await tx.org.update({
        where: { id: session.orgId },
        data: { orderSeq: { increment: 1 } },
        select: { orderSeq: true },
      });
      const orderNo = org.orderSeq;

      // Snapshot prices at order time — catalogue prices may change later.
      const totalCents = cart.reduce((sum, line) => sum + line.product.priceCents * line.qty, 0);

      const order = await tx.order.create({
        data: {
          orgId: session.orgId,
          orderNo,
          branchId,
          placedByUserId: session.userId,
          status: "PENDING",
          authCodeId: matchedCodeId,
          shipToAddressId: address.id,
          deliveryNote: parsed.data.deliveryNote || null,
          totalCents,
          items: {
            create: cart.map((line) => ({
              productId: line.productId,
              requestedQty: line.qty,
              unitPriceCents: line.product.priceCents,
              note: line.note,
            })),
          },
        },
      });

      await tx.cartItem.deleteMany({ where: { orgId: session.orgId, userId: session.userId } });

      await logAudit(tx, {
        orgId: session.orgId,
        userId: session.userId,
        userName: session.name,
        action: `Placed ${orderCode(orderNo)} (${cart.length} item${cart.length === 1 ? "" : "s"}) — stock reserved`,
        entityType: "Order",
        entityId: order.id,
      });

      return { orderId: order.id, orderNo };
    });

    // Best-effort, post-commit: never blocks or fails the placed order.
    await notifyNewOrder(result.orderId);

    revalidatePath("/purchase-manager/orders");
    revalidatePath("/purchase-manager/catalogue");
    revalidatePath("/purchase-manager/cart");
    return { ok: true, orderId: result.orderId, orderNo: result.orderNo, code: orderCode(result.orderNo) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "EMPTY_CART") return { ok: false, error: "Your cart is empty." };
    if (msg.startsWith("INACTIVE:")) return { ok: false, error: `${msg.slice(9)} is no longer available.` };
    return { ok: false, error: "Could not place the order. Please try again." };
  }
}

// ————————————————————————————————————————————————————————
// Editing a pending order
// ————————————————————————————————————————————————————————

const updateSchema = z.object({
  orderId: z.string().min(1),
  authCode: z.string().min(1).max(64),
  lines: z
    .array(
      z.object({
        orderItemId: z.string().min(1),
        qty: z.number().int().min(0).max(100_000),
      })
    )
    .max(200),
  /** Fold whatever is in the user's cart into this order as extra lines. */
  mergeCart: z.boolean().optional(),
  shipToAddressId: z.string().min(1).optional(),
  deliveryNote: z.string().max(500).optional(),
});

export type UpdateOrderResult = { ok: true } | { ok: false; error: string };

/**
 * Amends an order the warehouse has not started on yet.
 *
 * Only PENDING orders of the caller's own branch can be edited, and the edit
 * goes through the same authorization-code gate as placing an order — an
 * amended order carries the same approval as a new one.
 *
 * Quantities may go up or down, a line can be dropped (qty 0), and the cart
 * can be folded in to add products. Prices already snapshotted on existing
 * lines are kept — the branch is not re-priced for editing — while lines
 * added from the cart snapshot today's catalogue price. Emptying the order
 * entirely is rejected: that is a cancellation, which has its own action and
 * its own audit trail.
 */
export async function updateOrder(input: {
  orderId: string;
  authCode: string;
  lines: { orderItemId: string; qty: number }[];
  mergeCart?: boolean;
  shipToAddressId?: string;
  deliveryNote?: string;
}): Promise<UpdateOrderResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the quantities and try again." };
  const { orderId, lines, mergeCart, shipToAddressId, deliveryNote } = parsed.data;

  const session = await requireSession("PURCHASE_MANAGER");
  if (!session.locationId) return { ok: false, error: "Your account is not assigned to a branch." };
  const branchId = session.locationId;

  const verified = await verifyAuthCode(session, branchId, parsed.data.authCode);
  if (!verified.ok) return { ok: false, error: verified.error };

  const qtyById = new Map(lines.map((l) => [l.orderItemId, l.qty]));

  try {
    await withOrg(session.orgId, async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, orgId: session.orgId, branchId },
        include: { items: { include: { product: true } } },
      });
      if (!order) throw new Error("NOT_FOUND");
      if (order.status !== "PENDING") throw new Error("NOT_PENDING");

      // A different delivery address must still belong to this branch.
      if (shipToAddressId && shipToAddressId !== order.shipToAddressId) {
        const address = await tx.address.findFirst({
          where: { id: shipToAddressId, orgId: session.orgId, locationId: branchId, isActive: true },
        });
        if (!address) throw new Error("BAD_ADDRESS");
      }

      const changes: string[] = [];
      // productId → qty on the order after this edit, for the total.
      const finalLines = new Map<string, { qty: number; unitPriceCents: number }>();

      for (const item of order.items) {
        const next = qtyById.has(item.id) ? qtyById.get(item.id)! : item.requestedQty;
        if (next === 0) {
          await tx.orderItem.delete({ where: { id: item.id } });
          changes.push(`removed ${item.product.name}`);
          continue;
        }
        if (next !== item.requestedQty) {
          await tx.orderItem.update({ where: { id: item.id }, data: { requestedQty: next } });
          changes.push(`${item.product.name} ${item.requestedQty} → ${next}`);
        }
        finalLines.set(item.productId, { qty: next, unitPriceCents: item.unitPriceCents });
      }

      if (mergeCart) {
        const cart = await tx.cartItem.findMany({
          where: { orgId: session.orgId, userId: session.userId },
          include: { product: true },
          orderBy: { createdAt: "asc" },
        });
        for (const line of cart) {
          if (!line.product.active) throw new Error(`INACTIVE:${line.product.name}`);
          const existing = order.items.find((it) => it.productId === line.productId);
          if (existing && finalLines.has(line.productId)) {
            // Already on the order (and not removed above) — top it up.
            const current = finalLines.get(line.productId)!;
            const next = current.qty + line.qty;
            await tx.orderItem.update({ where: { id: existing.id }, data: { requestedQty: next } });
            finalLines.set(line.productId, { ...current, qty: next });
            changes.push(`${line.product.name} +${line.qty} from cart`);
          } else {
            await tx.orderItem.create({
              data: {
                orderId: order.id,
                productId: line.productId,
                requestedQty: line.qty,
                unitPriceCents: line.product.priceCents,
                note: line.note,
              },
            });
            finalLines.set(line.productId, { qty: line.qty, unitPriceCents: line.product.priceCents });
            changes.push(`added ${line.qty} × ${line.product.name}`);
          }
        }
        if (cart.length > 0) {
          await tx.cartItem.deleteMany({ where: { orgId: session.orgId, userId: session.userId } });
        }
      }

      if (finalLines.size === 0) throw new Error("EMPTY");

      const totalCents = [...finalLines.values()].reduce((s, l) => s + l.unitPriceCents * l.qty, 0);
      if (shipToAddressId && shipToAddressId !== order.shipToAddressId) changes.push("delivery address");
      if (deliveryNote !== undefined && (deliveryNote || null) !== order.deliveryNote) {
        changes.push("delivery note");
      }
      if (changes.length === 0) throw new Error("NO_CHANGES");

      await tx.order.update({
        where: { id: order.id },
        data: {
          totalCents,
          // Re-approved by the code just verified.
          authCodeId: verified.codeId,
          ...(shipToAddressId ? { shipToAddressId } : {}),
          ...(deliveryNote !== undefined ? { deliveryNote: deliveryNote || null } : {}),
        },
      });

      await logAudit(tx, {
        orgId: session.orgId,
        userId: session.userId,
        userName: session.name,
        action: `Edited ${orderCode(order.orderNo)} — ${changes.join("; ")}`,
        entityType: "Order",
        entityId: order.id,
      });
    });
  } catch (e) {
    const raw = e instanceof Error ? e.message : "";
    if (raw === "NOT_FOUND") return { ok: false, error: "Order not found." };
    if (raw === "NOT_PENDING") {
      return { ok: false, error: "The warehouse has started on this order, so it can no longer be edited." };
    }
    if (raw === "BAD_ADDRESS") return { ok: false, error: "Choose a valid delivery address." };
    if (raw === "EMPTY") return { ok: false, error: "An order needs at least one item. Cancel it instead." };
    if (raw === "NO_CHANGES") return { ok: false, error: "Nothing was changed." };
    if (raw.startsWith("INACTIVE:")) return { ok: false, error: `${raw.slice(9)} is no longer available.` };
    return { ok: false, error: "Could not save your changes. Please try again." };
  }

  await notifyOrderEdited(orderId);

  revalidatePath(`/purchase-manager/orders/${orderId}`);
  revalidatePath("/purchase-manager/orders");
  revalidatePath("/purchase-manager/cart");
  revalidatePath("/purchase-manager/catalogue");
  return { ok: true };
}

export async function cancelOrder(input: { orderId: string }) {
  const { orderId } = z.object({ orderId: z.string().min(1) }).parse(input);
  const session = await requireSession("PURCHASE_MANAGER");

  await withOrg(session.orgId, async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, orgId: session.orgId, branchId: session.locationId ?? undefined },
    });
    if (!order) throw new Error("Order not found");
    if (order.status !== "PENDING") throw new Error("Only pending orders can be cancelled");

    await tx.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
    await logAudit(tx, {
      orgId: session.orgId,
      userId: session.userId,
      userName: session.name,
      action: `Cancelled ${orderCode(order.orderNo)} — reservation released`,
      entityType: "Order",
      entityId: order.id,
    });
  });

  revalidatePath("/purchase-manager/orders");
  revalidatePath("/purchase-manager/catalogue");
}

/** Copies an order's lines back into the cart. */
export async function reorder(input: { orderId: string }) {
  const { orderId } = z.object({ orderId: z.string().min(1) }).parse(input);
  const session = await requireSession("PURCHASE_MANAGER");

  await withOrg(session.orgId, async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, orgId: session.orgId, branchId: session.locationId ?? undefined },
      include: { items: { include: { product: true } } },
    });
    if (!order) throw new Error("Order not found");

    for (const item of order.items) {
      if (!item.product.active) continue;
      const existing = await tx.cartItem.findFirst({
        where: { orgId: session.orgId, userId: session.userId, productId: item.productId },
      });
      if (existing) {
        await tx.cartItem.update({ where: { id: existing.id }, data: { qty: existing.qty + item.requestedQty } });
      } else {
        await tx.cartItem.create({
          data: { orgId: session.orgId, userId: session.userId, productId: item.productId, qty: item.requestedQty },
        });
      }
    }
  });

  revalidatePath("/purchase-manager/cart");
}

/** Helper for pages: current user's cart count (for the header badge). */
export async function getCartCount(): Promise<number> {
  const session = await requireSession("PURCHASE_MANAGER");
  const agg = await withOrg(session.orgId, (tx) =>
    tx.cartItem.aggregate({
      where: { orgId: session.orgId, userId: session.userId },
      _sum: { qty: true },
    })
  );
  return agg._sum.qty ?? 0;
}

export { reservedByProduct, availableOf };

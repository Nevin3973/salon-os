"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireSession, withOrg } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { orderCode } from "@/lib/format";
import { reservedByProduct, availableOf } from "@/lib/stock";
import { takeToken, resetTokens } from "@/lib/rate-limit";

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

  // 10 code attempts per 10 minutes per user, then wait it out.
  const limiter = takeToken(`authcode:${session.userId}`, { limit: 10, windowMs: 10 * 60 * 1000 });
  if (!limiter.ok) {
    return {
      ok: false,
      error: `Too many tries. Wait about ${Math.max(1, Math.ceil(limiter.retryAfterSec / 60))} minute(s) and try again.`,
    };
  }

  // Verify the authorization code against active codes scoped to this org,
  // that are either org-wide (locationId null) or match this branch.
  const codes = await withOrg(session.orgId, (tx) =>
    tx.authorizationCode.findMany({
      where: {
        orgId: session.orgId,
        isActive: true,
        OR: [{ locationId: null }, { locationId: branchId }],
      },
    })
  );
  let matchedCodeId: string | null = null;
  for (const c of codes) {
    if (await bcrypt.compare(parsed.data.authCode.trim(), c.codeHash)) {
      matchedCodeId = c.id;
      break;
    }
  }
  if (!matchedCodeId) return { ok: false, error: "That authorization code is not valid." };
  resetTokens(`authcode:${session.userId}`);

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
          items: {
            create: cart.map((line) => ({
              productId: line.productId,
              requestedQty: line.qty,
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

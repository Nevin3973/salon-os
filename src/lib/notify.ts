import { prisma } from "@/lib/db";
import { sendEmail, appUrl } from "@/lib/email";
import { orderCode } from "@/lib/format";
import { formatMoney } from "@/lib/money";

/**
 * Order notifications. Every function is fire-and-forget: it is called AFTER
 * the database transaction has committed and swallows its own errors, so a
 * mail problem can never undo or block a completed order/dispatch.
 */

async function warehouseEmails(orgId: string): Promise<string[]> {
  const rows = await prisma.membership.findMany({
    where: { orgId, role: "WAREHOUSE_MANAGER" },
    select: { user: { select: { email: true } } },
  });
  return rows.map((r) => r.user.email);
}

async function userEmail(userId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  return u?.email ?? null;
}

/** Tells the warehouse a new order has landed in their queue. */
export async function notifyNewOrder(orderId: string): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { branch: { select: { name: true } }, items: { select: { requestedQty: true } } },
    });
    if (!order) return;

    const to = await warehouseEmails(order.orgId);
    if (to.length === 0) return;

    const units = order.items.reduce((s, it) => s + it.requestedQty, 0);
    await sendEmail({
      to,
      subject: `New order ${orderCode(order.orderNo)} from ${order.branch.name}`,
      heading: `New order from ${order.branch.name}`,
      lines: [
        `${orderCode(order.orderNo)} has been placed and is waiting in your queue.`,
        `${order.items.length} product line${order.items.length === 1 ? "" : "s"} · ${units} unit${units === 1 ? "" : "s"} · ${formatMoney(order.totalCents)}`,
        "Stock for this order is already reserved.",
      ],
      cta: { label: "Open the queue", url: `${appUrl()}/warehouse/queue` },
    });
  } catch (e) {
    console.error("[notify] new order failed:", e instanceof Error ? e.message : e);
  }
}

/**
 * Tells the warehouse a pending order was amended before they picked it, so
 * nobody works from a printout of the old quantities.
 */
export async function notifyOrderEdited(orderId: string): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { branch: { select: { name: true } }, items: { select: { requestedQty: true } } },
    });
    if (!order) return;

    const to = await warehouseEmails(order.orgId);
    if (to.length === 0) return;

    const units = order.items.reduce((s, it) => s + it.requestedQty, 0);
    await sendEmail({
      to,
      subject: `${orderCode(order.orderNo)} was changed by ${order.branch.name}`,
      heading: `${order.branch.name} amended an order`,
      lines: [
        `${orderCode(order.orderNo)} is still waiting in your queue and has been edited.`,
        `It now has ${order.items.length} product line${order.items.length === 1 ? "" : "s"} · ${units} unit${units === 1 ? "" : "s"} · ${formatMoney(order.totalCents)}.`,
        "Check the queue before you pick it.",
      ],
      cta: { label: "Open the queue", url: `${appUrl()}/warehouse/queue` },
    });
  } catch (e) {
    console.error("[notify] order edited failed:", e instanceof Error ? e.message : e);
  }
}

/** Tells the salon the warehouse declined their order, and why. */
export async function notifyRejected(orderId: string): Promise<void> {
  try {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return;

    const to = await userEmail(order.placedByUserId);
    if (!to) return;

    await sendEmail({
      to,
      subject: `${orderCode(order.orderNo)} was not accepted`,
      heading: "The warehouse could not accept this order",
      lines: [
        `${orderCode(order.orderNo)} has been rejected and nothing will be dispatched against it.`,
        order.closureReason ? `Reason: ${order.closureReason}.` : "",
        order.closureNote ? `“${order.closureNote}”` : "",
        "Nothing was charged and no stock was moved. You can reorder the items at any time.",
      ].filter(Boolean),
      cta: { label: "View the order", url: `${appUrl()}/purchase-manager/orders/${order.id}` },
    });
  } catch (e) {
    console.error("[notify] rejected failed:", e instanceof Error ? e.message : e);
  }
}

/** Confirms to the salon that returned goods were received back into stock. */
export async function notifyReturn(orderId: string, units: number): Promise<void> {
  try {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return;

    const to = await userEmail(order.placedByUserId);
    if (!to) return;

    await sendEmail({
      to,
      subject: `Return received against ${orderCode(order.orderNo)}`,
      heading: "Your return has been booked in",
      lines: [
        `The warehouse has received ${units} unit${units === 1 ? "" : "s"} back against ${orderCode(order.orderNo)}.`,
        order.closureReason ? `Reason: ${order.closureReason}.` : "",
        order.closureNote ? `“${order.closureNote}”` : "",
        "The stock is back on the shelf and the order record has been updated.",
      ].filter(Boolean),
      cta: { label: "View the order", url: `${appUrl()}/purchase-manager/orders/${order.id}` },
    });
  } catch (e) {
    console.error("[notify] return failed:", e instanceof Error ? e.message : e);
  }
}

/** Tells the salon that stock has been sent (or the order settled). */
export async function notifyDispatch(orderId: string): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        branch: { select: { name: true } },
        items: {
          select: {
            requestedQty: true,
            deliveredQty: true,
            outstandingReason: true,
            product: { select: { name: true } },
          },
        },
      },
    });
    if (!order) return;

    const to = await userEmail(order.placedByUserId);
    if (!to) return;

    const delivered = order.items.reduce((s, it) => s + it.deliveredQty, 0);
    const requested = order.items.reduce((s, it) => s + it.requestedQty, 0);
    const short = order.items.filter((it) => it.deliveredQty < it.requestedQty);

    const complete = order.status === "COMPLETED";
    const lines = [
      complete
        ? `Your order ${orderCode(order.orderNo)} has been delivered in full.`
        : `The warehouse has sent part of your order ${orderCode(order.orderNo)}.`,
      `${delivered} of ${requested} units delivered.`,
    ];
    if (!complete && short.length > 0) {
      lines.push(
        `Still to come: ${short
          .map((s) => `${s.requestedQty - s.deliveredQty} × ${s.product.name}${s.outstandingReason ? ` (${s.outstandingReason})` : ""}`)
          .join(", ")}.`
      );
    }

    await sendEmail({
      to,
      subject: complete
        ? `${orderCode(order.orderNo)} delivered in full`
        : `${orderCode(order.orderNo)} — part of your order is on the way`,
      heading: complete ? "Your order is complete" : "Your order has been dispatched",
      lines,
      cta: { label: "Track this order", url: `${appUrl()}/purchase-manager/orders/${order.id}` },
    });
  } catch (e) {
    console.error("[notify] dispatch failed:", e instanceof Error ? e.message : e);
  }
}

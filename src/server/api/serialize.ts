import type { Address, Order, OrderItem, OrderItemDelivery, Product } from "@prisma/client";
import { orderCode } from "@/lib/format";

/**
 * Public JSON shapes for /api/v1. These are the versioned contract — keep
 * changes additive; never return raw Prisma rows from a route.
 */

export function serializeProduct(p: Product, reserved: number) {
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    brand: p.brand,
    category: p.category,
    unit: p.unit,
    stock: p.stock,
    reserved,
    available: Math.max(0, p.stock - reserved),
    minStock: p.minStock,
    active: p.active,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

type OrderWithItems = Order & {
  items: (OrderItem & {
    product: Pick<Product, "sku" | "name" | "unit">;
    deliveries?: OrderItemDelivery[];
  })[];
  branch: { id: string; name: string };
  shipToAddress?: Address | null;
};

export function serializeOrderSummary(o: OrderWithItems) {
  const requested = o.items.reduce((s, it) => s + it.requestedQty, 0);
  const delivered = o.items.reduce((s, it) => s + it.deliveredQty, 0);
  return {
    id: o.id,
    number: orderCode(o.orderNo),
    status: o.status,
    branch: { id: o.branch.id, name: o.branch.name },
    itemCount: o.items.length,
    unitsRequested: requested,
    unitsDelivered: delivered,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

export function serializeOrderDetail(o: OrderWithItems) {
  return {
    ...serializeOrderSummary(o),
    deliveryNote: o.deliveryNote,
    shipTo: o.shipToAddress ? serializeAddress(o.shipToAddress) : null,
    items: o.items.map((it) => ({
      id: it.id,
      product: { sku: it.product.sku, name: it.product.name, unit: it.product.unit },
      requestedQty: it.requestedQty,
      deliveredQty: it.deliveredQty,
      outstandingQty: Math.max(0, it.requestedQty - it.deliveredQty),
      note: it.note,
      outstanding:
        it.requestedQty > it.deliveredQty && (it.outstandingReason || it.outstandingEta)
          ? {
              reason: it.outstandingReason,
              expectedAt: it.outstandingEta?.toISOString() ?? null,
              remark: it.outstandingRemark,
            }
          : null,
      deliveries: (it.deliveries ?? []).map((d) => ({
        id: d.id,
        qty: d.qty,
        dispatchedAt: d.createdAt.toISOString(),
      })),
    })),
  };
}

export function serializeAddress(a: Address) {
  return {
    id: a.id,
    label: a.label,
    contactName: a.contactName,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2,
    city: a.city,
    state: a.state,
    postalCode: a.postalCode,
    country: a.country,
    isDefault: a.isDefault,
  };
}

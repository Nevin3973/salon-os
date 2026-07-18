import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getScopedDb } from "@/lib/tenant";
import { resolveOrgContext, unauthorized, apiError } from "@/server/api/auth";
import { serializeOrderDetail } from "@/server/api/serialize";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const ctx = await resolveOrgContext(req);
  if (!ctx) return unauthorized();
  const { orderId } = await params;

  const branchScope =
    ctx.role === "PURCHASE_MANAGER" && ctx.locationId ? { branchId: ctx.locationId } : {};

  const db = getScopedDb(ctx.orgId);
  const order = await db.order.findFirst({
    where: { id: orderId, ...branchScope },
    include: {
      items: {
        include: {
          product: { select: { sku: true, name: true, unit: true } },
          deliveries: { orderBy: { createdAt: "asc" } },
        },
      },
      branch: { select: { id: true, name: true } },
      shipToAddress: true,
    },
  });
  if (!order) return apiError(404, "not_found", "Order not found.");

  return NextResponse.json({ data: serializeOrderDetail(order) });
}

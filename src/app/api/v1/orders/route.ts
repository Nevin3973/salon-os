import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { OrderStatus } from "@prisma/client";
import { getScopedDb } from "@/lib/tenant";
import { resolveOrgContext, unauthorized, apiError } from "@/server/api/auth";
import { serializeOrderSummary } from "@/server/api/serialize";

const STATUSES = ["PENDING", "PROCESSING", "COMPLETED", "PARTIALLY_FULFILLED", "CANCELLED"];

export async function GET(req: NextRequest) {
  const ctx = await resolveOrgContext(req);
  if (!ctx) return unauthorized();

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  if (status && !STATUSES.includes(status)) {
    return apiError(400, "invalid_status", `status must be one of ${STATUSES.join(", ")}`);
  }
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 25, 1), 100);
  const cursor = sp.get("cursor");

  // Purchase Managers only see their own branch through the API too.
  const branchScope =
    ctx.role === "PURCHASE_MANAGER" && ctx.locationId ? { branchId: ctx.locationId } : {};

  const db = getScopedDb(ctx.orgId);
  const orders = await db.order.findMany({
    where: { ...(status ? { status: status as OrderStatus } : {}), ...branchScope },
    include: {
      items: { include: { product: { select: { sku: true, name: true, unit: true } } } },
      branch: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = orders.length > limit;
  const page = hasMore ? orders.slice(0, limit) : orders;

  return NextResponse.json({
    data: page.map(serializeOrderSummary),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
}

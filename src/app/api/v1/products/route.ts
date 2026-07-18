import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getScopedDb } from "@/lib/tenant";
import { reservedByProduct } from "@/lib/stock";
import { resolveOrgContext, unauthorized } from "@/server/api/auth";
import { serializeProduct } from "@/server/api/serialize";

export async function GET(req: NextRequest) {
  const ctx = await resolveOrgContext(req);
  if (!ctx) return unauthorized();

  const db = getScopedDb(ctx.orgId);
  const sp = req.nextUrl.searchParams;
  const category = sp.get("category") ?? undefined;
  const q = sp.get("q")?.trim();
  const activeParam = sp.get("active");

  const products = await db.product.findMany({
    where: {
      ...(category ? { category } : {}),
      ...(activeParam === null ? {} : { active: activeParam !== "false" }),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { brand: { contains: q, mode: "insensitive" } },
              { sku: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  const reserved = await reservedByProduct(ctx.orgId);
  return NextResponse.json({
    data: products.map((p) => serializeProduct(p, reserved.get(p.id) ?? 0)),
  });
}

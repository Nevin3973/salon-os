import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

/**
 * Integration test against the local dev database: proves the Postgres
 * row-level-security wall holds regardless of what application code does.
 *
 * Requires the dev DB (docker: amara-postgres) with the seeded demo orgs.
 */

const prisma = new PrismaClient();
let amaraId: string;
let bellissimaId: string;

beforeAll(async () => {
  const orgs = await prisma.org.findMany(); // Org is deliberately RLS-exempt
  const amara = orgs.find((o) => o.slug === "amara");
  const bellissima = orgs.find((o) => o.slug === "bellissima");
  if (!amara || !bellissima) throw new Error("Seeded demo orgs not found — run prisma db seed first");
  amaraId = amara.id;
  bellissimaId = bellissima.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

function withOrgTx<T>(orgId: string | null, fn: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    if (orgId !== null) {
      await tx.$executeRaw`SELECT set_config('app.org_id', ${orgId}, true)`;
    }
    return fn(tx);
  });
}

describe("Postgres row-level security", () => {
  it("returns no products at all when no org context is set (fail closed)", async () => {
    const count = await prisma.product.count(); // raw client, no setting
    expect(count).toBe(0);
  });

  it("returns only the org's own products when its context is set", async () => {
    const amaraCount = await withOrgTx(amaraId, (tx) => tx.product.count());
    const bellaCount = await withOrgTx(bellissimaId, (tx) => tx.product.count());
    expect(amaraCount).toBeGreaterThan(0);
    expect(bellaCount).toBeGreaterThan(0);

    // Amara's context must see zero Bellissima rows even when asking for them directly.
    const crossRead = await withOrgTx(amaraId, (tx) =>
      tx.product.count({ where: { orgId: bellissimaId } })
    );
    expect(crossRead).toBe(0);
  });

  it("orders and their items are walled the same way", async () => {
    const unscoped = await prisma.order.count();
    expect(unscoped).toBe(0);
    const unscopedItems = await prisma.orderItem.count();
    expect(unscopedItems).toBe(0);

    const amaraOrders = await withOrgTx(amaraId, (tx) => tx.order.count());
    expect(amaraOrders).toBeGreaterThan(0);
  });

  it("rejects writes that carry another org's id", async () => {
    // Under Amara's context, try to plant a product into Bellissima.
    await expect(
      withOrgTx(amaraId, (tx) =>
        tx.product.create({
          data: {
            orgId: bellissimaId,
            sku: `EVIL-${Date.now()}`,
            name: "Should never exist",
            brand: "x",
            category: "x",
            unit: "x",
          },
        })
      )
    ).rejects.toThrow();
  });

  it("rejects writes with no org context at all", async () => {
    await expect(
      prisma.auditLogEntry.create({
        data: { orgId: amaraId, action: "should be blocked" },
      })
    ).rejects.toThrow();
  });
});

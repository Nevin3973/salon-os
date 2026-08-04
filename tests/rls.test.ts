import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

/**
 * Integration test against the local dev database: proves the Postgres
 * row-level-security wall holds regardless of what application code does.
 *
 * Requires the dev DB (docker: salonos-postgres) with at least two orgs.
 *
 * Deliberately takes whatever two tenants it finds rather than naming them.
 * It used to pin the slug "beyond", which quietly broke the moment that org was
 * renamed in the rebrand — the wall was still standing, but the test could no
 * longer tell you so. What is under test is isolation between any two tenants;
 * which two is irrelevant.
 */

const prisma = new PrismaClient();
let orgAId: string;
let orgBId: string;

beforeAll(async () => {
  const orgs = await prisma.org.findMany({ orderBy: { slug: "asc" } }); // Org is deliberately RLS-exempt
  if (orgs.length < 2) {
    throw new Error(
      `Need at least two orgs to test tenant isolation; found ${orgs.length}. ` +
        `Run \`prisma db seed\` against the dev database.`
    );
  }
  orgAId = orgs[0].id;
  orgBId = orgs[1].id;
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
    const orgACount = await withOrgTx(orgAId, (tx) => tx.product.count());
    const orgBCount = await withOrgTx(orgBId, (tx) => tx.product.count());
    expect(orgACount).toBeGreaterThan(0);
    expect(orgBCount).toBeGreaterThan(0);

    // One tenant's context must see zero of the other's rows, even asking directly.
    const crossRead = await withOrgTx(orgAId, (tx) =>
      tx.product.count({ where: { orgId: orgBId } })
    );
    expect(crossRead).toBe(0);
  });

  it("orders and their items are walled the same way", async () => {
    // Fail closed: without an org context the tables must look empty,
    // no matter how many orders actually exist.
    const unscoped = await prisma.order.count();
    expect(unscoped).toBe(0);
    const unscopedItems = await prisma.orderItem.count();
    expect(unscopedItems).toBe(0);

    // With a context the same query succeeds (count reflects only that org —
    // may legitimately be 0 on a fresh database).
    const orgAOrders = await withOrgTx(orgAId, (tx) => tx.order.count());
    expect(orgAOrders).toBeGreaterThanOrEqual(0);
  });

  it("rejects writes that carry another org's id", async () => {
    // Under tenant A's context, try to plant a product into tenant B.
    await expect(
      withOrgTx(orgAId, (tx) =>
        tx.product.create({
          data: {
            orgId: orgBId,
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
        data: { orgId: orgAId, action: "should be blocked" },
      })
    ).rejects.toThrow();
  });
});

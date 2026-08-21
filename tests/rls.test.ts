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

  it("walls off the customer master, which holds names and phone numbers", async () => {
    // The most sensitive table in the schema: one salon group must never be
    // able to read another's customer list. A new tenant table with no policy
    // fails silently — the queries simply return everything — so this asserts
    // the wall rather than assuming the migration was applied.
    const unscoped = await prisma.customer.count();
    expect(unscoped).toBe(0);

    const planted = await withOrgTx(orgBId, (tx) =>
      tx.customer.create({
        data: { orgId: orgBId, phone: `9${Date.now().toString().slice(-9)}`, name: "Tenant B customer" },
      })
    );

    // Tenant A must not see it, by count or by direct lookup.
    const crossCount = await withOrgTx(orgAId, (tx) =>
      tx.customer.count({ where: { orgId: orgBId } })
    );
    expect(crossCount).toBe(0);
    const crossRead = await withOrgTx(orgAId, (tx) =>
      tx.customer.findUnique({ where: { id: planted.id } })
    );
    expect(crossRead).toBeNull();

    await withOrgTx(orgBId, (tx) => tx.customer.delete({ where: { id: planted.id } }));
  });

  it("rejects a customer written under another org's context", async () => {
    await expect(
      withOrgTx(orgAId, (tx) =>
        tx.customer.create({
          data: { orgId: orgBId, phone: `8${Date.now().toString().slice(-9)}`, name: "Should never exist" },
        })
      )
    ).rejects.toThrow();
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

describe("Row-level security on the Tally and expiry tables", () => {
  /**
   * These two tables came later than the rest and carry the most sensitive
   * payloads in the system, so they get the same fail-closed treatment.
   *
   * TallyOutbox is the sharper of the two: each row holds a complete bill —
   * customer name, GSTIN, every line and every amount — and it is read by an
   * API key rather than a signed-in person. A gap here would hand one salon
   * group's entire sales ledger to another group's connector, over the public
   * internet, with no session to trace it back to.
   */

  it("gives up nothing from the outbox with no org context", async () => {
    expect(await prisma.tallyOutbox.count()).toBe(0);
    expect(await prisma.productBatch.count()).toBe(0);
  });

  it("refuses to queue an outbox row under another org's id", async () => {
    await expect(
      withOrgTx(orgAId, (tx) =>
        tx.tallyOutbox.create({
          data: {
            orgId: orgBId,
            eventType: "SALE",
            entityId: "rls-probe",
            externalRef: `RLS-PROBE-${Date.now()}`,
            payload: {},
            occurredAt: new Date(),
          },
        })
      )
    ).rejects.toThrow();
  });

  it("refuses to record a batch under another org's id", async () => {
    await expect(
      withOrgTx(orgAId, (tx) =>
        tx.productBatch.create({
          data: {
            orgId: orgBId,
            productId: "rls-probe",
            batchNo: `RLS-${Date.now()}`,
            expiryDate: new Date(),
            qty: 1,
          },
        })
      )
    ).rejects.toThrow();
  });

  it("walls each tenant's queued events off from the other", async () => {
    const ref = `RLS-ISOLATION-${Date.now()}`;
    await withOrgTx(orgAId, (tx) =>
      tx.tallyOutbox.create({
        data: {
          orgId: orgAId,
          eventType: "SALE",
          entityId: "rls-probe",
          externalRef: ref,
          payload: { REF: ref },
          occurredAt: new Date(),
        },
      })
    );

    try {
      const own = await withOrgTx(orgAId, (tx) => tx.tallyOutbox.count({ where: { externalRef: ref } }));
      const other = await withOrgTx(orgBId, (tx) => tx.tallyOutbox.count({ where: { externalRef: ref } }));
      // Asking by exact reference: the row is there for its own org and simply
      // does not exist for the other one.
      expect(own).toBe(1);
      expect(other).toBe(0);
    } finally {
      await withOrgTx(orgAId, (tx) => tx.tallyOutbox.deleteMany({ where: { externalRef: ref } }));
    }
  });
});

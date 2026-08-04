/**
 * Removes demo workspaces from a hosted database, so a real pilot runs on real
 * data only.
 *
 * Deletes whole organisations by slug (default: the two the dev seed creates),
 * along with everything hanging off them — products, orders, bills, staff
 * memberships and audit history. Users who belong to no other organisation are
 * removed too, so no orphan logins are left behind.
 *
 * DESTRUCTIVE and irreversible. It refuses to run without --yes, prints exactly
 * what it will remove first, and never touches an organisation you did not name.
 *
 *   npx tsx scripts/purge-demo.ts                      # dry run, shows the plan
 *   npx tsx scripts/purge-demo.ts --yes                # removes beyond + bellissima
 *   npx tsx scripts/purge-demo.ts --slug acme --yes    # removes a named org
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});

const DEMO_SLUGS = ["aster", "beyond", "bellissima"];

/** Tables carrying an RLS policy; enforcement pauses while we delete. */
const TENANT_TABLES = [
  "Location", "Product", "StockMovement", "Order", "CartItem", "AuthorizationCode",
  "AuditLogEntry", "Address", "OrderItem", "OrderItemDelivery",
  "BranchStock", "BranchStockMovement", "Sale", "SaleItem",
  "InvoiceSeries", "SaleReturn", "SaleReturnItem",
] as const;

async function setRls(on: boolean) {
  for (const t of TENANT_TABLES) {
    if (on) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "${t}" FORCE ROW LEVEL SECURITY;`);
    } else {
      await prisma.$executeRawUnsafe(`ALTER TABLE "${t}" DISABLE ROW LEVEL SECURITY;`);
    }
  }
}

function flagValues(flag: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === `--${flag}` && process.argv[i + 1]) out.push(process.argv[i + 1]);
  }
  return out;
}

async function main() {
  const confirmed = process.argv.includes("--yes");
  const slugs = flagValues("slug").length > 0 ? flagValues("slug") : DEMO_SLUGS;

  const orgs = await prisma.org.findMany({
    where: { slug: { in: slugs } },
    select: {
      id: true, name: true, slug: true,
      _count: { select: { products: true, orders: true, sales: true, memberships: true } },
    },
  });

  if (orgs.length === 0) {
    console.log(`Nothing to remove — no organisation matches: ${slugs.join(", ")}`);
    return;
  }

  console.log(confirmed ? "Removing:" : "Would remove (dry run):");
  for (const o of orgs) {
    console.log(
      `  ${o.name} (${o.slug}) — ${o._count.products} products, ${o._count.orders} orders, ` +
        `${o._count.sales} bills, ${o._count.memberships} people`
    );
  }

  if (!confirmed) {
    console.log("\nNothing was changed. Re-run with --yes to actually remove these.\n");
    return;
  }

  const orgIds = orgs.map((o) => o.id);
  // Everyone who belongs to one of these orgs, so we can clean up afterwards.
  const affectedUserIds = (
    await prisma.membership.findMany({
      where: { orgId: { in: orgIds } },
      select: { userId: true },
    })
  ).map((m) => m.userId);

  await setRls(false);
  try {
    // Cascades handle the org's own rows; deleting the org is enough.
    await prisma.org.deleteMany({ where: { id: { in: orgIds } } });

    // Remove users left without any membership at all.
    let orphans = 0;
    for (const userId of [...new Set(affectedUserIds)]) {
      const remaining = await prisma.membership.count({ where: { userId } });
      if (remaining === 0) {
        await prisma.user.delete({ where: { id: userId } });
        orphans++;
      }
    }
    console.log(`\nRemoved ${orgs.length} organisation(s) and ${orphans} user(s) with no other workspace.`);
  } finally {
    await setRls(true);
    console.log("RLS re-enabled on all tenant tables.");
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

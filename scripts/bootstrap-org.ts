/**
 * Creates ONE real workspace with no demo content — the way a live customer
 * should be started, as opposed to `prisma/seed.ts` which fills a database with
 * fictional salons for development and CI.
 *
 * It creates the organisation, its warehouse, its branches (each with an
 * invoice prefix and a purchase authorization code), and a single Super Admin
 * who signs in and takes it from there: adding staff, products and prices
 * through the UI. No products, no orders, no bills are invented.
 *
 * Usage (values are examples — quote anything containing spaces):
 *
 *   npx tsx scripts/bootstrap-org.ts \
 *     --org "Bloom Salon Group" \
 *     --gstin 29ABCDE1234F1Z5 \
 *     --admin-name "Priya Nair" \
 *     --admin-email priya@bloomsalon.in \
 *     --warehouse "Central Store" \
 *     --branch "Indiranagar" --branch "Koramangala"
 *
 * It prints the admin's one-time password and each branch's purchase code
 * ONCE. They are stored hashed and cannot be shown again — write them down.
 */
import { PrismaClient, LocationType, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes, randomInt } from "node:crypto";
import { defaultPrefix } from "../src/lib/gst";

const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});

/** Reads repeated flags: `--branch A --branch B` → ["A", "B"]. */
function args(flag: string): string[] {
  const out: string[] = [];
  const argv = process.argv;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === `--${flag}` && argv[i + 1]) out.push(argv[i + 1]);
  }
  return out;
}
const arg = (flag: string): string | undefined => args(flag)[0];

/** URL-safe slug for the org, e.g. "Bloom Salon Group" → "bloom-salon-group". */
function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

async function main() {
  const orgName = arg("org");
  const adminName = arg("admin-name");
  const adminEmail = arg("admin-email")?.toLowerCase();
  const warehouseName = arg("warehouse") ?? "Main Warehouse";
  const branchNames = args("branch");
  const gstin = arg("gstin");
  const legalName = arg("legal-name") ?? orgName;

  if (!orgName || !adminName || !adminEmail) {
    console.error(
      "Missing required options.\n" +
        "  --org <name> --admin-name <name> --admin-email <email>\n" +
        "  [--warehouse <name>] [--branch <name> ...] [--gstin <no>] [--legal-name <name>]"
    );
    process.exit(1);
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) {
    console.error(`"${adminEmail}" is not a valid email address.`);
    process.exit(1);
  }
  if (branchNames.length === 0) {
    console.error("Add at least one branch with --branch <name>.");
    process.exit(1);
  }

  let slug = slugify(orgName);
  if (await prisma.org.findUnique({ where: { slug } })) {
    slug = `${slug}-${randomInt(100, 1000)}`;
  }

  const org = await prisma.org.create({
    data: { name: orgName, slug, legalName, gstin: gstin ?? null },
  });

  await prisma.location.create({
    data: { orgId: org.id, type: LocationType.WAREHOUSE, name: warehouseName },
  });

  const branches = [];
  for (const name of branchNames) {
    branches.push(
      await prisma.location.create({
        data: {
          orgId: org.id,
          type: LocationType.BRANCH,
          name,
          invoicePrefix: defaultPrefix(name),
        },
      })
    );
  }

  // A strong one-time password; the admin must change it at first sign-in.
  const tempPassword = randomBytes(9).toString("base64url").slice(0, 12);
  const admin = await prisma.user.create({
    data: {
      email: adminEmail,
      name: adminName,
      passwordHash: await bcrypt.hash(tempPassword, 12),
      mustChangePassword: true,
    },
  });
  await prisma.membership.create({
    data: { userId: admin.id, orgId: org.id, role: Role.SUPER_ADMIN, locationId: null },
  });

  // One purchase authorization code per branch — the spend-approval gate.
  const codes: { branch: string; code: string }[] = [];
  for (const branch of branches) {
    const prefix = defaultPrefix(branch.name);
    const raw = `${prefix}-${randomInt(1000, 10000)}`;
    await prisma.authorizationCode.create({
      data: {
        orgId: org.id,
        locationId: branch.id,
        codeHash: await bcrypt.hash(raw, 10),
        label: `${prefix}-••••`,
        createdByUserId: admin.id,
      },
    });
    codes.push({ branch: branch.name, code: raw });
  }

  console.log(`\nWorkspace ready: ${orgName}`);
  console.log(`  Warehouse: ${warehouseName}`);
  console.log(`  Branches:  ${branchNames.join(", ")}`);
  console.log(`\nSign in as`);
  console.log(`  ${adminEmail}`);
  console.log(`  one-time password: ${tempPassword}`);
  console.log(`  (must be changed at first sign-in)`);
  console.log(`\nPurchase codes — needed to place an order, void a bill or adjust stock:`);
  for (const c of codes) console.log(`  ${c.branch.padEnd(24)} ${c.code}`);
  console.log(
    `\nThese are stored hashed and will never be shown again. Next: sign in and add\n` +
      `staff under Team, then products and prices under Products.\n`
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

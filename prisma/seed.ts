import { PrismaClient, LocationType, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

// The seed writes without an org context, so it must use the owner
// connection (DIRECT_URL) — the app role would be blocked by RLS.
const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});

const DEMO_PASSWORD = "password123";

type ProductSeed = {
  sku: string;
  name: string;
  brand: string;
  category: string;
  unit: string;
  stock: number;
  minStock: number;
};

// Ported from reference/salon-procurement-v6.jsx SEED_PRODUCTS.
function beyondProducts(): ProductSeed[] {
  let n = 0;
  const P = (
    name: string,
    brand: string,
    category: string,
    unit: string,
    stock: number,
    minStock: number
  ): ProductSeed => {
    n++;
    const sku = `${category
      .split(" ")
      .map((w) => w[0])
      .join("")}-${1000 + n}`;
    return { sku, name, brand, category, unit, stock, minStock };
  };

  return [
    P("Repair Shampoo 1L", "Kérastase", "Hair Care", "bottle", 64, 20),
    P("Moisture Conditioner 1L", "Kérastase", "Hair Care", "bottle", 12, 20),
    P("Smoothing Serum 100ml", "Moroccanoil", "Hair Care", "bottle", 38, 12),
    P("Dry Shampoo 300ml", "Batiste Pro", "Hair Care", "can", 26, 10),
    P("Colour Tube — 6.35 Chestnut", "Majirel", "Hair Colour", "tube", 148, 40),
    P("Colour Tube — 9.1 Ash Blonde", "Majirel", "Hair Colour", "tube", 0, 40),
    P("Developer 20 Vol 4L", "Oxydant", "Hair Colour", "can", 22, 10),
    P("Bleach Powder 500g", "Blond Studio", "Hair Colour", "tub", 17, 8),
    P("Bond Builder No.1 500ml", "Olaplex Pro", "Hair Treatments", "bottle", 9, 6),
    P("Keratin Smoothing Kit", "Brasil Cacau", "Hair Treatments", "kit", 6, 4),
    P("Deep Repair Mask 500g", "Kérastase", "Hair Treatments", "jar", 21, 8),
    P("Scalp Detox Treatment", "Nioxin", "Hair Treatments", "bottle", 14, 6),
    P("Gentle Cleanser 500ml", "Dermalogica", "Skin Care", "bottle", 31, 12),
    P("Hydrating Toner 250ml", "Dermalogica", "Skin Care", "bottle", 19, 10),
    P("Vitamin C Serum 30ml", "SkinCeuticals", "Skin Care", "bottle", 11, 12),
    P("Daily Moisturiser SPF30", "Dermalogica", "Skin Care", "tube", 28, 10),
    P("Clay Cleansing Mask 500g", "Dermalogica", "Facial", "jar", 8, 10),
    P("Enzyme Exfoliant 300g", "Dermalogica", "Facial", "jar", 15, 6),
    P("Collagen Eye Pads (30 pr)", "Skin Republic", "Facial", "box", 24, 10),
    P("Hydra-Facial Serum Set", "HydroPeel", "Facial", "kit", 5, 4),
    P("Hot Wax Beads 1kg — Rose", "Rica", "Waxing", "bag", 33, 15),
    P("Strip Wax 800ml — Honey", "Rica", "Waxing", "tin", 20, 10),
    P("Non-Woven Wax Strips (100)", "Procare", "Waxing", "pack", 47, 20),
    P("Post-Wax Soothing Lotion", "Rica", "Waxing", "bottle", 18, 8),
    P("Gel Lacquer — Porcelain Rose", "OPI", "Nail Care", "bottle", 27, 8),
    P("Base + Top Coat Duo", "OPI", "Nail Care", "set", 16, 8),
    P("Acetone Remover 1L", "ProNails", "Nail Care", "bottle", 12, 10),
    P("Cuticle Oil 15ml", "OPI", "Nail Care", "bottle", 44, 15),
    P("Retail Shampoo 250ml", "Kérastase", "Retail Products", "bottle", 52, 20),
    P("Argan Oil 50ml — Retail", "Moroccanoil", "Retail Products", "bottle", 30, 12),
    P("Travel Care Kit", "Kérastase", "Retail Products", "kit", 14, 8),
    P('Cutting Scissors 5.5"', "Jaguar", "Tools", "piece", 7, 4),
    P("Sectioning Clips (12)", "YS Park", "Tools", "pack", 56, 20),
    P("Tint Brush Set (3)", "Framar", "Tools", "set", 23, 10),
    P("Carbon Cutting Comb", "YS Park", "Tools", "piece", 40, 15),
    P("Professional Blow Dryer", "Parlux", "Electrical", "unit", 4, 3),
    P("Ceramic Straightener", "GHD Pro", "Electrical", "unit", 3, 3),
    P("Cordless Clippers", "Wahl", "Electrical", "unit", 6, 3),
    P("UV/LED Nail Lamp 48W", "SunUV", "Electrical", "unit", 5, 3),
    P("Hydraulic Styling Chair", "Beauty Line", "Furniture", "unit", 2, 1),
    P("Trolley Cart — 5 Tray", "Beauty Line", "Furniture", "unit", 3, 2),
    P("Shampoo Backwash Unit", "Beauty Line", "Furniture", "unit", 1, 1),
    P("Disinfectant Concentrate 2L", "Barbicide", "Cleaning Supplies", "bottle", 15, 8),
    P("Surface Sanitiser Spray", "Clinell", "Cleaning Supplies", "bottle", 29, 12),
    P("Towel Laundry Detergent 5L", "Persil Pro", "Cleaning Supplies", "can", 9, 6),
    P("Floor Cleaner 5L", "Diversey", "Cleaning Supplies", "can", 11, 6),
    P("Colour Foil Roll 100m", "Procare", "Consumables", "roll", 5, 12),
    P("Nitrile Gloves M (100)", "Unigloves", "Consumables", "box", 90, 30),
    P("Disposable Towels (50)", "Scrummi", "Consumables", "pack", 34, 20),
    P("Neck Strips (5×100)", "Procare", "Consumables", "box", 22, 10),
    P("Cotton Pads 1kg", "Intrinsics", "Consumables", "bag", 18, 10),
    P("Client Capes — Disposable (30)", "Procare", "Consumables", "pack", 13, 10),
  ];
}

function bellissimaProducts(): ProductSeed[] {
  let n = 0;
  const P = (name: string, brand: string, category: string, unit: string, stock: number, minStock: number): ProductSeed => {
    n++;
    const sku = `BL-${1000 + n}`;
    return { sku, name, brand, category, unit, stock, minStock };
  };
  return [
    P("Volumising Shampoo 1L", "Redken", "Hair Care", "bottle", 40, 15),
    P("Colour Tube — 7.0 Natural Blonde", "Wella", "Hair Colour", "tube", 60, 20),
    P("Gel Polish — Ruby Red", "CND", "Nail Care", "bottle", 18, 8),
    P("Disposable Gloves S (100)", "Unigloves", "Consumables", "box", 50, 20),
    P("Ceramic Flat Iron", "GHD Pro", "Electrical", "unit", 2, 2),
  ];
}

async function seedOrg(opts: {
  name: string;
  slug: string;
  products: ProductSeed[];
  branchNames: string[];
  warehouseName: string;
  pmNames: string[]; // one per branch, same length as branchNames
  wmName: string;
  adminName: string;
}) {
  const org = await prisma.org.create({
    data: { name: opts.name, slug: opts.slug },
  });

  const branches = [];
  for (const name of opts.branchNames) {
    branches.push(
      await prisma.location.create({
        data: { orgId: org.id, type: LocationType.BRANCH, name },
      })
    );
  }
  const warehouse = await prisma.location.create({
    data: { orgId: org.id, type: LocationType.WAREHOUSE, name: opts.warehouseName },
  });

  const products = await Promise.all(
    opts.products.map((p) => prisma.product.create({ data: { ...p, orgId: org.id } }))
  );

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  for (let i = 0; i < branches.length; i++) {
    const email = `${opts.pmNames[i].toLowerCase().replace(/[^a-z]/g, ".")}@${opts.slug}.demo`;
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, name: opts.pmNames[i], passwordHash },
    });
    await prisma.membership.create({
      data: { userId: user.id, orgId: org.id, role: Role.PURCHASE_MANAGER, locationId: branches[i].id },
    });
    console.log(`  PM   ${opts.pmNames[i]} <${email}> — ${branches[i].name}`);
  }

  const wmEmail = `${opts.wmName.toLowerCase().replace(/[^a-z]/g, ".")}@${opts.slug}.demo`;
  const wmUser = await prisma.user.upsert({
    where: { email: wmEmail },
    update: {},
    create: { email: wmEmail, name: opts.wmName, passwordHash },
  });
  await prisma.membership.create({
    data: { userId: wmUser.id, orgId: org.id, role: Role.WAREHOUSE_MANAGER, locationId: warehouse.id },
  });
  console.log(`  WM   ${opts.wmName} <${wmEmail}> — ${warehouse.name}`);

  const adminEmail = `${opts.adminName.toLowerCase().replace(/[^a-z]/g, ".")}@${opts.slug}.demo`;
  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: { email: adminEmail, name: opts.adminName, passwordHash },
  });
  await prisma.membership.create({
    data: { userId: adminUser.id, orgId: org.id, role: Role.SUPER_ADMIN, locationId: null },
  });
  console.log(`  ADMIN ${opts.adminName} <${adminEmail}>`);

  // A default delivery address per branch so checkout works immediately.
  for (let i = 0; i < branches.length; i++) {
    await prisma.address.create({
      data: {
        orgId: org.id,
        locationId: branches[i].id,
        label: `${branches[i].name} — reception`,
        contactName: opts.pmNames[i],
        line1: `${10 + i * 4} ${branches[i].name}`,
        city: "Dubai",
        country: "United Arab Emirates",
        isDefault: true,
      },
    });
  }

  // Branch-scoped authorization codes. The plaintext goes to the console
  // only; the DB stores a hash and a masked label.
  for (const branch of branches) {
    const prefix = branch.name.slice(0, 4).toUpperCase().replace(/[^A-Z]/g, "");
    const raw = `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
    const codeHash = await bcrypt.hash(raw, 10);
    await prisma.authorizationCode.create({
      data: {
        orgId: org.id,
        locationId: branch.id,
        codeHash,
        label: `${prefix}-••••`,
        createdByUserId: adminUser.id,
      },
    });
    console.log(`  CODE ${branch.name}: ${raw}`);
  }

  return { org, branches, warehouse, products };
}

async function reset() {
  // Dev-only: clear all rows so the seed is re-runnable. Order matters for FKs.
  await prisma.orderItemDelivery.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.auditLogEntry.deleteMany();
  await prisma.authorizationCode.deleteMany();
  await prisma.product.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.location.deleteMany();
  await prisma.user.deleteMany();
  await prisma.org.deleteMany();
}

async function main() {
  // This seed wipes data and creates weak demo accounts — dev machines only.
  const dbUrl = process.env.DATABASE_URL ?? "";
  if (process.env.NODE_ENV === "production" || !/localhost|127\.0\.0\.1/.test(dbUrl)) {
    throw new Error(
      "Refusing to seed: this looks like a non-local database. The demo seed is for development only."
    );
  }

  console.log(`Seeding — all demo users share the password: ${DEMO_PASSWORD}\n`);
  await reset();

  console.log("Org: Beyond Demands");
  await seedOrg({
    name: "Beyond Demands",
    slug: "beyond",
    products: beyondProducts(),
    branchNames: ["Rosewood Avenue", "Marina Walk", "Palm District"],
    warehouseName: "Central Warehouse",
    pmNames: ["Leila M.", "Sara N.", "Huda K."],
    wmName: "Omar D.",
    adminName: "A. Rahman",
  });

  console.log("\nOrg: Bellissima Salon Group");
  await seedOrg({
    name: "Bellissima Salon Group",
    slug: "bellissima",
    products: bellissimaProducts(),
    branchNames: ["Downtown Studio"],
    warehouseName: "Bellissima Depot",
    pmNames: ["Priya S."],
    wmName: "Marco T.",
    adminName: "Elena V.",
  });

  console.log("\nDone.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

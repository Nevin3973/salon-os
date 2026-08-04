import { PrismaClient, LocationType, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { productImageUrl } from "../src/lib/product-image";
import { seedPriceMinor } from "../src/lib/seed-pricing";
import {
  lineGst,
  billTotals,
  financialYear,
  formatInvoiceCode,
  defaultPrefix,
} from "../src/lib/gst";

/** GST rate a category is billed at (whole percent). Cosmetics/salon goods are
 *  mostly 18%; a few staples sit lower. */
function categoryGst(category: string): number {
  const low: Record<string, number> = { Consumables: 12, "Cleaning Supplies": 18, Furniture: 18 };
  return low[category] ?? 18;
}

/** A plausible HSN code per category for the tax invoice. */
function categoryHsn(category: string): string {
  const map: Record<string, string> = {
    "Hair Care": "3305",
    "Hair Colour": "3305",
    "Hair Treatments": "3305",
    "Skin Care": "3304",
    Facial: "3304",
    Waxing: "3307",
    "Nail Care": "3304",
    "Retail Products": "3305",
    Tools: "8201",
    Electrical: "8516",
    Furniture: "9402",
    "Cleaning Supplies": "3402",
    Consumables: "3401",
  };
  return map[category] ?? "3307";
}

/** Retail (pre-GST) price the salon charges the customer: a markup on the
 *  procurement cost, rounded to a tidy rupee figure. */
function retailPriceMinor(costCents: number): number {
  const marked = Math.round(costCents * 1.55);
  return Math.max(100, Math.round(marked / 100) * 100); // whole rupees, ≥ ₹1
}

/** Small deterministic hash → stable "random" numbers so a reseed is identical. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff;
}

/** A stable rack/bin label like "C-07": aisle by category, slot by branch+product. */
function rackFor(category: string, branchId: string, productId: string): string {
  const aisle = String.fromCharCode(65 + Math.floor(hash(`aisle:${category}`) * 8)); // A–H
  const slot = 1 + Math.floor(hash(`${branchId}:${productId}`) * 40); // 1–40
  return `${aisle}-${String(slot).padStart(2, "0")}`;
}

/** Warehouse bin like "R3-B02" — a rack row and bay, stable per SKU. */
function binFor(sku: string): string {
  const row = 1 + Math.floor(hash(`row:${sku}`) * 6); // R1–R6
  const bay = 1 + Math.floor(hash(`bay:${sku}`) * 12); // B01–B12
  return `R${row}-B${String(bay).padStart(2, "0")}`;
}

/**
 * A valid-looking EAN-13 for demo scanning: a fixed prefix, a SKU-derived body,
 * and the real mod-10 check digit so scanners and validators accept it.
 */
function eanFor(sku: string): string {
  let body = "890" + String(Math.floor(hash(`ean:${sku}`) * 1e9)).padStart(9, "0").slice(0, 9);
  body = body.slice(0, 12);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3);
  return body + String((10 - (sum % 10)) % 10);
}

// The seed writes without an org context, so it must use the owner
// connection (DIRECT_URL) — the app role would be blocked by RLS.
const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});

const DEMO_PASSWORD = "password123";

/** "Leila M." -> "leila.m" — collapses separators and never leaves a leading or
 *  trailing dot, which would make the address invalid per RFC 5322. */
function emailSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

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
  cashierName?: string; // optional counter-only user at the first branch
}) {
  const org = await prisma.org.create({
    data: {
      name: opts.name,
      slug: opts.slug,
      legalName: `${opts.name} Pvt Ltd`,
      gstin: `27${opts.slug.slice(0, 3).toUpperCase().padEnd(3, "X")}0000${opts.slug.length}Z5`,
    },
  });

  const branches = [];
  for (const name of opts.branchNames) {
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
  const warehouse = await prisma.location.create({
    data: { orgId: org.id, type: LocationType.WAREHOUSE, name: opts.warehouseName },
  });

  const products = await Promise.all(
    opts.products.map((p) => {
      const priceCents = seedPriceMinor(p.name, p.category);
      return prisma.product.create({
        data: {
          ...p,
          orgId: org.id,
          imageUrl: productImageUrl(p.name, p.category),
          priceCents,
          retailPriceCents: retailPriceMinor(priceCents),
          gstRate: categoryGst(p.category),
          hsn: categoryHsn(p.category),
          barcode: eanFor(`${opts.slug}:${p.sku}`),
          binLocation: binFor(p.sku),
        },
      });
    })
  );

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const pmUsers = [];
  for (let i = 0; i < branches.length; i++) {
    const email = `${emailSlug(opts.pmNames[i])}@${opts.slug}.demo`;
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, name: opts.pmNames[i], passwordHash },
    });
    await prisma.membership.create({
      data: { userId: user.id, orgId: org.id, role: Role.PURCHASE_MANAGER, locationId: branches[i].id },
    });
    pmUsers.push(user);
    console.log(`  PM   ${opts.pmNames[i]} <${email}> — ${branches[i].name}`);
  }

  // Optional counter-only staff at the first branch, to demo the cashier view.
  if (opts.cashierName) {
    const cashEmail = `${emailSlug(opts.cashierName)}@${opts.slug}.demo`;
    const cashUser = await prisma.user.upsert({
      where: { email: cashEmail },
      update: {},
      create: { email: cashEmail, name: opts.cashierName, passwordHash },
    });
    await prisma.membership.create({
      data: { userId: cashUser.id, orgId: org.id, role: Role.SALON_STAFF, locationId: branches[0].id },
    });
    console.log(`  CASH ${opts.cashierName} <${cashEmail}> — ${branches[0].name} (counter only)`);
  }

  const wmEmail = `${emailSlug(opts.wmName)}@${opts.slug}.demo`;
  const wmUser = await prisma.user.upsert({
    where: { email: wmEmail },
    update: {},
    create: { email: wmEmail, name: opts.wmName, passwordHash },
  });
  await prisma.membership.create({
    data: { userId: wmUser.id, orgId: org.id, role: Role.WAREHOUSE_MANAGER, locationId: warehouse.id },
  });
  console.log(`  WM   ${opts.wmName} <${wmEmail}> — ${warehouse.name}`);

  const adminEmail = `${emailSlug(opts.adminName)}@${opts.slug}.demo`;
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
  const addresses = [];
  for (let i = 0; i < branches.length; i++) {
    addresses.push(
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
      })
    );
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

  return { org, branches, warehouse, products, pmUsers, wmUser, adminUser, addresses };
}

type SeededOrg = Awaited<ReturnType<typeof seedOrg>>;

// ————————————————————————————————————————————————————————
// Sample orders (demo data across statuses, branches and dates)
// ————————————————————————————————————————————————————————

type OrderLine = { product: string; req: number; del: number; reason?: string; etaDays?: number; note?: string };
type OrderSpec = {
  branch: number;
  daysAgo: number;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "PARTIALLY_FULFILLED";
  lines: OrderLine[];
};

const SAMPLE_ORDERS: OrderSpec[] = [
  { branch: 0, daysAgo: 13, status: "COMPLETED", lines: [
    { product: "Repair Shampoo 1L", req: 20, del: 20 },
    { product: "Nitrile Gloves M (100)", req: 6, del: 6 },
  ] },
  { branch: 1, daysAgo: 11, status: "COMPLETED", lines: [
    { product: "Hot Wax Beads 1kg — Rose", req: 10, del: 10 },
  ] },
  { branch: 2, daysAgo: 9, status: "PARTIALLY_FULFILLED", lines: [
    { product: "Colour Tube — 6.35 Chestnut", req: 30, del: 30 },
    { product: "Colour Foil Roll 100m", req: 8, del: 3, reason: "Awaiting supplier", etaDays: 4, note: "urgent — balayage week" },
  ] },
  { branch: 0, daysAgo: 6, status: "COMPLETED", lines: [
    { product: "Moisture Conditioner 1L", req: 15, del: 15 },
    { product: "Cuticle Oil 15ml", req: 12, del: 12 },
  ] },
  { branch: 1, daysAgo: 3, status: "PROCESSING", lines: [
    { product: "Gel Lacquer — Porcelain Rose", req: 12, del: 6 },
    { product: "Acetone Remover 1L", req: 8, del: 0 },
  ] },
  { branch: 0, daysAgo: 1, status: "PENDING", lines: [
    { product: "Deep Repair Mask 500g", req: 10, del: 0 },
    { product: "Sectioning Clips (12)", req: 20, del: 0 },
  ] },
  { branch: 2, daysAgo: 0, status: "PENDING", lines: [
    { product: "Colour Tube — 9.1 Ash Blonde", req: 20, del: 0, note: "out of stock — please supply" },
    { product: "Post-Wax Soothing Lotion", req: 6, del: 0 },
  ] },
];

function daysAgoDate(days: number, hour = 10, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function seedSampleOrders(ctx: SeededOrg) {
  const byName = new Map(ctx.products.map((p) => [p.name, p]));
  const stock = new Map(ctx.products.map((p) => [p.id, p.stock]));
  let orderNo = 0;

  for (const spec of SAMPLE_ORDERS) {
    orderNo++;
    const branch = ctx.branches[spec.branch];
    const pm = ctx.pmUsers[spec.branch];
    const address = ctx.addresses[spec.branch];
    const placedAt = daysAgoDate(spec.daysAgo, 9 + spec.branch, 15);

    const totalCents = spec.lines.reduce(
      (sum, l) => sum + byName.get(l.product)!.priceCents * l.req,
      0
    );

    const order = await prisma.order.create({
      data: {
        orgId: ctx.org.id,
        orderNo,
        branchId: branch.id,
        placedByUserId: pm.id,
        status: spec.status,
        shipToAddressId: address.id,
        totalCents,
        createdAt: placedAt,
        items: {
          create: spec.lines.map((l) => {
            const p = byName.get(l.product)!;
            const short = l.req - l.del;
            return {
              productId: p.id,
              requestedQty: l.req,
              deliveredQty: l.del,
              unitPriceCents: p.priceCents,
              note: l.note ?? null,
              outstandingReason: spec.status === "PARTIALLY_FULFILLED" && short > 0 ? l.reason ?? "Awaiting supplier" : null,
              outstandingEta:
                spec.status === "PARTIALLY_FULFILLED" && short > 0 && l.etaDays ? daysAgoDate(-l.etaDays) : null,
            };
          }),
        },
      },
      include: { items: true },
    });

    // Deliveries + stock movements for anything dispatched.
    const dispatchAt = daysAgoDate(Math.max(0, spec.daysAgo - 1), 11, 30);
    for (const item of order.items) {
      const line = spec.lines.find((l) => byName.get(l.product)!.id === item.productId)!;
      if (line.del > 0) {
        await prisma.orderItemDelivery.create({
          data: { orderItemId: item.id, qty: line.del, dispatchedByUserId: ctx.wmUser.id, createdAt: dispatchAt },
        });
        const prev = stock.get(item.productId)!;
        const next = Math.max(0, prev - line.del);
        stock.set(item.productId, next);
        await prisma.stockMovement.create({
          data: {
            orgId: ctx.org.id,
            productId: item.productId,
            userId: ctx.wmUser.id,
            prevQty: prev,
            newQty: next,
            action: `Dispatch · ORD-${String(orderNo).padStart(4, "0")} → ${branch.name}`,
            refOrderId: order.id,
            createdAt: dispatchAt,
          },
        });
      }
    }

    // Audit trail entries.
    await prisma.auditLogEntry.create({
      data: {
        orgId: ctx.org.id,
        userId: pm.id,
        userName: pm.name,
        action: `Placed ORD-${String(orderNo).padStart(4, "0")} (${spec.lines.length} item${spec.lines.length === 1 ? "" : "s"}) from ${branch.name}`,
        entityType: "Order",
        entityId: order.id,
        createdAt: placedAt,
      },
    });
    if (spec.status === "COMPLETED") {
      await prisma.auditLogEntry.create({
        data: {
          orgId: ctx.org.id, userId: ctx.wmUser.id, userName: ctx.wmUser.name,
          action: `Completed ORD-${String(orderNo).padStart(4, "0")} — all items dispatched in full`,
          entityType: "Order", entityId: order.id, createdAt: dispatchAt,
        },
      });
    } else if (spec.status === "PARTIALLY_FULFILLED") {
      await prisma.auditLogEntry.create({
        data: {
          orgId: ctx.org.id, userId: ctx.wmUser.id, userName: ctx.wmUser.name,
          action: `Closed ORD-${String(orderNo).padStart(4, "0")} — items outstanding, awaiting supplier`,
          entityType: "Order", entityId: order.id, createdAt: dispatchAt,
        },
      });
    }
  }

  // Persist stock changes and set the order counter so new orders continue.
  for (const [id, qty] of stock) {
    await prisma.product.update({ where: { id }, data: { stock: qty } });
  }
  await prisma.org.update({ where: { id: ctx.org.id }, data: { orderSeq: orderNo } });
  console.log(`  ${SAMPLE_ORDERS.length} sample orders created (ORD-0001…ORD-${String(orderNo).padStart(4, "0")})`);
}

// ————————————————————————————————————————————————————————
// Retail side: branch shelf stock + sample customer bills
// ————————————————————————————————————————————————————————

const SAMPLE_CUSTOMERS = [
  "Aisha Khan", "Ritu Sharma", "Meera Nair", "Fatima Ali", "Priya Menon",
  "Sana Iqbal", "Divya Rao", "Nadia H.", "Kavya Reddy", "Zoya M.",
  "Walk-in customer", "Neha Gupta",
];

async function seedBranchStockAndSales(ctx: SeededOrg) {
  const paymentModes = ["CASH", "CARD", "UPI"] as const;
  const sellable = ctx.products.filter((p) => p.active && p.retailPriceCents > 0);
  let saleNo = 0;

  for (let bi = 0; bi < ctx.branches.length; bi++) {
    const branch = ctx.branches[bi];
    const pm = ctx.pmUsers[bi];
    const shelf = new Map<string, number>();

    // Opening shelf count for each sellable product.
    for (const p of sellable) {
      const base = 6 + Math.floor(hash(`${branch.id}:${p.id}`) * 20); // 6..25
      shelf.set(p.id, base);
      await prisma.branchStock.create({
        data: {
          orgId: ctx.org.id,
          branchId: branch.id,
          productId: p.id,
          onHand: base,
          rackId: rackFor(p.category, branch.id, p.id),
        },
      });
      await prisma.branchStockMovement.create({
        data: {
          orgId: ctx.org.id, branchId: branch.id, productId: p.id,
          prevQty: 0, newQty: base, reason: "Opening stock", userId: pm.id,
          createdAt: daysAgoDate(14, 8, 0),
        },
      });
    }

    // Each branch runs its own invoice series, restarting at 1.
    const prefix = defaultPrefix(branch.name);
    let branchSeq = 0;

    // A spread of sample bills over the last ~12 days.
    const billCount = 8 + Math.floor(hash(`bills:${branch.id}`) * 6); // 8..13
    for (let s = 0; s < billCount; s++) {
      const daysAgo = Math.floor(hash(`${branch.id}:sale:${s}`) * 12); // 0..11
      const lineN = 1 + Math.floor(hash(`${branch.id}:sale:${s}:n`) * 3); // 1..3
      const chosen: { p: (typeof sellable)[number]; qty: number }[] = [];
      for (let l = 0; l < lineN; l++) {
        const idx = Math.floor(hash(`${branch.id}:sale:${s}:l:${l}`) * sellable.length);
        const p = sellable[idx];
        if (!p || chosen.some((c) => c.p.id === p.id)) continue;
        const have = shelf.get(p.id) ?? 0;
        if (have <= 0) continue;
        const qty = Math.min(have, 1 + Math.floor(hash(`${branch.id}:sale:${s}:q:${l}`) * 3)); // 1..3
        chosen.push({ p, qty });
      }
      if (chosen.length === 0) continue;

      saleNo++;
      branchSeq++;
      const createdAt = daysAgoDate(daysAgo, 12 + (s % 6), (s * 13) % 60);
      const items = chosen.map(({ p, qty }, li) => {
        // Give roughly one line in six a small discount, so the demo shows one.
        const gross = p.retailPriceCents * qty;
        const discountCents =
          hash(`${branch.id}:disc:${s}:${li}`) < 0.16 ? Math.round(gross * 0.1 / 100) * 100 : 0;
        const g = lineGst(p.retailPriceCents, qty, p.gstRate, discountCents);
        return {
          productId: p.id, name: p.name, hsn: p.hsn, qty,
          unitPriceCents: p.retailPriceCents, gstRate: p.gstRate, discountCents,
          lineNetCents: g.netCents, taxCents: g.taxCents, lineTotalCents: g.totalCents,
          unitCostCents: p.priceCents,
        };
      });
      const totals = billTotals(
        items.map((it) => ({
          unitPriceCents: it.unitPriceCents, qty: it.qty, gstRate: it.gstRate,
          discountCents: it.discountCents,
        }))
      );
      const costCents = items.reduce((n, it) => n + it.unitCostCents * it.qty, 0);
      const fy = financialYear(createdAt);

      const sale = await prisma.sale.create({
        data: {
          orgId: ctx.org.id, branchId: branch.id,
          invoiceNo: branchSeq,
          invoiceCode: formatInvoiceCode(prefix, fy, branchSeq),
          fy,
          soldByUserId: pm.id,
          customerName: SAMPLE_CUSTOMERS[Math.floor(hash(`${branch.id}:cust:${s}`) * SAMPLE_CUSTOMERS.length)],
          paymentMode: paymentModes[s % 3],
          subtotalCents: totals.subtotalCents,
          discountCents: totals.discountCents,
          taxCents: totals.taxCents,
          roundOffCents: totals.roundOffCents,
          totalCents: totals.totalCents,
          costCents,
          createdAt,
          items: { create: items },
        },
      });

      for (const { p, qty } of chosen) {
        const prev = shelf.get(p.id)!;
        const next = prev - qty;
        shelf.set(p.id, next);
        await prisma.branchStockMovement.create({
          data: {
            orgId: ctx.org.id, branchId: branch.id, productId: p.id,
            prevQty: prev, newQty: next, reason: "Sale", refId: sale.id, userId: pm.id, createdAt,
          },
        });
      }
    }

    // Persist the final shelf counts.
    for (const [productId, onHand] of shelf) {
      await prisma.branchStock.updateMany({
        where: { branchId: branch.id, productId },
        data: { onHand },
      });
    }

    // Record where each branch's series got to, so live sales carry on from
    // there instead of restarting at 1.
    if (branchSeq > 0) {
      await prisma.invoiceSeries.create({
        data: {
          orgId: ctx.org.id,
          branchId: branch.id,
          fy: financialYear(),
          prefix,
          seq: branchSeq,
        },
      });
    }
  }

  await prisma.org.update({ where: { id: ctx.org.id }, data: { saleSeq: saleNo } });
  console.log(`  ${saleNo} sample bills created across ${ctx.branches.length} branch(es)`);
}

async function reset() {
  // Dev-only: clear all rows so the seed is re-runnable. Order matters for FKs.
  await prisma.saleReturnItem.deleteMany();
  await prisma.saleReturn.deleteMany();
  await prisma.invoiceSeries.deleteMany();
  await prisma.saleItem.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.branchStockMovement.deleteMany();
  await prisma.branchStock.deleteMany();
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

// Every tenant-scoped table that carries a row-level-security policy. Kept in
// sync with the RLS migrations; the seed pauses enforcement across these while
// it wipes and repopulates.
const TENANT_TABLES = [
  "Location", "Product", "StockMovement", "Order", "CartItem", "AuthorizationCode",
  "AuditLogEntry", "Address", "OrderItem", "OrderItemDelivery",
  "BranchStock", "BranchStockMovement", "Sale", "SaleItem",
  "InvoiceSeries", "SaleReturn", "SaleReturnItem",
] as const;

/**
 * Turns RLS enforcement off or back on for every tenant table.
 *
 * The seed connects as the database OWNER. On Neon the owner is still subject
 * to FORCE RLS, so with policies active it can neither clear nor refill these
 * tables — which is exactly what broke a production reseed once. Pausing RLS
 * for the duration (and always restoring ENABLE + FORCE afterwards) makes a
 * reseed a single, safe command instead of a manual three-step dance. The
 * policies themselves are never dropped, so restoring is just a re-enable.
 * On local Docker the superuser ignores RLS, so this is a harmless no-op there.
 */
async function setTenantRls(on: boolean) {
  for (const t of TENANT_TABLES) {
    if (on) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "${t}" FORCE ROW LEVEL SECURITY;`);
    } else {
      await prisma.$executeRawUnsafe(`ALTER TABLE "${t}" DISABLE ROW LEVEL SECURITY;`);
    }
  }
}

async function main() {
  // This seed wipes data and creates weak demo accounts — dev machines only,
  // unless deliberately overridden (e.g. seeding a hosted DEMO environment).
  const dbUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "";
  const isLocal = /localhost|127\.0\.0\.1/.test(dbUrl);
  if (!isLocal && process.env.SEED_ALLOW_REMOTE !== "yes") {
    throw new Error(
      "Refusing to seed: this looks like a non-local database. Set SEED_ALLOW_REMOTE=yes only for a demo environment — this wipes all data."
    );
  }

  console.log(`Seeding — all demo users share the password: ${DEMO_PASSWORD}\n`);

  // Pause RLS across the wipe+seed and ALWAYS restore it, even on failure.
  await setTenantRls(false);
  try {
    await reset();

    console.log("Org: Beyond Demands");
    const beyond = await seedOrg({
      name: "Beyond Demands",
      slug: "beyond",
      products: beyondProducts(),
      branchNames: ["Rosewood Avenue", "Marina Walk", "Palm District"],
      warehouseName: "Central Warehouse",
      pmNames: ["Leila M.", "Sara N.", "Huda K."],
      wmName: "Omar D.",
      adminName: "A. Rahman",
      cashierName: "Zara P.",
    });
    await seedSampleOrders(beyond);
    await seedBranchStockAndSales(beyond);

    console.log("\nOrg: Bellissima Salon Group");
    const bellissima = await seedOrg({
      name: "Bellissima Salon Group",
      slug: "bellissima",
      products: bellissimaProducts(),
      branchNames: ["Downtown Studio"],
      warehouseName: "Bellissima Depot",
      pmNames: ["Priya S."],
      wmName: "Marco T.",
      adminName: "Elena V.",
    });
    await seedBranchStockAndSales(bellissima);
  } finally {
    await setTenantRls(true);
    console.log("\nRLS re-enabled on all tenant tables.");
  }

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes, randomInt } from "node:crypto";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireVerifiedScopedSession, withOrg } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { productImageUrl } from "@/lib/product-image";
import { defaultPrefix } from "@/lib/gst";
import { sendInviteEmail } from "@/lib/actions/password";
import { activeOrgName } from "@/lib/tenant";

export type AdminResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

// ————— Products —————

export async function toggleProductActive(input: { productId: string }): Promise<AdminResult> {
  const { productId } = z.object({ productId: z.string().min(1) }).parse(input);
  const { session, db } = await requireVerifiedScopedSession("SUPER_ADMIN");

  const product = await db.product.findFirst({ where: { id: productId } });
  if (!product) return { ok: false, error: "Product not found." };

  await db.product.update({ where: { id: product.id }, data: { active: !product.active } });
  await logAudit(prisma, {
    orgId: session.orgId,
    userId: session.userId,
    userName: session.name,
    action: `${product.active ? "Hid" : "Restored"} product ${product.name}`,
    entityType: "Product",
    entityId: product.id,
  });

  revalidatePath("/admin/products");
  revalidatePath("/purchase-manager/catalogue");
  return { ok: true };
}

const GST_RATES = [0, 5, 12, 18, 28] as const;

const productSchema = z.object({
  sku: z.string().trim().min(2).max(32),
  name: z.string().trim().min(2).max(120),
  brand: z.string().trim().min(1).max(60),
  category: z.string().trim().min(2).max(60),
  unit: z.string().trim().min(1).max(24),
  stock: z.number().int().min(0).max(1_000_000),
  minStock: z.number().int().min(0).max(1_000_000),
  priceCents: z.number().int().min(0).max(100_000_000),
  retailPriceCents: z.number().int().min(0).max(100_000_000).optional(),
  gstRate: z.number().int().refine((n) => (GST_RATES as readonly number[]).includes(n), "Pick a valid GST rate.").optional(),
  hsn: z.string().trim().max(12).optional(),
});

export async function createProduct(input: {
  sku: string;
  name: string;
  brand: string;
  category: string;
  unit: string;
  stock: number;
  minStock: number;
  priceCents: number;
  retailPriceCents?: number;
  gstRate?: number;
  hsn?: string;
}): Promise<AdminResult> {
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the product fields." };
  }
  const { session, db } = await requireVerifiedScopedSession("SUPER_ADMIN");

  const existing = await db.product.findFirst({ where: { sku: parsed.data.sku } });
  if (existing) return { ok: false, error: `SKU ${parsed.data.sku} already exists.` };

  const product = await db.product.create({
    data: {
      ...parsed.data,
      orgId: session.orgId,
      imageUrl: productImageUrl(parsed.data.name, parsed.data.category),
    },
  });
  if (parsed.data.stock > 0) {
    await withOrg(session.orgId, (tx) =>
      tx.stockMovement.create({
        data: {
          orgId: session.orgId,
          productId: product.id,
          userId: session.userId,
          prevQty: 0,
          newQty: parsed.data.stock,
          action: "New product",
        },
      })
    );
  }
  await logAudit(prisma, {
    orgId: session.orgId,
    userId: session.userId,
    userName: session.name,
    action: `Added product ${product.name} (${product.sku})`,
    entityType: "Product",
    entityId: product.id,
  });

  revalidatePath("/admin/products");
  return { ok: true };
}

const imageSchema = z.object({
  productId: z.string().min(1),
  imageUrl: z
    .string()
    .url()
    .max(500)
    .refine((u) => u.startsWith("https://res.cloudinary.com/"), {
      message: "Image must come from the upload service.",
    }),
});

/** Saves an uploaded photo against a product. The upload itself happens in the
 *  browser (unsigned Cloudinary preset); this is where permission is enforced. */
export async function setProductImage(input: {
  productId: string;
  imageUrl: string;
}): Promise<AdminResult> {
  const parsed = imageSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid image." };
  }
  const { session, db } = await requireVerifiedScopedSession("SUPER_ADMIN");

  const product = await db.product.findFirst({ where: { id: parsed.data.productId } });
  if (!product) return { ok: false, error: "Product not found." };

  await db.product.update({
    where: { id: product.id },
    data: { imageUrl: parsed.data.imageUrl },
  });
  await logAudit(prisma, {
    orgId: session.orgId,
    userId: session.userId,
    userName: session.name,
    action: `Updated the photo for ${product.name}`,
    entityType: "Product",
    entityId: product.id,
  });

  revalidatePath("/admin/products");
  revalidatePath("/purchase-manager/catalogue");
  return { ok: true };
}

const salePricingSchema = z.object({
  productId: z.string().min(1),
  retailPriceCents: z.number().int().min(0).max(100_000_000),
  gstRate: z.number().int().refine((n) => (GST_RATES as readonly number[]).includes(n), "Pick a valid GST rate."),
  hsn: z.string().trim().max(12).optional(),
});

/** Sets the retail selling price, GST rate and HSN code a branch bills to
 *  customers. Head-office controlled, org-wide — same as the procurement price. */
export async function setSalePricing(input: {
  productId: string;
  retailPriceCents: number;
  gstRate: number;
  hsn?: string;
}): Promise<AdminResult> {
  const parsed = salePricingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the retail price." };
  }
  const { session, db } = await requireVerifiedScopedSession("SUPER_ADMIN");

  const product = await db.product.findFirst({ where: { id: parsed.data.productId } });
  if (!product) return { ok: false, error: "Product not found." };

  await db.product.update({
    where: { id: product.id },
    data: {
      retailPriceCents: parsed.data.retailPriceCents,
      gstRate: parsed.data.gstRate,
      hsn: parsed.data.hsn || null,
    },
  });
  await logAudit(prisma, {
    orgId: session.orgId,
    userId: session.userId,
    userName: session.name,
    action: `Set retail pricing for ${product.name} (GST ${parsed.data.gstRate}%)`,
    entityType: "Product",
    entityId: product.id,
  });

  revalidatePath("/admin/products");
  revalidatePath("/salon/sell");
  return { ok: true };
}

const identifiersSchema = z.object({
  productId: z.string().min(1),
  /** EAN-8/13 or UPC-A as printed on the pack; digits only. Empty clears it. */
  barcode: z.string().trim().regex(/^[0-9]{0,14}$/, "A barcode is 8–14 digits.").optional(),
  /** Warehouse bin, e.g. "R3-B02". Empty clears it. */
  binLocation: z.string().trim().max(24).optional(),
});

/** Sets the scannable barcode and the warehouse bin a product is picked from. */
export async function setProductIdentifiers(input: {
  productId: string;
  barcode?: string;
  binLocation?: string;
}): Promise<AdminResult> {
  const parsed = identifiersSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the barcode." };
  }
  const { session, db } = await requireVerifiedScopedSession("SUPER_ADMIN");

  const product = await db.product.findFirst({ where: { id: parsed.data.productId } });
  if (!product) return { ok: false, error: "Product not found." };

  const barcode = parsed.data.barcode?.trim() || null;
  if (barcode) {
    // Barcodes must be unique within the org or a scan would be ambiguous.
    const clash = await db.product.findFirst({ where: { barcode, NOT: { id: product.id } } });
    if (clash) return { ok: false, error: `That barcode is already on ${clash.name}.` };
  }

  await db.product.update({
    where: { id: product.id },
    data: { barcode, binLocation: parsed.data.binLocation?.trim() || null },
  });
  await logAudit(prisma, {
    orgId: session.orgId,
    userId: session.userId,
    userName: session.name,
    action: `Updated barcode/bin for ${product.name}`,
    entityType: "Product",
    entityId: product.id,
  });

  revalidatePath("/admin/products");
  revalidatePath("/salon/sell");
  revalidatePath("/warehouse/queue");
  return { ok: true };
}

// ————— Locations (branches & warehouses) —————

const locationSchema = z.object({
  name: z.string().trim().min(2).max(80),
  type: z.enum(["BRANCH", "WAREHOUSE"]),
  /** Invoice prefix for a branch, e.g. "IND". Derived from the name if blank. */
  invoicePrefix: z.string().trim().max(6).optional(),
});

/**
 * Adds a salon branch or a warehouse. A branch also needs an invoice prefix —
 * its bills are numbered on their own per-year series — so one is derived from
 * the name when the admin doesn't supply it.
 */
export async function createLocation(input: {
  name: string;
  type: "BRANCH" | "WAREHOUSE";
  invoicePrefix?: string;
}): Promise<AdminResult> {
  const parsed = locationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the location details." };
  }
  const { session, db } = await requireVerifiedScopedSession("SUPER_ADMIN");

  const existing = await db.location.findFirst({
    where: { name: parsed.data.name, type: parsed.data.type },
  });
  if (existing) return { ok: false, error: `${parsed.data.name} already exists.` };

  const prefix =
    parsed.data.type === "BRANCH"
      ? (parsed.data.invoicePrefix?.toUpperCase() || defaultPrefix(parsed.data.name))
      : null;

  const location = await db.location.create({
    data: {
      orgId: session.orgId,
      name: parsed.data.name,
      type: parsed.data.type,
      invoicePrefix: prefix,
    },
  });
  await logAudit(prisma, {
    orgId: session.orgId,
    userId: session.userId,
    userName: session.name,
    action: `Added ${parsed.data.type === "BRANCH" ? "branch" : "warehouse"} ${location.name}`,
    entityType: "Location",
    entityId: location.id,
  });

  revalidatePath("/admin/users");
  revalidatePath("/admin/codes");
  return { ok: true };
}

// ————— Users —————

const userSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120),
  role: z.nativeEnum(Role),
  locationId: z.string().min(1).optional(),
});

export async function createUserWithMembership(input: {
  name: string;
  email: string;
  role: Role;
  locationId?: string;
}): Promise<AdminResult<{ tempPassword: string; invited: boolean }>> {
  const parsed = userSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the user details." };
  }
  const { session, db } = await requireVerifiedScopedSession("SUPER_ADMIN");

  if (parsed.data.role !== "SUPER_ADMIN" && !parsed.data.locationId) {
    return { ok: false, error: "Pick a location for this role." };
  }
  if (parsed.data.locationId) {
    const loc = await db.location.findFirst({ where: { id: parsed.data.locationId } });
    if (!loc) return { ok: false, error: "Location not found." };
  }

  const email = parsed.data.email.toLowerCase();
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    const existingMembership = await prisma.membership.findFirst({
      where: { userId: existingUser.id, orgId: session.orgId },
    });
    if (existingMembership) return { ok: false, error: "This person is already in your organization." };
  }

  // 12-char temporary password, shown once to the admin.
  const tempPassword = randomBytes(9).toString("base64url").slice(0, 12);
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  const user =
    existingUser ??
    (await prisma.user.create({
      data: { email, name: parsed.data.name, passwordHash, mustChangePassword: true },
    }));

  await prisma.membership.create({
    data: {
      userId: user.id,
      orgId: session.orgId,
      role: parsed.data.role,
      locationId: parsed.data.role === "SUPER_ADMIN" ? null : parsed.data.locationId,
    },
  });
  await logAudit(prisma, {
    orgId: session.orgId,
    userId: session.userId,
    userName: session.name,
    action: `Added ${parsed.data.name} as ${parsed.data.role.replaceAll("_", " ").toLowerCase()}`,
    entityType: "User",
    entityId: user.id,
  });

  // Email an invite so the new person sets their own password. The temp
  // password stays as a fallback the admin can read out if mail is down.
  let invited = false;
  if (!existingUser) {
    const orgName = await activeOrgName();
    invited = await sendInviteEmail({
      email: user.email,
      name: user.name,
      userId: user.id,
      orgName: orgName || "your workspace",
    });
  }

  revalidatePath("/admin/users");
  // For an existing user we never reveal a password (we didn't change it).
  return {
    ok: true,
    data: { tempPassword: existingUser ? "" : tempPassword, invited },
  };
}

// ————— Authorization codes —————

export async function generateAuthCode(input: { locationId?: string }): Promise<AdminResult<{ code: string }>> {
  const parsed = z.object({ locationId: z.string().min(1).optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid location." };
  const { session, db } = await requireVerifiedScopedSession("SUPER_ADMIN");

  let prefix = "CODE";
  if (parsed.data.locationId) {
    const loc = await db.location.findFirst({ where: { id: parsed.data.locationId } });
    if (!loc) return { ok: false, error: "Location not found." };
    prefix = loc.name.replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase() || "CODE";
  }
  const raw = `${prefix}-${randomInt(1000, 10000)}`;

  await db.authorizationCode.create({
    data: {
      orgId: session.orgId,
      locationId: parsed.data.locationId ?? null,
      codeHash: await bcrypt.hash(raw, 10),
      label: `${prefix}-••••`,
      createdByUserId: session.userId,
    },
  });
  await logAudit(prisma, {
    orgId: session.orgId,
    userId: session.userId,
    userName: session.name,
    action: `Generated a new purchase code${parsed.data.locationId ? ` for ${prefix}` : ""}`,
    entityType: "AuthorizationCode",
  });

  revalidatePath("/admin/codes");
  return { ok: true, data: { code: raw } };
}

export async function revokeAuthCode(input: { codeId: string }): Promise<AdminResult> {
  const { codeId } = z.object({ codeId: z.string().min(1) }).parse(input);
  const { session, db } = await requireVerifiedScopedSession("SUPER_ADMIN");

  const code = await db.authorizationCode.findFirst({ where: { id: codeId, isActive: true } });
  if (!code) return { ok: false, error: "Code not found." };

  await db.authorizationCode.update({
    where: { id: code.id },
    data: { isActive: false, rotatedAt: new Date() },
  });
  await logAudit(prisma, {
    orgId: session.orgId,
    userId: session.userId,
    userName: session.name,
    action: "Revoked a purchase code — it stops working immediately",
    entityType: "AuthorizationCode",
    entityId: code.id,
  });

  revalidatePath("/admin/codes");
  return { ok: true };
}

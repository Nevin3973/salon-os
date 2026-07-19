"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes, randomInt } from "node:crypto";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireScopedSession, withOrg } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";

export type AdminResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

// ————— Products —————

export async function toggleProductActive(input: { productId: string }): Promise<AdminResult> {
  const { productId } = z.object({ productId: z.string().min(1) }).parse(input);
  const { session, db } = await requireScopedSession("SUPER_ADMIN");

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

const productSchema = z.object({
  sku: z.string().trim().min(2).max(32),
  name: z.string().trim().min(2).max(120),
  brand: z.string().trim().min(1).max(60),
  category: z.string().trim().min(2).max(60),
  unit: z.string().trim().min(1).max(24),
  stock: z.number().int().min(0).max(1_000_000),
  minStock: z.number().int().min(0).max(1_000_000),
});

export async function createProduct(input: {
  sku: string;
  name: string;
  brand: string;
  category: string;
  unit: string;
  stock: number;
  minStock: number;
}): Promise<AdminResult> {
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the product fields." };
  }
  const { session, db } = await requireScopedSession("SUPER_ADMIN");

  const existing = await db.product.findFirst({ where: { sku: parsed.data.sku } });
  if (existing) return { ok: false, error: `SKU ${parsed.data.sku} already exists.` };

  const product = await db.product.create({
    data: { ...parsed.data, orgId: session.orgId },
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
}): Promise<AdminResult<{ tempPassword: string }>> {
  const parsed = userSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the user details." };
  }
  const { session, db } = await requireScopedSession("SUPER_ADMIN");

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

  revalidatePath("/admin/users");
  // For an existing user we never reveal a password (we didn't change it).
  return { ok: true, data: { tempPassword: existingUser ? "" : tempPassword } };
}

// ————— Authorization codes —————

export async function generateAuthCode(input: { locationId?: string }): Promise<AdminResult<{ code: string }>> {
  const parsed = z.object({ locationId: z.string().min(1).optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid location." };
  const { session, db } = await requireScopedSession("SUPER_ADMIN");

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
  const { session, db } = await requireScopedSession("SUPER_ADMIN");

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

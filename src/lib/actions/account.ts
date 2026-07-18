"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireSession, requireScopedSession } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";

export type ActionResult = { ok: true } | { ok: false; error: string };

// ————— Profile —————

const profileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(24).optional().or(z.literal("")),
});

export async function updateProfile(input: { name: string; phone?: string }): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid name (2–80 characters)." };
  const session = await requireSession();

  await prisma.user.update({
    where: { id: session.userId },
    data: { name: parsed.data.name, phone: parsed.data.phone || null },
  });
  revalidatePath("/purchase-manager", "layout");
  return { ok: true };
}

const passwordSchema = z.object({
  current: z.string().min(1),
  next: z
    .string()
    .min(10, "Use at least 10 characters.")
    .max(128)
    .refine((v) => /[a-zA-Z]/.test(v) && /[0-9]/.test(v), {
      message: "Use letters and at least one number.",
    }),
});

export async function changePassword(input: { current: string; next: string }): Promise<ActionResult> {
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid password." };
  }
  const session = await requireSession();

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return { ok: false, error: "Account not found." };

  const valid = await bcrypt.compare(parsed.data.current, user.passwordHash);
  if (!valid) return { ok: false, error: "Your current password is incorrect." };

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.next, 12), mustChangePassword: false },
  });
  await logAudit(prisma, {
    orgId: session.orgId,
    userId: session.userId,
    userName: session.name,
    action: "Changed account password",
    entityType: "User",
    entityId: user.id,
  });
  return { ok: true };
}

// ————— Address book —————

const addressSchema = z.object({
  label: z.string().trim().min(2).max(60),
  contactName: z.string().trim().max(80).optional().or(z.literal("")),
  phone: z.string().trim().max(24).optional().or(z.literal("")),
  line1: z.string().trim().min(3).max(120),
  line2: z.string().trim().max(120).optional().or(z.literal("")),
  city: z.string().trim().min(2).max(60),
  state: z.string().trim().max(60).optional().or(z.literal("")),
  postalCode: z.string().trim().max(16).optional().or(z.literal("")),
  country: z.string().trim().min(2).max(60),
});

export async function saveAddress(input: {
  addressId?: string;
  label: string;
  contactName?: string;
  phone?: string;
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode?: string;
  country: string;
  makeDefault?: boolean;
}): Promise<ActionResult> {
  const parsed = addressSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the address fields." };
  }
  const { session, db } = await requireScopedSession("PURCHASE_MANAGER");
  if (!session.locationId) return { ok: false, error: "Your account has no branch assigned." };

  const data = {
    label: parsed.data.label,
    contactName: parsed.data.contactName || null,
    phone: parsed.data.phone || null,
    line1: parsed.data.line1,
    line2: parsed.data.line2 || null,
    city: parsed.data.city,
    state: parsed.data.state || null,
    postalCode: parsed.data.postalCode || null,
    country: parsed.data.country,
  };

  const existingCount = await db.address.count({
    where: { locationId: session.locationId, isActive: true },
  });

  let savedId: string;
  if (input.addressId) {
    const existing = await db.address.findFirst({
      where: { id: input.addressId, locationId: session.locationId },
    });
    if (!existing) return { ok: false, error: "Address not found." };
    await db.address.update({ where: { id: existing.id }, data });
    savedId = existing.id;
  } else {
    const created = await db.address.create({
      data: {
        ...data,
        orgId: session.orgId,
        locationId: session.locationId,
        isDefault: existingCount === 0, // first address becomes the default
      },
    });
    savedId = created.id;
  }

  if (input.makeDefault) await setDefaultInternal(session.orgId, session.locationId, savedId);

  revalidatePath("/purchase-manager/account/addresses");
  revalidatePath("/purchase-manager/cart");
  return { ok: true };
}

export async function setDefaultAddress(input: { addressId: string }): Promise<ActionResult> {
  const { addressId } = z.object({ addressId: z.string().min(1) }).parse(input);
  const { session, db } = await requireScopedSession("PURCHASE_MANAGER");
  if (!session.locationId) return { ok: false, error: "No branch assigned." };

  const address = await db.address.findFirst({
    where: { id: addressId, locationId: session.locationId, isActive: true },
  });
  if (!address) return { ok: false, error: "Address not found." };

  await setDefaultInternal(session.orgId, session.locationId, addressId);
  revalidatePath("/purchase-manager/account/addresses");
  revalidatePath("/purchase-manager/cart");
  return { ok: true };
}

async function setDefaultInternal(orgId: string, locationId: string, addressId: string) {
  await prisma.$transaction([
    prisma.address.updateMany({
      where: { orgId, locationId },
      data: { isDefault: false },
    }),
    prisma.address.update({ where: { id: addressId }, data: { isDefault: true } }),
  ]);
}

export async function removeAddress(input: { addressId: string }): Promise<ActionResult> {
  const { addressId } = z.object({ addressId: z.string().min(1) }).parse(input);
  const { session, db } = await requireScopedSession("PURCHASE_MANAGER");
  if (!session.locationId) return { ok: false, error: "No branch assigned." };

  const address = await db.address.findFirst({
    where: { id: addressId, locationId: session.locationId, isActive: true },
  });
  if (!address) return { ok: false, error: "Address not found." };

  // Soft-delete: orders keep their historical shipping address.
  await db.address.update({ where: { id: address.id }, data: { isActive: false, isDefault: false } });

  if (address.isDefault) {
    const next = await db.address.findFirst({
      where: { locationId: session.locationId, isActive: true },
      orderBy: { createdAt: "asc" },
    });
    if (next) await setDefaultInternal(session.orgId, session.locationId, next.id);
  }

  revalidatePath("/purchase-manager/account/addresses");
  revalidatePath("/purchase-manager/cart");
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireScopedSession } from "@/lib/tenant";

const addSchema = z.object({
  productId: z.string().min(1),
  qty: z.number().int().min(1).max(9999),
  note: z.string().max(500).optional(),
});

export async function addToCart(input: { productId: string; qty: number; note?: string }) {
  const { productId, qty, note } = addSchema.parse(input);
  const { session, db } = await requireScopedSession("PURCHASE_MANAGER");

  // Verify the product exists in this org and is active (scoped db enforces org).
  const product = await db.product.findFirst({ where: { id: productId, active: true } });
  if (!product) throw new Error("Product not available");

  const existing = await db.cartItem.findFirst({
    where: { userId: session.userId, productId },
  });

  if (existing) {
    await db.cartItem.update({
      where: { id: existing.id },
      data: { qty: existing.qty + qty, note: note ?? existing.note },
    });
  } else {
    // orgId is also injected by the scoped-db extension at runtime; passed here
    // to satisfy the static create-input type.
    await db.cartItem.create({
      data: { orgId: session.orgId, userId: session.userId, productId, qty, note: note ?? null },
    });
  }

  revalidatePath("/purchase-manager/cart");
  revalidatePath("/purchase-manager/catalogue");
}

export async function setCartQty(input: { productId: string; qty: number }) {
  const { productId, qty } = z
    .object({ productId: z.string().min(1), qty: z.number().int().min(0).max(9999) })
    .parse(input);
  const { session, db } = await requireScopedSession("PURCHASE_MANAGER");

  const existing = await db.cartItem.findFirst({ where: { userId: session.userId, productId } });
  if (!existing) return;

  if (qty <= 0) {
    await db.cartItem.delete({ where: { id: existing.id } });
  } else {
    await db.cartItem.update({ where: { id: existing.id }, data: { qty } });
  }
  revalidatePath("/purchase-manager/cart");
}

export async function setCartNote(input: { productId: string; note: string }) {
  const { productId, note } = z
    .object({ productId: z.string().min(1), note: z.string().max(500) })
    .parse(input);
  const { session, db } = await requireScopedSession("PURCHASE_MANAGER");
  const existing = await db.cartItem.findFirst({ where: { userId: session.userId, productId } });
  if (!existing) return;
  await db.cartItem.update({ where: { id: existing.id }, data: { note } });
  revalidatePath("/purchase-manager/cart");
}

export async function removeFromCart(input: { productId: string }) {
  const { productId } = z.object({ productId: z.string().min(1) }).parse(input);
  const { session, db } = await requireScopedSession("PURCHASE_MANAGER");
  const existing = await db.cartItem.findFirst({ where: { userId: session.userId, productId } });
  if (existing) await db.cartItem.delete({ where: { id: existing.id } });
  revalidatePath("/purchase-manager/cart");
  revalidatePath("/purchase-manager/catalogue");
}

export async function clearCart() {
  const { session, db } = await requireScopedSession("PURCHASE_MANAGER");
  await db.cartItem.deleteMany({ where: { userId: session.userId } });
  revalidatePath("/purchase-manager/cart");
}

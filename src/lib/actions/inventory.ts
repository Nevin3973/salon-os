"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { orderCode } from "@/lib/format";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Manual +/- stock adjustment from the inventory table. */
export async function adjustStock(input: { productId: string; delta: number }): Promise<ActionResult> {
  const { productId, delta } = z
    .object({ productId: z.string().min(1), delta: z.number().int() })
    .parse(input);
  const session = await requireSession("WAREHOUSE_MANAGER");

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${productId} AND "orgId" = ${session.orgId} FOR UPDATE`;
      const p = await tx.product.findFirst({ where: { id: productId, orgId: session.orgId } });
      if (!p) throw new Error("NOT_FOUND");
      const next = Math.max(0, p.stock + delta);
      if (next === p.stock) return;
      await tx.product.update({ where: { id: p.id }, data: { stock: next } });
      await tx.stockMovement.create({
        data: {
          orgId: session.orgId,
          productId: p.id,
          userId: session.userId,
          prevQty: p.stock,
          newQty: next,
          action: "Manual adjustment",
        },
      });
      await logAudit(tx, {
        orgId: session.orgId,
        userId: session.userId,
        userName: session.name,
        action: `Manual adjustment: ${p.name} ${delta > 0 ? "+" : ""}${delta} (now ${next})`,
        entityType: "Product",
        entityId: p.id,
      });
    });
  } catch {
    return { ok: false, error: "Could not adjust stock." };
  }
  revalidatePath("/warehouse/inventory");
  revalidatePath("/warehouse/log");
  return { ok: true };
}

export async function setMinStock(input: { productId: string; minStock: number }): Promise<ActionResult> {
  const { productId, minStock } = z
    .object({ productId: z.string().min(1), minStock: z.number().int().min(0).max(1_000_000) })
    .parse(input);
  const session = await requireSession("WAREHOUSE_MANAGER");
  const p = await prisma.product.findFirst({ where: { id: productId, orgId: session.orgId } });
  if (!p) return { ok: false, error: "Product not found." };
  await prisma.product.update({ where: { id: p.id }, data: { minStock } });
  revalidatePath("/warehouse/inventory");
  return { ok: true };
}

/**
 * Fulfil an outstanding order line when stock has landed. Re-verifies stock
 * under a row lock (stock may have moved since the page rendered) and refuses
 * if there isn't enough. Flips the order to COMPLETED if now fully delivered.
 */
export async function fulfilOutstanding(input: { orderItemId: string }): Promise<ActionResult> {
  const { orderItemId } = z.object({ orderItemId: z.string().min(1) }).parse(input);
  const session = await requireSession("WAREHOUSE_MANAGER");

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "OrderItem" WHERE id = ${orderItemId} FOR UPDATE`;
      const item = await tx.orderItem.findFirst({
        where: { id: orderItemId, order: { orgId: session.orgId } },
        include: { order: true, product: true },
      });
      if (!item) throw new Error("NOT_FOUND");
      const need = item.requestedQty - item.deliveredQty;
      if (need <= 0) throw new Error("NOTHING_DUE");

      await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${item.productId} AND "orgId" = ${session.orgId} FOR UPDATE`;
      const p = await tx.product.findFirst({ where: { id: item.productId, orgId: session.orgId } });
      if (!p || p.stock < need) throw new Error("INSUFFICIENT");

      await tx.product.update({ where: { id: p.id }, data: { stock: p.stock - need } });
      await tx.stockMovement.create({
        data: {
          orgId: session.orgId,
          productId: p.id,
          userId: session.userId,
          prevQty: p.stock,
          newQty: p.stock - need,
          action: `Outstanding fulfilled · ${orderCode(item.order.orderNo)}`,
          refOrderId: item.orderId,
        },
      });
      await tx.orderItemDelivery.create({
        data: { orderItemId: item.id, qty: need, dispatchedByUserId: session.userId },
      });
      await tx.orderItem.update({
        where: { id: item.id },
        data: { deliveredQty: item.requestedQty },
      });

      // Complete the order if every line is now fully delivered.
      const siblings = await tx.orderItem.findMany({ where: { orderId: item.orderId } });
      const full = siblings.every((s) =>
        s.id === item.id ? true : s.deliveredQty >= s.requestedQty
      );
      if (full) {
        await tx.order.update({ where: { id: item.orderId }, data: { status: "COMPLETED" } });
      }
      await logAudit(tx, {
        orgId: session.orgId,
        userId: session.userId,
        userName: session.name,
        action: `Fulfilled outstanding ${need} × ${item.product.name} for ${orderCode(item.order.orderNo)}`,
        entityType: "Order",
        entityId: item.orderId,
      });
    });
  } catch (e) {
    const raw = e instanceof Error ? e.message : "";
    if (raw === "INSUFFICIENT") return { ok: false, error: "Not enough stock to fulfil this line." };
    if (raw === "NOTHING_DUE") return { ok: false, error: "This line is already fulfilled." };
    return { ok: false, error: "Could not fulfil the line." };
  }
  revalidatePath("/warehouse/outstanding");
  revalidatePath("/warehouse/inventory");
  revalidatePath("/warehouse/log");
  return { ok: true };
}

/* ————————————————— Import ————————————————— */

export type ImportMode = "Inventory Update" | "Product Import" | "Full Synchronization";
export type ImportRow = {
  sku: string;
  name: string;
  qty: number;
  brand?: string;
  category?: string;
  unit?: string;
  min?: number;
};
export type PreviewRow = ImportRow & { isNew: boolean; current: number | null };
export type ImportPreview = {
  valid: PreviewRow[];
  errors: string[];
  warnings: string[];
};
export type ImportSummary = { updated: number; created: number; deactivated: number; failed: number };

const rowSchema = z.object({
  sku: z.string().max(64),
  name: z.string().max(200),
  qty: z.number(),
  brand: z.string().max(120).optional(),
  category: z.string().max(120).optional(),
  unit: z.string().max(40).optional(),
  min: z.number().optional(),
});
const previewSchema = z.object({
  rows: z.array(rowSchema).max(5000),
  mode: z.enum(["Inventory Update", "Product Import", "Full Synchronization"]),
});

/** Validate parsed rows against existing catalogue — mirrors the prototype's importCheck. */
export async function previewImport(input: {
  rows: ImportRow[];
  mode: ImportMode;
}): Promise<ImportPreview> {
  const { rows, mode } = previewSchema.parse(input);
  const session = await requireSession("WAREHOUSE_MANAGER");
  const products = await prisma.product.findMany({ where: { orgId: session.orgId } });
  const bySku = new Map(products.map((p) => [p.sku, p]));

  const valid: PreviewRow[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const seenInSheet = new Set<string>();

  rows.forEach((r, i) => {
    const rowNo = i + 2; // header is row 1
    const match = r.sku ? bySku.get(r.sku) : undefined;
    if (r.sku && r.sku.trim() !== "") {
      const skuNorm = r.sku.trim();
      if (seenInSheet.has(skuNorm)) {
        errors.push(`Row ${rowNo}: Duplicate SKU “${r.sku}” found in sheet`);
        return;
      }
      seenInSheet.add(skuNorm);
    }
    if (!r.name) {
      errors.push(`Row ${rowNo}: missing product name${r.sku ? ` (SKU ${r.sku})` : ""}`);
      return;
    }
    if (!Number.isFinite(r.qty) || r.qty < 0) {
      errors.push(`Row ${rowNo}: invalid quantity “${r.qty}” for "${r.name}"`);
      return;
    }
    if (!match && mode === "Inventory Update") {
      errors.push(`Row ${rowNo}: SKU ${r.sku} not found — switch to Product Import to create it`);
      return;
    }
    if (!match) warnings.push(`Row ${rowNo}: "${r.name}" will be created as a new product`);
    valid.push({ ...r, isNew: !match, current: match ? match.stock : null });
  });

  return { valid, errors, warnings };
}

/** Apply a validated import. */
export async function confirmImport(input: {
  rows: ImportRow[];
  mode: ImportMode;
}): Promise<{ ok: true; summary: ImportSummary } | { ok: false; error: string }> {
  const { rows, mode } = previewSchema.parse(input);
  const session = await requireSession("WAREHOUSE_MANAGER");

  try {
    const summary = await prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({ where: { orgId: session.orgId } });
      const bySku = new Map(products.map((p) => [p.sku, p]));
      let updated = 0,
        created = 0,
        deactivated = 0,
        failed = 0;
      const seenSkus = new Set<string>();

      for (const r of rows) {
        if (!r.name || !Number.isFinite(r.qty) || r.qty < 0) {
          failed++;
          continue;
        }
        const match = r.sku ? bySku.get(r.sku) : undefined;
        if (!match && mode === "Inventory Update") {
          failed++;
          continue;
        }
        if (match) {
          seenSkus.add(match.sku);
          if (match.stock !== r.qty) {
            await tx.stockMovement.create({
              data: {
                orgId: session.orgId,
                productId: match.id,
                userId: session.userId,
                prevQty: match.stock,
                newQty: r.qty,
                action: "Import",
              },
            });
          }
          await tx.product.update({
            where: { id: match.id },
            data: {
              stock: r.qty,
              ...(r.brand ? { brand: r.brand } : {}),
              ...(r.category ? { category: r.category } : {}),
              ...(r.unit ? { unit: r.unit } : {}),
              ...(r.min != null ? { minStock: r.min } : {}),
              active: true,
            },
          });
          match.stock = r.qty; // Update stock in-memory cache to prevent incorrect stock movements on duplicate SKUs
          updated++;
        } else {
          const p = await tx.product.create({
            data: {
              orgId: session.orgId,
              sku: r.sku || `IMP-${Date.now()}-${created}`,
              name: r.name,
              brand: r.brand ?? "—",
              category: r.category ?? "Uncategorized",
              unit: r.unit ?? "unit",
              stock: r.qty,
              minStock: r.min ?? 5,
            },
          });
          seenSkus.add(p.sku);
          bySku.set(p.sku, p); // Add new product to in-memory cache to prevent duplicate inserts and unique constraint violation crashes
          await tx.stockMovement.create({
            data: {
              orgId: session.orgId,
              productId: p.id,
              userId: session.userId,
              prevQty: 0,
              newQty: r.qty,
              action: "Import (new)",
            },
          });
          created++;
        }
      }

      // Full Synchronization: deactivate active products absent from the sheet.
      if (mode === "Full Synchronization") {
        const toDeactivate = products.filter((p) => p.active && !seenSkus.has(p.sku));
        for (const p of toDeactivate) {
          await tx.product.update({ where: { id: p.id }, data: { active: false } });
          deactivated++;
        }
      }

      await logAudit(tx, {
        orgId: session.orgId,
        userId: session.userId,
        userName: session.name,
        action: `Imported stock (${mode}) — ${updated} updated, ${created} created, ${deactivated} deactivated, ${failed} failed`,
        entityType: "Import",
      });

      return { updated, created, deactivated, failed };
    });

    revalidatePath("/warehouse/inventory");
    revalidatePath("/warehouse/log");
    revalidatePath("/warehouse/import");
    return { ok: true, summary };
  } catch {
    return { ok: false, error: "Import failed. No changes were applied." };
  }
}

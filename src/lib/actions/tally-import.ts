"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireVerifiedSession, setOrgConfig, withOrg } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { mapRows, skuFor, type TallyStockRow } from "@/lib/tally/stock-summary";

/**
 * Loads Tally's Stock Summary into the product master.
 *
 * Tally is the system of record for what a product IS — its name, its group,
 * what it cost. This brings that across so the two systems describe the same
 * catalogue, and so a warehouse stock valuation here can be compared with the
 * closing balance there without translation.
 *
 * Matching is by generated SKU, derived from the group and item name, because
 * this export carries no item code and no GUID. That makes a repeat import of
 * the same file idempotent, but it also means renaming an item in Tally creates
 * a second product here. `Product.tallyGuid` is the real fix and the connector
 * should populate it — see docs/tally-formats.md.
 */

const rowSchema = z.object({
  group: z.string().max(200),
  name: z.string().max(300),
  qty: z.number().int().nullable(),
  rateCents: z.number().int().nullable(),
  valueCents: z.number().int().nullable(),
});

const inputSchema = z.object({
  rows: z.array(rowSchema).max(5000),
  /** Whether quantities in the file overwrite what the warehouse holds. */
  applyQuantities: z.boolean(),
});

export type TallyPreviewRow = {
  sku: string;
  name: string;
  group: string;
  brand: string;
  channel: "RETAIL" | "SALON";
  qty: number;
  priceCents: number;
  action: "create" | "update";
  /** Current warehouse quantity, for an update. */
  currentQty: number | null;
};

export type TallyPreview = {
  ok: boolean;
  rows: TallyPreviewRow[];
  createCount: number;
  updateCount: number;
  errors: string[];
  warnings: string[];
  /** Total closing value in the file, for comparison against Tally's own total. */
  fileValueCents: number;
};

export async function previewTallyStock(input: {
  rows: TallyStockRow[];
  applyQuantities: boolean;
}): Promise<TallyPreview> {
  const parsed = inputSchema.parse(input);
  const session = await requireVerifiedSession("WAREHOUSE_MANAGER");

  const mapped = mapRows(parsed.rows as TallyStockRow[]);
  const products = await withOrg(session.orgId, (tx) =>
    tx.product.findMany({ where: { orgId: session.orgId }, select: { sku: true, stock: true } })
  );
  const bySku = new Map(products.map((p) => [p.sku, p]));

  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const rows: TallyPreviewRow[] = [];

  for (const m of mapped) {
    const sku = skuFor(m.group, m.name);
    if (seen.has(sku)) {
      // Two rows that normalise to the same item — a genuine duplicate in the
      // sheet. Reported rather than silently letting the last one win.
      errors.push(`Duplicate item in the file: “${m.name}” under ${m.group}`);
      continue;
    }
    seen.add(sku);
    const existing = bySku.get(sku);
    if (m.priceCents === 0) {
      warnings.push(`${m.name} has no rate in Tally — it will import at zero cost.`);
    }
    rows.push({
      sku,
      name: m.name,
      group: m.group,
      brand: m.brand,
      channel: m.channel,
      qty: m.qty,
      priceCents: m.priceCents,
      action: existing ? "update" : "create",
      currentQty: existing?.stock ?? null,
    });
  }

  return {
    ok: errors.length === 0 && rows.length > 0,
    rows,
    createCount: rows.filter((r) => r.action === "create").length,
    updateCount: rows.filter((r) => r.action === "update").length,
    errors,
    warnings: warnings.slice(0, 25),
    fileValueCents: parsed.rows.reduce((s, r) => s + (r.valueCents ?? 0), 0),
  };
}

export type TallyImportResult =
  | { ok: true; created: number; updated: number; adjusted: number }
  | { ok: false; error: string };

export async function confirmTallyStock(input: {
  rows: TallyStockRow[];
  applyQuantities: boolean;
}): Promise<TallyImportResult> {
  const parsed = inputSchema.parse(input);
  const session = await requireVerifiedSession("WAREHOUSE_MANAGER");
  const mapped = mapRows(parsed.rows as TallyStockRow[]);
  if (mapped.length === 0) return { ok: false, error: "Nothing to import." };

  try {
    const summary = await prisma.$transaction(
      async (tx) => {
        await setOrgConfig(tx, session.orgId);
        const existing = await tx.product.findMany({
          where: { orgId: session.orgId },
          select: { id: true, sku: true, stock: true },
        });
        const bySku = new Map(existing.map((p) => [p.sku, p]));

        let created = 0;
        let updated = 0;
        let adjusted = 0;
        const seen = new Set<string>();

        for (const m of mapped) {
          const sku = skuFor(m.group, m.name);
          if (seen.has(sku)) continue;
          seen.add(sku);
          const found = bySku.get(sku);

          if (!found) {
            const product = await tx.product.create({
              data: {
                orgId: session.orgId,
                sku,
                name: m.name,
                brand: m.brand,
                category: m.category,
                unit: "Nos",
                priceCents: m.priceCents,
                stock: parsed.applyQuantities ? m.qty : 0,
                // The group's channel decides where the item can appear. A
                // salon-use item must never reach the till by default.
                sellRetail: m.channel === "RETAIL",
                salonUse: m.channel === "SALON",
              },
              select: { id: true },
            });
            created++;
            if (parsed.applyQuantities && m.qty !== 0) {
              await tx.stockMovement.create({
                data: {
                  orgId: session.orgId,
                  productId: product.id,
                  userId: session.userId,
                  prevQty: 0,
                  newQty: m.qty,
                  action: "Opening stock · imported from Tally",
                },
              });
              adjusted++;
            }
            continue;
          }

          // Never overwrite a name or a channel on an existing product: those
          // may have been corrected here deliberately. Cost and, optionally,
          // quantity are what Tally is authoritative for.
          await tx.product.update({
            where: { id: found.id },
            data: {
              priceCents: m.priceCents,
              category: m.category,
              ...(parsed.applyQuantities ? { stock: m.qty } : {}),
            },
          });
          updated++;

          if (parsed.applyQuantities && found.stock !== m.qty) {
            // Every change of a stock figure goes through the ledger, so the
            // warehouse can always answer where a number came from.
            await tx.stockMovement.create({
              data: {
                orgId: session.orgId,
                productId: found.id,
                userId: session.userId,
                prevQty: found.stock,
                newQty: m.qty,
                action: "Stock reconciled to Tally",
              },
            });
            adjusted++;
          }
        }

        await logAudit(tx, {
          orgId: session.orgId,
          userId: session.userId,
          userName: session.name,
          action: `Imported Tally stock summary — ${created} created, ${updated} updated${
            parsed.applyQuantities ? `, ${adjusted} quantities reconciled` : ", quantities left alone"
          }`,
          entityType: "Product",
        });

        return { created, updated, adjusted };
      },
      // 531 items with a ledger entry each is well past the default budget.
      { timeout: 120_000, maxWait: 20_000 }
    );

    revalidatePath("/warehouse/inventory");
    revalidatePath("/warehouse/stock-summary");
    return { ok: true, ...summary };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return {
      ok: false,
      error: msg.includes("Unique constraint")
        ? "Two items in the file map to the same product. Check for duplicates and try again."
        : "The import could not be completed. Nothing was changed.",
    };
  }
}

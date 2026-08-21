import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withOrg } from "@/lib/tenant";
import { unauthorized } from "@/server/api/auth";
import { resolveTallyContext } from "@/server/api/tally-auth";

/// Tally integration — inbound purchases (goods received into the warehouse).
///
/// Purchase invoices are keyed in Tally because that is where input credit is
/// claimed, so Tally is the origin for stock coming IN. This is the goods
/// receipt Salon OS has never had: until now the only way to raise warehouse
/// stock was an import that replaced the count, which is why the stock summary
/// reports imports as adjustments rather than purchases.
///
/// Nothing here is published back to Tally. These movements originate there,
/// and echoing them would double the stock — see TxnOrigin in the schema.

type LineIn = { GUID?: unknown; QTY?: unknown; RATE?: unknown; BATCHNO?: unknown; EXPIRYDATE?: unknown };
type PurchaseIn = { REF?: unknown; TRANSDATE?: unknown; SUPPLIER?: unknown; DETAIL?: unknown };

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/// Accepts "2026-06-30" or "30/Jun/2026". Anything ambiguous is refused rather
/// than guessed — an expiry read a month wrong either writes off good stock or
/// leaves expired stock on a shelf.
function parseDate(v: unknown): Date | null {
  const s = str(v);
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
  const tally = /^(\d{1,2})\/([A-Za-z]{3})\/(\d{4})$/.exec(s);
  if (tally) {
    const m = MONTHS.indexOf(tally[2].toLowerCase());
    if (m < 0) return null;
    return new Date(Date.UTC(+tally[3], m, +tally[1]));
  }
  return null;
}

export async function POST(req: NextRequest) {
  let body: { purchases?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  // Authenticated after parsing: the connector's key may arrive in the body.
  const ctx = await resolveTallyContext(req, body as Record<string, unknown>);
  if (ctx === "RATE_LIMITED") {
    return NextResponse.json(
      { error: "Too many failed attempts. Try again shortly." },
      { status: 429 },
    );
  }
  if (!ctx) return unauthorized();
  if (!Array.isArray(body.purchases)) {
    return NextResponse.json({ error: "Expected { purchases: [ … ] }." }, { status: 400 });
  }
  // A trusted caller, but a full master export arriving as one payload would
  // hold a transaction open while it looped. Capped so an accidental bulk send
  // is a clear error rather than an outage.
  if (body.purchases.length > 1000) {
    return NextResponse.json(
      { error: "Too many purchases in one request. Send at most 1000 and page the rest." },
      { status: 413 },
    );
  }

  let applied = 0;
  let skipped = 0;
  let batches = 0;
  const rejected: Array<{ ref: string; why: string }> = [];

  await withOrg(ctx.orgId, async (tx) => {
    for (const p of body.purchases as PurchaseIn[]) {
      const ref = str(p?.REF);
      if (!ref) {
        rejected.push({ ref: "(none)", why: "Missing REF" });
        continue;
      }
      if (!Array.isArray(p.DETAIL) || p.DETAIL.length === 0) {
        rejected.push({ ref, why: "No DETAIL lines" });
        continue;
      }

      // Date-range polling re-delivers the same document, so a receipt already
      // applied must be a no-op rather than a second helping of stock. The
      // ledger is the record of what was applied, so it is also the check.
      const seen = await tx.stockMovement.findFirst({
        where: { action: { startsWith: `Purchase · ${ref}` } },
        select: { id: true },
      });
      if (seen) {
        skipped += 1;
        continue;
      }

      for (const raw of p.DETAIL as LineIn[]) {
        const guid = str(raw?.GUID);
        const qty = num(raw?.QTY);
        if (!guid || qty === null || qty <= 0) {
          rejected.push({ ref, why: `Line missing GUID or quantity` });
          continue;
        }

        const product = await tx.product.findFirst({
          where: { tallyGuid: guid },
          select: { id: true, stock: true },
        });
        if (!product) {
          // Masters must land before the movements that reference them, the
          // same order Tally itself requires when importing a voucher.
          rejected.push({ ref, why: `No product linked to GUID ${guid} — sync item masters first` });
          continue;
        }

        const units = Math.round(qty);
        await tx.stockMovement.create({
          data: {
            orgId: ctx.orgId,
            productId: product.id,
            prevQty: product.stock,
            newQty: product.stock + units,
            action: `Purchase · ${ref}${str(p.SUPPLIER) ? ` · ${str(p.SUPPLIER)}` : ""}`,
          },
        });
        await tx.product.update({
          where: { id: product.id },
          data: { stock: product.stock + units },
        });

        // Expiry, when the supplier's lot carries it. This is what finally
        // populates the batch register from real receipts rather than by hand.
        const expiry = parseDate(raw.EXPIRYDATE);
        const batchNo = str(raw.BATCHNO);
        if (expiry && batchNo) {
          const existing = await tx.productBatch.findFirst({
            where: { productId: product.id, batchNo, branchId: null },
            select: { id: true, qty: true },
          });
          if (existing) {
            await tx.productBatch.update({
              where: { id: existing.id },
              data: { qty: existing.qty + units, expiryDate: expiry },
            });
          } else {
            await tx.productBatch.create({
              data: {
                orgId: ctx.orgId,
                productId: product.id,
                batchNo,
                expiryDate: expiry,
                qty: units,
                branchId: null,
              },
            });
          }
          batches += 1;
        }
      }

      applied += 1;
    }
  });

  return NextResponse.json({
    APPLIED: applied,
    /// Already received on an earlier poll; overlapping windows are expected.
    SKIPPED_DUPLICATE: skipped,
    BATCHES_RECORDED: batches,
    REJECTED: rejected,
  });
}

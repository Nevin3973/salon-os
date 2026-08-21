import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withOrg } from "@/lib/tenant";
import { unauthorized } from "@/server/api/auth";
import { resolveTallyContext } from "@/server/api/tally-auth";

/// Tally integration — inbound item masters.
///
/// Tally owns the fiscal attributes of a product: HSN, GST rate, unit and the
/// name the books use. If those drift between the two systems the client's
/// returns are wrong, so Tally is the source and Salon OS follows.
///
/// Salon OS keeps its own operational attributes — images, rack locations,
/// retail and salon-use flags, minimum stock — and this route never touches
/// them. A master sync that overwrote the catalogue every night would undo the
/// warehouse team's work daily.

type ItemIn = {
  GUID?: unknown;
  NAME?: unknown;
  PRDCODE?: unknown;
  HSN?: unknown;
  "TAX RATE"?: unknown;
  UNIT?: unknown;
  GROUP?: unknown;
  CATEGORY?: unknown;
  MRP?: unknown;
  PURCHASERATE?: unknown;
};

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

/// Tally sends money as a decimal string or number; we store integer paise.
const paise = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

const pct = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.round(n) : null;
};

export async function POST(req: NextRequest) {
  let body: { items?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  // Authenticated after parsing: the connector's key may arrive in the body.
  const ctx = await resolveTallyContext(req, body as Record<string, unknown>);
  if (!ctx) return unauthorized();
  if (!Array.isArray(body.items)) {
    return NextResponse.json({ error: "Expected { items: [ … ] }." }, { status: 400 });
  }

  const created: string[] = [];
  const updated: string[] = [];
  const rejected: Array<{ item: string; why: string }> = [];

  await withOrg(ctx.orgId, async (tx) => {
    for (const raw of body.items as ItemIn[]) {
      const guid = str(raw?.GUID);
      const name = str(raw?.NAME);

      // The GUID is non-negotiable. Item names get edited in the normal course
      // of bookkeeping, and a name-matched row silently re-links to the wrong
      // product — or creates a duplicate — with no error to notice.
      if (!guid) {
        rejected.push({ item: name ?? "(unnamed)", why: "Missing GUID" });
        continue;
      }
      if (!name) {
        rejected.push({ item: guid, why: "Missing NAME" });
        continue;
      }

      const fiscal = {
        name,
        ...(str(raw.HSN) ? { hsn: str(raw.HSN)! } : {}),
        ...(pct(raw["TAX RATE"]) !== null ? { gstRate: pct(raw["TAX RATE"])! } : {}),
        ...(str(raw.UNIT) ? { unit: str(raw.UNIT)! } : {}),
        ...(str(raw.CATEGORY) ? { category: str(raw.CATEGORY)! } : {}),
        ...(str(raw.GROUP) ? { brand: str(raw.GROUP)! } : {}),
        ...(paise(raw.PURCHASERATE) !== null ? { priceCents: paise(raw.PURCHASERATE)! } : {}),
      };

      const existing = await tx.product.findFirst({
        where: { tallyGuid: guid },
        select: { id: true },
      });

      if (existing) {
        await tx.product.update({ where: { id: existing.id }, data: fiscal });
        updated.push(guid);
        continue;
      }

      // Not linked yet. An unlinked product with the same code is almost
      // certainly the same item, so adopt it rather than creating a duplicate
      // catalogue entry beside it.
      const code = str(raw.PRDCODE);
      const bySku = code
        ? await tx.product.findFirst({ where: { sku: code, tallyGuid: null }, select: { id: true } })
        : null;

      if (bySku) {
        await tx.product.update({ where: { id: bySku.id }, data: { ...fiscal, tallyGuid: guid } });
        updated.push(guid);
        continue;
      }

      await tx.product.create({
        data: {
          orgId: ctx.orgId,
          tallyGuid: guid,
          sku: code ?? `TALLY-${guid.slice(0, 12)}`,
          name,
          brand: str(raw.GROUP) ?? "—",
          category: str(raw.CATEGORY) ?? "Uncategorized",
          unit: str(raw.UNIT) ?? "unit",
          hsn: str(raw.HSN),
          gstRate: pct(raw["TAX RATE"]) ?? 0,
          priceCents: paise(raw.PURCHASERATE) ?? 0,
          retailPriceCents: paise(raw.MRP) ?? 0,
          // Arrives inactive on purpose: a product cannot be ordered or sold
          // until someone decides whether it is retail stock, salon-use stock
          // or both. Tally does not carry that distinction, and guessing it
          // would put back-bar consumables on the till.
          active: false,
        },
      });
      created.push(guid);
    }
  });

  return NextResponse.json({
    CREATED: created.length,
    UPDATED: updated.length,
    REJECTED: rejected,
    /// New items land inactive and invisible until the warehouse classifies
    /// them. Surfaced here so the connector's operator can see it is expected.
    NOTE: created.length
      ? "New items are created inactive until classified as retail or salon-use in Salon OS."
      : undefined,
  });
}

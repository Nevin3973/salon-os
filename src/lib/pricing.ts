import type { Role } from "@prisma/client";

/**
 * Which price a console values stock at.
 *
 * The two sides of this business look at the same bottle and see different
 * money. The warehouse buys it, so its console is denominated in what was
 * PAID — that is the number a stock valuation, a purchase order and the Tally
 * closing balance all have to agree on. A salon sells it, so its console is
 * denominated in MRP — the number on the pack, the number the manager quotes a
 * customer, and the number their shelf is worth as revenue.
 *
 * Supplier cost is the owner's commercial position. A branch manager who can
 * read it can also work out the owner's margin with every distributor, so it
 * stays behind `showCostToManager`, which is off unless the owner turns it on.
 */
export type PriceBasis = "COST" | "MRP";

export function priceBasisFor(role: Role, showCostToManager: boolean): PriceBasis {
  switch (role) {
    // Buys the stock and answers for its valuation.
    case "WAREHOUSE_MANAGER":
    case "SUPER_ADMIN":
      return "COST";
    // Sells the stock. Sees cost only when the owner has opened it up.
    case "PURCHASE_MANAGER":
      return showCostToManager ? "COST" : "MRP";
    case "SALON_STAFF":
      return "MRP";
  }
}

/** Column heading for whichever basis is in force. */
export function priceLabel(basis: PriceBasis): string {
  return basis === "COST" ? "Purchase price" : "MRP";
}

type Priceable = { priceCents: number; retailPriceCents: number; gstRate: number };

/**
 * MRP — what the customer pays, GST included.
 *
 * `retailPriceCents` is held exclusive of GST because that is what an invoice
 * line needs. MRP is a tax-INCLUSIVE figure by law, so the two differ by the
 * tax and must not be used interchangeably: quoting the ex-GST number as "MRP"
 * understates the shelf price by up to 28%.
 */
export function mrpCents(p: { retailPriceCents: number; gstRate: number }): number {
  return p.retailPriceCents + Math.round((p.retailPriceCents * p.gstRate) / 100);
}

/**
 * The figure to print for a product, or `null` when there isn't one.
 *
 * Null is a real answer, not a failure: a back-bar-only item has no MRP because
 * it is never sold, and an unpriced retail line genuinely cannot be quoted. Both
 * must read as "no price", never as ₹0.00 — a zero here looks like a free
 * product and has been acted on as one.
 */
export function displayPriceCents(p: Priceable, basis: PriceBasis): number | null {
  if (basis === "COST") return p.priceCents > 0 ? p.priceCents : null;
  const mrp = mrpCents(p);
  return mrp > 0 ? mrp : null;
}

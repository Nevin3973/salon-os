import Link from "next/link";
import { requireScopedSession } from "@/lib/tenant";
import { PosTerminal, type Sellable } from "./pos-terminal";

export default async function SellPage() {
  const { session, db } = await requireScopedSession(["PURCHASE_MANAGER", "SALON_STAFF"]);
  const branchId = session.locationId ?? undefined;

  const stock = branchId
    ? await db.branchStock.findMany({
        where: { branchId, onHand: { gt: 0 } },
        include: { product: true },
      })
    : [];

  const items: Sellable[] = stock
    .filter((s) => s.product.active && s.product.retailPriceCents > 0)
    .map((s) => ({
      productId: s.productId,
      sku: s.product.sku,
      name: s.product.name,
      brand: s.product.brand,
      unit: s.product.unit,
      category: s.product.category,
      retailPriceCents: s.product.retailPriceCents,
      gstRate: s.product.gstRate,
      hsn: s.product.hsn,
      onHand: s.onHand,
      rackId: s.rackId,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!branchId) {
    return (
      <p className="text-muted">Your account isn’t assigned to a branch, so there’s nothing to sell from.</p>
    );
  }

  if (items.length === 0) {
    const isManager = session.role === "PURCHASE_MANAGER";
    return (
      <div className="max-w-lg">
        <h1 className="text-2xl font-semibold">Sell to a customer</h1>
        <p className="text-muted text-sm mt-2">
          Nothing is on your shelf yet. Stock arrives here automatically when the warehouse delivers an
          order.
          {isManager ? (
            <>
              {" "}You can also adjust counts under{" "}
              <Link href="/salon/inventory" className="text-velvet hover:text-velvet-dark">My inventory</Link>.
              If a product has no retail price, head office needs to set one first.
            </>
          ) : (
            <> Ask your branch manager if you think something should be in stock.</>
          )}
        </p>
        {isManager && (
          <Link
            href="/purchase-manager/catalogue"
            className="inline-flex mt-4 h-10 px-5 items-center rounded-lg bg-velvet text-on-velvet text-sm font-semibold hover:bg-velvet-dark transition-colors"
          >
            Shop for supplies
          </Link>
        )}
      </div>
    );
  }

  return <PosTerminal items={items} />;
}

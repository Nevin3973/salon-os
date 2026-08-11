import Link from "next/link";
import { requireScopedSession } from "@/lib/tenant";
import { PosTerminal, type Sellable, type StaffOption } from "./pos-terminal";
import { optimizedImage } from "@/lib/cloudinary";

export default async function SellPage() {
  const { session, db } = await requireScopedSession(["PURCHASE_MANAGER", "SALON_STAFF"]);
  const branchId = session.locationId ?? undefined;

  // RETAIL only. Salon-use stock is held for services and must never appear on
  // the till, or a cashier will sell the back bar's open bottles.
  const stock = branchId
    ? await db.branchStock.findMany({
        where: { branchId, kind: "RETAIL", onHand: { gt: 0 } },
        include: { product: true },
      })
    : [];

  // Everyone who can be credited with a sale here: staff pinned to this
  // branch, plus anyone who covers several (branchId null). Read from Staff
  // rather than User, because most stylists never sign in and should not need
  // a login account to be creditable.
  const staff: StaffOption[] = branchId
    ? (
        await db.staff.findMany({
          where: { isActive: true, OR: [{ branchId }, { branchId: null }] },
          select: { id: true, name: true, title: true },
          orderBy: { name: "asc" },
        })
      ).map((m) => ({ id: m.id, name: m.name, title: m.title }))
    : [];

  const items: Sellable[] = stock
    .filter((s) => s.product.active && s.product.retailPriceCents > 0)
    .map((s) => ({
      productId: s.productId,
      sku: s.product.sku,
      barcode: s.product.barcode,
      name: s.product.name,
      brand: s.product.brand,
      unit: s.product.unit,
      category: s.product.category,
      retailPriceCents: s.product.retailPriceCents,
      gstRate: s.product.gstRate,
      hsn: s.product.hsn,
      onHand: s.onHand,
      rackId: s.rackId,
      // Served through Cloudinary's transform so the till pulls a small,
      // format-optimised image rather than the full upload — a counter on a
      // slow connection should not wait on product photos.
      imageUrl: s.product.imageUrl ? optimizedImage(s.product.imageUrl, 200) : null,
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

  return <PosTerminal items={items} staff={staff} />;
}

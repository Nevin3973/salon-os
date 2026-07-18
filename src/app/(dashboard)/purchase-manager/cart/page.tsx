import Link from "next/link";
import { requireScopedSession, activeLocationName } from "@/lib/tenant";
import { reservedByProduct, availableOf } from "@/lib/stock";
import { CartView, type CartAddress } from "./cart-view";

export default async function CartPage() {
  const { session, db } = await requireScopedSession("PURCHASE_MANAGER");
  const branchName = await activeLocationName();

  const [items, addresses] = await Promise.all([
    db.cartItem.findMany({
      where: { userId: session.userId },
      include: { product: true },
      orderBy: { createdAt: "asc" },
    }),
    db.address.findMany({
      where: { locationId: session.locationId ?? undefined, isActive: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    }),
  ]);

  const reserved = await reservedByProduct(session.orgId);

  const lines = items.map((it) => {
    const available = availableOf(it.product.stock, reserved.get(it.productId) ?? 0);
    return {
      productId: it.productId,
      name: it.product.name,
      brand: it.product.brand,
      unit: it.product.unit,
      qty: it.qty,
      note: it.note ?? "",
      available,
      isRequirement: it.qty > available,
    };
  });

  const addressData: CartAddress[] = addresses.map((a) => ({
    id: a.id,
    label: a.label,
    summary: [a.line1, a.line2, a.city, a.state, a.postalCode].filter(Boolean).join(", "),
    isDefault: a.isDefault,
  }));

  if (lines.length === 0) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <h1 className="font-display text-2xl font-bold">Your cart is empty</h1>
        <p className="text-muted mt-2">Browse the catalogue and add the supplies your branch needs.</p>
        <Link
          href="/purchase-manager/catalogue"
          className="inline-block mt-6 px-7 h-12 leading-[48px] rounded-full bg-velvet text-white text-sm font-semibold hover:bg-velvet-dark transition-colors"
        >
          Start shopping
        </Link>
      </div>
    );
  }

  return <CartView lines={lines} branchName={branchName} addresses={addressData} />;
}

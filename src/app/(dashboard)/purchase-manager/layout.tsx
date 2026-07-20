import { requireScopedSession, activeOrgName, activeLocationName } from "@/lib/tenant";
import { getCartCount } from "@/lib/actions/orders";
import { StorefrontHeader } from "./storefront-header";

export default async function PurchaseManagerLayout({ children }: { children: React.ReactNode }) {
  const { session, db } = await requireScopedSession("PURCHASE_MANAGER");
  const [orgName, branchName, cartCount, products] = await Promise.all([
    activeOrgName(),
    activeLocationName(),
    getCartCount(),
    db.product.findMany({ where: { active: true }, select: { category: true } }),
  ]);
  const categories = Array.from(new Set(products.map((p) => p.category))).sort();

  return (
    <div className="theme-store min-h-screen bg-bg text-ink">
      <StorefrontHeader
        userName={session.name}
        orgName={orgName}
        branchName={branchName}
        cartCount={cartCount}
        categories={categories}
      />
      <main className="max-w-[1500px] mx-auto px-3 sm:px-4 py-4">{children}</main>
    </div>
  );
}

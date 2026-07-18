import { requireSession, activeOrgName, activeLocationName } from "@/lib/tenant";
import { getCartCount } from "@/lib/actions/orders";
import { StorefrontHeader } from "./storefront-header";

export default async function PurchaseManagerLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession("PURCHASE_MANAGER");
  const [orgName, branchName, cartCount] = await Promise.all([
    activeOrgName(),
    activeLocationName(),
    getCartCount(),
  ]);

  return (
    <div className="theme-store min-h-screen bg-bg text-ink">
      <StorefrontHeader
        userName={session.name}
        orgName={orgName}
        branchName={branchName}
        cartCount={cartCount}
      />
      <main className="max-w-6xl mx-auto px-6 py-6">{children}</main>
    </div>
  );
}

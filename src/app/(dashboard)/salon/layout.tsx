import { requireScopedSession, activeOrgName, activeLocationName } from "@/lib/tenant";
import { OpsShell } from "@/components/ops-shell";

/**
 * The salon-manager's operational console — the "selling" side, kept separate
 * from the storefront where they "buy" supplies. Same person, same branch, two
 * modes: shop for stock in the marketplace, run the counter here.
 */
export default async function SalonLayout({ children }: { children: React.ReactNode }) {
  const { session } = await requireScopedSession(["PURCHASE_MANAGER", "SALON_STAFF"]);
  const [orgName, branchName] = await Promise.all([activeOrgName(), activeLocationName()]);
  const isManager = session.role === "PURCHASE_MANAGER";

  // Cashiers only sell and reprint their own bills; managers get inventory,
  // reports and the supply storefront too.
  const items = [
    { label: "Sell", href: "/salon/sell", icon: "cart" as const },
    { label: "Bills", href: "/salon/bills", icon: "receipt" as const },
    ...(isManager
      ? [
          { label: "My inventory", href: "/salon/inventory", icon: "boxes" as const },
          { label: "Sales report", href: "/salon/reports", icon: "chart" as const },
          { label: "Shop supplies", href: "/purchase-manager/catalogue", icon: "store" as const },
        ]
      : []),
  ];

  return (
    <div className="bg-bg text-ink min-h-screen">
      <OpsShell
        brand="Beyond Demands"
        subtitle={isManager ? (branchName ?? "Salon") : `${branchName ?? "Salon"} · Counter`}
        userName={session.name}
        orgName={orgName}
        items={items}
      >
        {children}
      </OpsShell>
    </div>
  );
}

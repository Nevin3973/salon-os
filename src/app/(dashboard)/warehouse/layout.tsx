import { requireScopedSession, activeOrgBranding } from "@/lib/tenant";
import { OpsShell } from "@/components/ops-shell";
import { versionLabel } from "@/lib/version";
import { DesktopOnly } from "@/components/desktop-only";

export default async function WarehouseLayout({ children }: { children: React.ReactNode }) {
  const { session, db } = await requireScopedSession("WAREHOUSE_MANAGER");
  const org = await activeOrgBranding();

  const [queueCount, outstandingOrders] = await Promise.all([
    db.order.count({ where: { status: { in: ["PENDING", "PROCESSING"] } } }),
    db.order.findMany({
      where: { status: "PARTIALLY_FULFILLED" },
      select: { items: { select: { requestedQty: true, deliveredQty: true } } },
    }),
  ]);
  const outstandingCount = outstandingOrders.reduce(
    (sum, o) => sum + o.items.filter((it) => it.deliveredQty < it.requestedQty).length,
    0
  );

  return (
    <DesktopOnly what="The warehouse console">
    <div className="theme-ops bg-bg text-ink min-h-screen">
      <OpsShell
        brand="Salon OS"
        subtitle="Warehouse"
        userName={session.name}
        orgName={org.name}
        orgLogoUrl={org.logoUrl}
        version={versionLabel()}
        items={[
          { label: "Order queue", href: "/warehouse/queue", icon: "queue", badge: queueCount || undefined },
          { label: "Pending supplies", href: "/warehouse/outstanding", icon: "clock", badge: outstandingCount || undefined },
          { label: "Inventory", href: "/warehouse/inventory", icon: "boxes" },
          { label: "Returns", href: "/warehouse/returns", icon: "undo" },
          { label: "Expiry", href: "/warehouse/expiry", icon: "undo" },
          { label: "Stock summary", href: "/warehouse/stock-summary", icon: "undo" },
          { label: "Import", href: "/warehouse/import", icon: "upload" },
          { label: "Movement log", href: "/warehouse/log", icon: "list" },
        ]}
      >
        {children}
      </OpsShell>
    </div>
    </DesktopOnly>
  );
}

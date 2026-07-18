import { requireScopedSession, activeOrgName } from "@/lib/tenant";
import { OpsShell } from "@/components/ops-shell";

export default async function WarehouseLayout({ children }: { children: React.ReactNode }) {
  const { session, db } = await requireScopedSession("WAREHOUSE_MANAGER");
  const orgName = await activeOrgName();

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
    <div className="theme-ops bg-bg text-ink min-h-screen">
      <OpsShell
        brand="Velvet"
        subtitle="Operations"
        userName={session.name}
        orgName={orgName}
        items={[
          { label: "Order queue", href: "/warehouse/queue", icon: "queue", badge: queueCount || undefined },
          { label: "Pending supplies", href: "/warehouse/outstanding", icon: "clock", badge: outstandingCount || undefined },
          { label: "Inventory", href: "/warehouse/inventory", icon: "boxes" },
          { label: "Import", href: "/warehouse/import", icon: "upload" },
          { label: "Movement log", href: "/warehouse/log", icon: "list" },
        ]}
      >
        {children}
      </OpsShell>
    </div>
  );
}

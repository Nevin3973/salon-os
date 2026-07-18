import { requireScopedSession, activeOrgName } from "@/lib/tenant";
import { TopNav } from "@/components/top-nav";

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
    <div className="min-h-screen">
      <TopNav
        subtitle="Warehouse"
        userName={session.name}
        orgName={orgName}
        items={[
          { label: "Queue", href: "/warehouse/queue", badge: queueCount || undefined },
          { label: "Outstanding", href: "/warehouse/outstanding", badge: outstandingCount || undefined },
          { label: "Inventory", href: "/warehouse/inventory" },
          { label: "Import", href: "/warehouse/import" },
          { label: "Log", href: "/warehouse/log" },
        ]}
      />
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}

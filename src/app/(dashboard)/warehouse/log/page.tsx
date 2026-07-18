import { requireScopedSession } from "@/lib/tenant";
import { fmtDateTime } from "@/lib/format";

export default async function LogPage() {
  const { db } = await requireScopedSession("WAREHOUSE_MANAGER");

  const movements = await db.stockMovement.findMany({
    include: { product: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  // Resolve user names (StockMovement.userId has no relation).
  const userIds = [...new Set(movements.map((m) => m.userId).filter(Boolean) as string[])];
  const memberships = await db.membership.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, user: { select: { name: true } } },
  });
  const nameOf = new Map(memberships.map((m) => [m.userId, m.user.name]));

  return (
    <div>
      <div className="mb-4">
        <h1 className="font-display text-2xl font-semibold">Inventory log</h1>
        <p className="text-muted text-sm mt-1">
          Every stock movement — dispatches, adjustments, imports and outstanding fulfilments — with
          previous and new levels.
        </p>
      </div>

      <div className="bg-surface border border-line rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-faint border-b border-line">
                <th className="p-3 font-medium">Time</th>
                <th className="p-3 font-medium">User</th>
                <th className="p-3 font-medium">Product</th>
                <th className="p-3 font-medium text-right">Prev</th>
                <th className="p-3 font-medium text-right">New</th>
                <th className="p-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {movements.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted">
                    No stock movements yet.
                  </td>
                </tr>
              )}
              {movements.map((m) => (
                <tr key={m.id} className="border-b border-line last:border-0">
                  <td className="p-3 text-muted whitespace-nowrap">{fmtDateTime(m.createdAt)}</td>
                  <td className="p-3 text-muted">{m.userId ? nameOf.get(m.userId) ?? "—" : "System"}</td>
                  <td className="p-3">{m.product.name}</td>
                  <td className="p-3 text-right tabular-nums text-faint">{m.prevQty}</td>
                  <td className="p-3 text-right tabular-nums">{m.newQty}</td>
                  <td className="p-3 text-muted">{m.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

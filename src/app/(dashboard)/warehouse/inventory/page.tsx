import { requireScopedSession } from "@/lib/tenant";
import { reservedByProduct, availableOf, stockState } from "@/lib/stock";
import { InventoryTable, type InventoryRow } from "./inventory-table";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { session, db } = await requireScopedSession("WAREHOUSE_MANAGER");
  const { filter } = await searchParams;

  const products = await db.product.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] });
  const reserved = await reservedByProduct(session.orgId);

  let rows: InventoryRow[] = products.map((p) => {
    const res = reserved.get(p.id) ?? 0;
    const available = availableOf(p.stock, res);
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      stock: p.stock,
      reserved: res,
      available,
      minStock: p.minStock,
      state: stockState(available, p.minStock),
      active: p.active,
    };
  });

  const totalCount = products.length;
  const lowCount = rows.filter((r) => r.state === "low").length;
  const outCount = rows.filter((r) => r.state === "out").length;

  if (filter === "low") rows = rows.filter((r) => r.state === "low");
  else if (filter === "out") rows = rows.filter((r) => r.state === "out");

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold text-ink">Inventory</h1>
        <p className="text-muted text-sm mt-2 leading-relaxed max-w-2xl">
          Reserved = committed to open orders. Available = stock − reserved, which is what branches
          see. Minimum stock is editable inline.
        </p>
        {/* Summary stat chips */}
        <div className="flex gap-3 mt-4 flex-wrap">
          <div className="glass-surface rounded-xl px-4 py-2.5 flex items-center gap-2">
            <span className="text-xs text-faint font-medium uppercase tracking-wider">Products</span>
            <span className="text-sm font-bold text-ink tabular-nums">{totalCount}</span>
          </div>
          {lowCount > 0 && (
            <div className="bg-low-soft border border-amber-200 rounded-xl px-4 py-2.5 flex items-center gap-2 animate-scale-in">
              <span className="w-2 h-2 rounded-full bg-low" />
              <span className="text-xs text-low font-semibold">{lowCount} low</span>
            </div>
          )}
          {outCount > 0 && (
            <div className="bg-out-soft border border-rose-200 rounded-xl px-4 py-2.5 flex items-center gap-2 animate-scale-in">
              <span className="w-2 h-2 rounded-full bg-out animate-pulse-soft" />
              <span className="text-xs text-out font-semibold">{outCount} out</span>
            </div>
          )}
        </div>
      </div>
      <InventoryTable rows={rows} activeFilter={filter ?? "all"} />
    </div>
  );
}

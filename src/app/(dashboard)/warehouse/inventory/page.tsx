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

  if (filter === "low") rows = rows.filter((r) => r.state === "low");
  else if (filter === "out") rows = rows.filter((r) => r.state === "out");

  return (
    <div>
      <div className="mb-4">
        <h1 className="font-display text-2xl font-semibold">Inventory</h1>
        <p className="text-muted text-sm mt-1">
          Reserved = committed to open orders. Available = stock − reserved, which is what branches
          see. Minimum stock is editable inline.
        </p>
      </div>
      <InventoryTable rows={rows} activeFilter={filter ?? "all"} />
    </div>
  );
}

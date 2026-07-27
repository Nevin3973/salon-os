import { requireScopedSession } from "@/lib/tenant";
import { formatMoney } from "@/lib/money";
import { AdjustCell } from "./adjust-cell";

export default async function SalonInventoryPage() {
  const { session, db } = await requireScopedSession("PURCHASE_MANAGER");
  const branchId = session.locationId ?? undefined;

  const [products, stock] = await Promise.all([
    db.product.findMany({ where: { active: true }, orderBy: [{ category: "asc" }, { name: "asc" }] }),
    branchId ? db.branchStock.findMany({ where: { branchId } }) : Promise.resolve([]),
  ]);
  const onHandOf = new Map(stock.map((s) => [s.productId, s.onHand]));

  const rows = products.map((p) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    category: p.category,
    unit: p.unit,
    retailPriceCents: p.retailPriceCents,
    onHand: onHandOf.get(p.id) ?? 0,
  }));

  const totalUnits = rows.reduce((s, r) => s + r.onHand, 0);
  const shelfValue = rows.reduce((s, r) => s + r.onHand * r.retailPriceCents, 0);

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold">My inventory</h1>
      <p className="text-muted text-sm mt-1">
        What this branch holds on its shelf. Stock arrives automatically when the warehouse delivers an order;
        selling draws it down. Correct a count by hand any time.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5">
        <Stat label="Products stocked" value={String(rows.filter((r) => r.onHand > 0).length)} />
        <Stat label="Units on shelf" value={String(totalUnits)} />
        <Stat label="Shelf value (retail)" value={formatMoney(shelfValue)} />
      </div>

      <div className="bg-surface border border-line rounded-[10px] overflow-x-auto mt-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-faint">
              <th className="font-medium px-4 py-3">Product</th>
              <th className="font-medium px-4 py-3">Category</th>
              <th className="font-medium px-4 py-3 text-right">Retail</th>
              <th className="font-medium px-4 py-3 text-right">On shelf</th>
              <th className="font-medium px-4 py-3 text-right">Adjust</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line-soft">
                <td className="px-4 py-3">
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-faint">{r.brand} · per {r.unit}</div>
                </td>
                <td className="px-4 py-3 text-muted">{r.category}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {r.retailPriceCents > 0 ? formatMoney(r.retailPriceCents) : <span className="text-faint">—</span>}
                </td>
                <td className={`px-4 py-3 text-right tabular-nums font-medium ${r.onHand === 0 ? "text-faint" : ""}`}>
                  {r.onHand}
                </td>
                <td className="px-4 py-3">
                  <AdjustCell productId={r.id} name={r.name} onHand={r.onHand} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface border border-line rounded-xl p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-2xl font-semibold mt-1 tabular-nums">{value}</div>
    </div>
  );
}

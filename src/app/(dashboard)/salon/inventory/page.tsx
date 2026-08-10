import { requireScopedSession } from "@/lib/tenant";
import { formatMoney } from "@/lib/money";
import { AdjustCell } from "./adjust-cell";
import { RackCell } from "./rack-cell";

export default async function SalonInventoryPage() {
  const { session, db } = await requireScopedSession("PURCHASE_MANAGER");
  const branchId = session.locationId ?? undefined;

  const [products, stock] = await Promise.all([
    db.product.findMany({ where: { active: true }, orderBy: [{ category: "asc" }, { name: "asc" }] }),
    branchId ? db.branchStock.findMany({ where: { branchId } }) : Promise.resolve([]),
  ]);
  // Keyed by pool as well as product. A branch can hold the same product in
  // both, so a Map keyed on productId alone would silently keep whichever row
  // the database returned last and report one pool's figure as the whole.
  const retailOf = new Map(
    stock.filter((s) => s.kind === "RETAIL").map((s) => [s.productId, s.onHand])
  );
  const salonUseOf = new Map(
    stock.filter((s) => s.kind === "SALON_USE").map((s) => [s.productId, s.onHand])
  );
  // The rack label belongs to the sellable stock — it is where a cashier looks.
  const rackOf = new Map(
    stock.filter((s) => s.kind === "RETAIL").map((s) => [s.productId, s.rackId])
  );

  const rows = products.map((p) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    category: p.category,
    unit: p.unit,
    retailPriceCents: p.retailPriceCents,
    onHand: retailOf.get(p.id) ?? 0,
    salonUse: salonUseOf.get(p.id) ?? 0,
    rackId: rackOf.get(p.id) ?? null,
  }));

  const totalUnits = rows.reduce((s, r) => s + r.onHand, 0);
  const salonUseUnits = rows.reduce((s, r) => s + r.salonUse, 0);
  // Value only the sellable pool: salon-use stock is a cost already incurred,
  // not inventory awaiting revenue, so counting it here would overstate what
  // the shelf is worth.
  const shelfValue = rows.reduce((s, r) => s + r.onHand * r.retailPriceCents, 0);

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold">My inventory</h1>
      <p className="text-muted text-sm mt-1">
        What this branch holds, split into what you sell and what you use. Stock arrives when the warehouse
        delivers an order; selling draws down the shelf. Correct either count by hand any time.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
        <Stat label="Products stocked" value={String(rows.filter((r) => r.onHand > 0).length)} />
        <Stat label="For sale" value={String(totalUnits)} />
        <Stat label="For salon use" value={String(salonUseUnits)} />
        <Stat label="Shelf value (retail)" value={formatMoney(shelfValue)} />
      </div>

      <div className="bg-surface border border-line rounded-[10px] overflow-x-auto mt-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-faint">
              <th className="font-medium px-4 py-3">Product</th>
              <th className="font-medium px-4 py-3">Category</th>
              <th className="font-medium px-4 py-3">Rack</th>
              <th className="font-medium px-4 py-3 text-right">Retail</th>
              <th className="font-medium px-4 py-3 text-right">For sale</th>
              <th className="font-medium px-4 py-3 text-right">Salon use</th>
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
                <td className="px-4 py-3">
                  <RackCell productId={r.id} rackId={r.rackId} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {r.retailPriceCents > 0 ? formatMoney(r.retailPriceCents) : <span className="text-faint">—</span>}
                </td>
                <td className={`px-4 py-3 text-right tabular-nums font-medium ${r.onHand === 0 ? "text-faint" : ""}`}>
                  {r.onHand}
                </td>
                <td className={`px-4 py-3 text-right tabular-nums ${r.salonUse === 0 ? "text-faint" : ""}`}>
                  {r.salonUse}
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

import { requireScopedSession } from "@/lib/tenant";
import { formatMoney } from "@/lib/money";
import { AdjustCell } from "./adjust-cell";
import { RackCell } from "./rack-cell";
import { CategoryVisibility } from "./category-visibility";
import { mrpCents } from "@/lib/pricing";

type Row = {
  id: string;
  name: string;
  brand: string;
  category: string;
  unit: string;
  mrpCents: number;
  onHand: number;
  salonUseQty: number;
  rackId: string | null;
  sellRetail: boolean;
  salonUse: boolean;
};

export default async function SalonInventoryPage() {
  const { session, db } = await requireScopedSession("PURCHASE_MANAGER");
  const branchId = session.locationId ?? undefined;

  const [products, stock] = await Promise.all([
    db.product.findMany({ where: { active: true }, orderBy: [{ category: "asc" }, { name: "asc" }] }),
    branchId ? db.branchStock.findMany({ where: { branchId } }) : Promise.resolve([]),
  ]);

  const branch = branchId
    ? await db.location.findFirst({ where: { id: branchId }, select: { posHiddenCategories: true } })
    : null;
  const hiddenCategories = branch?.posHiddenCategories ?? [];
  // Only retail categories can be hidden from the till, so offering the rest
  // would be offering a control that does nothing.
  const allCategories = [
    ...new Set(products.filter((p) => p.sellRetail).map((p) => p.category)),
  ].sort();

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

  const rows: Row[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    category: p.category,
    unit: p.unit,
    mrpCents: mrpCents(p),
    onHand: retailOf.get(p.id) ?? 0,
    salonUseQty: salonUseOf.get(p.id) ?? 0,
    rackId: rackOf.get(p.id) ?? null,
    sellRetail: p.sellRetail,
    salonUse: p.salonUse,
  }));

  const retailRows = rows.filter((r) => r.sellRetail);
  const salonRows = rows.filter((r) => r.salonUse);
  // The two flags are independent, so "neither" is reachable. Such a product
  // would otherwise appear on no screen at all and look like it had vanished,
  // so it is surfaced rather than filtered away.
  const unclassified = rows.filter((r) => !r.sellRetail && !r.salonUse);

  const totalUnits = retailRows.reduce((s, r) => s + r.onHand, 0);
  const salonUseUnits = salonRows.reduce((s, r) => s + r.salonUseQty, 0);
  // Value only the sellable pool: salon-use stock is a cost already incurred,
  // not inventory awaiting revenue, so counting it here would overstate what
  // the shelf is worth.
  const shelfValue = retailRows.reduce((s, r) => s + r.onHand * r.mrpCents, 0);

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold">My inventory</h1>
      <p className="text-muted text-sm mt-1">
        What this branch holds, kept in two separate lists: what you sell to customers, and what your
        stylists use during services. Stock arrives when the warehouse delivers an order; selling draws
        down the shelf. Correct either count by hand any time.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
        <Stat label="Lines on the shelf" value={String(retailRows.filter((r) => r.onHand > 0).length)} />
        <Stat label="Units for sale" value={String(totalUnits)} />
        <Stat label="Units for salon use" value={String(salonUseUnits)} />
        <Stat label="Shelf value (MRP)" value={formatMoney(shelfValue)} />
      </div>

      <Section
        title="Sales / shelf products"
        blurb="Sold to customers at the till. Only these appear on the POS."
        count={retailRows.length}
      >
        <CategoryVisibility categories={allCategories} hidden={hiddenCategories} />
        <Table rows={retailRows} kind="RETAIL" />
      </Section>

      <Section
        title="Salon products and consumables"
        blurb="Used during services — colour, developer, wax, tools, cleaning. Never offered at the till."
        count={salonRows.length}
      >
        <Table rows={salonRows} kind="SALON_USE" />
      </Section>

      {unclassified.length > 0 && (
        <Section
          title="Not yet classified"
          blurb="Ticked as neither sellable nor salon-use, so they appear on no other list. Set one in Admin → Products."
          count={unclassified.length}
        >
          <Table rows={unclassified} kind="RETAIL" />
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  blurb,
  count,
  children,
}: {
  title: string;
  blurb: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <div className="flex items-baseline gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        <span className="text-xs text-faint tabular-nums">{count}</span>
      </div>
      <p className="text-muted text-xs mt-0.5">{blurb}</p>
      {children}
    </section>
  );
}

/**
 * One pool's table. The columns differ by pool on purpose: a retail price and
 * a rack label are things a cashier needs and are meaningless against back-bar
 * stock, so showing them there would just be a column of dashes.
 */
function Table({ rows, kind }: { rows: Row[]; kind: "RETAIL" | "SALON_USE" }) {
  const retail = kind === "RETAIL";

  if (rows.length === 0) {
    return (
      <div className="bg-surface border border-line rounded-[10px] mt-3 px-4 py-6 text-sm text-muted">
        Nothing here yet.
      </div>
    );
  }

  return (
    <div className="bg-surface border border-line rounded-[10px] overflow-x-auto mt-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-faint">
            <th className="font-medium px-4 py-3">Product</th>
            <th className="font-medium px-4 py-3">Category</th>
            {retail && <th className="font-medium px-4 py-3">Rack</th>}
            {retail && <th className="font-medium px-4 py-3 text-right">MRP</th>}
            <th className="font-medium px-4 py-3 text-right">{retail ? "For sale" : "In use"}</th>
            <th className="font-medium px-4 py-3 text-right">Adjust</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const qty = retail ? r.onHand : r.salonUseQty;
            return (
              <tr key={r.id} className="border-t border-line-soft">
                <td className="px-4 py-3">
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-faint">
                    {r.brand} · per {r.unit}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted">{r.category}</td>
                {retail && (
                  <td className="px-4 py-3">
                    <RackCell productId={r.id} rackId={r.rackId} />
                  </td>
                )}
                {retail && (
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.mrpCents > 0 ? (
                      formatMoney(r.mrpCents)
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                )}
                <td
                  className={`px-4 py-3 text-right tabular-nums font-medium ${qty === 0 ? "text-faint" : ""}`}
                >
                  {qty}
                </td>
                <td className="px-4 py-3 text-right">
                  <AdjustCell
                    productId={r.id}
                    name={retail ? r.name : `${r.name} (salon use)`}
                    onHand={qty}
                    kind={kind}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface border border-line rounded-xl p-4">
      <div className="text-[11px] uppercase tracking-[0.1em] text-faint">{label}</div>
      <div className="text-xl font-semibold mt-1 tabular-nums">{value}</div>
    </div>
  );
}

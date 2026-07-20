import { requireScopedSession } from "@/lib/tenant";
import { reservedByProduct, availableOf, stockState } from "@/lib/stock";
import { ProductCard } from "./product-card";

export default async function CataloguePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string }>;
}) {
  const { session, db } = await requireScopedSession("PURCHASE_MANAGER");
  const { q, cat } = await searchParams;

  const products = await db.product.findMany({
    where: { active: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  const reserved = await reservedByProduct(session.orgId);

  const query = (q ?? "").trim().toLowerCase();
  const filtered = products.filter((p) => {
    if (cat && cat !== "All" && p.category !== cat) return false;
    if (!query) return true;
    return (
      p.name.toLowerCase().includes(query) ||
      p.brand.toLowerCase().includes(query) ||
      p.sku.toLowerCase().includes(query)
    );
  });

  const cards = filtered.map((p) => {
    const res = reserved.get(p.id) ?? 0;
    const available = availableOf(p.stock, res);
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      brand: p.brand,
      category: p.category,
      unit: p.unit,
      imageUrl: p.imageUrl,
      available,
      state: stockState(available, p.minStock),
    };
  });

  const heading = query
    ? `Results for “${q}”`
    : cat && cat !== "All"
    ? cat
    : "All supplies";

  return (
    <div>
      {/* Results bar */}
      <div className="bg-surface border border-line rounded-sm px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm">
          <span className="font-semibold">{heading}</span>
          <span className="text-muted"> · {cards.length} item{cards.length === 1 ? "" : "s"}</span>
        </div>
        <div className="text-xs text-muted">
          Out of stock items can still be ordered — the warehouse ships them when stock arrives.
        </div>
      </div>

      {cards.length === 0 ? (
        <div className="bg-surface border border-line rounded-sm mt-3 p-16 text-center">
          <p className="text-muted">No products match{query ? ` “${q}”` : ""}. Try a different search or category.</p>
        </div>
      ) : (
        <div
          className="grid gap-3 mt-3"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}
        >
          {cards.map((c) => (
            <ProductCard key={c.id} product={c} />
          ))}
        </div>
      )}
    </div>
  );
}

import { requireScopedSession } from "@/lib/tenant";
import { reservedByProduct, availableOf, stockState } from "@/lib/stock";
import { CategoryBar } from "./category-bar";
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

  const categories = Array.from(new Set(products.map((p) => p.category))).sort();

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
      available,
      state: stockState(available, p.minStock),
    };
  });

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display text-3xl font-semibold">Shop supplies</h1>
        <p className="text-muted text-sm mt-1">
          Availability is what the warehouse can promise today. Out-of-stock items can still be
          requested — place a requirement and the warehouse fulfils it when stock lands.
        </p>
      </div>

      <CategoryBar categories={["All", ...categories]} active={cat ?? "All"} q={q} />

      {cards.length === 0 ? (
        <p className="text-muted mt-16 text-center">
          No products match{query ? ` “${q}”` : ""}. Try a different search or category.
        </p>
      ) : (
        <div className="grid gap-4 mt-6" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          {cards.map((c) => (
            <ProductCard key={c.id} product={c} />
          ))}
        </div>
      )}
    </div>
  );
}

import { requireScopedSession } from "@/lib/tenant";
import { reservedByProduct, availableOf, stockState } from "@/lib/stock";
import { ProductCard } from "./product-card";
import { FilterBar, Pagination, type SortKey } from "./filter-bar";

const PAGE_SIZE = 24;

export default async function CataloguePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string; sort?: string; stock?: string; page?: string }>;
}) {
  const { session, db } = await requireScopedSession("PURCHASE_MANAGER");
  const { q, cat, sort, stock, page: pageParam } = await searchParams;

  const products = await db.product.findMany({
    where: { active: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  const reserved = await reservedByProduct(session.orgId);

  const query = (q ?? "").trim().toLowerCase();
  let rows = products
    .filter((p) => {
      if (cat && cat !== "All" && p.category !== cat) return false;
      if (!query) return true;
      return (
        p.name.toLowerCase().includes(query) ||
        p.brand.toLowerCase().includes(query) ||
        p.sku.toLowerCase().includes(query)
      );
    })
    .map((p) => {
      const available = availableOf(p.stock, reserved.get(p.id) ?? 0);
      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        brand: p.brand,
        category: p.category,
        unit: p.unit,
        imageUrl: p.imageUrl,
        priceCents: p.priceCents,
        available,
        state: stockState(available, p.minStock),
      };
    });

  if (stock === "in") rows = rows.filter((r) => r.state !== "out");

  const sortKey = (sort as SortKey) ?? "relevance";
  const sorted = [...rows];
  if (sortKey === "price-asc") sorted.sort((a, b) => a.priceCents - b.priceCents);
  else if (sortKey === "price-desc") sorted.sort((a, b) => b.priceCents - a.priceCents);
  else if (sortKey === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
  else if (sortKey === "stock") sorted.sort((a, b) => b.available - a.available);

  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(pageParam) || 1), pageCount);
  const cards = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const heading = query
    ? `Results for “${q}”`
    : cat && cat !== "All"
    ? cat
    : "All supplies";

  return (
    <div>
      <FilterBar total={total} showing={cards.length} heading={heading} />

      {cards.length === 0 ? (
        <div className="bg-surface border border-line rounded-sm mt-3 p-16 text-center">
          <p className="text-muted">
            No products match{query ? ` “${q}”` : ""}. Try a different search, category or filter.
          </p>
        </div>
      ) : (
        <>
          <div
            className="grid gap-3 mt-3"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}
          >
            {cards.map((c) => (
              <ProductCard key={c.id} product={c} />
            ))}
          </div>
          <Pagination page={page} pageCount={pageCount} />
        </>
      )}
    </div>
  );
}

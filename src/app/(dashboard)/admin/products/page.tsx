import { requireScopedSession } from "@/lib/tenant";
import { ProductsTable } from "./products-table";

export default async function AdminProductsPage() {
  const { db } = await requireScopedSession("SUPER_ADMIN");

  const products = await db.product.findMany({
    orderBy: [{ active: "desc" }, { category: "asc" }, { name: "asc" }],
  });

  const categories = [...new Set(products.map((p) => p.category))].sort();

  return (
    <div>
      <h1 className="text-2xl font-semibold">Products</h1>
      <p className="text-muted text-sm mt-1 max-w-xl">
        Hidden products disappear from the salon shop right away. Their history stays.
      </p>
      <ProductsTable
        products={products.map((p) => ({
          id: p.id,
          sku: p.sku,
          name: p.name,
          brand: p.brand,
          category: p.category,
          unit: p.unit,
          stock: p.stock,
          priceCents: p.priceCents,
          imageUrl: p.imageUrl,
          active: p.active,
        }))}
        categories={categories}
      />
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireScopedSession } from "@/lib/tenant";
import { reservedByProduct, availableOf, stockState } from "@/lib/stock";
import { formatMoney } from "@/lib/money";
import { optimizedImage } from "@/lib/cloudinary";
import { BuyPanel } from "./buy-panel";
import { ProductCard } from "../../catalogue/product-card";

function tint(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return `hsl(${h} 42% 95%)`;
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { session, db } = await requireScopedSession("PURCHASE_MANAGER");
  const { productId } = await params;

  const product = await db.product.findFirst({ where: { id: productId, active: true } });
  if (!product) notFound();

  const reserved = await reservedByProduct(session.orgId);
  const available = availableOf(product.stock, reserved.get(product.id) ?? 0);
  const state = stockState(available, product.minStock);

  const related = (
    await db.product.findMany({
      where: { active: true, category: product.category, id: { not: product.id } },
      orderBy: { name: "asc" },
      take: 6,
    })
  ).map((p) => {
    const avail = availableOf(p.stock, reserved.get(p.id) ?? 0);
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      brand: p.brand,
      category: p.category,
      unit: p.unit,
      imageUrl: p.imageUrl,
      priceCents: p.priceCents,
      available: avail,
      state: stockState(avail, p.minStock),
    };
  });

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="text-xs text-muted flex items-center gap-1.5 flex-wrap mb-3">
        <Link href="/purchase-manager/catalogue" className="hover:text-velvet hover:underline">Shop</Link>
        <span className="text-faint">›</span>
        <Link
          href={`/purchase-manager/catalogue?cat=${encodeURIComponent(product.category)}`}
          className="hover:text-velvet hover:underline"
        >
          {product.category}
        </Link>
        <span className="text-faint">›</span>
        <span className="text-faint truncate">{product.name}</span>
      </nav>

      {/* Amazon 3-column: image | details | buy box */}
      <div className="bg-surface border border-line rounded-sm">
        <div className="grid lg:grid-cols-[360px_1fr_300px] gap-6 p-4 lg:p-6">
          {/* Image */}
          <div className="bg-white border border-line rounded-sm grid place-items-center aspect-square overflow-hidden">
            {product.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={optimizedImage(product.imageUrl, 800)} alt={product.name} className="w-full h-full object-contain p-4" />
            ) : (
              <div className="w-full h-full grid place-items-center" style={{ background: tint(product.category) }}>
                <span className="text-7xl font-bold text-velvet/30">{product.brand.charAt(0)}</span>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="min-w-0">
            <h1 className="text-xl lg:text-2xl font-semibold leading-tight">{product.name}</h1>
            <Link
              href={`/purchase-manager/catalogue?q=${encodeURIComponent(product.brand)}`}
              className="text-velvet text-sm hover:underline mt-1 inline-block"
            >
              Brand: {product.brand}
            </Link>
            <div className="text-xs text-muted mt-1">SKU {product.sku} · sold per {product.unit}</div>

            <div className="border-t border-line mt-4 pt-4">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold">{formatMoney(product.priceCents)}</span>
                <span className="text-sm text-muted">per {product.unit}</span>
              </div>
            </div>

            <div className="border-t border-line mt-4 pt-4">
              <div className="text-[15px] font-semibold mb-1">
                {state === "in" && <span style={{ color: "var(--color-price)" }}>In stock</span>}
                {state === "low" && <span className="text-low">Low stock — only {available} left</span>}
                {state === "out" && <span className="text-out">Currently out of stock</span>}
              </div>
              {state !== "out" && (
                <div className="text-sm text-muted">{available} available from the central warehouse.</div>
              )}
            </div>

            <div className="border-t border-line mt-4 pt-4">
              <h2 className="text-sm font-semibold mb-2">About this item</h2>
              <ul className="space-y-1.5 text-sm text-muted list-disc pl-5">
                <li>Dispatched from your organization&rsquo;s central warehouse.</li>
                <li>Every dispatch is tracked — follow delivery progress under Your Orders.</li>
                <li>Sold per {product.unit}, brand {product.brand}.</li>
                {state === "out" && (
                  <li>Out of stock now — place a requirement and the warehouse supplies it when stock arrives.</li>
                )}
              </ul>
            </div>
          </div>

          {/* Buy box */}
          <div className="lg:sticky lg:top-4 self-start">
            <BuyPanel productId={product.id} available={available} state={state} unit={product.unit} priceCents={product.priceCents} />
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <div className="mt-4 bg-surface border border-line rounded-sm p-4">
          <h2 className="text-lg font-semibold mb-3">More in {product.category}</h2>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

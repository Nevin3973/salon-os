import Link from "next/link";
import { notFound } from "next/navigation";
import { requireScopedSession } from "@/lib/tenant";
import { reservedByProduct, availableOf, stockState } from "@/lib/stock";
import { BuyPanel } from "./buy-panel";
import { ProductCard } from "../../catalogue/product-card";

// Deterministic soft tint per category (matches the catalogue cards).
function tint(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return `hsl(${h} 42% 93%)`;
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
      take: 4,
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
      available: avail,
      state: stockState(avail, p.minStock),
    };
  });

  return (
    <div>
      <nav className="text-sm text-faint flex items-center gap-2 flex-wrap">
        <Link href="/purchase-manager/catalogue" className="hover:text-ink">Shop</Link>
        <span>/</span>
        <Link
          href={`/purchase-manager/catalogue?cat=${encodeURIComponent(product.category)}`}
          className="hover:text-ink"
        >
          {product.category}
        </Link>
        <span>/</span>
        <span className="text-muted">{product.name}</span>
      </nav>

      <div className="grid lg:grid-cols-[1.1fr_1fr] gap-10 mt-6 items-start">
        {/* Gallery */}
        <div
          className="rounded-2xl aspect-[4/3] grid place-items-center border border-line"
          style={{ background: tint(product.category) }}
        >
          <span className="font-display text-8xl text-velvet/25 select-none">
            {product.brand.charAt(0)}
          </span>
        </div>

        {/* Details */}
        <div>
          <div className="text-xs tracking-[0.16em] uppercase text-plum font-semibold">
            {product.brand}
          </div>
          <h1 className="font-display text-3xl lg:text-4xl font-bold mt-2 leading-tight">
            {product.name}
          </h1>
          <div className="text-sm text-faint mt-2">
            SKU {product.sku} · sold per {product.unit}
          </div>

          <BuyPanel
            productId={product.id}
            available={available}
            state={state}
          />

          <div className="mt-8 border-t border-line pt-6 space-y-3 text-sm">
            <div className="flex gap-3">
              <Check />
              <span className="text-muted">
                Dispatched from your organization&rsquo;s central warehouse
              </span>
            </div>
            <div className="flex gap-3">
              <Check />
              <span className="text-muted">
                Every dispatch is tracked — follow delivery progress from My Orders
              </span>
            </div>
            {state === "out" && (
              <div className="flex gap-3">
                <Check />
                <span className="text-muted">
                  Out of stock now — place a requirement and the warehouse supplies it when stock lands
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <div className="mt-14">
          <h2 className="font-display text-2xl font-bold mb-5">
            More in {product.category}
          </h2>
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Check() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-plum shrink-0 mt-0.5">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

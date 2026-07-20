"use client";

import { useRouter, useSearchParams } from "next/navigation";

export type SortKey = "relevance" | "price-asc" | "price-desc" | "name" | "stock";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "relevance", label: "Featured" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "name", label: "Name A–Z" },
  { value: "stock", label: "Most in stock" },
];

export function FilterBar({
  total,
  showing,
  heading,
}: {
  total: number;
  showing: number;
  heading: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const sort = (params.get("sort") as SortKey) ?? "relevance";
  const inStockOnly = params.get("stock") === "in";

  function update(patch: Record<string, string | null>) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") p.delete(k);
      else p.set(k, v);
    }
    p.delete("page"); // any filter change returns to page 1
    const s = p.toString();
    router.push(`/purchase-manager/catalogue${s ? `?${s}` : ""}`);
  }

  return (
    <div className="bg-surface border border-line rounded-sm px-4 py-2.5 flex items-center justify-between flex-wrap gap-3">
      <div className="text-sm">
        <span className="font-semibold">{heading}</span>
        <span className="text-muted">
          {" "}
          · showing {showing} of {total} item{total === 1 ? "" : "s"}
        </span>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={inStockOnly}
            onChange={(e) => update({ stock: e.target.checked ? "in" : null })}
            className="accent-[var(--color-velvet)] cursor-pointer"
          />
          <span className="text-muted">In stock only</span>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">Sort by</span>
          <select
            value={sort}
            onChange={(e) => update({ sort: e.target.value === "relevance" ? null : e.target.value })}
            className="border border-line rounded-md bg-white px-2 h-8 text-sm cursor-pointer"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

export function Pagination({
  page,
  pageCount,
}: {
  page: number;
  pageCount: number;
}) {
  const router = useRouter();
  const params = useSearchParams();

  if (pageCount <= 1) return null;

  function goto(p: number) {
    const q = new URLSearchParams(params.toString());
    if (p <= 1) q.delete("page");
    else q.set("page", String(p));
    const s = q.toString();
    router.push(`/purchase-manager/catalogue${s ? `?${s}` : ""}`);
  }

  // Compact window of page numbers around the current page.
  const pages: number[] = [];
  const from = Math.max(1, page - 2);
  const to = Math.min(pageCount, from + 4);
  for (let i = from; i <= to; i++) pages.push(i);

  const btn = "min-w-9 h-9 px-3 rounded-md border text-sm transition-colors cursor-pointer";

  return (
    <div className="flex items-center justify-center gap-2 mt-5">
      <button
        onClick={() => goto(page - 1)}
        disabled={page <= 1}
        className={`${btn} border-line bg-surface disabled:opacity-40 disabled:cursor-default hover:border-velvet`}
      >
        Previous
      </button>
      {pages.map((p) => (
        <button
          key={p}
          onClick={() => goto(p)}
          className={`${btn} ${
            p === page
              ? "border-velvet bg-velvet text-on-velvet font-semibold"
              : "border-line bg-surface hover:border-velvet"
          }`}
        >
          {p}
        </button>
      ))}
      <button
        onClick={() => goto(page + 1)}
        disabled={page >= pageCount}
        className={`${btn} border-line bg-surface disabled:opacity-40 disabled:cursor-default hover:border-velvet`}
      >
        Next
      </button>
    </div>
  );
}

"use client";

import Link from "next/link";

export function CategoryBar({
  categories,
  active,
  q,
}: {
  categories: string[];
  active: string;
  q?: string;
}) {
  const qs = (cat: string) => {
    const p = new URLSearchParams();
    if (cat && cat !== "All") p.set("cat", cat);
    if (q) p.set("q", q);
    const s = p.toString();
    return `/purchase-manager/catalogue${s ? `?${s}` : ""}`;
  };

  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar border-b border-line pb-3">
      {categories.map((cat) => {
        const on = cat === active;
        return (
          <Link
            key={cat}
            href={qs(cat)}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm border transition-colors ${
              on
                ? "bg-velvet text-white border-velvet"
                : "bg-surface text-muted border-line hover:border-velvet hover:text-velvet"
            }`}
          >
            {cat}
          </Link>
        );
      })}
    </div>
  );
}

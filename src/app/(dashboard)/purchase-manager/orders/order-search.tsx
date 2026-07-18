"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function OrderSearch({ initial }: { initial: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const query = q.trim();
    router.push(`/purchase-manager/orders${query ? `?q=${encodeURIComponent(query)}` : ""}`);
  }

  return (
    <form onSubmit={submit}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by order number or product"
        className="w-full bg-surface border border-line rounded-full px-4 h-11 text-sm focus:border-velvet outline-none"
        aria-label="Search orders"
      />
    </form>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AuditSearch({ initial }: { initial: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const query = q.trim();
    router.push(`/admin/audit${query ? `?q=${encodeURIComponent(query)}` : ""}`);
  }

  return (
    <form onSubmit={submit}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by person or action"
        className="w-full bg-surface border border-line rounded-[6px] px-3.5 h-10 text-sm text-ink focus:border-velvet outline-none transition-colors"
        aria-label="Search the audit log"
      />
    </form>
  );
}

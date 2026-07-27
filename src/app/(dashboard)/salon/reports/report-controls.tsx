"use client";

/** Date-range picker + print trigger for the salon sales report. The range
 *  lives in the URL so it's shareable and the CSV link matches the screen. */

import { useRouter } from "next/navigation";
import { useState } from "react";

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const PRESETS: { label: string; days: number }[] = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

export function ReportControls({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);

  const apply = (f: string, t: string) => router.push(`/salon/reports?from=${f}&to=${t}`);

  function applyPreset(days: number) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    setDraftFrom(iso(start));
    setDraftTo(iso(end));
    apply(iso(start), iso(end));
  }

  return (
    <div className="no-print flex flex-wrap items-end gap-3">
      <label className="text-xs">
        <span className="block text-faint font-medium uppercase tracking-wider mb-1">From</span>
        <input type="date" value={draftFrom} onChange={(e) => setDraftFrom(e.target.value)}
          className="h-9 px-3 rounded-lg bg-surface border border-line text-sm text-ink" />
      </label>
      <label className="text-xs">
        <span className="block text-faint font-medium uppercase tracking-wider mb-1">To</span>
        <input type="date" value={draftTo} onChange={(e) => setDraftTo(e.target.value)}
          className="h-9 px-3 rounded-lg bg-surface border border-line text-sm text-ink" />
      </label>
      <button onClick={() => apply(draftFrom, draftTo)}
        className="h-9 px-4 rounded-lg bg-velvet text-on-velvet text-xs font-semibold hover:bg-velvet-dark transition-colors cursor-pointer">
        Apply
      </button>

      <div className="flex items-center gap-1.5 ml-auto">
        {PRESETS.map((p) => (
          <button key={p.days} onClick={() => applyPreset(p.days)}
            className="h-9 px-3 rounded-lg border border-line text-xs font-medium text-muted hover:text-ink hover:border-velvet/40 transition-colors cursor-pointer">
            {p.label}
          </button>
        ))}
        <button onClick={() => window.print()}
          className="h-9 px-3.5 rounded-lg border border-line text-xs font-semibold text-muted hover:text-ink hover:border-velvet/40 transition-colors cursor-pointer inline-flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9V3h12v6M6 18H4v-6h16v6h-2M8 14h8v7H8z" />
          </svg>
          Save as PDF
        </button>
      </div>
    </div>
  );
}

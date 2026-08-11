"use client";

import { Fragment, useState } from "react";
import { formatMoney } from "@/lib/money";
import type { SaleStaffRow } from "@/lib/reports";

/**
 * Who sold what, over the chosen window.
 *
 * Two questions, one table. The rows answer "who is selling" — the ranking a
 * manager uses for commission. Expanding a row answers "what are they good at
 * selling", which is the more useful question: a stylist who moves treatments
 * but never retail needs different coaching from one who does the reverse.
 *
 * Figures are netted for returns like every other number in this report. A sale
 * that came back is not a sale anyone should be paid for.
 */
export function StaffSales({ rows }: { rows: SaleStaffRow[] }) {
  const [open, setOpen] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted">
        No sales in this window yet. Credit is picked at the till when a bill is charged.
      </p>
    );
  }

  const top = Math.max(1, ...rows.map((r) => r.revenueCents));

  return (
    <div className="bg-surface border border-line rounded-[10px] overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-faint">
            <th className="font-medium px-4 py-3">Staff</th>
            <th className="font-medium px-4 py-3 text-right">Bills</th>
            <th className="font-medium px-4 py-3 text-right">Units</th>
            <th className="font-medium px-4 py-3 text-right">Revenue</th>
            <th className="font-medium px-4 py-3 text-right">Margin</th>
            <th className="font-medium px-4 py-3 w-32">Share</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const key = r.staffId ?? "__counter__";
            const isOpen = open === key;
            return (
              <Fragment key={key}>
                <tr
                  onClick={() => setOpen(isOpen ? null : key)}
                  className="border-t border-line-soft cursor-pointer hover:bg-bg/50"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium flex items-center gap-1.5">
                      <span className="text-faint text-xs">{isOpen ? "▾" : "▸"}</span>
                      {r.name}
                    </div>
                    <div className="text-xs text-faint pl-4">
                      {/* A null staffId is the counter, not a missing record. */}
                      {r.staffId === null ? "Walk-in, nobody credited" : r.title ?? "Staff"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.bills}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.units}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">
                    {formatMoney(r.revenueCents)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted">
                    {formatMoney(r.marginCents)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-1.5 bg-line-soft rounded-full overflow-hidden">
                      <div
                        className="h-full bg-velvet rounded-full"
                        style={{ width: `${Math.round((r.revenueCents / top) * 100)}%` }}
                      />
                    </div>
                  </td>
                </tr>

                {isOpen && (
                  <tr className="bg-bg/40">
                    <td colSpan={6} className="px-4 py-3">
                      <div className="text-[11px] uppercase tracking-[0.1em] text-faint mb-2">
                        What {r.name} sells
                      </div>
                      <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1">
                        {r.products.map((p) => (
                          <div key={p.name} className="flex justify-between gap-3 text-xs">
                            <span className="truncate">{p.name}</span>
                            <span className="tabular-nums text-muted whitespace-nowrap">
                              {p.units} × · {formatMoney(p.revenueCents)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

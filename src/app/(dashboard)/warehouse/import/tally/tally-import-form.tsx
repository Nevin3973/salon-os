"use client";

import { useRef, useState, useTransition } from "react";
import Papa from "papaparse";
import { formatMoney } from "@/lib/money";
import { parseQty, parseAmountCents, type TallyStockRow } from "@/lib/tally/stock-summary";
import {
  previewTallyStock,
  confirmTallyStock,
  type TallyPreview,
} from "@/lib/actions/tally-import";

/** Reads a header cell under any of the spellings Tally and Excel produce. */
function pick(row: Record<string, string>, keys: string[]): string {
  for (const k of Object.keys(row)) {
    if (keys.includes(k.trim().toLowerCase())) return row[k] ?? "";
  }
  return "";
}

export function TallyImportForm() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<TallyStockRow[]>([]);
  const [applyQuantities, setApplyQuantities] = useState(true);
  const [preview, setPreview] = useState<TallyPreview | null>(null);
  const [done, setDone] = useState<{ created: number; updated: number; adjusted: number } | null>(
    null
  );
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function reset() {
    setFileName("");
    setRows([]);
    setPreview(null);
    setDone(null);
    setError("");
    if (fileInput.current) fileInput.current.value = "";
  }

  function processFile(file: File) {
    setError("");
    setDone(null);
    setPreview(null);
    setFileName(file.name);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const parsed: TallyStockRow[] = result.data
          .map((raw) => ({
            group: pick(raw, ["group", "stock group", "stockgroup"]).trim(),
            name: pick(raw, ["item", "name", "particulars", "stock item", "stockitem"]).trim(),
            qty: parseQty(pick(raw, ["qty", "quantity", "closing qty", "closing quantity"])),
            rateCents: parseAmountCents(pick(raw, ["rate", "closing rate"])),
            valueCents: parseAmountCents(pick(raw, ["value", "closing value", "amount"])),
          }))
          .filter((r) => r.group && r.name);

        if (parsed.length === 0) {
          setError(
            "No rows found. The file needs a header row with at least: group, item, qty, rate."
          );
          return;
        }
        setRows(parsed);
        startTransition(async () => {
          try {
            setPreview(await previewTallyStock({ rows: parsed, applyQuantities }));
          } catch {
            setError("Could not read that file.");
          }
        });
      },
      error: () => setError("Could not read that file."),
    });
  }

  function apply() {
    setError("");
    startTransition(async () => {
      const res = await confirmTallyStock({ rows, applyQuantities });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone({ created: res.created, updated: res.updated, adjusted: res.adjusted });
      setPreview(null);
    });
  }

  return (
    <div className="mt-6">
      <div className="bg-surface border border-line rounded-xl p-5">
        <label className="block text-sm font-medium mb-2">Stock Summary file (CSV)</label>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) processFile(f);
          }}
          className="block w-full text-sm text-muted file:mr-3 file:h-9 file:px-4 file:rounded-[6px] file:border-0 file:bg-velvet file:text-on-velvet file:text-sm file:font-semibold file:cursor-pointer cursor-pointer"
        />
        {fileName && <p className="text-xs text-faint mt-2">{fileName}</p>}

        <label className="flex items-start gap-3 mt-4 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={applyQuantities}
            onChange={(e) => setApplyQuantities(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-[var(--color-velvet)] cursor-pointer shrink-0"
          />
          <span>
            <span className="block text-sm font-medium">Set stock to the quantities in the file</span>
            <span className="block text-xs text-muted mt-0.5 leading-relaxed">
              Every change is written to the movement log, so the warehouse can still answer where a
              number came from. Untick to bring across names and rates only and leave the counts
              here alone.
            </span>
          </span>
        </label>
      </div>

      {error && (
        <p className="text-out text-sm mt-4" role="alert">
          {error}
        </p>
      )}

      {done && (
        <div className="bg-in-soft border border-in/25 rounded-xl p-5 mt-4">
          <p className="text-sm font-semibold text-in">Import complete</p>
          <p className="text-sm text-ink mt-1">
            {done.created} product{done.created === 1 ? "" : "s"} created, {done.updated} updated
            {applyQuantities ? `, ${done.adjusted} quantit${done.adjusted === 1 ? "y" : "ies"} reconciled` : ""}.
          </p>
          <button
            onClick={reset}
            className="mt-3 h-9 px-4 rounded-[6px] border border-line text-sm font-medium hover:border-velvet cursor-pointer"
          >
            Import another file
          </button>
        </div>
      )}

      {pending && <p className="text-muted text-sm mt-4">Reading…</p>}

      {preview && (
        <div className="mt-4">
          <div className="flex gap-3 flex-wrap">
            <Chip label="To create" value={String(preview.createCount)} />
            <Chip label="To update" value={String(preview.updateCount)} />
            <Chip label="File value" value={formatMoney(preview.fileValueCents)} />
          </div>

          {preview.errors.length > 0 && (
            <div className="bg-out-soft border border-out/25 rounded-xl p-4 mt-3">
              <p className="text-sm font-semibold text-out mb-1">
                {preview.errors.length} problem{preview.errors.length === 1 ? "" : "s"} — nothing
                will be imported
              </p>
              <ul className="text-xs text-ink list-disc pl-5 space-y-0.5">
                {preview.errors.slice(0, 10).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          {preview.warnings.length > 0 && (
            <details className="bg-low-soft border border-low/25 rounded-xl p-4 mt-3">
              <summary className="text-sm font-semibold text-low cursor-pointer">
                {preview.warnings.length} item{preview.warnings.length === 1 ? "" : "s"} with no rate
              </summary>
              <ul className="text-xs text-ink list-disc pl-5 space-y-0.5 mt-2">
                {preview.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          )}

          <div className="bg-surface border border-line rounded-xl overflow-x-auto mt-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-faint">
                  <th className="font-medium px-4 py-3">Group</th>
                  <th className="font-medium px-4 py-3">Item</th>
                  <th className="font-medium px-4 py-3">Sold as</th>
                  <th className="font-medium px-4 py-3 text-right">Qty</th>
                  <th className="font-medium px-4 py-3 text-right">Rate</th>
                  <th className="font-medium px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 100).map((r) => (
                  <tr key={r.sku} className="border-t border-line-soft">
                    <td className="px-4 py-2.5 text-muted text-xs">{r.group}</td>
                    <td className="px-4 py-2.5 font-medium">{r.name}</td>
                    <td className="px-4 py-2.5 text-xs">
                      {r.channel === "RETAIL" ? (
                        <span className="text-velvet">Retail · till</span>
                      ) : (
                        <span className="text-muted">Salon use</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {r.qty}
                      {r.action === "update" && r.currentQty !== null && r.currentQty !== r.qty && (
                        <span className="text-faint text-xs"> (was {r.currentQty})</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {r.priceCents > 0 ? formatMoney(r.priceCents) : <span className="text-faint">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {r.action === "create" ? (
                        <span className="text-in">New</span>
                      ) : (
                        <span className="text-muted">Update</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.rows.length > 100 && (
              <p className="text-xs text-faint px-4 py-3 border-t border-line-soft">
                Showing the first 100 of {preview.rows.length} rows. All of them will be imported.
              </p>
            )}
          </div>

          <div className="flex gap-2 mt-4">
            <button
              onClick={apply}
              disabled={pending || !preview.ok}
              className="h-10 px-5 rounded-[6px] bg-velvet text-on-velvet text-sm font-semibold hover:bg-velvet-dark transition-colors disabled:opacity-50 cursor-pointer"
            >
              {pending ? "Importing…" : `Import ${preview.rows.length} items`}
            </button>
            <button
              onClick={reset}
              className="h-10 px-5 rounded-[6px] border border-line text-sm font-medium hover:border-velvet cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-surface rounded-xl px-4 py-2.5 flex items-center gap-2">
      <span className="text-xs text-faint font-medium uppercase tracking-wider">{label}</span>
      <span className="text-sm font-bold text-ink tabular-nums">{value}</span>
    </div>
  );
}

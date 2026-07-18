"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import {
  previewImport,
  confirmImport,
  type ImportMode,
  type ImportRow,
  type ImportPreview,
  type ImportSummary,
} from "@/lib/actions/inventory";

const MODES: ImportMode[] = ["Inventory Update", "Product Import", "Full Synchronization"];
const MODE_HINT: Record<ImportMode, string> = {
  "Inventory Update": "Update stock for existing SKUs. Unknown SKUs are skipped.",
  "Product Import": "Update existing SKUs and create any new ones found in the file.",
  "Full Synchronization": "Update/create from the file, and deactivate active products not in it.",
};

const SAMPLE = `sku,name,qty,brand,category,unit,min
HC-1001,Repair Shampoo 1L,120,Kérastase,Hair Care,bottle,20
HC-1006,Colour Tube — 9.1 Ash Blonde,60,Majirel,Hair Colour,tube,40
NEW-2001,Argan Repair Ampoules (10),25,Moroccanoil,Hair Treatments,box,6`;

function pick(row: Record<string, string>, keys: string[]): string {
  for (const k of Object.keys(row)) {
    if (keys.includes(k.trim().toLowerCase())) return row[k];
  }
  return "";
}

export function ImportWizard() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<ImportMode>("Inventory Update");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);

  function reset() {
    setFileName("");
    setRows([]);
    setPreview(null);
    setSummary(null);
    setError("");
    if (fileInput.current) fileInput.current.value = "";
  }

  function processFile(file: File) {
    setError("");
    setSummary(null);
    setFileName(file.name);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const parsed: ImportRow[] = result.data.map((raw) => {
          const qtyStr = pick(raw, ["qty", "quantity", "stock"]);
          const minStr = pick(raw, ["min", "minstock", "min stock"]);
          return {
            sku: pick(raw, ["sku"]).trim(),
            name: pick(raw, ["name", "product", "product name"]).trim(),
            qty: Number(qtyStr),
            brand: pick(raw, ["brand"]).trim() || undefined,
            category: pick(raw, ["category", "section"]).trim() || undefined,
            unit: pick(raw, ["unit"]).trim() || undefined,
            min: minStr ? Number(minStr) : undefined,
          };
        });
        setRows(parsed);
        startTransition(async () => {
          try {
            const pv = await previewImport({ rows: parsed, mode });
            setPreview(pv);
          } catch {
            setError("Could not read that file. Check it is a valid CSV.");
          }
        });
      },
      error: () => setError("Could not parse the file."),
    });
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  function reValidate(nextMode: ImportMode) {
    setMode(nextMode);
    if (rows.length > 0) {
      startTransition(async () => {
        const pv = await previewImport({ rows, mode: nextMode });
        setPreview(pv);
      });
    }
  }

  function confirm() {
    setError("");
    startTransition(async () => {
      const res = await confirmImport({ rows, mode });
      if (!res.ok) setError(res.error);
      else {
        setSummary(res.summary);
        setPreview(null);
        router.refresh();
      }
    });
  }

  const sampleHref = "data:text/csv;charset=utf-8," + encodeURIComponent(SAMPLE);

  // ── Success state ──
  if (summary) {
    return (
      <div className="glass-surface rounded-xl p-8 animate-scale-in">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-in-soft flex items-center justify-center">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-in">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <h2 className="font-display text-xl font-bold text-ink">Import complete</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {([
            ["Updated", summary.updated, "text-velvet", "bg-velvet-soft"],
            ["Created", summary.created, "text-in", "bg-in-soft"],
            ["Deactivated", summary.deactivated, "text-low", "bg-low-soft"],
            ["Failed", summary.failed, "text-out", "bg-out-soft"],
          ] as const).map(([label, n, textColor, bgColor]) => (
            <div key={label} className={`${bgColor} border border-line-soft rounded-xl p-4 animate-slide-up`}>
              <div className="text-[11px] uppercase tracking-wider text-faint font-medium">{label}</div>
              <div className={`font-display text-3xl font-bold mt-1 tabular-nums ${textColor}`}>{n}</div>
            </div>
          ))}
        </div>
        <p className="text-muted text-sm mt-5 leading-relaxed">
          Stock levels are live across all branches. This import was written to the inventory and
          audit logs.
        </p>
        <button
          onClick={reset}
          className="mt-5 h-11 px-6 rounded-xl border-2 border-line text-sm font-semibold hover:border-velvet hover:text-velvet transition-all duration-200 cursor-pointer btn-press"
        >
          Run another import
        </button>
      </div>
    );
  }

  // ── Step indicator ──
  const step = !fileName ? 1 : preview ? 3 : 2;

  return (
    <div className="glass-surface rounded-xl p-6 sm:p-8">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {["Select mode", "Upload CSV", "Preview & confirm"].map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            {i > 0 && <div className={`w-8 h-[2px] rounded-full transition-colors duration-300 ${i + 1 <= step ? "bg-velvet" : "bg-line"}`} />}
            <div className="flex items-center gap-1.5">
              <div className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center transition-all duration-300 ${
                i + 1 < step
                  ? "bg-velvet text-white"
                  : i + 1 === step
                  ? "bg-velvet text-white shadow-sm"
                  : "bg-line text-faint"
              }`}>
                {i + 1 < step ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span className={`text-xs font-medium hidden sm:block transition-colors ${
                i + 1 <= step ? "text-ink" : "text-faint"
              }`}>{label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Mode selection */}
      <div className="text-[11px] uppercase tracking-wider text-faint font-medium mb-2.5">Import mode</div>
      <div className="flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button
            key={m}
            onClick={() => reValidate(m)}
            className={`px-4 py-2 rounded-full text-sm font-medium border cursor-pointer transition-all duration-200 btn-press ${
              mode === m
                ? "bg-velvet text-white border-velvet shadow-sm"
                : "bg-bg text-muted border-line hover:border-velvet/40 hover:text-ink"
            }`}
          >
            {m}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted mt-2 leading-relaxed">{MODE_HINT[mode]}</p>

      {/* Upload area — drag and drop zone */}
      <div
        className={`mt-6 border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 ${
          dragging
            ? "border-velvet bg-velvet-soft/30 scale-[1.01]"
            : "border-line hover:border-velvet/40"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input ref={fileInput} type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
        <div className="w-12 h-12 rounded-full bg-velvet-soft mx-auto mb-3 flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-velvet">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        {fileName ? (
          <div className="animate-scale-in">
            <p className="text-sm font-medium text-ink">{fileName}</p>
            <p className="text-xs text-faint mt-1">{rows.length} rows parsed</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted">
              <button onClick={() => fileInput.current?.click()} className="text-velvet font-semibold hover:text-velvet-dark cursor-pointer">
                Choose a file
              </button>{" "}
              or drag and drop
            </p>
            <p className="text-xs text-faint mt-1.5">
              Columns: <code className="bg-bg px-1.5 py-0.5 rounded text-velvet">sku, name, qty</code> (required) and optional <code className="bg-bg px-1.5 py-0.5 rounded text-velvet">brand, category, unit, min</code>
            </p>
          </>
        )}
        <a
          href={sampleHref}
          download="velvet-stock-sample.csv"
          className="inline-flex items-center gap-1.5 text-xs text-velvet hover:text-velvet-dark mt-3 cursor-pointer"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download sample CSV
        </a>
      </div>

      {error && (
        <div className="bg-out-soft border border-rose-200 text-out text-sm px-4 py-3 rounded-xl mt-4 animate-scale-in">
          {error}
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div className="mt-6 animate-slide-up">
          {preview.errors.length > 0 && (
            <div className="border border-rose-200 bg-out-soft rounded-xl p-4 mb-4 animate-scale-in">
              <div className="text-out text-sm font-semibold flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                {preview.errors.length} row{preview.errors.length === 1 ? "" : "s"} will be skipped
              </div>
              <ul className="text-xs text-out/80 mt-2 space-y-1">
                {preview.errors.slice(0, 8).map((e, i) => (
                  <li key={i}>• {e}</li>
                ))}
                {preview.errors.length > 8 && <li>…and {preview.errors.length - 8} more</li>}
              </ul>
            </div>
          )}
          {preview.warnings.length > 0 && (
            <div className="border border-amber-200 bg-low-soft rounded-xl p-4 mb-4 animate-scale-in">
              <div className="text-low text-sm font-semibold flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                {preview.warnings.length} warning{preview.warnings.length === 1 ? "" : "s"}
              </div>
              <ul className="text-xs text-low/80 mt-2 space-y-1">
                {preview.warnings.slice(0, 6).map((w, i) => (
                  <li key={i}>• {w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Preview table */}
          <div className="border border-line-soft rounded-xl overflow-hidden">
            <div className="overflow-x-auto max-h-80 thin-scrollbar">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface z-10">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-faint border-b border-line-soft">
                    <th className="px-4 py-3 font-semibold">SKU</th>
                    <th className="px-4 py-3 font-semibold">Product</th>
                    <th className="px-4 py-3 font-semibold text-right">Current</th>
                    <th className="px-4 py-3 font-semibold text-right">New qty</th>
                    <th className="px-4 py-3 font-semibold"></th>
                  </tr>
                </thead>
                <tbody className="stagger-children">
                  {preview.valid.map((r, i) => (
                    <tr key={`${r.sku}-${i}`} className="border-b border-line-soft last:border-0 row-hover animate-slide-up">
                      <td className="px-4 py-2.5 text-xs text-faint tabular-nums font-mono">{r.sku}</td>
                      <td className="px-4 py-2.5 font-medium">{r.name}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-faint">{r.current ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{r.qty}</td>
                      <td className="px-4 py-2.5">
                        {r.isNew && (
                          <span className="text-[10px] text-velvet font-bold uppercase tracking-wider bg-velvet-soft px-2 py-0.5 rounded-full">
                            NEW
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Confirm / Cancel */}
          <div className="flex items-center gap-3 mt-5">
            <button
              onClick={confirm}
              disabled={pending || preview.valid.length === 0}
              className="h-11 px-6 rounded-xl bg-velvet text-white text-sm font-semibold hover:bg-velvet-dark transition-all duration-200 disabled:opacity-40 cursor-pointer btn-press shadow-sm hover:shadow-md flex items-center gap-2"
            >
              {pending ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Importing…
                </>
              ) : (
                `Confirm import — ${preview.valid.length} row${preview.valid.length === 1 ? "" : "s"}`
              )}
            </button>
            <button
              onClick={reset}
              className="text-sm text-muted hover:text-ink transition-colors cursor-pointer px-3 py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

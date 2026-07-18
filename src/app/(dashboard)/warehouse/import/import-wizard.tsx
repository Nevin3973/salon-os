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

  function reset() {
    setFileName("");
    setRows([]);
    setPreview(null);
    setSummary(null);
    setError("");
    if (fileInput.current) fileInput.current.value = "";
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
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

  if (summary) {
    return (
      <div className="bg-surface border border-line rounded-xl p-6">
        <h2 className="font-display text-xl font-semibold">Import complete</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          {([
            ["Updated", summary.updated],
            ["Created", summary.created],
            ["Deactivated", summary.deactivated],
            ["Failed", summary.failed],
          ] as const).map(([label, n]) => (
            <div key={label} className="bg-bg border border-line rounded-lg p-4">
              <div className="text-xs text-muted">{label}</div>
              <div className="font-display text-2xl font-semibold mt-1">{n}</div>
            </div>
          ))}
        </div>
        <p className="text-muted text-sm mt-4">
          Stock levels are live across all branches. This import was written to the inventory and
          audit logs.
        </p>
        <button
          onClick={reset}
          className="mt-4 h-10 px-5 rounded-full border border-line text-sm font-medium hover:border-velvet hover:text-velvet transition-colors"
        >
          Run another import
        </button>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-line rounded-xl p-6">
      {/* Mode */}
      <div className="text-xs uppercase tracking-wide text-faint mb-2">Import mode</div>
      <div className="flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button
            key={m}
            onClick={() => reValidate(m)}
            className={`px-3.5 py-1.5 rounded-full text-sm border transition-colors ${
              mode === m ? "bg-velvet text-white border-velvet" : "bg-bg text-muted border-line hover:border-velvet"
            }`}
          >
            {m}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted mt-2">{MODE_HINT[mode]}</p>

      {/* Upload */}
      <div className="mt-5 flex items-center gap-3 flex-wrap">
        <input ref={fileInput} type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
        <button
          onClick={() => fileInput.current?.click()}
          className="h-10 px-5 rounded-full bg-velvet text-white text-sm font-semibold hover:bg-velvet-dark transition-colors"
        >
          Choose CSV file
        </button>
        {fileName && <span className="text-sm text-muted">{fileName}</span>}
        <a href={sampleHref} download="velvet-stock-sample.csv" className="text-sm text-velvet hover:text-velvet-dark ml-auto">
          Download sample CSV
        </a>
      </div>
      <p className="text-xs text-faint mt-2">
        Columns: <code>sku, name, qty</code> (required) and optional <code>brand, category, unit, min</code>.
      </p>

      {error && <p className="text-out text-sm mt-4">{error}</p>}

      {/* Preview */}
      {preview && (
        <div className="mt-6">
          {preview.errors.length > 0 && (
            <div className="border border-out/30 bg-rose-50 rounded-lg p-3 mb-3">
              <div className="text-out text-sm font-medium">
                {preview.errors.length} row{preview.errors.length === 1 ? "" : "s"} will be skipped
              </div>
              <ul className="text-xs text-out/90 mt-1 space-y-0.5">
                {preview.errors.slice(0, 8).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                {preview.errors.length > 8 && <li>…and {preview.errors.length - 8} more</li>}
              </ul>
            </div>
          )}
          {preview.warnings.length > 0 && (
            <div className="border border-low/30 bg-amber-50 rounded-lg p-3 mb-3">
              <div className="text-low text-sm font-medium">{preview.warnings.length} warning(s)</div>
              <ul className="text-xs text-low/90 mt-1 space-y-0.5">
                {preview.warnings.slice(0, 6).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="border border-line rounded-lg overflow-hidden">
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface">
                  <tr className="text-left text-xs uppercase tracking-wide text-faint border-b border-line">
                    <th className="p-2.5 font-medium">SKU</th>
                    <th className="p-2.5 font-medium">Product</th>
                    <th className="p-2.5 font-medium text-right">Current</th>
                    <th className="p-2.5 font-medium text-right">New qty</th>
                    <th className="p-2.5 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {preview.valid.map((r, i) => (
                    <tr key={`${r.sku}-${i}`} className="border-b border-line last:border-0">
                      <td className="p-2.5 text-xs text-faint tabular-nums">{r.sku}</td>
                      <td className="p-2.5">{r.name}</td>
                      <td className="p-2.5 text-right tabular-nums text-faint">{r.current ?? "—"}</td>
                      <td className="p-2.5 text-right tabular-nums">{r.qty}</td>
                      <td className="p-2.5">
                        {r.isNew && <span className="text-xs text-velvet font-medium">NEW</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={confirm}
              disabled={pending || preview.valid.length === 0}
              className="h-10 px-5 rounded-full bg-velvet text-white text-sm font-semibold hover:bg-velvet-dark transition-colors disabled:opacity-50"
            >
              {pending ? "Importing…" : `Confirm import — ${preview.valid.length} row${preview.valid.length === 1 ? "" : "s"}`}
            </button>
            <button onClick={reset} className="text-sm text-muted hover:text-ink">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

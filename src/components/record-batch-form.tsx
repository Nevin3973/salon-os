"use client";

import { useState, useTransition } from "react";
import { recordBatch } from "@/lib/actions/batches";

/// Entry point for the batch register.
///
/// Batches are keyed by hand for now. Salon OS has no goods-receipt path —
/// under the agreed split, purchases are entered in Tally — so until the
/// inbound sync carries lot and expiry data across, this is how a dated lot
/// gets on the books.

export type BatchProductOption = { id: string; name: string; sku: string };
export type BatchLocationOption = { id: string; name: string };

export function RecordBatchForm({
  products,
  locations,
}: {
  products: BatchProductOption[];
  locations: BatchLocationOption[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const [productId, setProductId] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [qty, setQty] = useState("");
  const [branchId, setBranchId] = useState("");

  if (!open) {
    return (
      <button type="button" className="btn mb-6" onClick={() => setOpen(true)}>
        Record a batch
      </button>
    );
  }

  const submit = () => {
    setError(null);
    setDone(null);
    const n = Number(qty);
    if (!productId) return setError("Pick a product.");
    if (!batchNo.trim()) return setError("Enter the batch number from the pack.");
    if (!expiryDate) return setError("Enter the expiry date.");
    if (!Number.isInteger(n) || n < 1) return setError("Quantity must be a whole number of units.");

    startTransition(async () => {
      const res = await recordBatch({
        productId,
        batchNo: batchNo.trim(),
        expiryDate,
        qty: n,
        branchId: branchId || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone(`Recorded ${n} units of batch ${batchNo.trim()}.`);
      setBatchNo("");
      setQty("");
    });
  };

  return (
    <div className="border border-line rounded p-4 mb-6 max-w-xl">
      <h2 className="font-display text-lg font-semibold mb-3">Record a batch</h2>

      {error ? <p className="text-sm text-red-600 mb-3">{error}</p> : null}
      {done ? <p className="text-sm text-green-700 mb-3">{done}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">
          <span className="block text-muted mb-1">Product</span>
          <select value={productId} onChange={(e) => setProductId(e.target.value)} className="input">
            <option value="">Choose a product…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.sku})
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="block text-muted mb-1">Batch number</span>
          <input value={batchNo} onChange={(e) => setBatchNo(e.target.value)} className="input" />
        </label>

        <label className="text-sm">
          <span className="block text-muted mb-1">Expires</span>
          <input
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            className="input"
          />
        </label>

        <label className="text-sm">
          <span className="block text-muted mb-1">Units</span>
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="input"
          />
        </label>

        <label className="text-sm">
          <span className="block text-muted mb-1">Where it is</span>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="input">
            <option value="">Central warehouse</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex gap-2 mt-4">
        <button type="button" className="btn btn-primary" disabled={pending} onClick={submit}>
          {pending ? "Saving…" : "Record batch"}
        </button>
        <button type="button" className="btn" disabled={pending} onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
    </div>
  );
}

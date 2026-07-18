"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleProductActive, createProduct } from "@/lib/actions/admin";

type Row = {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  unit: string;
  stock: number;
  active: boolean;
};

const inputCls =
  "w-full bg-bg border border-line rounded-[6px] px-3 h-10 text-sm text-ink focus:border-velvet outline-none transition-colors";

export function ProductsTable({ products, categories }: { products: Row[]; categories: string[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(id: string) {
    startTransition(async () => {
      await toggleProductActive({ productId: id });
      setConfirm(null);
      router.refresh();
    });
  }

  return (
    <div className="mt-5">
      <div className="flex justify-end mb-4">
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="h-10 px-5 rounded-[6px] bg-velvet text-on-velvet text-sm font-semibold hover:bg-velvet-dark transition-colors cursor-pointer"
          >
            Add product
          </button>
        )}
      </div>

      {adding && (
        <AddProductForm
          categories={categories}
          onDone={() => { setAdding(false); router.refresh(); }}
          onCancel={() => setAdding(false)}
        />
      )}

      <div className="bg-surface border border-line rounded-[10px] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-faint">
              <th className="font-medium px-4 py-3">SKU</th>
              <th className="font-medium px-4 py-3">Product</th>
              <th className="font-medium px-4 py-3">Category</th>
              <th className="font-medium px-4 py-3 text-right">Stock</th>
              <th className="font-medium px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className={`border-t border-line-soft ${p.active ? "" : "opacity-50"}`}>
                <td className="px-4 py-3 text-faint text-xs tracking-wide">{p.sku}</td>
                <td className="px-4 py-3">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-faint">{p.brand} · per {p.unit}</div>
                </td>
                <td className="px-4 py-3 text-muted">{p.category}</td>
                <td className="px-4 py-3 text-right tabular-nums">{p.stock}</td>
                <td className="px-4 py-3">
                  <span className={p.active ? "text-in" : "text-faint"}>
                    {p.active ? "For sale" : "Hidden"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {p.active ? (
                    confirm === p.id ? (
                      <button
                        onClick={() => toggle(p.id)}
                        onBlur={() => setConfirm(null)}
                        disabled={pending}
                        className="text-out text-xs font-semibold cursor-pointer"
                      >
                        Hide from shop?
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirm(p.id)}
                        className="text-muted hover:text-out text-xs font-medium cursor-pointer"
                      >
                        Hide
                      </button>
                    )
                  ) : (
                    <button
                      onClick={() => toggle(p.id)}
                      disabled={pending}
                      className="text-velvet hover:text-velvet-dark text-xs font-semibold cursor-pointer"
                    >
                      Restore
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AddProductForm({
  categories,
  onDone,
  onCancel,
}: {
  categories: string[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    sku: "",
    name: "",
    brand: "",
    category: categories[0] ?? "",
    unit: "piece",
    stock: "0",
    minStock: "0",
  });
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const res = await createProduct({
        sku: form.sku,
        name: form.name,
        brand: form.brand,
        category: form.category,
        unit: form.unit,
        stock: Number(form.stock) || 0,
        minStock: Number(form.minStock) || 0,
      });
      if (res.ok) onDone();
      else setError(res.error);
    });
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <form onSubmit={submit} className="bg-surface border border-velvet/40 rounded-[10px] p-5 mb-4">
      <div className="font-medium mb-4">New product</div>
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <L label="SKU"><input value={form.sku} onChange={set("sku")} required className={inputCls} /></L>
        <L label="Name"><input value={form.name} onChange={set("name")} required className={inputCls} /></L>
        <L label="Brand"><input value={form.brand} onChange={set("brand")} required className={inputCls} /></L>
        <L label="Category">
          <input value={form.category} onChange={set("category")} list="cats" required className={inputCls} />
          <datalist id="cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </L>
        <L label="Unit"><input value={form.unit} onChange={set("unit")} required className={inputCls} /></L>
        <L label="Stock"><input type="number" min={0} value={form.stock} onChange={set("stock")} className={inputCls} /></L>
        <L label="Low-stock alert at"><input type="number" min={0} value={form.minStock} onChange={set("minStock")} className={inputCls} /></L>
      </div>
      {error && <p className="text-out text-sm mt-3">{error}</p>}
      <div className="flex gap-3 mt-4">
        <button type="submit" disabled={pending} className="h-10 px-5 rounded-[6px] bg-velvet text-on-velvet text-sm font-semibold hover:bg-velvet-dark transition-colors disabled:opacity-50 cursor-pointer">
          {pending ? "Saving…" : "Save product"}
        </button>
        <button type="button" onClick={onCancel} className="h-10 px-4 rounded-[6px] border border-line text-sm text-muted hover:text-ink transition-colors cursor-pointer">
          Cancel
        </button>
      </div>
    </form>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-faint mb-1.5 uppercase tracking-[0.1em]">{label}</span>
      {children}
    </label>
  );
}

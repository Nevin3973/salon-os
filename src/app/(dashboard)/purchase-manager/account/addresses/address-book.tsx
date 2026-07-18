"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveAddress, setDefaultAddress, removeAddress } from "@/lib/actions/account";

export type AddressData = {
  id: string;
  label: string;
  contactName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
};

const EMPTY: Omit<AddressData, "id" | "isDefault"> = {
  label: "",
  contactName: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "India",
};

const inputCls =
  "w-full bg-bg border border-line rounded-lg px-3.5 h-11 text-sm transition-all hover:border-velvet/30 focus:border-velvet focus:ring-2 focus:ring-velvet/10 outline-none";

export function AddressBook({ addresses }: { addresses: AddressData[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function makeDefault(id: string) {
    startTransition(async () => {
      await setDefaultAddress({ addressId: id });
      router.refresh();
    });
  }
  function remove(id: string) {
    startTransition(async () => {
      await removeAddress({ addressId: id });
      setConfirmRemove(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-lg">Delivery addresses</h2>
          <p className="text-muted text-sm mt-0.5">
            Where the warehouse delivers your branch&rsquo;s orders.
          </p>
        </div>
        {editing === null && (
          <button
            onClick={() => setEditing("new")}
            className="h-10 px-5 rounded-lg bg-velvet text-white text-sm font-semibold hover:bg-velvet-dark transition-colors cursor-pointer btn-press shrink-0"
          >
            Add address
          </button>
        )}
      </div>

      {editing === "new" && (
        <AddressForm initial={EMPTY} onDone={() => { setEditing(null); router.refresh(); }} onCancel={() => setEditing(null)} />
      )}

      {addresses.length === 0 && editing !== "new" && (
        <div className="bg-surface border border-dashed border-line rounded-xl p-10 text-center">
          <p className="text-muted font-medium">No addresses yet</p>
          <p className="text-faint text-sm mt-1">
            Add your first delivery address — it&rsquo;s required at checkout.
          </p>
        </div>
      )}

      {addresses.map((a) =>
        editing === a.id ? (
          <AddressForm
            key={a.id}
            initial={a}
            addressId={a.id}
            onDone={() => { setEditing(null); router.refresh(); }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <div key={a.id} className="bg-surface border border-line rounded-xl p-5 hover-lift">
            <div className="flex items-start gap-3 flex-wrap">
              <div className="flex-1 min-w-[220px]">
                <div className="flex items-center gap-2.5">
                  <span className="font-semibold">{a.label}</span>
                  {a.isDefault && (
                    <span className="text-[10px] uppercase tracking-wider font-bold text-velvet bg-velvet-soft px-2 py-0.5 rounded-full">
                      Default
                    </span>
                  )}
                </div>
                <div className="text-sm text-muted mt-1.5 leading-relaxed">
                  {a.contactName && <>{a.contactName} · </>}
                  {a.line1}
                  {a.line2 && <>, {a.line2}</>}, {a.city}
                  {a.state && <>, {a.state}</>} {a.postalCode} · {a.country}
                  {a.phone && <> · {a.phone}</>}
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm">
                {!a.isDefault && (
                  <button
                    onClick={() => makeDefault(a.id)}
                    disabled={pending}
                    className="text-velvet hover:text-velvet-dark font-medium cursor-pointer"
                  >
                    Make default
                  </button>
                )}
                <button
                  onClick={() => setEditing(a.id)}
                  className="text-muted hover:text-ink font-medium cursor-pointer"
                >
                  Edit
                </button>
                {confirmRemove === a.id ? (
                  <button
                    onClick={() => remove(a.id)}
                    onBlur={() => setConfirmRemove(null)}
                    disabled={pending}
                    className="text-out font-semibold cursor-pointer"
                  >
                    Confirm?
                  </button>
                ) : (
                  <button
                    onClick={() => setConfirmRemove(a.id)}
                    className="text-muted hover:text-out font-medium cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}

function AddressForm({
  initial,
  addressId,
  onDone,
  onCancel,
}: {
  initial: Omit<AddressData, "id" | "isDefault">;
  addressId?: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const res = await saveAddress({ ...form, addressId });
      if (res.ok) onDone();
      else setError(res.error);
    });
  }

  return (
    <form onSubmit={submit} className="bg-surface border border-velvet/30 rounded-xl p-5 animate-scale-in">
      <div className="font-semibold mb-4">{addressId ? "Edit address" : "New address"}</div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Label" required>
          <input value={form.label} onChange={set("label")} placeholder="e.g. Salon front desk" required className={inputCls} />
        </Field>
        <Field label="Contact person">
          <input value={form.contactName} onChange={set("contactName")} className={inputCls} />
        </Field>
        <Field label="Address line 1" required full>
          <input value={form.line1} onChange={set("line1")} required className={inputCls} />
        </Field>
        <Field label="Address line 2" full>
          <input value={form.line2} onChange={set("line2")} className={inputCls} />
        </Field>
        <Field label="City" required>
          <input value={form.city} onChange={set("city")} required className={inputCls} />
        </Field>
        <Field label="State">
          <input value={form.state} onChange={set("state")} className={inputCls} />
        </Field>
        <Field label="Postal code">
          <input value={form.postalCode} onChange={set("postalCode")} className={inputCls} />
        </Field>
        <Field label="Country" required>
          <input value={form.country} onChange={set("country")} required className={inputCls} />
        </Field>
        <Field label="Phone">
          <input value={form.phone} onChange={set("phone")} className={inputCls} />
        </Field>
      </div>

      {error && <p className="text-out text-sm mt-4">{error}</p>}

      <div className="flex gap-3 mt-5">
        <button
          type="submit"
          disabled={pending}
          className="h-10 px-6 rounded-lg bg-velvet text-white text-sm font-semibold hover:bg-velvet-dark transition-colors disabled:opacity-50 cursor-pointer btn-press"
        >
          {pending ? "Saving…" : "Save address"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-10 px-5 rounded-lg border border-line text-sm font-medium text-muted hover:text-ink transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  full,
  children,
}: {
  label: string;
  required?: boolean;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <span className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wider">
        {label}
        {required && <span className="text-out ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}

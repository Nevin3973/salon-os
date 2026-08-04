"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { voidSale, returnSaleItems } from "@/lib/actions/sales";
import {
  VOID_SALE_REASONS,
  SALE_RETURN_REASONS,
  PAYMENT_MODES,
  PAYMENT_MODE_LABEL,
  type PaymentModeValue,
} from "@/lib/constants";

export type ReturnableLine = {
  saleItemId: string;
  name: string;
  qty: number;
  returnedQty: number;
};

/** Paper the counter can print on. A4 is the GST tax invoice; the rest are rolls. */
const PAPER = [
  { id: "a4", label: "A4 invoice", hint: "Tax invoice for the customer's records" },
  { id: "80", label: "80mm receipt", hint: "Standard counter roll" },
  { id: "58", label: "58mm receipt", hint: "Narrow handheld roll" },
] as const;

type PaperId = (typeof PAPER)[number]["id"];
const PAPER_PREF_KEY = "salonos:paper";

/**
 * Print control offering A4 or a thermal roll.
 *
 * A branch prints to the same printer all day, so the last choice is remembered
 * and becomes the one-click default — the dropdown is only there for the
 * occasional customer who wants the full A4 tax invoice.
 *
 * Roll sizes work by putting a class on <html> that the print stylesheet keys
 * off (see globals.css). It is removed again on `afterprint` so the on-screen
 * page is never left in receipt mode — including when the user cancels the
 * print dialog, which still fires the event.
 */
function PrintMenu() {
  const [paper, setPaper] = useState<PaperId>("a4");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PAPER_PREF_KEY);
      if (saved && PAPER.some((p) => p.id === saved)) setPaper(saved as PaperId);
    } catch {
      /* private mode — the A4 default is fine */
    }
  }, []);

  function print(choice: PaperId) {
    setOpen(false);
    setPaper(choice);
    try {
      localStorage.setItem(PAPER_PREF_KEY, choice);
    } catch {
      /* ignore */
    }

    const root = document.documentElement;
    const cls = choice === "a4" ? null : `receipt-${choice}`;

    // `@page` cannot be scoped by a class, so the roll's page box has to be
    // injected for the duration of the print and pulled out afterwards. Without
    // it the browser keeps the A4 page box from globals.css and prints a 58mm
    // column down the left of an A4 sheet. `auto` height because roll paper has
    // no fixed page length.
    let pageStyle: HTMLStyleElement | null = null;
    if (cls) {
      root.classList.add(cls);
      pageStyle = document.createElement("style");
      pageStyle.setAttribute("data-receipt-page", choice);
      pageStyle.textContent = `@page { size: ${choice}mm auto; margin: 0; }`;
      document.head.appendChild(pageStyle);
    }

    const cleanup = () => {
      if (cls) root.classList.remove(cls);
      pageStyle?.remove();
      pageStyle = null;
      window.removeEventListener("afterprint", cleanup);
    };
    // `afterprint` covers both completing and cancelling the dialog. There is
    // deliberately no timer fallback: an earlier version tore the styles down
    // after 3s, which fired while the dialog was still open — changing any
    // setting re-rendered the preview as A4 and sent that to the roll printer.
    window.addEventListener("afterprint", cleanup);

    window.print();
  }

  const current = PAPER.find((p) => p.id === paper) ?? PAPER[0];

  return (
    <div className="no-print relative flex items-stretch">
      <button
        onClick={() => print(paper)}
        className="h-9 pl-4 pr-3 rounded-l-lg border border-line text-xs font-semibold text-muted hover:text-ink hover:border-velvet/40 transition-colors cursor-pointer"
      >
        Print {current.label}
      </button>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Choose paper size"
        aria-expanded={open}
        className="h-9 px-2 rounded-r-lg border border-l-0 border-line text-xs text-muted hover:text-ink hover:border-velvet/40 transition-colors cursor-pointer"
      >
        ▾
      </button>

      {open && (
        <>
          {/* Click-away catcher. */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-20 w-60 bg-surface border border-line rounded-xl p-1 shadow-lg text-left">
            {PAPER.map((p) => (
              <button
                key={p.id}
                onClick={() => print(p.id)}
                className={`w-full text-left px-3 py-2 rounded-lg hover:bg-bg cursor-pointer ${
                  p.id === paper ? "text-velvet" : "text-ink"
                }`}
              >
                <div className="text-xs font-semibold">{p.label}</div>
                <div className="text-[11px] text-faint">{p.hint}</div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Print, return and void controls for one invoice.
 *
 * Return and void are deliberately different things: a return is the everyday
 * counter case that credits part of a bill and leaves the invoice standing; a
 * void cancels a bill raised in error and is only offered while nothing has
 * been returned yet.
 */
export function InvoiceActions({
  saleId,
  canVoid,
  canReturn,
  lines,
}: {
  saleId: string;
  canVoid: boolean;
  canReturn: boolean;
  lines: ReturnableLine[];
}) {
  const [panel, setPanel] = useState<"none" | "return" | "void">("none");

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <PrintMenu />

        {canReturn && panel !== "return" && (
          <button
            onClick={() => setPanel("return")}
            className="h-9 px-4 rounded-lg border border-line text-xs font-semibold text-muted hover:text-velvet hover:border-velvet/40 transition-colors cursor-pointer"
          >
            Return items
          </button>
        )}

        {canVoid && panel !== "void" && (
          <button
            onClick={() => setPanel("void")}
            className="h-9 px-4 rounded-lg border border-line text-xs font-semibold text-muted hover:text-out hover:border-out/40 transition-colors cursor-pointer"
          >
            Void bill
          </button>
        )}
      </div>

      {panel === "return" && (
        <ReturnPanel saleId={saleId} lines={lines} onClose={() => setPanel("none")} />
      )}
      {panel === "void" && <VoidPanel saleId={saleId} onClose={() => setPanel("none")} />}
    </div>
  );
}

function ReturnPanel({
  saleId,
  lines,
  onClose,
}: {
  saleId: string;
  lines: ReturnableLine[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [qty, setQty] = useState<Map<string, number>>(new Map());
  const [reason, setReason] = useState<(typeof SALE_RETURN_REASONS)[number]>(SALE_RETURN_REASONS[0]);
  const [refundMode, setRefundMode] = useState<PaymentModeValue>("CASH");
  const [note, setNote] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const open = lines.filter((l) => l.qty > l.returnedQty);
  const totalUnits = [...qty.values()].reduce((s, n) => s + n, 0);

  function set(id: string, n: number, max: number) {
    setError("");
    setQty((prev) => {
      const next = new Map(prev);
      const clamped = Math.max(0, Math.min(n, max));
      if (clamped === 0) next.delete(id);
      else next.set(id, clamped);
      return next;
    });
  }

  function submit() {
    if (totalUnits === 0) {
      setError("Enter how many units are coming back.");
      return;
    }
    if (!authCode.trim()) {
      setError("Enter the authorization code.");
      return;
    }
    setError("");
    startTransition(async () => {
      const res = await returnSaleItems({
        saleId,
        reason,
        note: note.trim() || undefined,
        refundMode,
        authCode,
        lines: [...qty.entries()].map(([saleItemId, q]) => ({ saleItemId, qty: q })),
      });
      if (res.ok) {
        onClose();
        router.refresh();
      } else setError(res.error);
    });
  }

  return (
    <div className="no-print w-full sm:w-[30rem] bg-surface border border-velvet/40 rounded-xl p-4 text-left">
      <div className="font-semibold text-sm mb-1">Return items</div>
      <p className="text-xs text-muted mb-3">
        The invoice stays as it is — a credit note is raised for what comes back, and the stock
        returns to your shelf.
      </p>

      <div className="space-y-2 max-h-56 overflow-y-auto">
        {open.map((l) => {
          const max = l.qty - l.returnedQty;
          return (
            <div key={l.saleItemId} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate">{l.name}</div>
                <div className="text-[11px] text-faint">
                  {max} of {l.qty} can come back
                  {l.returnedQty > 0 ? ` · ${l.returnedQty} already returned` : ""}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => set(l.saleItemId, (qty.get(l.saleItemId) ?? 0) - 1, max)}
                  className="w-9 h-9 grid place-items-center rounded-lg border border-line text-muted active:scale-95 cursor-pointer"
                  aria-label={`One less ${l.name}`}
                >
                  −
                </button>
                <span className="w-7 text-center text-sm font-semibold tabular-nums">
                  {qty.get(l.saleItemId) ?? 0}
                </span>
                <button
                  onClick={() => set(l.saleItemId, (qty.get(l.saleItemId) ?? 0) + 1, max)}
                  disabled={(qty.get(l.saleItemId) ?? 0) >= max}
                  className="w-9 h-9 grid place-items-center rounded-lg border border-line text-muted active:scale-95 disabled:opacity-30 cursor-pointer"
                  aria-label={`One more ${l.name}`}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid sm:grid-cols-2 gap-2 mt-3">
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value as (typeof SALE_RETURN_REASONS)[number])}
          aria-label="Reason for the return"
          className="h-9 bg-bg border border-line rounded-lg px-2 text-xs text-ink outline-none focus:border-velvet"
        >
          {SALE_RETURN_REASONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <select
          value={refundMode}
          onChange={(e) => setRefundMode(e.target.value as PaymentModeValue)}
          aria-label="How the refund is given"
          className="h-9 bg-bg border border-line rounded-lg px-2 text-xs text-ink outline-none focus:border-velvet"
        >
          {PAYMENT_MODES.map((m) => (
            <option key={m} value={m}>Refund by {PAYMENT_MODE_LABEL[m]}</option>
          ))}
        </select>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          className="h-9 bg-bg border border-line rounded-lg px-2.5 text-xs outline-none focus:border-velvet"
        />
        <input
          value={authCode}
          onChange={(e) => setAuthCode(e.target.value)}
          placeholder="Authorization code"
          aria-label="Authorization code"
          className="h-9 bg-bg border border-line rounded-lg px-2.5 text-xs outline-none focus:border-velvet"
        />
      </div>

      {error && <p className="text-out text-xs mt-2">{error}</p>}

      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={submit}
          disabled={pending || totalUnits === 0}
          className="h-9 px-4 rounded-lg bg-velvet text-on-velvet text-xs font-semibold disabled:opacity-40 cursor-pointer"
        >
          {pending ? "Saving…" : `Return ${totalUnits} unit${totalUnits === 1 ? "" : "s"}`}
        </button>
        <button onClick={onClose} className="h-9 px-2 text-xs text-muted hover:text-ink cursor-pointer">
          Cancel
        </button>
      </div>
    </div>
  );
}

function VoidPanel({ saleId, onClose }: { saleId: string; onClose: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState<(typeof VOID_SALE_REASONS)[number]>(VOID_SALE_REASONS[0]);
  const [authCode, setAuthCode] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    setError("");
    startTransition(async () => {
      const res = await voidSale({ saleId, reason, authCode });
      if (res.ok) {
        onClose();
        router.refresh();
      } else setError(res.error);
    });
  }

  return (
    <div className="no-print flex flex-wrap items-center gap-2 justify-end">
      <select
        value={reason}
        onChange={(e) => setReason(e.target.value as (typeof VOID_SALE_REASONS)[number])}
        aria-label="Reason for voiding"
        className="h-9 bg-surface border border-line rounded-lg px-2 text-xs text-ink outline-none focus:border-velvet"
      >
        {VOID_SALE_REASONS.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
      <input
        value={authCode}
        onChange={(e) => setAuthCode(e.target.value)}
        placeholder="Authorization code"
        aria-label="Authorization code"
        className="h-9 w-40 bg-surface border border-line rounded-lg px-2.5 text-xs text-ink outline-none focus:border-velvet"
      />
      <button
        onClick={submit}
        disabled={pending || !authCode.trim()}
        className="h-9 px-3 rounded-lg bg-out text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50 cursor-pointer"
      >
        {pending ? "Voiding…" : "Confirm void"}
      </button>
      <button onClick={onClose} className="h-9 px-2 text-xs text-muted hover:text-ink cursor-pointer">
        Cancel
      </button>
      {error && <span className="text-out text-xs w-full text-right">{error}</span>}
    </div>
  );
}

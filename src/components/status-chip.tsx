import { statusLabel } from "@/lib/format";

const STYLES: Record<string, string> = {
  PENDING: "bg-slate-100 text-slate-600",
  PROCESSING: "bg-velvet-soft text-velvet",
  PARTIALLY_FULFILLED: "bg-amber-50 text-low",
  COMPLETED: "bg-emerald-50 text-in",
  CANCELLED: "bg-rose-50 text-out",
};

export function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
        STYLES[status] ?? "bg-slate-100 text-slate-600"
      }`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {statusLabel(status)}
    </span>
  );
}

import { statusLabel } from "@/lib/format";

const STYLES: Record<string, string> = {
  PENDING: "bg-surface-raised text-muted border-line",
  PROCESSING: "bg-velvet-soft text-velvet border-velvet/20",
  PARTIALLY_FULFILLED: "bg-low-soft text-low border-low/25",
  COMPLETED: "bg-in-soft text-in border-in/25",
  CANCELLED: "bg-out-soft text-out border-out/25",
};

const PULSE_STATUSES = new Set(["PENDING", "PROCESSING"]);

export function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
        STYLES[status] ?? "bg-surface-raised text-muted border-line"
      }`}
    >
      <span className="relative flex h-2 w-2">
        <span className={`w-2 h-2 rounded-full bg-current ${
          PULSE_STATUSES.has(status) ? "animate-pulse-soft" : ""
        }`} />
        {PULSE_STATUSES.has(status) && (
          <span
            className="absolute inset-0 rounded-full bg-current opacity-40"
            style={{ animation: "pulse-ring 2s cubic-bezier(0, 0, 0.2, 1) infinite" }}
          />
        )}
      </span>
      {statusLabel(status)}
    </span>
  );
}

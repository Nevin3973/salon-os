import type { ReactNode } from "react";

/** Consistent page header for the warehouse & admin consoles. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{title}</h1>
        {subtitle && <p className="text-muted text-sm mt-1 max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}

export type Stat = { label: string; value: number | string; tone?: "default" | "in" | "low" | "out" | "accent" };

const TONE: Record<NonNullable<Stat["tone"]>, string> = {
  default: "text-ink",
  in: "text-in",
  low: "text-low",
  out: "text-out",
  accent: "text-velvet",
};

/** A compact row of KPI cards — the "at a glance" bar. */
export function StatGrid({ stats }: { stats: Stat[] }) {
  return (
    <div
      className="grid gap-2.5 mb-5"
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(150px, 1fr))` }}
    >
      {stats.map((s) => (
        <div key={s.label} className="bg-surface border border-line rounded-md px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-faint font-medium">{s.label}</div>
          <div className={`text-2xl font-semibold mt-1 tabular-nums ${TONE[s.tone ?? "default"]}`}>
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}

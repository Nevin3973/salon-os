export function VelvetLogo({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex items-baseline gap-2 select-none">
      <span className="font-display text-2xl tracking-tight text-ink">
        Salon<span className="text-plum"> OS</span>
      </span>
      {subtitle && (
        <span className="text-[11px] uppercase tracking-[0.18em] text-faint font-medium">
          {subtitle}
        </span>
      )}
    </div>
  );
}

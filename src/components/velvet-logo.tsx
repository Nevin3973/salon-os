export function VelvetLogo({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex items-baseline gap-2 select-none">
      <span className="font-display text-2xl font-semibold tracking-tight text-velvet">Velvet</span>
      {subtitle && <span className="text-xs uppercase tracking-[0.18em] text-faint">{subtitle}</span>}
    </div>
  );
}

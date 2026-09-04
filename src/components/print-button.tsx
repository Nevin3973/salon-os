"use client";

/** Prints the page. Split out so an invoice page can stay a server component. */
export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="h-9 px-4 rounded-full border border-line text-sm font-medium hover:border-velvet hover:text-velvet transition-colors cursor-pointer"
    >
      {label}
    </button>
  );
}

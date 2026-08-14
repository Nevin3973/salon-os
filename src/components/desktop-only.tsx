import { PRODUCT_NAME } from "@/lib/brand";

/**
 * Gates a console to desktop and tablet.
 *
 * The till and the warehouse are dense, two-handed screens — a bill with five
 * tax columns, a picking list, a dispatch grid. Squeezed onto a phone they do
 * not become harder to use, they become wrong to use: a cashier mis-taps a
 * quantity, a picker confirms the wrong line. Refusing is safer than degrading.
 *
 * Done in CSS at the `md` breakpoint (768px) rather than by sniffing the user
 * agent, so it follows the actual viewport — a tablet in portrait is 768 and
 * passes, a phone in landscape is still a phone by height and does not get a
 * broken half-layout either way. There is no JavaScript and therefore no
 * hydration mismatch, which is the usual way this kind of gate breaks.
 *
 * Note the children still render into the DOM below the breakpoint; they are
 * merely not displayed. This is a usability gate, not a security boundary —
 * every route behind it is already role-checked server-side.
 */
export function DesktopOnly({ what, children }: { what: string; children: React.ReactNode }) {
  return (
    <>
      <div className="hidden md:block">{children}</div>

      <div className="md:hidden min-h-screen grid place-items-center px-7 text-center">
        <div className="max-w-xs">
          <div className="font-display text-2xl font-bold text-velvet tracking-tight">
            {PRODUCT_NAME}
          </div>
          <h1 className="text-base font-semibold mt-6">{what} needs a bigger screen</h1>
          <p className="text-muted text-sm mt-2 leading-relaxed">
            Open this on a tablet or a computer. These screens are dense, and squeezing the columns
            onto a phone is how the wrong quantity gets tapped.
          </p>
          <p className="text-faint text-xs mt-5 leading-relaxed">
            Head office reporting does work on a phone.
          </p>
        </div>
      </div>
    </>
  );
}

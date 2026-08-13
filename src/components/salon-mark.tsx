import { optimizedImage } from "@/lib/cloudinary";

/**
 * The salon's OWN mark — not the product's.
 *
 * Falls back to a monogram drawn from the salon's name when no logo has been
 * uploaded. That fallback is the point: a tenant that never gets round to
 * uploading a logo should still look finished rather than showing a broken
 * image or a hole in the chrome, and the great majority never upload one.
 *
 * Deliberately not a client component — it renders inside the shell on every
 * page, and there is nothing here that needs to run in the browser.
 */
export function SalonMark({
  name,
  logoUrl,
  size = 32,
  className = "",
}: {
  name: string;
  logoUrl: string | null;
  size?: number;
  className?: string;
}) {
  const box = { width: size, height: size };

  if (logoUrl) {
    return (
      <span
        style={box}
        className={`shrink-0 rounded-lg border border-line bg-white overflow-hidden grid place-items-center ${className}`}
      >
        {/* Plain <img>: the URL is user-supplied per tenant, so it cannot be
            statically analysed, and next/image would need every tenant's
            Cloudinary host allow-listed at build time. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={optimizedImage(logoUrl, size * 3)}
          alt={`${name} logo`}
          className="w-full h-full object-contain"
        />
      </span>
    );
  }

  return (
    <span
      style={{ ...box, fontSize: Math.max(11, Math.round(size * 0.38)) }}
      aria-hidden
      className={`shrink-0 rounded-lg border border-velvet/30 bg-velvet-soft text-velvet grid place-items-center font-semibold tracking-tight ${className}`}
    >
      {monogram(name)}
    </span>
  );
}

/**
 * Up to two initials. Words like "&" or "of" would make a poor monogram, so
 * only alphanumeric-initial words count.
 */
export function monogram(name: string): string {
  const words = name
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => /^[\p{L}\p{N}]/u.test(w));
  if (words.length === 0) return "?";
  const letters = words.slice(0, 2).map((w) => w[0]!.toUpperCase());
  return letters.join("");
}

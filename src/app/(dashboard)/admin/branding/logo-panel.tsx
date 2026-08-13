"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadProductImage, cloudinaryConfigured } from "@/lib/cloudinary";
import { setOrgLogo } from "@/lib/actions/admin";
import { SalonMark } from "@/components/salon-mark";
import { PRODUCT_NAME, ATTRIBUTION } from "@/lib/brand";

/**
 * Upload and preview the salon's logo.
 *
 * Shows the mark at the size it actually appears in the sidebar next to a
 * mock-up of that header, because the common failure with a logo upload is a
 * file that looks fine on its own and is illegible at 34px. Better to see that
 * before saving than to discover it on the counter tablet.
 */
export function LogoPanel({ orgName, logoUrl }: { orgName: string; logoUrl: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();

  const configured = cloudinaryConfigured();

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;

    setError("");
    setBusy(true);
    const uploaded = await uploadProductImage(file);
    if (!uploaded.ok) {
      setError(uploaded.error);
      setBusy(false);
      return;
    }
    const saved = await setOrgLogo({ logoUrl: uploaded.url });
    setBusy(false);
    if (!saved.ok) {
      setError(saved.error);
      return;
    }
    startTransition(() => router.refresh());
  }

  async function remove() {
    setError("");
    setBusy(true);
    const saved = await setOrgLogo({ logoUrl: null });
    setBusy(false);
    if (!saved.ok) {
      setError(saved.error);
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="mt-6 max-w-xl rounded-xl border border-line bg-surface p-5">
      <div className="text-[11px] font-medium text-faint uppercase tracking-[0.12em]">
        Sidebar preview
      </div>

      {/* The real thing, at the real size. */}
      <div className="mt-3 rounded-lg border border-line p-4">
        <div className="font-display text-lg font-bold text-velvet tracking-tight leading-none">
          {PRODUCT_NAME}
        </div>
        <div className="attribution text-[10px] mt-1 leading-tight">{ATTRIBUTION}</div>
        <div className="flex items-center gap-2.5 mt-4 pt-4 border-t border-line">
          <SalonMark name={orgName} logoUrl={logoUrl} size={34} />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-ink truncate leading-tight">{orgName}</div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-faint font-semibold mt-0.5">
              Head office
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          onChange={pick}
          className="hidden"
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy || !configured}
          className="h-9 px-4 rounded-lg bg-velvet text-on-velvet text-xs font-semibold hover:bg-velvet-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {busy ? "Uploading…" : logoUrl ? "Change logo" : "Upload logo"}
        </button>
        {logoUrl && (
          <button
            onClick={remove}
            disabled={busy}
            className="h-9 px-4 rounded-lg border border-line text-xs font-semibold text-muted hover:text-ink hover:border-velvet/40 transition-colors disabled:opacity-40 cursor-pointer"
          >
            Remove
          </button>
        )}
      </div>

      {!configured && (
        <p className="text-[11px] text-muted mt-3">
          Image uploads are not configured on this deployment yet.
        </p>
      )}
      {error && <p className="text-sm text-out mt-3">{error}</p>}

      <p className="text-[11px] text-muted mt-4 leading-relaxed">
        A square image works best — it is shown at 34&nbsp;pixels, so fine detail and small
        lettering will not survive. PNG or WebP with a transparent background, up to 5&nbsp;MB.
        With no logo set, your initials are used instead.
      </p>
    </div>
  );
}

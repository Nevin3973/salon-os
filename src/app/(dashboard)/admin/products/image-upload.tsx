"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadProductImage, cloudinaryConfigured, optimizedImage } from "@/lib/cloudinary";
import { setProductImage } from "@/lib/actions/admin";

export function ProductImageCell({
  productId,
  name,
  imageUrl,
}: {
  productId: string;
  name: string;
  imageUrl: string | null;
}) {
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
    const saved = await setProductImage({ productId, imageUrl: uploaded.url });
    setBusy(false);
    if (!saved.ok) {
      setError(saved.error);
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex items-center gap-2">
      <div className="w-11 h-11 rounded-md border border-line bg-white grid place-items-center overflow-hidden shrink-0">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={optimizedImage(imageUrl, 96)} alt={name} className="w-full h-full object-contain" />
        ) : (
          <span className="text-faint text-[10px]">none</span>
        )}
      </div>
      <div className="min-w-0">
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
          title={configured ? "Upload a product photo" : "Image uploads are not configured"}
          className="text-xs font-medium text-velvet hover:text-velvet-dark disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {busy ? "Uploading…" : imageUrl ? "Change photo" : "Add photo"}
        </button>
        {error && <div className="text-[11px] text-out mt-0.5 max-w-[160px]">{error}</div>}
      </div>
    </div>
  );
}

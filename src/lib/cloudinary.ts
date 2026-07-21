/**
 * Client-side unsigned upload to Cloudinary.
 *
 * Unsigned presets mean no API secret ever reaches the browser — the preset
 * itself is the (revocable) permission. The resulting secure URL is then saved
 * against the product by a server action, which is where authorisation is
 * actually enforced.
 */

export const CLOUDINARY_CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "";
export const CLOUDINARY_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? "";

export function cloudinaryConfigured(): boolean {
  return Boolean(CLOUDINARY_CLOUD && CLOUDINARY_PRESET);
}

export type UploadResult = { ok: true; url: string } | { ok: false; error: string };

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export async function uploadProductImage(file: File): Promise<UploadResult> {
  if (!cloudinaryConfigured()) {
    return { ok: false, error: "Image uploads are not configured yet." };
  }
  if (!ALLOWED.includes(file.type)) {
    return { ok: false, error: "Use a JPG, PNG, WebP or AVIF image." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "That image is over 5 MB — please use a smaller one." };
  }

  const body = new FormData();
  body.append("file", file);
  body.append("upload_preset", CLOUDINARY_PRESET);

  try {
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, {
      method: "POST",
      body,
    });
    const json = await res.json();
    if (!res.ok || !json.secure_url) {
      const detail = json?.error?.message ?? "";
      // The commonest setup slip: the preset still requires a signature.
      if (/unsigned/i.test(detail)) {
        return { ok: false, error: "The Cloudinary preset must be set to 'Unsigned' in Settings → Upload." };
      }
      return { ok: false, error: detail || "Upload failed. Please try again." };
    }
    return { ok: true, url: json.secure_url as string };
  } catch {
    return { ok: false, error: "Could not reach the image service. Check your connection." };
  }
}

/** Cloudinary can resize/optimise on delivery — keeps catalogue pages light. */
export function optimizedImage(url: string, width = 400): string {
  if (!url.includes("/upload/")) return url;
  return url.replace("/upload/", `/upload/f_auto,q_auto,w_${width},c_limit/`);
}

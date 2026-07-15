export function safePublicUrl(value: unknown, options?: { allowImageData?: boolean }): string | null {
  if (value == null || value === "") return null;
  const raw = String(value).trim();
  if (!raw || /[\u0000-\u001f\u007f]/.test(raw) || raw.startsWith("//")) return null;
  if (/^\/(?!\/)/.test(raw)) return raw;
  if (options?.allowImageData && /^data:image\/(?:png|jpeg|jpg|webp);base64,[a-z0-9+/=\s]+$/i.test(raw)) {
    return raw.length <= 2_800_000 ? raw : null;
  }
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function isSafeGeneratedJpegName(value: unknown): boolean {
  return /^\d+_[a-f0-9]{24}\.jpg$/.test(String(value ?? ""));
}

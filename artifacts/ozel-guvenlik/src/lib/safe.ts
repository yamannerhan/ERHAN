/** API / bildirim / liste yanıtlarını güvenli diziye çevir */
export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * Bildirim / banner linklerini uygulama içi path'e çevir.
 * Absolute URL, boş veya tehlikeli değerler temizlenir.
 */
export function normalizeAppPath(raw: unknown, fallback = "/"): string {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const u = new URL(trimmed);
      if (typeof window !== "undefined" && u.origin === window.location.origin) {
        const path = `${u.pathname}${u.search}${u.hash}` || "/";
        return path.startsWith("/") ? path : fallback;
      }
      return fallback;
    }
  } catch {
    return fallback;
  }

  if (trimmed.startsWith("//")) return fallback;
  if (trimmed.startsWith("/")) {
    // protokol-relative veya javascript: benzeri engelle
    if (/^\/\s*javascript:/i.test(trimmed)) return fallback;
    return trimmed;
  }
  return fallback;
}

export function safeNavigate(
  navigate: (path: string) => void,
  raw: unknown,
  fallback = "/",
): void {
  const path = normalizeAppPath(raw, fallback);
  try {
    navigate(path);
  } catch {
    try {
      window.location.assign(path);
    } catch { /* ignore */ }
  }
}

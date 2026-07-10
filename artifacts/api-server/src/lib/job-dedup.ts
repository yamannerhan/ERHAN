import crypto from "crypto";

/**
 * Çift ilan: sadece metinlerin (normalize edilmiş) tamamı aynıysa.
 * Benzer güvenlik ilanları / aynı telefon / aynı isim tek başına çift sayılmaz.
 */
export function normalizeJobContentForDedup(text: string): string {
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/\r\n/g, "\n")
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function createDuplicateHash(text: string): string {
  const normalized = normalizeJobContentForDedup(text);
  return crypto.createHash("sha256").update(`job-exact:${normalized || "empty"}`).digest("hex");
}

/** @deprecated Benzerlik artık kullanılmıyor — tam metin eşleşmesi için createDuplicateHash kullanın. */
export function duplicateTokenSimilarity(_a: string, _b: string): number {
  return 0;
}

export function normalizePhoneForDedup(text: string): string | null {
  const m = text.match(/(?:\+90|0)[\s\-.]?5\d{2}[\s\-.]?\d{3}[\s\-.]?\d{2}[\s\-.]?\d{2}|(?<!\d)5\d{9}(?!\d)/);
  if (!m) return null;
  const digits = m[0].replace(/[\s\-.\(\)]/g, "");
  return digits.startsWith("+90") ? "0" + digits.slice(3) : digits.startsWith("0") ? digits : "0" + digits;
}

/** Yalnızca tüm yazı aynıysa çift. */
export function isLikelyDuplicateJob(a: string, b: string): boolean {
  if (!a?.trim() || !b?.trim()) return false;
  return createDuplicateHash(a) === createDuplicateHash(b);
}

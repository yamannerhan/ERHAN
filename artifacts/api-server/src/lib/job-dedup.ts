import crypto from "crypto";

const DEDUP_STOP_WORDS = new Set([
  "ilan", "ilani", "alimi", "alim", "araniyor", "aranmaktadir", "yapilacaktir", "alinacaktir",
  "gorev", "yeri", "gorevlisi", "personel", "eleman", "ozel", "guvenlik", "ogg",
  "basvuru", "iletisim", "irtibat", "tel", "whatsapp", "watsapp", "wp", "maas",
  "ucret", "hakedis", "net", "toplam", "tl", "bin", "proje", "projemiz", "projede", "projesi",
  "icin", "ile", "ve", "bir", "olan", "olarak", "uygun", "deneyimli", "kimlik",
  "kartli", "karti", "sahibi", "deleted", "gunduz", "gece", "izin", "off", "vardiya",
  "saat", "calisma", "sistemi", "duzen", "her", "seydahil", "dahil", "site", "arkasi",
  "avm", "plaza", "bay", "bayan", "erkek", "kadin", "emekli", "silahli", "silahsiz",
  "araniyoruz", "aliyoruz", "lazim", "ihtiyac", "kontenjan", "adet", "kişi", "kisi",
]);

const DUPLICATE_SIMILARITY_THRESHOLD = 0.75;
const DUPLICATE_PHONE_SIMILARITY_THRESHOLD = 0.55;

/** Telegram kopyaları / küçük farklar için agresif normalizasyon */
export function normalizeJobContentForDedup(text: string): string {
  let s = text
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/\r\n/g, "\n")
    .replace(/^>.*$/gm, " ")
    .replace(/deleted:/gi, " ")
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, " ")
    .replace(/(?:\+90|0)[\s\-.()]?5\d{2}[\s\-.()]?\d{3}[\s\-.()]?\d{2}[\s\-.()]?\d{2}/g, " ")
    .replace(/(?<!\d)5\d{9}(?!\d)/g, " ")
    .replace(/\d{1,2}[./]\d{1,2}[./]\d{2,4}/g, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/t\.me\/\S+/gi, " ")
    .replace(/@\w+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  s = s.replace(/\b\d{1,3}(?:\.\d{3})+\b/g, (m) => m.replace(/\./g, ""));
  // Telefon parçaları ve vardiya sayıları (2 gündüz 2 gece vb.)
  s = s.replace(/\b\d{1,3}\b/g, " ");

  const tokens = s.split(" ").filter((t) => t.length > 2 && !DEDUP_STOP_WORDS.has(t));
  return [...new Set(tokens)].sort().join(" ");
}

export function createDuplicateHash(text: string): string {
  const normalized = normalizeJobContentForDedup(text);
  return crypto.createHash("sha256").update(`job:${normalized || "empty"}`).digest("hex");
}

export function duplicateTokenSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeJobContentForDedup(a).split(" ").filter(Boolean));
  const tb = new Set(normalizeJobContentForDedup(b).split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size);
}

export function normalizePhoneForDedup(text: string): string | null {
  const m = text.match(/(?:\+90|0)[\s\-.]?5\d{2}[\s\-.]?\d{3}[\s\-.]?\d{2}[\s\-.]?\d{2}|(?<!\d)5\d{9}(?!\d)/);
  if (!m) return null;
  const digits = m[0].replace(/[\s\-.\(\)]/g, "");
  return digits.startsWith("+90") ? "0" + digits.slice(3) : digits.startsWith("0") ? digits : "0" + digits;
}

export function isLikelyDuplicateJob(a: string, b: string): boolean {
  if (createDuplicateHash(a) === createDuplicateHash(b)) return true;

  const sim = duplicateTokenSimilarity(a, b);
  if (sim >= DUPLICATE_SIMILARITY_THRESHOLD) return true;

  const phoneA = normalizePhoneForDedup(a);
  const phoneB = normalizePhoneForDedup(b);
  if (phoneA && phoneB && phoneA === phoneB && sim >= DUPLICATE_PHONE_SIMILARITY_THRESHOLD) {
    return true;
  }

  return false;
}

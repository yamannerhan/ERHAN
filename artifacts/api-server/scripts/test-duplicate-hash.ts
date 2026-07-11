import crypto from "crypto";

const DEDUP_STOP_WORDS = new Set([
  "ilan", "alimi", "alim", "araniyor", "aranmaktadir", "yapilacaktir", "alinacaktir",
  "gorev", "yeri", "gorevlisi", "personel", "eleman", "ozel", "guvenlik", "ogg",
  "basvuru", "iletisim", "irtibat", "tel", "whatsapp", "watsapp", "wp", "maas",
  "ucret", "hakedis", "net", "toplam", "tl", "bin", "proje", "projemiz", "projede",
  "icin", "ile", "ve", "bir", "olan", "olarak", "uygun", "deneyimli", "kimlik",
  "kartli", "kartı", "sahibi", "deleted", "gunduz", "gece", "izin", "off", "vardiya",
  "saat", "calisma", "sistemi", "duzen", "her", "seydahil", "dahil",
]);

function normalizeJobContentForDedup(text: string): string {
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

  const tokens = s.split(" ").filter((t) => t.length > 2 && !DEDUP_STOP_WORDS.has(t));
  return [...new Set(tokens)].sort().join(" ");
}

function createDuplicateHash(text: string): string {
  const normalized = normalizeJobContentForDedup(text);
  return crypto.createHash("sha256").update(`job:${normalized || "empty"}`).digest("hex");
}

function duplicateTokenSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeJobContentForDedup(a).split(" ").filter(Boolean));
  const tb = new Set(normalizeJobContentForDedup(b).split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size);
}

const base = `📢 ÖZEL GÜVENLİK GÖREVLİSİ ALIM İLANI
Beylikdüzü Marmara Park AVM arkası site projesi
2 Gündüz – 2 Gece – 2 İzin
Maaş: 45.000 TL
WhatsApp 0507 649 22 54`;

const variant = `ÖZEL GÜVENLİK GÖREVLİSİ ALIM İLANI
Görev Yeri Beylikdüzü Marmara Park AVM arkası
2 Gündüz 2 Gece 2 İzin
45.000 TL
Tel: +90 507 649 22 54`;

const different = `Pendik Kurtköy Plaza projesi Bay özel güvenlik 38.590 TL 0506 534 78 44`;

const sim = duplicateTokenSimilarity(base, variant);
const simDiff = duplicateTokenSimilarity(base, different);

if (sim < 0.82) {
  console.error("FAIL: same job similarity", sim);
  process.exit(1);
}
if (simDiff >= 0.82) {
  console.error("FAIL: different jobs too similar", simDiff);
  process.exit(1);
}
console.log("ALL OK", { sim, simDiff });

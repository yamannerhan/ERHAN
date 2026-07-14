/** Türkçe konum metin normalizasyonu — Location Classifier V2 */

export type NormalizedText = {
  original: string;
  ascii: string;
  folded: string;
  tokens: string[];
};

export function normalizeTurkishText(input: string): NormalizedText {
  const original = String(input ?? "");
  const nfkc = original.normalize("NFKC");
  const lower = nfkc.toLocaleLowerCase("tr-TR");
  // G.O.S.B. → gosb
  const dottedAbbr = lower.replace(/\b([a-zçğıöşü])\.(?:([a-zçğıöşü])\.)+/gi, (m) =>
    m.replace(/\./g, ""),
  );
  // Noktalama: cümle sonlarını koru (konum rol mesafesi için)
  const withSent = dottedAbbr.replace(/[.!?;]+/g, " <sent> ").replace(/[,:]+/g, " ");
  const ascii = withSent
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9\s<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const folded = ascii.replace(/<sent>/g, " ");
  const tokens = folded.split(" ").filter((t) => {
    if (!t) return false;
    // telefon / maaş / tarih benzeri gürültü
    if (/^\d{5,}$/.test(t)) return false;
    if (/^\d+[.,]\d+$/.test(t)) return false;
    return true;
  });
  return { original, ascii, folded, tokens };
}

export function normalizeAliasKey(value: string): string {
  return normalizeTurkishText(value).ascii.replace(/\s+/g, " ").trim();
}

export function compactKey(value: string): string {
  return normalizeAliasKey(value).replace(/\s+/g, "");
}

export function hashText(value: string): string {
  const s = normalizeAliasKey(value);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

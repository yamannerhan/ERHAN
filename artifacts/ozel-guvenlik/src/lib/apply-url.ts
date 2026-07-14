/** Açıklama / metinden tüm TR cep telefonlarını çıkar (05XXXXXXXXX). */
export function extractPhonesFromText(text: string | null | undefined): string[] {
  if (!text) return [];
  const found: string[] = [];
  const seen = new Set<string>();
  const patterns = [
    /(?:\+90|0)?[\s\-./()]*(?:5(?:[\s\-./()]*\d){9})/g,
    /(?<!\d)5(?:[\s\-./()]*\d){9}(?!\d)/g,
  ];
  for (const re of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const digits = m[0].replace(/\D/g, "");
      let normalized = digits;
      if (normalized.startsWith("90") && normalized.length >= 12) {
        normalized = "0" + normalized.slice(2);
      }
      if (normalized.length === 10 && normalized.startsWith("5")) {
        normalized = "0" + normalized;
      }
      if (/^0+5\d{9}$/.test(normalized)) {
        normalized = "0" + normalized.slice(-10);
      }
      if (/^05\d{9}$/.test(normalized) && !seen.has(normalized)) {
        seen.add(normalized);
        found.push(normalized);
      }
    }
  }
  return found;
}

/** İlk bulunan numara — geriye uyumlu. */
export function extractPhoneFromText(text: string | null | undefined): string | null {
  return extractPhonesFromText(text)[0] ?? null;
}

/** Kullanıcı girişi / applyUrl → normalize edilmiş numaralar. */
export function normalizePhoneList(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return extractPhonesFromText(raw.replace(/^tel:/i, ""));
}

export function formatTelApplyUrl(phones: string[]): string | null {
  const list = normalizePhoneList(phones.join(","));
  if (!list.length) return null;
  return `tel:${list.join(",")}`;
}

/** Virgül / satır ile birden fazla isim. */
export function normalizeContactNames(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";
  return raw
    .split(/[,;\n|]+/)
    .map((s) => s.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .slice(0, 8)
    .join(", ");
}

function isTelegramOrChatLink(url: string): boolean {
  return /t\.me\//i.test(url) || /telegram\.me\//i.test(url) || /wa\.me\//i.test(url);
}

/**
 * Başvuru: her zaman telefon ara. Telegram / sohbet linkine düşme.
 * Birden fazla numara varsa ilkini ana CTA olarak döner.
 */
export function resolveApplyHref(opts: {
  applyUrl?: string | null;
  description?: string | null;
  requirements?: string | null;
  title?: string | null;
}): string | null {
  const raw = (opts.applyUrl ?? "").trim();
  if (raw.startsWith("tel:")) {
    const phones = normalizePhoneList(raw);
    if (phones[0]) return `tel:${phones[0]}`;
  }
  if (raw === "auth_required") return "auth_required";

  const blob = [opts.applyUrl, opts.description, opts.requirements, opts.title].filter(Boolean).join("\n");
  const phones = extractPhonesFromText(blob);
  if (phones[0]) return `tel:${phones[0]}`;

  if (raw && isTelegramOrChatLink(raw)) return null;
  if (raw.startsWith("http")) return null;
  if (raw) return raw;
  return null;
}

/** İlanda gösterilecek tüm telefonlar (applyUrl + metin). */
export function collectListingPhones(opts: {
  applyUrl?: string | null;
  description?: string | null;
  requirements?: string | null;
  title?: string | null;
}): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of [
    ...normalizePhoneList(opts.applyUrl),
    ...extractPhonesFromText([opts.description, opts.requirements, opts.title].filter(Boolean).join("\n")),
  ]) {
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

/** Açıklama / metinden TR cep telefonu çıkar (05XXXXXXXXX) */
export function extractPhoneFromText(text: string | null | undefined): string | null {
  if (!text) return null;
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
      if (/^05\d{9}$/.test(normalized)) return normalized;
    }
  }
  return null;
}

function isTelegramOrChatLink(url: string): boolean {
  return /t\.me\//i.test(url) || /telegram\.me\//i.test(url) || /wa\.me\//i.test(url);
}

/**
 * Başvuru: her zaman telefon ara. Telegram / sohbet linkine düşme.
 * Numara yoksa null → detay sayfasına yönlendirilir.
 */
export function resolveApplyHref(opts: {
  applyUrl?: string | null;
  description?: string | null;
  requirements?: string | null;
  title?: string | null;
}): string | null {
  const raw = (opts.applyUrl ?? "").trim();
  if (raw.startsWith("tel:")) {
    const digits = raw.slice(4).replace(/\D/g, "");
    if (digits.length >= 10) return raw;
  }
  if (raw === "auth_required") return "auth_required";

  const blob = [opts.description, opts.requirements, opts.title, raw].filter(Boolean).join("\n");
  const phone = extractPhoneFromText(blob);
  if (phone) return `tel:${phone}`;

  // Telegram / WhatsApp linki başvuru sayılmaz
  if (raw && isTelegramOrChatLink(raw)) return null;
  if (raw.startsWith("http")) return null;
  if (raw) return raw;
  return null;
}

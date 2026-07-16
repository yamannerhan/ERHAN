/**
 * Türkiye WhatsApp numaralarını E.164 digits (ülke kodu + numara, + yok) biçimine çevirir.
 * 5052661996 / 05052661996 / +90 505 266 19 96 → 905052661996
 */
export function normalizeTurkishWhatsAppPhone(input: string): string | null {
  const digits = String(input ?? "").replace(/\D/g, "");
  if (!digits) return null;

  let n = digits;
  if (n.startsWith("00")) n = n.slice(2);
  if (n.startsWith("90") && n.length >= 12) n = n.slice(0, 12);
  else if (n.startsWith("0") && n.length === 11) n = `90${n.slice(1)}`;
  else if (n.length === 10 && n.startsWith("5")) n = `90${n}`;
  else if (n.length === 11 && n.startsWith("5")) n = `90${n.slice(0, 10)}`; // nadir bozukluk
  else return null;

  if (!/^90[5]\d{9}$/.test(n)) return null;
  return n;
}

export function isValidWaPhone(normalized: string): boolean {
  return /^90[5]\d{9}$/.test(normalized);
}

export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  if (phone.length < 6) return "***";
  return `${phone.slice(0, 4)}****${phone.slice(-2)}`;
}

export function maskChatId(chatId: string | null | undefined): string | null {
  if (!chatId) return null;
  if (chatId.length <= 12) return "***";
  return `${chatId.slice(0, 6)}…${chatId.slice(-6)}`;
}

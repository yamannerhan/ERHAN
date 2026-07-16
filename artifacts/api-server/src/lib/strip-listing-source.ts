/** Kullanıcıya giden sohbet / bildirim metninden Telegram·WhatsApp·Eleman vb. kaynak izlerini sil. */
export function stripListingSourceLabels(text: string): string {
  if (!text) return text;
  return text
    .replace(/\s*\[(?:Telegram|WhatsApp|Eleman\.net|Eleman|Demo|Kaynak)\]/gi, "")
    .replace(/\b(?:Telegram|WhatsApp|Eleman\.net|Eleman)\s*[—\-–:]\s*/gi, "")
    .replace(
      /\b(?:Telegram|WhatsApp|Eleman\.net|Eleman|Kaynak)\s+ilanı\s+yayınlandı:\s*/gi,
      "Yeni ilan eklendi: ",
    )
    .replace(/\s{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Kullanıcı maaş girişi → standart "45.300 TL"
 * Örn: 45300 | 45.300 | 45300 tl → 45.300 TL
 */
export function formatSalaryInput(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (/asgari\s*[üu]cret/i.test(s) && !/\d/.test(s)) return "Asgari Ücret";

  const isDaily = /g[üu]nl[üu]k|yevmiye/i.test(s);
  const isTotal = /toplam/i.test(s);
  const digits = s.replace(/[^\d]/g, "");
  if (!digits) return s;

  const n = Number(digits);
  if (!Number.isFinite(n) || n < 400 || n > 500_000) return s;

  const formatted = `${n.toLocaleString("tr-TR")} TL`;
  if (isDaily && n <= 25_000) return `${formatted} / Günlük`;
  if (isTotal) return `${formatted} Toplam`;
  return formatted;
}

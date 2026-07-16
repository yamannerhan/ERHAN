import type { ClassifierResult } from "./types";
import { normalizeTurkishWhatsAppPhone } from "./phone";

function normalizeTr(text: string): string {
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}

const NEGATIVE = [
  /is\s+ariyorum/,
  /guvenlik\s+isi\s+ariyorum/,
  /is\s+ariyorum/,
  /\bkurs\b/,
  /sertifika/,
  /kimlik\s+yenileme/,
  /\begitim\b/,
  /\bhaber\b/,
  /\breklam\b/,
  /siyasi/,
  /\bsatilik\b/,
  /\bkiralik\b/,
  /\bsohbet\b/,
  /gunaydin/,
  /kandil/,
  /bayraminiz/,
  /hayirli\s+bayram/,
];

const POSITIVE_ROLE = [
  /ozel\s+guvenlik/,
  /guvenlik\s+gorevlisi/,
  /bay\s+guvenlik/,
  /bayan\s+guvenlik/,
  /silahli\s+guvenlik/,
  /silahsiz\s+guvenlik/,
  /guvenlik\s+personeli/,
  /koruma\s+guvenlik/,
  /guvenlik\s+elemani/,
  /guvenlik\s+kimlik/,
  /\bogg\b/,
  /guvenlik\s+amiri/,
];

const HIRING = [
  /araniyor/,
  /aranmaktadir/,
  /alinacak/,
  /personel\s+alim/,
  /eleman\s+alim/,
  /ise\s+alim/,
  /basvuru/,
  /iletisim/,
  /is\s+ilani/,
  /\bvardiya\b/,
  /\bmaas\b/,
  /\bservis\b/,
  /\byemek\b/,
];

function extractField(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1].trim().slice(0, 120);
  }
  return null;
}

function extractPhones(text: string): string | null {
  const matches = text.match(/(?:\+?90|0)?\s*5\d{2}[\s().-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}/g) ?? [];
  for (const raw of matches) {
    const n = normalizeTurkishWhatsAppPhone(raw);
    if (n) return n;
  }
  return null;
}

/**
 * Kural tabanlı özel güvenlik iş ilanı sınıflandırıcısı.
 * Yalnız işveren/aracı alım ilanlarını kabul eder.
 */
export function classifySecurityJob(text: string): ClassifierResult {
  const raw = String(text ?? "").trim();
  const extractedFields: Record<string, string | null> = {
    title: null,
    city: null,
    district: null,
    company: null,
    position: null,
    genderPreference: null,
    armed: null,
    workType: null,
    shift: null,
    salary: null,
    meal: null,
    transport: null,
    age: null,
    height: null,
    experience: null,
    phone: null,
  };

  if (raw.length < 20) {
    return { isJobPosting: false, confidence: 0.9, reason: "too_short", extractedFields };
  }

  const t = normalizeTr(raw);

  for (const re of NEGATIVE) {
    if (re.test(t) && !/araniyor|alinacak|personel\s+alim/.test(t)) {
      return { isJobPosting: false, confidence: 0.85, reason: `negative:${re.source}`, extractedFields };
    }
    // İş arayan net ifadeler her zaman negatif
    if (/is\s+ariyorum|guvenlik\s+isi\s+ariyorum/.test(t)) {
      return { isJobPosting: false, confidence: 0.95, reason: "job_seeker", extractedFields };
    }
  }

  const hasRole = POSITIVE_ROLE.some((re) => re.test(t));
  const hasHiring = HIRING.some((re) => re.test(t));
  const hasPhone = /(?:\+?90|0)?5\d{2}/.test(t) || /5\d{9}/.test(t);

  if (!hasRole) {
    return { isJobPosting: false, confidence: 0.8, reason: "no_security_role", extractedFields };
  }
  if (!hasHiring && !hasPhone) {
    return { isJobPosting: false, confidence: 0.75, reason: "no_hiring_signal", extractedFields };
  }

  extractedFields.phone = extractPhones(raw);
  extractedFields.salary = extractField(raw, [
    /(?:maa[şs]|[üu]cret)\s*[:\-]?\s*([^\n,]{3,40})/i,
  ]);
  extractedFields.city = extractField(raw, [
    /(?:şehir|il)\s*[:\-]\s*([^\n,]{2,40})/i,
  ]);
  extractedFields.district = extractField(raw, [
    /(?:ilçe|ilce)\s*[:\-]\s*([^\n,]{2,40})/i,
  ]);
  extractedFields.company = extractField(raw, [
    /(?:firma|şirket|proje)\s*[:\-]\s*([^\n,]{2,60})/i,
  ]);
  extractedFields.shift = /vardiya/i.test(raw) ? "vardiya" : null;
  extractedFields.meal = /yemek/i.test(raw) ? "var" : null;
  extractedFields.transport = /servis/i.test(raw) ? "var" : null;
  extractedFields.armed = /silahl[ıi]/i.test(raw) ? "silahli" : /silahs[ıi]z/i.test(raw) ? "silahsiz" : null;
  extractedFields.genderPreference = /bayan\s+g[üu]venlik/i.test(raw)
    ? "bayan"
    : /bay\s+g[üu]venlik/i.test(raw)
      ? "bay"
      : null;
  extractedFields.position = hasRole ? "Özel Güvenlik" : null;
  extractedFields.age = extractField(raw, [/ya[şs]\s*[:\-]?\s*(\d{2}(?:\s*[-–]\s*\d{2})?)/i]);
  extractedFields.height = extractField(raw, [/boy\s*[:\-]?\s*(\d{2,3})/i]);
  extractedFields.experience = extractField(raw, [/deneyim\s*[:\-]?\s*([^\n,]{2,40})/i]);
  extractedFields.workType = /part[\s-]?time|yar[ıi]\s+zaman/i.test(raw)
    ? "Part Time"
    : /vardiya/i.test(raw)
      ? "Vardiyalı"
      : "Tam Zamanlı";

  const confidence = hasRole && hasHiring ? 0.9 : hasRole && hasPhone ? 0.8 : 0.7;
  return {
    isJobPosting: true,
    confidence,
    reason: hasHiring ? "role+hiring" : "role+phone",
    extractedFields,
  };
}

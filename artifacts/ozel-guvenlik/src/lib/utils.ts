import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// İlanın "requirements" metnindeki "Cinsiyet: X" satırından cinsiyeti çeker.
// Bulunamazsa "Belirtilmemiş" döner.
export function extractGender(requirements?: string | null): string {
  if (requirements) {
    const line = requirements
      .split("\n")
      .find((l) => l.trim().toLocaleLowerCase("tr-TR").startsWith("cinsiyet:"));
    if (line) {
      const val = line.split(":").slice(1).join(":").trim();
      if (val) return val;
    }
  }
  return "Belirtilmemiş";
}

export function extractRequirementValue(requirements: string | null | undefined, label: string): string | null {
  if (!requirements) return null;
  const prefix = `${label.toLocaleLowerCase("tr-TR")}:`;
  const line = requirements
    .split("\n")
    .find((l) => l.trim().toLocaleLowerCase("tr-TR").startsWith(prefix));
  if (!line) return null;
  const value = line.split(":").slice(1).join(":").trim();
  return value || null;
}

export function extractBenefits(requirements?: string | null, description?: string | null): string[] {
  const benefits: string[] = [];
  const add = (label: string) => { if (!benefits.includes(label)) benefits.push(label); };
  const value = extractRequirementValue(requirements, "Yan Haklar");
  value?.split(",").map(v => v.trim()).filter(Boolean).forEach(add);

  const text = `${requirements ?? ""}\n${description ?? ""}`.toLocaleLowerCase("tr-TR");
  if (/\bservis\b|personel\s+servisi|ula[şs][ıi]m/.test(text)) add("Servis");
  if (/\byemek\b|yemekhane|ö[ğg]le\s+yeme[ğg]i/.test(text)) add("Yemek");
  if (/yemek\s+kart[ıi]|multinet|sodexo|edenred|ticket|setcard|metropol/.test(text)) add("Yemek Kartı");
  if (/\bsgk\b|sigorta|sosyal\s+g[üu]vence/.test(text)) add("SGK");
  if (/prim|ikramiye|bonus/.test(text)) add("Prim");
  if (/konaklama|lojman|yat[ıi]l[ıi]/.test(text)) add("Konaklama");
  if (/k[ıi]yafet|uniforma|elbise/.test(text)) add("Kıyafet");
  if (/mesai|fazla\s+mesai/.test(text)) add("Mesai");
  return benefits;
}

// Firma adı anlamlı değilse (boş veya "Belirtilmemiş" gibi yer tutucu) null döner ki
// arayüzde gereksiz "Belirtilmemiş" yazısı gösterilmesin.
const COMPANY_PLACEHOLDERS = new Set(["", "n", "belirtilmemiş", "belirtilmemis"]);
export function displayCompany(company?: string | null): string | null {
  if (!company) return null;
  const t = company.trim();
  if (!t || COMPANY_PLACEHOLDERS.has(t.toLocaleLowerCase("tr-TR"))) return null;
  return t;
}

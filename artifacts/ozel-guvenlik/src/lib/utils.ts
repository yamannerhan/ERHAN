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

// Firma adı anlamlı değilse (boş veya "Belirtilmemiş" gibi yer tutucu) null döner ki
// arayüzde gereksiz "Belirtilmemiş" yazısı gösterilmesin.
const COMPANY_PLACEHOLDERS = new Set(["", "n", "belirtilmemiş", "belirtilmemis"]);
export function displayCompany(company?: string | null): string | null {
  if (!company) return null;
  const t = company.trim();
  if (!t || COMPANY_PLACEHOLDERS.has(t.toLocaleLowerCase("tr-TR"))) return null;
  return t;
}

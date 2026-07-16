import { SCORE_WEIGHTS } from "./constants";

export type JobMatchPrefsInput = {
  preferredCities: string[];
  preferredDistricts: string[];
  nearbyDistrictsEnabled: boolean;
  maximumDistance: number | null;
  securityLicenseTypes: string[];
  employmentTypes: string[];
  shiftPreferences: string[];
  projectTypes: string[];
  minimumSalary: number | null;
  benefits: string[];
  experienceLevel: string | null;
  preferredRoles: string[];
  drivingLicense: boolean;
  srcCertificate: boolean;
  height?: string | null;
  weight?: string | null;
};

export type ListingMatchInput = {
  id: number;
  title: string;
  city: string;
  company?: string | null;
  salary?: string | null;
  salaryMin?: number | null;
  workType?: string | null;
  description?: string | null;
  requirements?: string | null;
};

export type MatchReason =
  | "Konumuna uygun"
  | "Silahlı kimliğine uygun"
  | "Silahsız kimliğine uygun"
  | "Vardiya tercihinle eşleşiyor"
  | "Maaş beklentine uygun"
  | "Tercih ettiğin proje türü"
  | "Deneyimine uygun"
  | "Sana yakın"
  | "Çalışma şekline uygun";

export type MatchMismatch =
  | "Maaş beklentisinin altında"
  | "Seçtiğin ilçenin dışında"
  | "Farklı vardiya düzeni"
  | "Farklı proje türü"
  | "Silahlı/silahsız uyuşmuyor"
  | "Farklı il";

export type MatchResult = {
  score: number;
  hardFail: boolean;
  reasons: MatchReason[];
  mismatches: MatchMismatch[];
  label: "cok_uygun" | "uygun" | "ilgini_cekebilir" | "normal";
  labelText: string;
};

function norm(s: string): string {
  return s
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}

function blobOf(l: ListingMatchInput): string {
  return norm(`${l.title} ${l.city} ${l.company ?? ""} ${l.workType ?? ""} ${l.description ?? ""} ${l.requirements ?? ""} ${l.salary ?? ""}`);
}

function cityOf(listing: ListingMatchInput): string {
  return norm(listing.city || "");
}

function listingArmed(blob: string): "armed" | "unarmed" | "unknown" {
  const armed = /silahli/.test(blob) && !/silahsiz/.test(blob);
  const unarmed = /silahsiz/.test(blob);
  if (armed) return "armed";
  if (unarmed) return "unarmed";
  return "unknown";
}

function parseSalary(listing: ListingMatchInput): number | null {
  if (listing.salaryMin && listing.salaryMin > 0) return listing.salaryMin;
  const m = String(listing.salary ?? "").match(/(\d{1,3}(?:[.,]\d{3})+|\d{4,6})/);
  if (!m) return null;
  const n = Number(m[1].replace(/[.,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

const PROJECT_PATTERNS: Record<string, RegExp> = {
  site: /\bsite\b|sitesi/,
  residence: /rezidans|residence/,
  avm: /\bavm\b|alisveris merkezi/,
  factory: /fabrika/,
  warehouse: /\bdepo\b/,
  logistics: /lojistik/,
  hospital: /hastane/,
  plaza: /plaza|is merkezi/,
  hotel: /otel|hotel/,
  school: /\bokul\b/,
  university: /universite/,
  bank: /\bbanka\b/,
  municipality: /belediye/,
  public: /kamu/,
  construction: /santiye/,
  osb: /\bosb\b|organize sanayi/,
  event: /etkinlik|mac gunu|konser/,
  close_protection: /yakin koruma|koruma gorev/,
};

const EMPLOYMENT_PATTERNS: Record<string, RegExp> = {
  fulltime: /tam zamanli|full.?time|sabit/,
  parttime: /part.?time|yari zamanli|parti.?me/,
  daily: /gunluk|yevmiye/,
};

const SHIFT_PATTERNS: Record<string, RegExp> = {
  night: /gece|20:00|21:00|22:00|24\s*\/\s*48/,
  day: /gunduz|08:00|09:00/,
  h8: /8\s*saat|08:00\s*\/\s*16:00|09:00\s*\/\s*17:00/,
  h12: /12\s*saat|12\s*\/\s*24|12\s*\/\s*36/,
  "2_2_2": /2\s*\+\s*2|2\s*gunduz|2\s*\/\s*2\s*\/\s*2|4\s*calis\s*3/,
  fixed: /sabit vardiya|sabit gece|sabit gunduz/,
};

export function matchLabel(score: number): Pick<MatchResult, "label" | "labelText"> {
  if (score >= 90) return { label: "cok_uygun", labelText: "Çok Uygun" };
  if (score >= 75) return { label: "uygun", labelText: "Uygun" };
  if (score >= 60) return { label: "ilgini_cekebilir", labelText: "İlgini Çekebilir" };
  return { label: "normal", labelText: "Normal öneri" };
}

/** Saf eşleştirme — unit test için */
export function scoreListingMatch(
  prefs: JobMatchPrefsInput,
  listing: ListingMatchInput,
  opts?: { soft?: boolean },
): MatchResult {
  const soft = !!opts?.soft;
  const blob = blobOf(listing);
  const listingCity = cityOf(listing);
  const reasons: MatchReason[] = [];
  const mismatches: MatchMismatch[] = [];
  let score = 0;
  let hardFail = false;

  const cities = prefs.preferredCities.map(norm).filter(Boolean);
  const districts = prefs.preferredDistricts.map(norm).filter(Boolean);
  const cityHit = cities.some((c) => listingCity.includes(c) || c.includes(listingCity) || blob.includes(c));
  const districtHit = districts.some((d) => listingCity.includes(d) || blob.includes(d));

  if (cityHit) {
    score += SCORE_WEIGHTS.city;
    reasons.push("Konumuna uygun");
  } else if (!soft) {
    hardFail = true;
    mismatches.push("Farklı il");
  } else {
    mismatches.push("Farklı il");
    score += Math.floor(SCORE_WEIGHTS.city * 0.35);
  }

  if (districtHit) {
    score += SCORE_WEIGHTS.district;
    reasons.push("Sana yakın");
  } else if (districts.length && prefs.nearbyDistrictsEnabled && cityHit) {
    score += Math.floor(SCORE_WEIGHTS.district * 0.5);
    reasons.push("Sana yakın");
  } else if (districts.length) {
    mismatches.push("Seçtiğin ilçenin dışında");
  }

  const armedNeed = listingArmed(blob);
  const userArmed = prefs.securityLicenseTypes.includes("armed");
  const userUnarmed = prefs.securityLicenseTypes.includes("unarmed");
  const userHasCard = prefs.securityLicenseTypes.includes("has_card")
    || userArmed
    || userUnarmed
    || prefs.securityLicenseTypes.includes("renewing");

  if (armedNeed === "armed" && !userArmed) {
    hardFail = true;
    mismatches.push("Silahlı/silahsız uyuşmuyor");
  } else if (armedNeed === "unarmed" && userArmed && !userUnarmed) {
    // silahlı kullanıcı silahsıza girebilir — soft ok
    score += SCORE_WEIGHTS.license;
    reasons.push("Silahsız kimliğine uygun");
  } else if (armedNeed === "armed" && userArmed) {
    score += SCORE_WEIGHTS.license;
    reasons.push("Silahlı kimliğine uygun");
  } else if (armedNeed === "unarmed" && (userUnarmed || userHasCard)) {
    score += SCORE_WEIGHTS.license;
    reasons.push("Silahsız kimliğine uygun");
  } else if (armedNeed === "unknown" && userHasCard) {
    score += Math.floor(SCORE_WEIGHTS.license * 0.7);
  } else if (prefs.securityLicenseTypes.includes("none") && armedNeed !== "unknown") {
    hardFail = true;
    mismatches.push("Silahlı/silahsız uyuşmuyor");
  }

  // Erkek şartı — prefs'te cinsiyet yok; listing metninde bayan-only ve soft değilse puan düşür
  if (/\bbayan\b/.test(blob) && !/\bbay\b/.test(blob) && !soft) {
    score = Math.min(score, 55);
  }

  const empAny = prefs.employmentTypes.length === 0;
  let empHit = empAny;
  for (const e of prefs.employmentTypes) {
    const re = EMPLOYMENT_PATTERNS[e];
    if (re?.test(blob) || (e === "fulltime" && /tam zamanli|vardiya|sabit/.test(blob) && !/part.?time/.test(blob))) {
      empHit = true;
      break;
    }
  }
  if (empHit) {
    score += SCORE_WEIGHTS.employment;
    reasons.push("Çalışma şekline uygun");
  }

  const shiftAny = prefs.shiftPreferences.includes("any_shift")
    || prefs.shiftPreferences.includes("shift_any")
    || prefs.shiftPreferences.length === 0;
  let shiftHit = shiftAny;
  if (!shiftAny) {
    for (const s of prefs.shiftPreferences) {
      const re = SHIFT_PATTERNS[s];
      if (re?.test(blob)) { shiftHit = true; break; }
    }
  }
  if (shiftHit) {
    score += SCORE_WEIGHTS.shift;
    reasons.push("Vardiya tercihinle eşleşiyor");
  } else {
    mismatches.push("Farklı vardiya düzeni");
  }

  const projectAny = prefs.projectTypes.includes("any_project") || prefs.projectTypes.length === 0;
  let projectHit = projectAny;
  if (!projectAny) {
    for (const p of prefs.projectTypes) {
      const re = PROJECT_PATTERNS[p];
      if (re?.test(blob)) { projectHit = true; break; }
    }
  }
  if (projectHit) {
    score += SCORE_WEIGHTS.project;
    reasons.push("Tercih ettiğin proje türü");
  } else {
    mismatches.push("Farklı proje türü");
  }

  const sal = parseSalary(listing);
  if (prefs.minimumSalary == null || prefs.minimumSalary <= 0) {
    score += SCORE_WEIGHTS.salary;
  } else if (sal != null && sal >= prefs.minimumSalary) {
    score += SCORE_WEIGHTS.salary;
    reasons.push("Maaş beklentine uygun");
  } else if (sal == null) {
    score += Math.floor(SCORE_WEIGHTS.salary * 0.4);
  } else {
    mismatches.push("Maaş beklentisinin altında");
  }

  if (prefs.experienceLevel) {
    const expHit = prefs.experienceLevel === "none"
      || /tecrube|deneyim|yil/.test(blob)
      || true;
    if (expHit) {
      score += SCORE_WEIGHTS.experience;
      reasons.push("Deneyimine uygun");
    }
  } else {
    score += SCORE_WEIGHTS.experience;
  }

  const benefitsAny = prefs.benefits.includes("benefits_any") || prefs.benefits.length === 0;
  let extras = 0;
  if (benefitsAny) extras = SCORE_WEIGHTS.extras;
  else {
    let hits = 0;
    if (prefs.benefits.includes("service") && /servis/.test(blob)) hits += 1;
    if (prefs.benefits.includes("meal") && /yemek|multinet|sodexo/.test(blob)) hits += 1;
    if (prefs.benefits.includes("transport_pay") && /yol|ulasim/.test(blob)) hits += 1;
    if (prefs.benefits.includes("housing") && /lojman/.test(blob)) hits += 1;
    if (prefs.benefits.includes("overtime") && /fazla mesai|mesai/.test(blob)) hits += 1;
    extras = hits > 0 ? SCORE_WEIGHTS.extras : Math.floor(SCORE_WEIGHTS.extras * 0.3);
  }
  if (prefs.drivingLicense && /ehliyet/.test(blob)) extras = SCORE_WEIGHTS.extras;
  if (prefs.srcCertificate && /\bsrc\b/.test(blob)) extras = SCORE_WEIGHTS.extras;
  score += extras;

  if (hardFail && !soft) {
    score = 0;
  } else {
    score = Math.max(0, Math.min(100, Math.round(score)));
  }

  const { label, labelText } = matchLabel(score);
  return {
    score,
    hardFail: hardFail && !soft,
    reasons: [...new Set(reasons)].slice(0, 6),
    mismatches: [...new Set(mismatches)].slice(0, 4),
    label,
    labelText,
  };
}

export function validateJobPrefs(body: Partial<JobMatchPrefsInput>): string[] {
  const errors: string[] = [];
  const cities = Array.isArray(body.preferredCities) ? body.preferredCities.filter(Boolean) : [];
  const employment = Array.isArray(body.employmentTypes) ? body.employmentTypes : [];
  const license = Array.isArray(body.securityLicenseTypes) ? body.securityLicenseTypes : [];
  const shifts = Array.isArray(body.shiftPreferences) ? body.shiftPreferences : [];
  const projects = Array.isArray(body.projectTypes) ? body.projectTypes : [];

  if (!cities.length) errors.push("En az bir il seçmelisiniz.");
  if (!employment.length) errors.push("En az bir çalışma şekli seçmelisiniz.");
  if (!license.includes("armed") && !license.includes("unarmed") && !license.includes("has_card")) {
    errors.push("Silahlı veya silahsız tercihini seçmelisiniz.");
  }
  if (!shifts.length) errors.push("En az bir vardiya tercihi seçmelisiniz.");
  if (!projects.length) errors.push("En az bir proje türü seçmelisiniz veya «Fark etmez» seçin.");
  return errors;
}

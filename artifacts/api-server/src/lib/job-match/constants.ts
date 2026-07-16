export const EMPLOYMENT_OPTIONS = [
  { id: "fulltime", label: "Tam zamanlı" },
  { id: "parttime", label: "Part-time" },
  { id: "daily", label: "Günlük çalışma" },
] as const;

export const SHIFT_OPTIONS = [
  { id: "night", label: "Gece vardiyası" },
  { id: "day", label: "Gündüz vardiyası" },
  { id: "any_shift", label: "Gece ve gündüz fark etmez" },
  { id: "h8", label: "8 saat" },
  { id: "h12", label: "12 saat" },
  { id: "2_2_2", label: "2 gündüz 2 gece 2 izin" },
  { id: "fixed", label: "Sabit vardiya" },
  { id: "shift_any", label: "Vardiya fark etmez" },
] as const;

export const LICENSE_OPTIONS = [
  { id: "has_card", label: "Özel güvenlik kimlik kartım var" },
  { id: "armed", label: "Silahlı" },
  { id: "unarmed", label: "Silahsız" },
  { id: "renewing", label: "Kimlik yenileme aşamasında" },
  { id: "none", label: "Kimlik kartım yok" },
] as const;

export const PROJECT_OPTIONS = [
  { id: "site", label: "Site" },
  { id: "residence", label: "Rezidans" },
  { id: "avm", label: "AVM" },
  { id: "factory", label: "Fabrika" },
  { id: "warehouse", label: "Depo" },
  { id: "logistics", label: "Lojistik merkezi" },
  { id: "hospital", label: "Hastane" },
  { id: "plaza", label: "Plaza" },
  { id: "hotel", label: "Otel" },
  { id: "school", label: "Okul" },
  { id: "university", label: "Üniversite" },
  { id: "bank", label: "Banka" },
  { id: "municipality", label: "Belediye" },
  { id: "public", label: "Kamu kurumu" },
  { id: "construction", label: "Şantiye" },
  { id: "osb", label: "OSB" },
  { id: "event", label: "Etkinlik" },
  { id: "close_protection", label: "Yakın koruma" },
  { id: "any_project", label: "Proje türü fark etmez" },
] as const;

export const BENEFIT_OPTIONS = [
  { id: "transport_pay", label: "Yol parası olsun" },
  { id: "meal", label: "Yemek olsun" },
  { id: "service", label: "Servis olsun" },
  { id: "housing", label: "Lojman olsun" },
  { id: "overtime", label: "Fazla mesai olsun" },
  { id: "benefits_any", label: "Yan haklar önemli değil" },
] as const;

export const EXPERIENCE_OPTIONS = [
  { id: "none", label: "Deneyimsiz" },
  { id: "0_1", label: "0–1 yıl" },
  { id: "1_3", label: "1–3 yıl" },
  { id: "3_5", label: "3–5 yıl" },
  { id: "5_plus", label: "5 yıl ve üzeri" },
] as const;

export const ROLE_OPTIONS = [
  { id: "ogg", label: "Özel güvenlik görevlisi" },
  { id: "supervisor", label: "Güvenlik amiri" },
  { id: "shift_supervisor", label: "Güvenlik vardiya amiri" },
  { id: "cctv", label: "CCTV operatörü" },
  { id: "reception", label: "Danışma personeli" },
  { id: "close_protection", label: "Yakın koruma" },
] as const;

export const DISTANCE_OPTIONS = [
  { id: 5, label: "5 km" },
  { id: 10, label: "10 km" },
  { id: 20, label: "20 km" },
  { id: 30, label: "30 km" },
  { id: 50, label: "50 km" },
  { id: null, label: "Mesafe önemli değil" },
] as const;

export const SCORE_WEIGHTS = {
  city: 25,
  district: 15,
  license: 15,
  employment: 10,
  shift: 10,
  project: 10,
  salary: 5,
  experience: 5,
  extras: 5,
} as const;

export const MATCH_THRESHOLD = 60;

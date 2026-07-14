/** Location Classifier V2 — puanlama yapılandırması */
export const locationScoringConfig = {
  structuredWorkLocation: 100,
  workPlacePhraseNear: 100,
  projectPhraseNear: 85,
  titleExactOsb: 80,
  titleExactDistrict: 70,
  descriptionExactOsb: 70,
  descriptionExactDistrict: 60,
  hierarchyProvinceDistrict: 30,
  hierarchyDistrictNeighborhood: 25,
  exactAlias: 50,
  fuzzyMax: 25,
  sourceNameMax: 5,
  serviceContextPenalty: -100,
  residenceContextPenalty: -80,
  interviewContextPenalty: -100,
  headquartersContextPenalty: -100,
  fuzzyThreshold: 0.84,
  fuzzyConfirmedMin: 0.9,
  confidence: {
    confirmedMin: 0.9,
    probableMin: 0.75,
    ambiguousMin: 0.5,
  },
  contextWindowWords: 10,
} as const;

export const WORK_LOCATION_PHRASES = [
  "calisma yeri", "gorev yeri", "proje", "projemiz", "projemize", "projesi", "projesinde",
  "lokasyon", "is yeri", "tesis", "fabrika", "site projesi", "hastane projesi", "magaza", "avm",
  "gorevlendirilmek uzere", "guvenlik gorevlisi alinacaktir", "personel aranmaktadir",
  "calisacak", "gorevlendirilecek",
];

export const SERVICE_ROUTE_PHRASES = [
  "servis", "servis guzergahi", "servisimiz", "servis vardir", "servis kalkis",
  "servis gecmektedir", "guzergah", "ulasim", "servis imkani", "servis bolgeleri",
];

export const RESIDENCE_PHRASES = [
  "ikamet eden", "ikametgah", "ikamet edenler", "bolgelerinde oturan",
  "cevresinde ikamet", "yakin bolgelerde yasayan", "tercihen ikamet",
];

export const INTERVIEW_PHRASES = [
  "gorusme adresi", "gorusme ofisi", "gorusmeler", "gorusme", "mulakat",
  "basvuru adresi", "basvuru ofisi", "evrak teslimi", "ofisimize", "insan kaynaklari ofisi",
];

export const HEADQUARTERS_PHRASES = [
  "genel merkez", "merkez ofis", "sirket merkezi", "firmamizin merkezi", "merkezimiz",
  "merkezli firmamiz", "merkezli firma", "merkezli sirket",
];

export const AMBIGUOUS_SHORT_NAMES = new Set([
  "aosb", "iosb", "dosb", "merkez", "cumhuriyet", "sanayi", "yenimahalle", "ataturk",
]);

export type LocationRole =
  | "work_location"
  | "service_route"
  | "residence_requirement"
  | "interview_location"
  | "application_location"
  | "company_headquarters"
  | "source_location"
  | "mentioned_location";

export type ClassificationStatus = "confirmed" | "probable" | "ambiguous" | "unresolved";

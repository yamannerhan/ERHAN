const CATEGORY_IMAGES: Record<string, string> = {
  hastane: "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=600&h=300&fit=crop",
  klinik:  "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=600&h=300&fit=crop",
  saglik:  "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=600&h=300&fit=crop",
  medikal: "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=600&h=300&fit=crop",
  tip:     "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=600&h=300&fit=crop",

  postane: "https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?w=600&h=300&fit=crop",
  ptt:     "https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?w=600&h=300&fit=crop",
  posta:   "https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?w=600&h=300&fit=crop",
  kargo:   "https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?w=600&h=300&fit=crop",
  lojistik:"https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=600&h=300&fit=crop",
  depo:    "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=600&h=300&fit=crop",
  ambar:   "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=600&h=300&fit=crop",

  banka:   "https://images.unsplash.com/photo-1501167786227-4cba60f6d58f?w=600&h=300&fit=crop",
  finans:  "https://images.unsplash.com/photo-1501167786227-4cba60f6d58f?w=600&h=300&fit=crop",
  sigorta: "https://images.unsplash.com/photo-1501167786227-4cba60f6d58f?w=600&h=300&fit=crop",
  atm:     "https://images.unsplash.com/photo-1501167786227-4cba60f6d58f?w=600&h=300&fit=crop",

  fabrika: "https://images.unsplash.com/photo-1565793298595-6a879b1d9492?w=600&h=300&fit=crop",
  sanayi:  "https://images.unsplash.com/photo-1565793298595-6a879b1d9492?w=600&h=300&fit=crop",
  uretim:  "https://images.unsplash.com/photo-1565793298595-6a879b1d9492?w=600&h=300&fit=crop",
  tesis:   "https://images.unsplash.com/photo-1565793298595-6a879b1d9492?w=600&h=300&fit=crop",

  otel:    "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&h=300&fit=crop",
  resort:  "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&h=300&fit=crop",
  konaklama:"https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&h=300&fit=crop",
  tatil:   "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&h=300&fit=crop",

  market:  "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=600&h=300&fit=crop",
  magaza:  "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=600&h=300&fit=crop",
  avm:     "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=600&h=300&fit=crop",
  alisveris:"https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=600&h=300&fit=crop",

  insaat:  "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=600&h=300&fit=crop",
  site:    "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=600&h=300&fit=crop",
  bina:    "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=600&h=300&fit=crop",

  okul:    "https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=600&h=300&fit=crop",
  egitim:  "https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=600&h=300&fit=crop",
  universite:"https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=600&h=300&fit=crop",
  kampus:  "https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=600&h=300&fit=crop",

  havaalani:"https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=600&h=300&fit=crop",
  havalimani:"https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=600&h=300&fit=crop",
  terminal:"https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=600&h=300&fit=crop",

  etkinlik:"https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600&h=300&fit=crop",
  konser:  "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600&h=300&fit=crop",
  stadyum: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600&h=300&fit=crop",

  liman:   "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=300&fit=crop",
  gemi:    "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=300&fit=crop",
};

const DEFAULT_IMAGE = "https://images.unsplash.com/photo-1557597774-9d273605dfa9?w=600&h=300&fit=crop";

function normalize(str: string) {
  return str
    .toLowerCase()
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c");
}

export function getListingImage(
  title: string,
  company: string,
  customUrl?: string | null
): string {
  if (customUrl) return customUrl;

  const haystack = normalize(`${title} ${company}`);

  for (const [keyword, url] of Object.entries(CATEGORY_IMAGES)) {
    if (haystack.includes(keyword)) return url;
  }

  return DEFAULT_IMAGE;
}

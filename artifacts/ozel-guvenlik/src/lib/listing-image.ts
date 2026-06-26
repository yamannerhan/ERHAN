const CATEGORIES: Array<{ keys: string[]; label: string; icon: string }> = [
  { keys: ["metro", "metrobüs", "marmaray", "istasyon"], label: "METRO", icon: "M" },
  { keys: ["avm", "alışveriş", "magaza", "mağaza", "market"], label: "AVM", icon: "A" },
  { keys: ["site", "rezidans", "residans", "konut", "apartman"], label: "SİTE", icon: "S" },
  { keys: ["fabrika", "sanayi", "üretim", "uretim", "tesis", "osb"], label: "FABRİKA", icon: "F" },
  { keys: ["depo", "lojistik", "ambar", "kargo"], label: "DEPO", icon: "D" },
  { keys: ["belediye", "kamu", "kurum"], label: "BELEDİYE", icon: "B" },
  { keys: ["hastane", "klinik", "sağlık", "saglik", "medikal"], label: "HASTANE", icon: "H" },
  { keys: ["otel", "hotel", "resort", "turizm"], label: "OTEL", icon: "O" },
  { keys: ["okul", "üniversite", "universite", "kampüs", "kampus", "eğitim", "egitim"], label: "OKUL", icon: "E" },
  { keys: ["plaza", "ofis", "iş merkezi", "is merkezi", "banka", "finans"], label: "PLAZA", icon: "P" },
  { keys: ["havalimanı", "havalimani", "havaalanı", "havaalani", "terminal"], label: "TERMİNAL", icon: "T" },
];

const PALETTES = [
  ["#020617", "#1d4ed8", "#38bdf8", "#e0f2fe"],
  ["#111827", "#7c2d12", "#f59e0b", "#fff7ed"],
  ["#052e16", "#15803d", "#22c55e", "#dcfce7"],
  ["#1e1b4b", "#7c3aed", "#ec4899", "#fae8ff"],
  ["#450a0a", "#dc2626", "#f97316", "#fff7ed"],
  ["#042f2e", "#0f766e", "#14b8a6", "#ccfbf1"],
  ["#172554", "#2563eb", "#a855f7", "#eff6ff"],
  ["#312e81", "#4f46e5", "#06b6d4", "#e0f2fe"],
  ["#0c0a09", "#57534e", "#facc15", "#fefce8"],
  ["#0f172a", "#475569", "#94a3b8", "#f8fafc"],
  ["#3b0764", "#9333ea", "#f472b6", "#fdf4ff"],
  ["#083344", "#0891b2", "#67e8f9", "#ecfeff"],
];

function normalize(str: string) {
  return str
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c");
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function escapeSvg(text: string) {
  return text.replace(/[<>&"]/g, "");
}

function getCategory(haystack: string) {
  return CATEGORIES.find(category => category.keys.some(key => haystack.includes(normalize(key)))) ?? {
    label: "ÖZEL GÜVENLİK",
    icon: "G",
  };
}

function sceneIllustration(label: string, palette: string[], hash: number): string {
  const x = 455 + (hash % 35);
  const y = 118 + ((hash >> 4) % 20);
  const line = palette[3];
  const fill = palette[0];
  const accent = palette[2];
  const common = `stroke="${line}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"`;

  if (label === "METRO") {
    return `<g transform="translate(${x} ${y})" opacity=".88" filter="url(#shadow)">
      <rect x="0" y="52" width="250" height="94" rx="24" fill="${fill}" opacity=".62" ${common}/>
      <rect x="28" y="78" width="48" height="28" rx="6" fill="${accent}" opacity=".72"/>
      <rect x="96" y="78" width="48" height="28" rx="6" fill="${accent}" opacity=".72"/>
      <rect x="164" y="78" width="48" height="28" rx="6" fill="${accent}" opacity=".72"/>
      <circle cx="68" cy="152" r="13" fill="${line}"/><circle cx="186" cy="152" r="13" fill="${line}"/>
      <path d="M-18 186H268M18 166l-24 20M78 166l-24 20M138 166l-24 20M198 166l-24 20M258 166l-24 20" ${common} opacity=".55"/>
    </g>`;
  }

  if (label === "FABRİKA") {
    return `<g transform="translate(${x} ${y})" opacity=".9" filter="url(#shadow)">
      <path d="M0 190V84l58 34V84l62 36V82l70 40V42h54v148H0z" fill="${fill}" opacity=".64" ${common}/>
      <rect x="24" y="142" width="32" height="28" rx="4" fill="${accent}" opacity=".72"/>
      <rect x="82" y="142" width="32" height="28" rx="4" fill="${accent}" opacity=".72"/>
      <rect x="140" y="142" width="32" height="28" rx="4" fill="${accent}" opacity=".72"/>
      <path d="M210 38c26-28-12-34 8-60M238 38c28-34-14-40 10-70" ${common} opacity=".42"/>
    </g>`;
  }

  if (label === "DEPO") {
    return `<g transform="translate(${x} ${y})" opacity=".9" filter="url(#shadow)">
      <rect x="0" y="68" width="240" height="126" rx="18" fill="${fill}" opacity=".64" ${common}/>
      <path d="M24 194v-62h192v62M24 106h192" ${common} opacity=".55"/>
      <rect x="44" y="132" width="38" height="38" rx="5" fill="${accent}" opacity=".75"/>
      <rect x="101" y="132" width="38" height="38" rx="5" fill="${accent}" opacity=".55"/>
      <rect x="158" y="132" width="38" height="38" rx="5" fill="${accent}" opacity=".75"/>
      <path d="M42 88h156l-28-42H70L42 88z" fill="${accent}" opacity=".28" ${common}/>
    </g>`;
  }

  if (label === "HASTANE") {
    return `<g transform="translate(${x} ${y})" opacity=".92" filter="url(#shadow)">
      <rect x="28" y="38" width="188" height="160" rx="18" fill="${fill}" opacity=".64" ${common}/>
      <path d="M122 76v78M83 115h78" stroke="${accent}" stroke-width="18" stroke-linecap="round"/>
      <rect x="54" y="166" width="30" height="32" rx="5" fill="${line}" opacity=".55"/>
      <rect x="160" y="166" width="30" height="32" rx="5" fill="${line}" opacity=".55"/>
    </g>`;
  }

  if (label === "AVM" || label === "PLAZA" || label === "OTEL") {
    return `<g transform="translate(${x} ${y})" opacity=".9" filter="url(#shadow)">
      <rect x="28" y="34" width="62" height="164" rx="12" fill="${fill}" opacity=".64" ${common}/>
      <rect x="108" y="70" width="62" height="128" rx="12" fill="${fill}" opacity=".56" ${common}/>
      <rect x="188" y="48" width="58" height="150" rx="12" fill="${fill}" opacity=".62" ${common}/>
      ${Array.from({ length: 12 }, (_, i) => `<rect x="${48 + (i % 2) * 22}" y="${62 + Math.floor(i / 2) * 22}" width="12" height="10" rx="2" fill="${accent}" opacity=".72"/>`).join("")}
      ${Array.from({ length: 8 }, (_, i) => `<rect x="${128 + (i % 2) * 22}" y="${94 + Math.floor(i / 2) * 22}" width="12" height="10" rx="2" fill="${accent}" opacity=".65"/>`).join("")}
      ${Array.from({ length: 10 }, (_, i) => `<rect x="${207 + (i % 2) * 20}" y="${74 + Math.floor(i / 2) * 22}" width="11" height="10" rx="2" fill="${accent}" opacity=".70"/>`).join("")}
    </g>`;
  }

  if (label === "SİTE") {
    return `<g transform="translate(${x} ${y})" opacity=".9" filter="url(#shadow)">
      <path d="M18 194V92l86-58 86 58v102H18z" fill="${fill}" opacity=".62" ${common}/>
      <path d="M-8 104L104 28l112 76" ${common}/>
      <rect x="62" y="126" width="34" height="68" rx="6" fill="${accent}" opacity=".72"/>
      <rect x="122" y="126" width="34" height="34" rx="6" fill="${accent}" opacity=".55"/>
      <path d="M218 194V88h54v106" fill="${fill}" opacity=".52" ${common}/>
    </g>`;
  }

  if (label === "BELEDİYE" || label === "OKUL" || label === "TERMİNAL") {
    return `<g transform="translate(${x} ${y})" opacity=".9" filter="url(#shadow)">
      <path d="M20 90h220L130 28 20 90z" fill="${accent}" opacity=".35" ${common}/>
      <rect x="38" y="92" width="184" height="104" rx="10" fill="${fill}" opacity=".62" ${common}/>
      <path d="M62 194V112M104 194V112M146 194V112M188 194V112" ${common} opacity=".68"/>
      <path d="M20 198h224" ${common}/>
    </g>`;
  }

  return `<g transform="translate(${x} ${y})" opacity=".9" filter="url(#shadow)">
    <rect x="32" y="52" width="178" height="138" rx="26" fill="${fill}" opacity=".62" ${common}/>
    <path d="M121 78l58 22v44c0 46-30 72-58 85-28-13-58-39-58-85v-44l58-22z" fill="${accent}" opacity=".36" ${common}/>
    <text x="121" y="155" text-anchor="middle" font-family="Arial, sans-serif" font-size="56" font-weight="900" fill="${line}">G</text>
  </g>`;
}

function isUploadedCustom(url?: string | null) {
  if (!url) return false;
  return url.startsWith("/api/listing-images/") || url.startsWith("blob:") || url.startsWith("data:image/png") || url.startsWith("data:image/jpeg") || url.startsWith("data:image/webp");
}

function buildUniqueSvg(title: string, company: string, seed: string): string {
  const safeTitle = escapeSvg(title || "Güvenlik Personeli").slice(0, 48);
  const safeCompany = escapeSvg(company || "Özel Güvenlik").slice(0, 34);
  const normalized = normalize(`${title} ${company}`);
  const category = getCategory(normalized);
  const hash = hashSeed(`${seed}|${title}|${company}`);
  const palette = PALETTES[hash % PALETTES.length]!;
  const variant = hash % 200;
  const angle = 20 + (hash % 120);
  const circleX = 120 + (hash % 660);
  const circleY = 55 + ((hash >> 3) % 260);
  const stripeGap = 26 + (hash % 18);
  const badgeX = 585 + (hash % 95);
  const badgeY = 54 + ((hash >> 4) % 58);
  const shieldOpacity = 0.10 + ((hash % 8) / 100);
  const watermarkY = 370 + (hash % 50);
  const pattern = variant % 4;
  const guardX = 620 + (hash % 55);
  const guardY = 128 + ((hash >> 5) % 24);
  const patternSvg = pattern === 0
    ? `<g opacity=".12">${Array.from({ length: 12 }, (_, i) => `<rect x="${i * stripeGap - 80}" y="-80" width="10" height="620" fill="#fff" transform="rotate(${angle} 450 225)"/>`).join("")}</g>`
    : pattern === 1
      ? `<g opacity=".12">${Array.from({ length: 18 }, (_, i) => `<circle cx="${(i * 73 + hash) % 900}" cy="${(i * 41 + hash) % 450}" r="${8 + ((hash + i) % 18)}" fill="#fff"/>`).join("")}</g>`
      : pattern === 2
        ? `<path d="M0 360 C160 ${210 + (hash % 70)}, 300 ${430 - (hash % 90)}, 470 300 S720 155 900 260 V450 H0 Z" fill="#000" opacity=".18"/>`
        : `<g opacity=".11">${Array.from({ length: 9 }, (_, i) => `<path d="M${i * 120 - 80} 450 L${i * 120 + 90} 0" stroke="#fff" stroke-width="${3 + (i % 3) * 2}"/>`).join("")}</g>`;
  const sceneSvg = sceneIllustration(category.label, palette, hash);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 450">
    <defs>
      <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
        <stop stop-color="${palette[0]}"/>
        <stop offset=".52" stop-color="${palette[1]}"/>
        <stop offset="1" stop-color="${palette[2]}"/>
      </linearGradient>
      <filter id="shadow"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity=".38"/></filter>
      <filter id="glow"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <rect width="900" height="450" fill="url(#g)"/>
    ${patternSvg}
    <circle cx="${circleX}" cy="${circleY}" r="${120 + (hash % 80)}" fill="#fff" opacity=".08"/>
    <circle cx="${760 - (hash % 120)}" cy="${360 - (hash % 110)}" r="${95 + (hash % 70)}" fill="#000" opacity=".16"/>
    <path d="M450 58l158 57v112c0 96-65 148-158 188-93-40-158-92-158-188V115l158-57z" fill="#fff" opacity="${shieldOpacity}"/>
    <path d="M450 98l112 40v86c0 66-43 105-112 136-69-31-112-70-112-136v-86l112-40z" fill="#fff" opacity=".15"/>
    ${sceneSvg}
    <g transform="translate(${guardX} ${guardY})" filter="url(#shadow)" opacity=".94">
      <ellipse cx="92" cy="238" rx="112" ry="22" fill="#000" opacity=".22"/>
      <path d="M46 224c8-72 27-112 72-112s64 40 72 112H46z" fill="#111827" opacity=".92"/>
      <path d="M72 224c5-54 20-86 46-86s41 32 46 86H72z" fill="${palette[1]}" opacity=".82"/>
      <circle cx="118" cy="76" r="42" fill="#f8fafc"/>
      <path d="M75 72c8-35 28-56 61-49 22 5 36 22 40 49-24-10-62-11-101 0z" fill="#0f172a"/>
      <path d="M76 66c28-18 58-20 87-1l-9-29H87l-11 30z" fill="#111827"/>
      <rect x="78" y="58" width="82" height="16" rx="8" fill="${palette[2]}" opacity=".95"/>
      <path d="M118 118l22 33-22 72-22-72 22-33z" fill="#e2e8f0" opacity=".95"/>
      <path d="M66 132l-48 72 34 16 42-58-28-30z" fill="#0f172a"/>
      <path d="M170 132l48 72-34 16-42-58 28-30z" fill="#0f172a"/>
      <path d="M178 162l62 22v43c0 42-28 65-62 80-34-15-62-38-62-80v-43l62-22z" fill="#fff" opacity=".22"/>
      <path d="M178 177l42 15v33c0 28-17 45-42 57-25-12-42-29-42-57v-33l42-15z" fill="${palette[2]}" opacity=".44"/>
      <text x="178" y="236" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="900" fill="#fff">G</text>
    </g>
    <text x="${badgeX}" y="${badgeY}" font-family="Arial, sans-serif" font-size="82" font-weight="900" fill="#fff" opacity=".18" filter="url(#glow)">${category.icon}</text>
    <rect x="46" y="48" width="238" height="40" rx="20" fill="#000" opacity=".32"/>
    <text x="64" y="75" font-family="Arial, sans-serif" font-size="20" font-weight="900" fill="${palette[3]}">ÖZEL GÜVENLİK</text>
    <text x="54" y="145" font-family="Arial, sans-serif" font-size="48" font-weight="900" fill="#fff" filter="url(#shadow)">${category.label}</text>
    <text x="54" y="204" font-family="Arial, sans-serif" font-size="30" font-weight="900" fill="#fff" opacity=".96">${safeTitle}</text>
    <text x="56" y="250" font-family="Arial, sans-serif" font-size="24" font-weight="800" fill="${palette[3]}" opacity=".95">${safeCompany}</text>
    <text x="510" y="${watermarkY}" font-family="Arial, sans-serif" font-size="36" font-weight="900" fill="#fff" opacity=".14" transform="rotate(-16 510 ${watermarkY})">ÖZEL GÜVENLİK</text>
    <text x="742" y="410" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="900" fill="#fff" opacity=".35">#${String(variant + 1).padStart(3, "0")}</text>
  </svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function getListingImage(
  title: string,
  company: string,
  customUrl?: string | null,
  seed?: string | number | null,
): string {
  if (isUploadedCustom(customUrl)) return customUrl!;
  return buildUniqueSvg(title, company, String(seed ?? `${title}|${company}`));
}
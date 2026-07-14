import {
  WORK_LOCATION_PHRASES,
  SERVICE_ROUTE_PHRASES,
  RESIDENCE_PHRASES,
  INTERVIEW_PHRASES,
  HEADQUARTERS_PHRASES,
  locationScoringConfig,
  type LocationRole,
} from "./location-scoring.config";
import { normalizeTurkishText, normalizeAliasKey } from "./turkishTextNormalizer";
import type { LocationMatchHit, ScoredCandidate, CatalogLocation } from "./locationCatalog";
import { getLocationDisplay } from "./locationCatalog";

/** Türkçe ekler: proje→projelerimize, servis→servisi, ikamet→ikamet eden */
function phraseMatchIndexes(ascii: string, phrase: string): number[] {
  const p = normalizeAliasKey(phrase);
  if (!p) return [];
  const out: number[] = [];
  const re = new RegExp(`(?:^|[^a-z0-9])(${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[a-z0-9]*)`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(ascii)) !== null) {
    const full = m[1]!;
    // Çok uzun eklenme (yanlış kök) engeli
    if (full.length > p.length + 12) continue;
    out.push(m.index + (m[0].startsWith(full) ? 0 : 1));
  }
  return out;
}

function findPhrasePositions(ascii: string, phrases: string[]): { phrase: string; index: number }[] {
  const hits: { phrase: string; index: number }[] = [];
  for (const phrase of phrases) {
    const p = normalizeAliasKey(phrase);
    for (const index of phraseMatchIndexes(ascii, phrase)) {
      hits.push({ phrase: p, index });
    }
  }
  return hits;
}

function roleNearMatch(
  ascii: string,
  matchStart: number,
  matchEnd: number,
  rolePhrases: { role: LocationRole; phrases: string[] }[],
  maxWords: number,
): { role: LocationRole; phrase: string; distance: number } | null {
  let best: { role: LocationRole; phrase: string; distance: number } | null = null;
  const rolePriority: Record<string, number> = {
    work_location: 5,
    service_route: 4,
    residence_requirement: 4,
    interview_location: 4,
    company_headquarters: 3,
    mentioned_location: 1,
  };
  for (const group of rolePhrases) {
    for (const phrase of group.phrases) {
      const p = normalizeAliasKey(phrase);
      for (const idx of phraseMatchIndexes(ascii, phrase)) {
        const phraseMid = idx + p.length / 2;
        const matchMid = (matchStart + matchEnd) / 2;
        const left = Math.min(phraseMid, matchMid);
        const right = Math.max(phraseMid, matchMid);
        const between = ascii.slice(left, right);
        if (between.includes("<sent>")) continue;
        const words = between.replace(/<sent>/g, " ").split(/\s+/).filter(Boolean).length;
        if (words > maxWords) continue;
        if (
          !best ||
          words < best.distance ||
          (words === best.distance && (rolePriority[group.role] ?? 0) > (rolePriority[best.role] ?? 0))
        ) {
          best = { role: group.role, phrase: p, distance: words };
        }
      }
    }
  }
  return best;
}

/** "... Gebze, Darıca ve Çayırova'dan servis ..." → liste aralığı (proje konumunu dahil etme) */
export function findServiceRouteSpans(ascii: string): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  const endRe = /(?:dan|den)\s+servis/g;
  let m: RegExpExecArray | null;
  while ((m = endRe.exec(ascii)) !== null) {
    const denPos = m.index;
    const lookback = ascii.slice(Math.max(0, denPos - 120), denPos);
    const stopMarkers = [
      "projemize", "projesine", "projesinde", "projelerimize", "proje",
      "calisma yeri", "gorev yeri", "<sent>",
    ];
    let rel = 0;
    for (const sw of stopMarkers) {
      const i = lookback.lastIndexOf(sw);
      if (i >= 0) rel = Math.max(rel, i + sw.length);
    }
    const start = Math.max(0, denPos - 120) + rel;
    spans.push({ start, end: denPos + m[0].length });
  }
  // "servis ... A B C" (servisten sonraki aynı cümle)
  const afterRe = /servis(?:\s+(?:guzergahi|imkani|bolgeleri|vardir|kalkis|gecmektedir))?/g;
  while ((m = afterRe.exec(ascii)) !== null) {
    const from = m.index + m[0].length;
    const sent = ascii.indexOf("<sent>", from);
    const end = sent < 0 ? Math.min(ascii.length, from + 80) : sent;
    if (end > from) spans.push({ start: from, end });
  }
  return spans;
}

function inSpans(pos: number, spans: { start: number; end: number }[]): boolean {
  return spans.some((s) => pos >= s.start && pos <= s.end);
}

function extractSentence(original: string, matchHint: string): string {
  const lower = original.toLocaleLowerCase("tr-TR");
  const hint = matchHint.toLocaleLowerCase("tr-TR");
  const idx = lower.indexOf(hint);
  if (idx < 0) {
    const parts = original.split(/[.!?\n]+/).map((s) => s.trim()).filter(Boolean);
    return parts[0] ?? original.slice(0, 160);
  }
  const before = original.lastIndexOf(".", idx);
  const before2 = original.lastIndexOf("\n", idx);
  const start = Math.max(before, before2) + 1;
  let end = original.indexOf(".", idx);
  if (end < 0) end = original.indexOf("\n", idx);
  if (end < 0) end = Math.min(original.length, idx + 120);
  return original.slice(start, end + 1).trim() || original.slice(Math.max(0, idx - 40), idx + 80).trim();
}

function isIndustrial(loc: CatalogLocation): boolean {
  return loc.locationType === "industrial_zone" || loc.locationType === "free_zone";
}

function isDistrict(loc: CatalogLocation): boolean {
  return loc.locationType === "district";
}

function isProvince(loc: CatalogLocation): boolean {
  return loc.locationType === "province";
}

export function classifyCandidateRoles(
  text: string,
  title: string,
  hits: LocationMatchHit[],
  sourceName?: string | null,
): ScoredCandidate[] {
  const cfg = locationScoringConfig;
  const full = `${title}\n${text}`;
  const ascii = normalizeTurkishText(full).ascii;
  const titleAscii = normalizeTurkishText(title).ascii;
  const descAscii = normalizeTurkishText(text).ascii;
  const sourceAscii = sourceName ? normalizeTurkishText(sourceName).ascii : "";

  const roleGroups: { role: LocationRole; phrases: string[] }[] = [
    { role: "work_location", phrases: WORK_LOCATION_PHRASES },
    { role: "service_route", phrases: SERVICE_ROUTE_PHRASES },
    { role: "residence_requirement", phrases: RESIDENCE_PHRASES },
    { role: "interview_location", phrases: INTERVIEW_PHRASES },
    { role: "company_headquarters", phrases: HEADQUARTERS_PHRASES },
  ];

  const scored: ScoredCandidate[] = [];
  const serviceSpans = findServiceRouteSpans(ascii);

  for (const hit of hits) {
    let near = roleNearMatch(ascii, hit.start, hit.end, roleGroups, cfg.contextWindowWords);
    // Servis güzergâh span'ı içindeki konumlar project bağlamına rağmen servis sayılır
    if (inSpans(hit.start, serviceSpans) || inSpans(hit.end, serviceSpans)) {
      near = { role: "service_route", phrase: "servis", distance: 0 };
    }
    let role: LocationRole = near?.role ?? "mentioned_location";
    let score = 0;
    const evidenceParts: string[] = [];

    // source group city
    if (sourceAscii && (sourceAscii.includes(hit.matchedText) || sourceAscii.includes(hit.location.normalizedName))) {
      if (!near || near.role === "mentioned_location") {
        role = "source_location";
        score += cfg.sourceNameMax;
        evidenceParts.push("kaynak/grup adı");
      }
    }

    const inTitle = titleAscii.includes(hit.matchedText);
    if (isIndustrial(hit.location)) {
      score += inTitle ? cfg.titleExactOsb : cfg.descriptionExactOsb;
    } else if (isDistrict(hit.location)) {
      score += inTitle ? cfg.titleExactDistrict : cfg.descriptionExactDistrict;
    } else if (isProvince(hit.location)) {
      score += inTitle ? 40 : 25;
    } else if (hit.location.locationType === "region") {
      score += inTitle ? 55 : 40;
    } else {
      score += inTitle ? 50 : 35;
    }

    if (hit.method === "alias" || hit.method === "exact") {
      score += cfg.exactAlias;
    }
    if (hit.method === "fuzzy") {
      score += Math.min(cfg.fuzzyMax, Math.round((hit.similarity ?? 0.84) * cfg.fuzzyMax));
    }

    if (near?.role === "work_location") {
      role = "work_location";
      const workBoost = /proje|gorev yeri/.test(near.phrase) ? cfg.projectPhraseNear : cfg.workPlacePhraseNear;
      score += workBoost;
      evidenceParts.push(`çalışma bağlamı: ${near.phrase}`);
    } else if (near?.role === "service_route") {
      role = "service_route";
      // work list'e girmesin; rol listesinde kalsın
      score = Math.max(55, score + 20);
      evidenceParts.push(`servis bağlamı: ${near.phrase}`);
    } else if (near?.role === "residence_requirement") {
      role = "residence_requirement";
      score = Math.max(55, score + 20);
      evidenceParts.push(`ikamet bağlamı: ${near.phrase}`);
    } else if (near?.role === "interview_location") {
      role = "interview_location";
      score = Math.max(55, score + 20);
      evidenceParts.push(`mülakat bağlamı: ${near.phrase}`);
    } else if (near?.role === "company_headquarters") {
      role = "company_headquarters";
      score = Math.max(55, score + 20);
      evidenceParts.push(`merkez bağlamı: ${near.phrase}`);
    }

    // ambiguous alias alone cannot be work
    if (hit.alias?.isAmbiguous) {
      score = Math.min(score, 40);
      evidenceParts.push("belirsiz alias");
    }

    const sentence = extractSentence(full, hit.matchedText);
    const nearby = ascii
      .slice(Math.max(0, hit.start - 40), hit.end + 40)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 12);

    const confidence = Math.max(0, Math.min(1, score / 280));
    scored.push({
      ...hit,
      role,
      score,
      confidence,
      evidence: evidenceParts.join("; ") || getLocationDisplay(hit.location),
      sentence,
      nearbyWords: nearby,
    });
  }

  return scored;
}

export function applyHierarchyBonuses(candidates: ScoredCandidate[]): ScoredCandidate[] {
  const cfg = locationScoringConfig;
  return candidates.map((c) => {
    let bonus = 0;
    if (c.location.provinceId && c.location.districtId) {
      bonus += cfg.hierarchyProvinceDistrict;
    }
    if (c.location.districtId && c.location.locationType === "neighborhood") {
      bonus += cfg.hierarchyDistrictNeighborhood;
    }
    // conflicting district/province among siblings handled later
    return { ...c, score: c.score + bonus, confidence: Math.max(0, Math.min(1, (c.score + bonus) / 280)) };
  });
}

export { findPhrasePositions, roleNearMatch };

import type { ScoredCandidate } from "./locationCatalog";
import type { ClassifyJobLocationsResult } from "./jobLocationClassifier";

export type AiLocationResolution = {
  status: "confirmed" | "probable" | "ambiguous" | "unresolved";
  workLocationIds: number[];
  serviceRouteIds: number[];
  residenceIds: number[];
  interviewIds: number[];
  headquartersIds: number[];
  evidence?: string;
  confidence?: number;
};

export const LOCATION_AI_SYSTEM_PROMPT = `Türkiye'deki özel güvenlik iş ilanının fiilî çalışma konumunu belirle. Servis güzergâhını, ikamet şartını, görüşme adresini, firma merkezini ve ilan kaynak grubunun şehrini çalışma konumu olarak seçme. Yalnızca verilen locationCandidates listesindeki kayıtları kullan. Kanıt cümleler göster. Emin değilsen unresolved döndür.

Önemli yerellik örnekleri (açıklamada geçince çalışma yeri say):
- Samandıra / Samandıra gişeleri → İstanbul / Sancaktepe
- Alemdağ, Taşdelen, Paşaköy → İstanbul / Çekmeköy
- Kurtköy, Sabiha Gökçen → İstanbul / Pendik
- Dudullu, DES → İstanbul / Ümraniye
- İkitelli, MASKO → İstanbul / Başakşehir
- Viaport, Orhanlı → İstanbul / Tuzla
"Türkiye", "Türkiye Geneli" veya yalnızca il adı yazılmış ama semt/gişe/OSB/AVM adı geçen ilanlarda semti önceliklendir.`;

function isAiResult(v: unknown): v is AiLocationResolution {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const statuses = ["confirmed", "probable", "ambiguous", "unresolved"];
  if (!statuses.includes(String(o.status))) return false;
  const arr = (x: unknown) => Array.isArray(x) && x.every((n) => typeof n === "number");
  return (
    arr(o.workLocationIds ?? []) &&
    arr(o.serviceRouteIds ?? []) &&
    arr(o.residenceIds ?? []) &&
    arr(o.interviewIds ?? []) &&
    arr(o.headquartersIds ?? [])
  );
}

/** AI yalnızca düşük güven / çelişkide; aday listesi dışına çıkamaz */
export async function resolveWithAi(opts: {
  title: string;
  description: string;
  candidates: ScoredCandidate[];
  current: ClassifyJobLocationsResult;
}): Promise<AiLocationResolution | null> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.LOCATION_AI_API_KEY;
  if (!apiKey || process.env.LOCATION_AI_ENABLED === "false") return null;
  if (opts.candidates.length === 0) return null;

  const candidatePayload = opts.candidates.slice(0, 40).map((c) => ({
    id: c.location.id,
    name: c.location.name,
    province: c.location.provinceName,
    district: c.location.districtName,
    type: c.location.locationType,
    suggestedRole: c.role,
    score: c.score,
    evidence: c.sentence,
  }));

  const body = {
    model: process.env.LOCATION_AI_MODEL || "gpt-4o-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: LOCATION_AI_SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          title: opts.title,
          description: opts.description.slice(0, 4000),
          locationCandidates: candidatePayload,
          instruction:
            "JSON: {status, workLocationIds, serviceRouteIds, residenceIds, interviewIds, headquartersIds, evidence, confidence}. Sadece candidate id.",
        }),
      },
    ],
  };

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isAiResult(parsed)) return null;

    const allowed = new Set(opts.candidates.map((c) => c.location.id));
    const filterIds = (ids: number[] | undefined) => (ids ?? []).filter((id) => allowed.has(id));
    return {
      status: parsed.status,
      workLocationIds: filterIds(parsed.workLocationIds),
      serviceRouteIds: filterIds(parsed.serviceRouteIds),
      residenceIds: filterIds(parsed.residenceIds),
      interviewIds: filterIds(parsed.interviewIds),
      headquartersIds: filterIds(parsed.headquartersIds),
      evidence: parsed.evidence,
      confidence: parsed.confidence,
    };
  } catch {
    return null;
  }
}

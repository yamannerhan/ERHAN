import { db, listingsTable, adminSettingsTable } from "@workspace/db";
import { eq, count, sql } from "drizzle-orm";

type IO = { emit: (event: string, data: unknown) => void };
let _io: IO | null = null;

export function setBotIo(io: IO) { _io = io; }

const BOT_USER = {
  id: 0, username: "GuvenlikBot", displayName: "GuvenlikBot",
  userRole: "bot", userAvatarUrl: null,
  userNameColor: "#06B6D4", userNameAnimated: false, isBot: true,
};

function makeBotMsg(content: string, replyToUsername?: string) {
  return {
    ...BOT_USER,
    id: Date.now() + Math.random(),
    content,
    replyToId: null,
    replyToUsername: replyToUsername ?? null,
    replyToContent: null,
    isPinned: false,
    mentions: replyToUsername ? [replyToUsername] : [],
    reactions: [],
    createdAt: new Date().toISOString(),
  };
}

// ── Bot enable/disable cache ───────────────────────────────────────
let botEnabledCache = true;
let botEnabledCacheAt = 0;
const BOT_ENABLED_TTL = 30_000;

async function isBotEnabled(): Promise<boolean> {
  const now = Date.now();
  if (now - botEnabledCacheAt < BOT_ENABLED_TTL) return botEnabledCache;
  try {
    const rows = await db.select({ v: adminSettingsTable.botGuvenlikEnabled }).from(adminSettingsTable).limit(1);
    botEnabledCache = rows[0]?.v ?? true;
  } catch { /* DB timeout'da devam et */ }
  botEnabledCacheAt = now;
  return botEnabledCache;
}

export async function setBotEnabled(v: boolean) {
  botEnabledCache = v;
  botEnabledCacheAt = Date.now();
}

// ── DB'den istatistik (5 dakika önbellekli) ────────────────────────
type StatsResult = { total: number; minSalary: number; maxSalary: number; cities: string[]; ok: boolean };
let cachedStats: StatsResult | null = null;
let statsCachedAt = 0;
const STATS_TTL_MS = 5 * 60_000;

async function getStats(): Promise<StatsResult> {
  if (cachedStats && Date.now() - statsCachedAt < STATS_TTL_MS) return cachedStats;
  try {
    const activeRows = await db
      .select({ city: listingsTable.city, salary: listingsTable.salary })
      .from(listingsTable)
      .where(eq(listingsTable.status, "active"));

    const total = activeRows.length;
    const cities = [...new Set(activeRows.map(r => r.city).filter(Boolean))].slice(0, 5);

    // salary alanı "28.000 - 40.000 TL" gibi metin — sayıları parse et
    const nums: number[] = [];
    for (const row of activeRows) {
      if (row.salary) {
        const matches = row.salary.replace(/\./g, "").match(/\d{4,}/g);
        if (matches) nums.push(...matches.map(Number).filter(n => n >= 10000 && n <= 200000));
      }
    }
    const minSalary = nums.length > 0 ? Math.round(Math.min(...nums) / 1000) * 1000 : 25000;
    const maxSalary = nums.length > 0 ? Math.round(Math.max(...nums) / 1000) * 1000 : 55000;

    cachedStats = { total, minSalary, maxSalary, cities, ok: true };
    statsCachedAt = Date.now();
    return cachedStats;
  } catch {
    // Hata durumunda önceki cache varsa onu kullan, yoksa bilinmiyor işareti
    if (cachedStats) return cachedStats;
    return { total: -1, minSalary: 25000, maxSalary: 50000, cities: [] as string[], ok: false };
  }
}

// ── API key önbelleği (60 saniye) ──────────────────────────────────
let cachedApiKey: string | null = null;
let apiKeyCachedAt = 0;
const API_KEY_TTL_MS = 60_000;

async function getOpenAiKey(): Promise<string | null> {
  if (cachedApiKey !== null && Date.now() - apiKeyCachedAt < API_KEY_TTL_MS) {
    return cachedApiKey;
  }
  try {
    const rows = await db.select({ k: adminSettingsTable.openaiApiKey }).from(adminSettingsTable).limit(1);
    cachedApiKey = rows[0]?.k ?? null;
    apiKeyCachedAt = Date.now();
    return cachedApiKey;
  } catch {
    return null;
  }
}

// ── OpenAI API çağrısı ─────────────────────────────────────────────
async function callOpenAI(apiKey: string, userMsg: string, username: string, stats: Awaited<ReturnType<typeof getStats>>): Promise<string | null> {
  const cityStr = stats.cities.length > 0 ? stats.cities.join(", ") : "İstanbul, Ankara, İzmir";
  const listingInfo = stats.total > 0
    ? `Şu an ${stats.total} aktif iş ilanı var. Maaş aralığı: ${stats.minSalary.toLocaleString("tr-TR")}–${stats.maxSalary.toLocaleString("tr-TR")} TL. Aktif şehirler: ${cityStr}.`
    : stats.total === 0
      ? "Şu an aktif ilan bulunmuyor, yakında yenileri eklenecek."
      : "İlan sayısı şu an alınamadı; kullanıcılara /ilanlar sayfasını ziyaret etmelerini öner.";

  const systemPrompt = `Sen ÖzelGüvenlik.Online platformunun yapay zeka destekli uzman sohbet botu GuvenlikBot'sun. Bu platform Türkiye'deki özel güvenlik sektörüne özel iş ilanları ve topluluk platformudur.

PLATFORM BİLGİSİ:
- ${listingInfo}
- Kullanıcılar /ilanlar sayfasından iş ilanlarını filtreleyebilir (şehir, maaş, pozisyon).
- /cv-olustur sayfasından profesyonel CV oluşturabilirler.
- /profil sayfasından hesaplarını yönetebilirler.

UZMANLIK ALANLARIN (yalnızca bu konularda cevap ver):
1. 5188 Sayılı Özel Güvenlik Kanunu: özel güvenlik görevlisinin yetkileri (arama, kimlik sorma, yakalama, zor kullanma sınırları), yasaklar, idari para cezaları, kimlik kartı ve çalışma izni kuralları.
2. İSG (İş Sağlığı ve Güvenliği): risk değerlendirmesi, KKD (kişisel koruyucu donanım), iş kazası bildirimi, ramak kala olaylar, 6331 sayılı İSG Kanunu, çalışan hakları ve işveren yükümlülükleri.
3. Yangın Güvenliği: yangın sınıfları (A/B/C/D/F), doğru söndürücü seçimi, yangın tüpü kullanımı (PASS tekniği), tahliye prosedürü, yangın alarmı ve toplanma alanı, duman/alev müdahalesi.
4. İlk Yardım: temel yaşam desteği (CPR/kalp masajı 30:2), kanama kontrolü, şok, bayılma, kırık-burkulma, yanık, boğulma (Heimlich), bilinç kontrolü, 112 arama ve olay yeri güvenliği.
5. Acil Durum Yönetimi: deprem, sel, gaz kaçağı, bomba ihbarı, silahlı saldırı, tahliye planı, acil durum ekipleri, panik yönetimi.
6. Güvenlik kariyeri ve mevzuat: sertifikalar (temel/silahlı/amirlik), İş Kanunu (fazla mesai, kıdem, ihbar, izin), SGK primleri, maaş bilgileri, AVM/fabrika/hastane/banka/VIP sektörleri.

SELAMLAMA KURALLARI:
- "sa", "s.a", "s/a", "selamun aleyküm" → "Ve aleyküm selam @${username}!" ile başla
- "merhaba", "selam", "hey", "günaydın", "iyi akşamlar" → kısa samimi karşılama yap

YANIT KURALLARI:
1. Her zaman @${username} ile başla.
2. Maksimum 2-3 kısa cümle — sohbet ortamındasın, makale yazmıyorsun.
3. Türkçe yaz, net ve doğru bilgi ver; uydurma. İlk yardım/acil durum gibi kritik konularda yanlış bilgi vermek tehlikelidir — emin değilsen 112'yi veya uzmanı yönlendir.
4. Konu platform/iş ilanı ise /ilanlar veya /cv-olustur sayfasına yönlendir.
5. SORU SENİN UZMANLIK ALANLARININ TAMAMEN DIŞINDAYSA (ör. spor, magazin, siyaset, alakasız sohbet) cevap verme, kibarca "@${username} Ben yalnızca güvenlik sektörü, İSG, yangın, ilk yardım, 5188 sayılı kanun ve acil durumlar konusunda yardımcı olabiliyorum." de.
6. Emoji kullanma.`;

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 200,
        temperature: 0.75,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMsg },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) return null;
    const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content?.trim();
    return text ?? null;
  } catch {
    return null;
  }
}

// ── Anahtar kelime fallback ────────────────────────────────────────
type Stats = Awaited<ReturnType<typeof getStats>>;

const KEYWORD_RULES: Array<{
  keywords: RegExp;
  getReplies: (s: Stats, username: string) => string[];
}> = [
  {
    keywords: /^(sa|s\.a\.?|s\/a|selamun aleyküm|selamün aleyküm)/i,
    getReplies: (_, u) => [
      `@${u} Ve aleyküm selam! ÖzelGüvenlik.Online'a hoş geldiniz. Size nasıl yardımcı olabilirim?`,
    ],
  },
  {
    keywords: /merhaba|selam|günaydın|iyi akşam|iyi geceler|hey|naber/i,
    getReplies: (_, u) => [
      `@${u} Merhaba! Güvenlik sektöründe iş, maaş, sertifika veya yasal haklar konusunda yardımcı olabilirim.`,
      `@${u} Hoş geldiniz! İş ilanları, mevzuat veya kariyer konularında her türlü sorunuzu yanıtlayabilirim.`,
    ],
  },
  {
    keywords: /maaş|ücret|ne kadar|kaç tl|kaç para|kazan/i,
    getReplies: (s, u) => [
      `@${u} Platformumuzdaki ilanların maaş aralığı genellikle ${s.minSalary.toLocaleString("tr-TR")}–${s.maxSalary.toLocaleString("tr-TR")} TL. Silahlı ve deneyimli pozisyonlarda çok daha yüksek olabiliyor.`,
      `@${u} Maaşlar pozisyona ve şirkete göre büyük fark gösteriyor. Güncel rakamlar için /ilanlar sayfasını filtreli inceleyin.`,
    ],
  },
  {
    keywords: /sertifika|lisans|belge|kurs|eğitim|kart/i,
    getReplies: (_, u) => [
      `@${u} Temel güvenlik eğitimi (120 saat, MEB onaylı) zorunlu. Sonrasında ilk yardım ve silahlı güvenlik belgeleri kariyer için büyük fark yaratıyor.`,
      `@${u} Özel güvenlik kimlik kartı 5 yılda bir yenileniyor. Süresi dolmuş kartla çalışmak yasal ihlal sayılır.`,
    ],
  },
  {
    keywords: /ilan|iş bul|pozisyon|açık|başvur|iş aran/i,
    getReplies: (s, u) => [
      s.total > 0
        ? `@${u} Şu an ${s.total} aktif ilan var. /ilanlar sayfasında şehir, pozisyon ve maaşa göre filtreleyebilirsiniz.`
        : `@${u} İlanlar sayfamızı düzenli takip edin, yeni pozisyonlar sürekli ekleniyor.`,
    ],
  },
  {
    keywords: /sgk|sigorta|prim/i,
    getReplies: (_, u) => [
      `@${u} e-Devlet'ten "Sigortalılık Hizmet Dökümü"ne girerek primlerinizin düzgün yatıp yatmadığını kontrol edin. Eksikse işverene yazılı bildirim yapın.`,
    ],
  },
  {
    keywords: /kıdem|tazminat|ihbar/i,
    getReplies: (_, u) => [
      `@${u} Kıdem tazminatı için en az 1 yıl çalışmış olmanız gerekiyor. Son brüt ücret üzerinden her yıl için 30 günlük ödeme yapılır.`,
    ],
  },
  {
    keywords: /silahlı|tabanca|silah ruhsat/i,
    getReplies: (_, u) => [
      `@${u} Silahlı güvenlik için valilik onayı, psiko-teknik değerlendirme ve ateşli silah yetkinlik belgesi şart. Maaş avantajı önemli bir fark yaratıyor.`,
    ],
  },
  {
    keywords: /fazla mesai|haftalık 45|mesai ücret/i,
    getReplies: (_, u) => [
      `@${u} Haftalık 45 saati aşan her saat %50 zamlı ödenmek zorunda. Yıllık 270 saat sınırı var, aşımı için onayınız şart.`,
    ],
  },
  {
    keywords: /nasıl başla|nasıl giri|yeni başl|sektöre gir/i,
    getReplies: (_, u) => [
      `@${u} Önce temel özel güvenlik eğitimi sertifikası alın, ardından sabıka kaydı ve sağlık raporuyla başvurabilirsiniz. Deneyimsiz adayları kabul eden ilanlar da mevcut.`,
    ],
  },
  {
    keywords: /teşekkür|sağ ol|eyvallah/i,
    getReplies: (_, u) => [
      `@${u} Rica ederim! Başka sorularınız olursa buradayım.`,
      `@${u} Ne demek, başarılar dilerim!`,
    ],
  },
  {
    keywords: /mobbing|baskı|haksız|istismar/i,
    getReplies: (_, u) => [
      `@${u} Psikolojik baskı yasal olarak suç. ALO 170 (Çalışma Bakanlığı) hattını arayarak şikayette bulunabilirsiniz.`,
    ],
  },
  {
    keywords: /tatil|bayram|resmi tatil/i,
    getReplies: (_, u) => [
      `@${u} Resmi tatillerde çalıştırılan işçiye o gün için ayrıca günlük ücret ödenmek zorunda. Bu tutar normal ücrete ek olarak ödenir.`,
    ],
  },
  {
    keywords: /\bisg\b|iş sağlığı|iş güvenliği|risk değerlend|6331|kkd|koruyucu donanım|ramak kala|iş kazas/i,
    getReplies: (_, u) => [
      `@${u} İSG mevzuatı 6331 sayılı kanuna dayanır. İşveren risk değerlendirmesi yapmak ve uygun KKD (baret, eldiven, reflektörlü yelek vb.) sağlamak zorundadır.`,
      `@${u} İş kazası 3 iş günü içinde SGK'ya bildirilmek zorunda. Ramak kala olaylar da kayıt altına alınmalı — gelecekteki kazaları önler.`,
    ],
  },
  {
    keywords: /yangın|yangin|söndür|yangın tüp|tahliye|duman|alev|yanıyor/i,
    getReplies: (_, u) => [
      `@${u} Yangın tüpünü PASS tekniğiyle kullanın: Pimi çek, hortumu yangının dibine tut, kola bas, yelpaze gibi süpür. Asla alevin tepesine değil dibine sıkın.`,
      `@${u} Yangın sınıfı önemli: A (katı), B (sıvı), C (gaz), F (yağ). Elektrik ve yağ yangınına su dökmeyin. Tahliyede asansör kullanmayın, toplanma alanında buluşun.`,
    ],
  },
  {
    keywords: /ilk yardım|ilkyardım|kanama|kalp masaj|suni teneffüs|\bcpr\b|bayıl|kırık|yaralı|boğul|heimlich|yanık|112/i,
    getReplies: (_, u) => [
      `@${u} Temel yaşam desteğinde 30 kalp masajı + 2 suni nefes uygulanır (dakikada 100-120 bası). Önce bilinç ve solunum kontrolü yapın, 112'yi arayın.`,
      `@${u} Önce olay yeri güvenliğini sağlayın, sonra 112'yi arayın. Ağır kanamada temiz bezle doğrudan baskı uygulayın. Bilinçsiz ama nefes alan kişiyi koma pozisyonuna alın.`,
    ],
  },
  {
    keywords: /acil durum|deprem|gaz kaçağı|bomba|silahlı saldır|tahliye plan|toplanma alan|panik/i,
    getReplies: (_, u) => [
      `@${u} Acil durumda öncelik can güvenliği. Sakin kalın, tahliye planına uyun, asansör kullanmayın ve belirlenen toplanma alanında toplanın.`,
      `@${u} Depremde "Çök-Kapan-Tutun" uygulayın; sağlam bir masanın yanına çökün. Gaz kaçağında kıvılcım çıkaracak hiçbir şeye dokunmayın, vanayı kapatıp havalandırın.`,
    ],
  },
  {
    keywords: /5188|yetki|arama yap|kimlik sor|yakala|zor kullan|el koy/i,
    getReplies: (_, u) => [
      `@${u} 5188 sayılı kanuna göre özel güvenlik; görev alanında kimlik sorabilir, dedektör/X-ray ile arama yapabilir ve suçüstü halinde yakalayıp kolluğa teslim edebilir. Yetkiler görev alanıyla sınırlıdır.`,
    ],
  },
];

const lastBotReplyAt = new Map<string, number>();
const BOT_REPLY_COOLDOWN_MS = 3_000; // 3 saniye daha hızlı cevap

function keywordFallback(content: string, username: string, stats: Stats): string | null {
  const matched = KEYWORD_RULES.find(rule => rule.keywords.test(content));
  if (!matched) return null;
  const replies = matched.getReplies(stats, username);
  return replies[Math.floor(Math.random() * replies.length)]!;
}

// Bot'a doğrudan hitap (mention) → her zaman cevapla.
// @bot / @guvenlikbot / @güvenlikbot ya da tam isim "guvenlikbot"/"güvenlikbot".
// Çıplak "bot" kelimesi (@'sız) tetiklemez.
const BOT_MENTION_RE = /@\s*(g[uü]venlik\s*bot|bot)\b|\bg[uü]venlik\s*bot\b/i;

// Selamlama/teşekkür → kısa nezaket cevabı verilir
const COURTESY_RE = /^(sa|s\.a\.?|s\/a|selamün? aleyküm|merhaba|selam|hey|günaydın|iyi akşam|iyi geceler|teşekkür|sağ ?ol|eyvallah)/i;

// Bot'un cevap vereceği konular: platform + güvenlik sektörü + İSG/yangın/ilk yardım/5188/acil durum
const RELEVANT_TOPIC_RE = new RegExp(
  [
    // Platform / site
    "site|platform|özelgüvenlik|ilan|iş bul|başvur|pozisyon|cv|profil|üyelik|kayıt ol|hesab",
    // Güvenlik sektörü
    "güvenli|guvenli|bekçi|koruma|devriye|nöbet|vardiya|avm|plaza|fabrika|hastane|banka|vip|x-?ray|dedektör|kamera|sertifika|lisans|belge|kart|silahl|amir|ekip lider",
    // Mevzuat / haklar
    "5188|6331|kanun|yasa|mevzuat|yetki|maaş|ücret|mesai|sgk|prim|kıdem|tazminat|ihbar|izin|emekli|sigorta|mobbing|tatil|bayram",
    // İSG
    "\\bisg\\b|iş sağlığı|iş güvenliği|risk değerlend|kkd|koruyucu donanım|ramak kala|iş kazas",
    // Yangın
    "yangın|yangin|söndür|tüp|tahliye|duman|alev|yanıyor",
    // İlk yardım
    "ilk yardım|ilkyardım|kanama|kalp masaj|suni teneffüs|\\bcpr\\b|bayıl|kırık|yaralı|boğul|heimlich|yanık|112",
    // Acil durum
    "acil|deprem|sel|gaz kaçağı|bomba|saldır|toplanma alan|panik|tehlike|alarm",
  ].join("|"),
  "i"
);

// Mesajın bot cevabı gerektirip gerektirmediğini belirle
function shouldReply(content: string, role: string): boolean {
  // Bot kendi mesajlarına cevap vermesin
  if (role === "bot") return false;
  const trimmed = content.trim();
  if (trimmed.length === 0) return false;
  // Bot'a doğrudan hitap → her zaman cevapla
  if (BOT_MENTION_RE.test(trimmed)) return true;
  // Selamlama/teşekkür → kısa nezaket cevabı ("sa" gibi 2 harfliler dahil)
  if (COURTESY_RE.test(trimmed)) return true;
  // Çok kısa mesajlar (3 karakterden az) genelde anlamsız
  if (trimmed.length < 3) return false;
  // Sadece ilgili konulardaki mesajlara cevap ver, gerisini görmezden gel
  return RELEVANT_TOPIC_RE.test(trimmed);
}

function genericFallback(username: string, stats: Stats): string {
  const opts = [
    `@${username} Maaş, sertifika, yasal haklar veya iş ilanları hakkında sorularınızı yanıtlayabilirim. Ne öğrenmek istersiniz?`,
    `@${username} 5188 sayılı kanun, fazla mesai hakları, SGK primleri veya kariyer konularında yardımcı olabilirim.`,
    `@${username} Güvenlik sektöründe ${stats.total > 0 ? `${stats.total} aktif ilan` : "güncel ilanlar"} mevcut. Soru sormaktan çekinmeyin!`,
  ];
  return opts[Math.floor(Math.random() * opts.length)]!;
}

export function triggerContextualReply(content: string, username: string, role: string): void {
  if (!_io) return;
  if (!shouldReply(content, role)) return;

  const now = Date.now();
  const last = lastBotReplyAt.get(username) ?? 0;
  if (now - last < BOT_REPLY_COOLDOWN_MS) return;

  // Cooldown'u hemen kaydet — aynı kullanıcıdan spam önle
  lastBotReplyAt.set(username, now);

  const trimmed = content.trim();
  const delay = 1500 + Math.random() * 3000;

  setTimeout(async () => {
    // Bot ayarı kapalıysa bypass et ve cooldown'u sıfırla
    if (!await isBotEnabled()) {
      lastBotReplyAt.delete(username);
      return;
    }
    if (!_io) {
      // IO yoksa cooldown'u sıfırla ki bir sonraki mesajda tekrar denesin
      lastBotReplyAt.delete(username);
      return;
    }

    const stats = await getStats();
    const apiKey = await getOpenAiKey();

    let reply: string | null = null;

    if (apiKey) {
      reply = await callOpenAI(apiKey, trimmed, username, stats);
    }

    // OpenAI yoksa veya başarısız olduysa anahtar kelime fallback
    if (!reply) {
      reply = keywordFallback(trimmed, username, stats);
    }

    // Hiçbiri tutmadıysa genel bir yardımcı cevap ver
    if (!reply) {
      reply = genericFallback(username, stats);
    }

    _io!.emit("chat:message", makeBotMsg(reply, username));
  }, delay);
}

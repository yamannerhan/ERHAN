import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  useGetListings, useGetAnnouncements,
  useGetMyFavorites, getGetMyFavoritesQueryKey,
  useToggleListingFavorite,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, Building2, MapPin, Briefcase, ChevronRight, Clock,
  Bookmark, Star, ShieldCheck, ChevronDown,
} from "lucide-react";
import { getListingImage } from "@/lib/listing-image";
import { displayCompany } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { useQueryClient } from "@tanstack/react-query";

const BASE_URL = "https://ozelguvenlik.online";

interface Banner {
  id: number;
  title: string | null;
  imageUrl: string;
  linkUrl: string | null;
}

const bannerFallbacks = [
  "linear-gradient(135deg,#0f172a 0%,#1d4ed8 45%,#06b6d4 100%)",
  "linear-gradient(135deg,#111827 0%,#7c2d12 45%,#f59e0b 100%)",
  "linear-gradient(135deg,#020617 0%,#166534 45%,#22c55e 100%)",
  "linear-gradient(135deg,#18181b 0%,#6d28d9 45%,#ec4899 100%)",
  "linear-gradient(135deg,#0c0a09 0%,#be123c 45%,#f97316 100%)",
];

function BannerCarousel({ banners }: { banners: Banner[] }) {
  const [current, setCurrent] = useState(0);
  const [failedImages, setFailedImages] = useState<Set<number>>(new Set());

  const next = useCallback(() => {
    setCurrent(c => (c + 1) % banners.length);
  }, [banners.length]);

  useEffect(() => {
    if (banners.length < 2) return;
    const id = setInterval(next, 4000);
    return () => clearInterval(id);
  }, [next, banners.length]);

  if (banners.length === 0) return null;

  return (
    <div className="relative w-full overflow-hidden rounded-2xl" style={{ aspectRatio: "16/5" }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={current}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
          className="absolute inset-0"
        >
          {(() => {
            const banner = banners[current]!;
            const imageFailed = failedImages.has(banner.id);
            const content = (
              <>
                {imageFailed ? (
                  <div className="w-full h-full rounded-2xl" style={{ background: bannerFallbacks[current % bannerFallbacks.length] }} />
                ) : (
                  <img
                    src={banner.imageUrl}
                    alt={banner.title ?? "Banner"}
                    className="w-full h-full object-cover rounded-2xl"
                    onError={() => setFailedImages(prev => new Set(prev).add(banner.id))}
                  />
                )}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-black/65 via-black/20 to-transparent" />
                {banner.title && (
                  <div className="absolute inset-x-0 bottom-0 rounded-b-2xl px-4 py-3">
                    <p className="text-white text-sm font-extrabold leading-snug drop-shadow md:text-base">{banner.title}</p>
                  </div>
                )}
              </>
            );
            return banner.linkUrl ? (
              <a href={banner.linkUrl} className="block w-full h-full relative">
                {content}
              </a>
            ) : (
              <div className="w-full h-full relative">{content}</div>
            );
          })()}
        </motion.div>
      </AnimatePresence>

      {banners.length > 1 && (
        <>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
            {banners.map((_, i) => (
              <button key={i} onClick={() => setCurrent(i)}
                className={`h-1.5 rounded-full transition-all ${i === current ? "w-5 bg-white" : "w-1.5 bg-white/40"}`} />
            ))}
          </div>
          <button onClick={() => setCurrent(c => (c - 1 + banners.length) % banners.length)}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 text-white flex items-center justify-center z-10 text-base leading-none">
            ‹
          </button>
          <button onClick={next}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 text-white flex items-center justify-center z-10 text-base leading-none">
            ›
          </button>
        </>
      )}
    </div>
  );
}

function formatDate(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 1) return "Az önce yayınlandı";
  if (mins < 60) return `${mins} dk önce`;
  if (hours < 24) return `${hours} saat önce`;
  if (days < 7) return `${days} gün önce`;
  return new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
}

const QUICK_CITY_PILLS = [
  { id: "all",        label: "Tümü",            match: null as null | ((c: string) => boolean) },
  { id: "istanbul",   label: "İstanbul",        match: (c: string) => /istanbul/i.test(c) },
  { id: "anadolu",    label: "Anadolu Yakası",  match: (c: string) => /anadolu/i.test(c) },
  { id: "avrupa",     label: "Avrupa Yakası",   match: (c: string) => /avrupa/i.test(c) },
];

const OTHER_CITIES = [
  "Ankara", "İzmir", "Bursa", "Kocaeli", "Antalya", "Adana", "Konya", "Gaziantep",
  "Mersin", "Kayseri", "Eskişehir", "Sakarya", "Tekirdağ", "Samsun", "Trabzon",
];

export default function Home() {
  useDocumentMeta({
    title: "Özel Güvenlik İş İlanları | Bay Bayan Güvenlik Personeli Alımı",
    description: "Türkiye genelinde özel güvenlik iş ilanları, bay bayan güvenlik görevlisi alımları, ücretsiz CV oluşturma, yapay zeka destekli iş bulma ve ücretsiz ilan verme platformu.",
    keywords: "özel güvenlik iş ilanları, güvenlik görevlisi alımı, bay bayan güvenlik ilanları, silahlı güvenlik iş ilanları, silahsız güvenlik iş ilanları, İstanbul özel güvenlik iş ilanları, Kocaeli özel güvenlik iş ilanları, Gebze güvenlik iş ilanları, GOSB güvenlik ilanları, TOSB güvenlik ilanları, avm güvenlik, fabrika güvenlik, site güvenlik, özel güvenlik maaşları, ögg iş ilanları",
    canonical: BASE_URL,
    ogImage: `${BASE_URL}/og-image.jpg`,
    ogType: "website",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": "Özel Güvenlik İş İlanları",
        "url": BASE_URL,
        "potentialAction": {
          "@type": "SearchAction",
          "target": { "@type": "EntryPoint", "urlTemplate": `${BASE_URL}/ilanlar?search={search_term_string}` },
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "Özel Güvenlik Online",
        "url": BASE_URL,
        "logo": `${BASE_URL}/favicon-192x192.png`,
        "sameAs": [],
        "contactPoint": {
          "@type": "ContactPoint",
          "contactType": "Müşteri Hizmetleri",
          "availableLanguage": "Turkish",
        },
      },
    ],
  });

  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: announcementsData } = useGetAnnouncements();
  const announcements = announcementsData || [];

  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [activePill, setActivePill] = useState<string>("all");
  const [otherCity, setOtherCity] = useState<string | null>(null);
  const [otherSheetOpen, setOtherSheetOpen] = useState(false);
  const [sortNewest, setSortNewest] = useState<"new" | "old">("new");
  const [cityFilters, setCityFilters] = useState<{ city: string; count: number }[]>([]);

  useEffect(() => {
    fetch("/api/listings/cities")
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setCityFilters(data); })
      .catch(() => setCityFilters([]));
  }, []);

  const cityFilter = useMemo(() => {
    if (activePill === "other" && otherCity) return otherCity;
    if (activePill === "istanbul") return "İstanbul";
    return undefined;
  }, [activePill, otherCity]);

  const { data: listingsData, isLoading, refetch } = useGetListings({
    page,
    limit: pageSize,
    ...(cityFilter ? { city: cityFilter } : {}),
  } as Parameters<typeof useGetListings>[0]);

  const [banners, setBanners] = useState<Banner[]>([]);

  /* Favorites */
  const { data: favData } = useGetMyFavorites({
    query: { queryKey: getGetMyFavoritesQueryKey(), enabled: !!user }
  });
  const favListings = Array.isArray(favData) ? favData : [];
  const favCount = favListings.length;
  const favIds = useMemo(() => {
    return new Set<number>(favListings.map((l: any) => Number(l?.id)).filter((n: number) => Number.isFinite(n)));
  }, [favListings]);
  const toggleFav = useToggleListingFavorite();

  const handleToggleFav = async (e: React.MouseEvent, listingId: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      toast({ title: "Önce giriş yapın", description: "Favorilere eklemek için giriş gerekir." });
      return;
    }
    try {
      await toggleFav.mutateAsync({ id: listingId });
      queryClient.invalidateQueries({ queryKey: getGetMyFavoritesQueryKey() });
    } catch {
      toast({ title: "İşlem başarısız", variant: "destructive" });
    }
  };

  useEffect(() => {
    fetch("/api/banners")
      .then(r => r.json())
      .then(data => setBanners(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const id = setInterval(() => { void refetch(); }, 30000);
    return () => clearInterval(id);
  }, [refetch]);

  /* Local filtering for pills that don't map to server-side city query */
  const allListings = listingsData?.listings ?? [];
  const filtered = useMemo(() => {
    if (activePill === "all" || activePill === "istanbul" || (activePill === "other" && otherCity)) {
      return allListings;
    }
    const pill = QUICK_CITY_PILLS.find(p => p.id === activePill);
    if (pill?.match) {
      return allListings.filter(l => pill.match!(l.city));
    }
    return allListings;
  }, [allListings, activePill, otherCity]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      return sortNewest === "new" ? tb - ta : ta - tb;
    });
    return arr;
  }, [filtered, sortNewest]);

  const featured = (allListings.filter(l => l.isFeatured)[0]) ?? null;
  const totalCount = listingsData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  /* Stats */
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  const newToday = allListings.filter(l => new Date(l.createdAt).getTime() > dayAgo).length;
  const companies = useMemo(() => {
    const set = new Set<string>();
    allListings.forEach(l => {
      const c = displayCompany(l.company);
      if (c) set.add(c);
    });
    return set.size;
  }, [allListings]);

  const canQuickEditCity = user?.role === "admin" || user?.role === "moderator";

  const quickChangeCity = async (listingId: number, currentCity: string) => {
    const nextCity = window.prompt("İlanın il / ilçe / semt bilgisini değiştir", currentCity);
    if (!nextCity || nextCity.trim() === currentCity.trim()) return;
    const token = localStorage.getItem("auth_token") ?? "";
    const res = await fetch(`/api/admin/listings/${listingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ city: nextCity.trim() }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast({ title: "İl değiştirilemedi", description: data.error || "Hata oluştu", variant: "destructive" });
      return;
    }
    toast({ title: `İlan #${listingId} il bilgisi güncellendi` });
    void refetch();
  };

  const quickDeleteListing = async (listingId: number) => {
    if (!window.confirm(`#${listingId} numaralı ilan silinsin mi?`)) return;
    const token = localStorage.getItem("auth_token") ?? "";
    const res = await fetch(`/api/admin/listings/${listingId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast({ title: "İlan silinemedi", description: data.error || "Hata oluştu", variant: "destructive" });
      return;
    }
    toast({ title: `İlan #${listingId} silindi` });
    void refetch();
  };

  const greetingName = user?.username || "Misafir";

  return (
    <Layout>
      {announcements.length > 0 && (
        <div className="bg-amber-400/10 border-b border-amber-400/20 overflow-hidden relative h-9 flex items-center">
          <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
          <div className="flex animate-ticker whitespace-nowrap" style={{ animationDelay: `-${((Date.now() / 1000) % 60).toFixed(2)}s` }}>
            {[...announcements, ...announcements].map((a, i) => (
              <span key={i} className="inline-flex items-center gap-2 mx-8 text-xs font-bold text-amber-300 drop-shadow">
                <span className="text-amber-400">●</span>{a.content}
              </span>
            ))}
          </div>
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
        </div>
      )}

      {banners.length > 0 && (
        <div className="px-4 pt-4">
          <BannerCarousel banners={banners} />
        </div>
      )}

      <div className="p-4 space-y-5">

        {/* ── Hero Banner ──────────────────────────────────── */}
        <section className="og-hero">
          <div className="og-hero-inner">
            <div className="flex-1 min-w-0">
              <h1 className="og-hero-title">
                Merhaba, {greetingName}! <span className="og-wave">👋</span>
              </h1>
              <p className="og-hero-sub">Sana uygun özel güvenlik ilanlarını keşfet</p>
              <Link href="/ilanlar" className="og-hero-cta">
                İlanları Keşfet <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="og-hero-art">
              <ShieldCheck className="og-hero-shield" />
            </div>
          </div>
        </section>

        {/* ── Stats Row ────────────────────────────────────── */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <StatCard icon={<Briefcase className="w-4 h-4" />} value={totalCount}    label="Açık İlan" />
          <StatCard icon={<Building2 className="w-4 h-4" />} value={companies}     label="Firma" />
          <StatCard icon={<Clock className="w-4 h-4" />}     value={newToday}      label="Yeni İlan" />
          <StatCard icon={<Bookmark className="w-4 h-4" />}  value={favCount}      label="Kaydedilen" />
        </section>

        {/* ── Filter Pills ─────────────────────────────────── */}
        <section className="og-pills hide-scrollbar">
          {QUICK_CITY_PILLS.map(p => {
            const active = activePill === p.id;
            return (
              <button
                key={p.id}
                onClick={() => { setActivePill(p.id); setOtherCity(null); setPage(1); }}
                className={`og-pill ${active ? "og-pill-active" : ""}`}
              >
                {p.id === "istanbul" && <MapPin className="w-3 h-3" />}
                {p.label}
              </button>
            );
          })}
          <button
            onClick={() => setOtherSheetOpen(true)}
            className={`og-pill ${activePill === "other" ? "og-pill-active" : ""}`}
          >
            ··· {otherCity ? otherCity : "Diğer"}
          </button>
        </section>

        {/* Other-city sheet */}
        <AnimatePresence>
          {otherSheetOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setOtherSheetOpen(false)}
                className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 26, stiffness: 280 }}
                className="og-sheet fixed bottom-0 left-0 right-0 z-[80] rounded-t-3xl p-5 max-w-md mx-auto"
              >
                <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3" />
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-base">Şehir Seç</h3>
                  <button onClick={() => setOtherSheetOpen(false)} className="og-icon-btn p-1">
                    <ChevronDown className="w-5 h-5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto">
                  {cityFilters
                    .filter(c => OTHER_CITIES.includes(c.city) && c.count > 0)
                    .map(c => (
                      <button
                        key={c.city}
                        onClick={() => {
                          setActivePill("other");
                          setOtherCity(c.city);
                          setPage(1);
                          setOtherSheetOpen(false);
                        }}
                        className={`og-city-btn ${otherCity === c.city ? "og-city-btn-active" : ""}`}
                      >
                        <MapPin className="w-3.5 h-3.5" />
                        <span className="text-sm font-semibold">{c.city}</span>
                      </button>
                    ))}
                  {cityFilters.filter(c => OTHER_CITIES.includes(c.city) && c.count > 0).length === 0 && (
                    <div className="col-span-2 text-center text-sm og-text-muted py-4">
                      Şu anda diğer şehirlerde ilan bulunmuyor.
                    </div>
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* ── Featured Listing ─────────────────────────────── */}
        {featured && (
          <section>
            <Link
              href={`/ilan/${featured.id}`}
              className="og-featured-card block relative"
            >
              <div className="og-featured-pill">
                <Star className="w-3 h-3 fill-current" /> ÖNE ÇIKAN
              </div>
              <div className="flex gap-3 items-start">
                <div className="og-featured-logo shrink-0">
                  {featured.companyLogoUrl ? (
                    <img src={featured.companyLogoUrl} alt={displayCompany(featured.company) ?? ""} className="w-full h-full object-cover rounded-lg" />
                  ) : (
                    <ShieldCheck className="w-6 h-6 text-amber-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="og-featured-title">{featured.title}</h3>
                  <div className="flex items-center gap-1 text-xs mt-1 og-text-muted">
                    <MapPin className="w-3 h-3" />
                    <span className="truncate">{featured.city}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span className="og-chip">{featured.workType || "Tam Zamanlı"}</span>
                    <span className="og-chip">{detectArmed(featured.title, featured.description, featured.requirements)}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="og-featured-salary">{featured.salary || "Görüşülecek"}</div>
                  <div className="og-text-muted text-[10px] font-semibold mt-0.5">Aylık</div>
                </div>
              </div>
              <div className="og-featured-foot">
                <span className="og-text-muted text-[11px] truncate">
                  {displayCompany(featured.company) ?? "Firma"} · {formatDate(featured.createdAt)}
                </span>
                <ChevronRight className="w-4 h-4 text-amber-400 shrink-0" />
              </div>
            </Link>
          </section>
        )}

        {/* ── Tüm İlanlar ──────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="og-section-title">
              Tüm İlanlar <span className="og-text-muted text-sm font-semibold">({totalCount})</span>
            </h2>
            <button
              onClick={() => setSortNewest(s => s === "new" ? "old" : "new")}
              className="og-sort-btn"
            >
              {sortNewest === "new" ? "En Yeni" : "En Eski"}
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2.5">
            {isLoading ? (
              [1,2,3,4,5].map(i => (
                <div key={i} className="og-list-skeleton" />
              ))
            ) : sorted.length === 0 ? (
              <div className="og-empty">
                <Briefcase className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm font-semibold">Bu filtreye uygun ilan bulunamadı</p>
                <button onClick={() => { setActivePill("all"); setOtherCity(null); }} className="text-amber-400 text-xs mt-1 hover:underline">
                  Filtreyi Temizle
                </button>
              </div>
            ) : (
              sorted.map((listing, idx) => {
                const company = displayCompany(listing.company) || "Firma";
                const initials = company.split(/\s+/).map(w => w[0] ?? "").join("").slice(0, 2).toUpperCase() || "G";
                const ageMs = Date.now() - new Date(listing.createdAt).getTime();
                const isUrgent = /acil|urgent|hemen/i.test(listing.title) || /acil|urgent/i.test(listing.description ?? "");
                const isNew = ageMs < 24 * 3600 * 1000;
                const armedLabel = detectArmed(listing.title, listing.description, listing.requirements);
                const img = getListingImage(listing.title, listing.company, listing.companyLogoUrl, listing.id);
                const isFav = favIds.has(Number(listing.id));

                return (
                  <motion.div
                    key={listing.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(idx * 0.02, 0.2) }}
                    className="og-list-row-wrap"
                  >
                    <Link href={`/ilan/${listing.id}`} className="og-list-row">
                      {/* Image / logo */}
                      <div className="og-list-img">
                        {listing.companyLogoUrl ? (
                          <img src={listing.companyLogoUrl} alt={company} className="w-full h-full object-cover" />
                        ) : img ? (
                          <img src={img} alt={listing.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full grid place-items-center text-base font-black text-slate-900 bg-gradient-to-br from-amber-300 to-amber-500">
                            {initials}
                          </div>
                        )}
                      </div>

                      {/* Body */}
                      <div className="flex-1 min-w-0">
                        {/* Status pill */}
                        <div className="flex items-center gap-1.5 mb-1">
                          {listing.isFeatured ? (
                            <span className="og-status og-status-featured">
                              <Star className="w-2.5 h-2.5 fill-current" /> Öne Çıkan
                            </span>
                          ) : isUrgent ? (
                            <span className="og-status og-status-urgent">Acil</span>
                          ) : isNew ? (
                            <span className="og-status og-status-new">Yeni</span>
                          ) : null}
                        </div>

                        <h3 className="og-list-title">{listing.title}</h3>

                        <div className="flex items-center gap-1 text-[11px] og-text-muted mt-0.5">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate">{listing.city}</span>
                        </div>

                        <div className="flex flex-wrap gap-1 mt-1.5">
                          <span className="og-mini-chip">{listing.workType || "Tam Zamanlı"}</span>
                          <span className="og-mini-chip">{armedLabel}</span>
                        </div>

                        <div className="og-list-foot">
                          <span className="og-text-muted text-[10px] truncate">
                            {company} · {formatDate(listing.createdAt)}
                          </span>
                          <button
                            onClick={(e) => handleToggleFav(e, listing.id)}
                            className="og-bookmark-btn"
                            aria-label="Favorilere ekle"
                          >
                            <Bookmark className={`w-4 h-4 ${isFav ? "fill-amber-400 text-amber-400" : ""}`} />
                          </button>
                        </div>
                      </div>

                      {/* Salary */}
                      <div className="og-list-salary text-right shrink-0">
                        <div className="og-list-salary-amount">{listing.salary || "—"}</div>
                        <div className="og-text-muted text-[10px] font-semibold">Aylık</div>
                      </div>

                      {/* Admin overlay */}
                      {canQuickEditCity && (
                        <div className="absolute top-1 left-1 z-30 flex gap-1">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              void quickChangeCity(listing.id, listing.city);
                            }}
                            className="rounded-full bg-black/70 px-1.5 py-0.5 text-[8px] font-black text-white border border-white/20"
                          >
                            İl Değiştir
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              void quickDeleteListing(listing.id);
                            }}
                            className="rounded-full bg-red-600/90 px-1.5 py-0.5 text-[8px] font-black text-white border border-red-200/30"
                          >
                            Sil
                          </button>
                        </div>
                      )}
                    </Link>
                  </motion.div>
                );
              })
            )}
          </div>

          {/* Pagination */}
          {!isLoading && totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-5">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="og-page-btn"
              >
                Önceki
              </button>
              <div className="og-page-current">
                Sayfa {page} / {totalPages}
              </div>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="og-page-btn"
              >
                Sonraki
              </button>
            </div>
          )}

          {/* Trust strip */}
          {!isLoading && sorted.length > 0 && (
            <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-2 og-trust-strip">
              {[
                { icon: "🛡️", title: "Güvenilir İlanlar", subtitle: "Tüm ilanlar doğrulanır." },
                { icon: "👥", title: "Doğrudan İletişim", subtitle: "İşverenle direkt iletişim." },
                { icon: "⏱️", title: "Hızlı Başvuru", subtitle: "Tek tıkla başvuru." },
                { icon: "🔒", title: "%100 Güvenli", subtitle: "Bilgileriniz korunur." },
              ].map(item => (
                <div key={item.title} className="flex items-start gap-2.5 px-2 py-1">
                  <span className="text-xl shrink-0">{item.icon}</span>
                  <div className="min-w-0">
                    <div className="text-xs font-bold og-text">{item.title}</div>
                    <div className="text-[10px] og-text-muted leading-tight">{item.subtitle}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}

/* ── Helpers ──────────────────────────────────────────────── */
function detectArmed(title?: string | null, desc?: string | null, req?: string | null): string {
  const haystack = `${title ?? ""} ${desc ?? ""} ${req ?? ""}`.toLocaleLowerCase("tr-TR");
  const isArmed = /silahl[ıi]/.test(haystack);
  const isUnarmed = /silahs[ıi]z/.test(haystack);
  if (isArmed && !isUnarmed) return "Silahlı Görev";
  return "Silahsız Görev";
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="og-stat-card">
      <div className="og-stat-icon">{icon}</div>
      <div className="og-stat-value">{value}</div>
      <div className="og-stat-label">{label}</div>
    </div>
  );
}

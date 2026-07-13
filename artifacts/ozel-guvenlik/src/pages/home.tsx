import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  useGetListings, useGetAnnouncements,
  useGetMyFavorites, getGetMyFavoritesQueryKey,
  useToggleListingFavorite,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useGpuSafeMode } from "@/hooks/use-gpu-safe-mode";
import {
  MapPin, Briefcase, Star, ChevronDown,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { buildHomeTitle, buildHomeDescription, SEO_BASE_URL, SEO_OG_IMAGE, breadcrumbSchema } from "@/lib/seo-config";
import { toSlug } from "@/lib/seo-cities";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { useQueryClient } from "@tanstack/react-query";
import { JobListingCard } from "@/components/job-listing-card";
import { FeaturedJobCarousel } from "@/components/featured-job-card";
import { LiveSupportBar } from "@/components/live-support-bar";
import { HomeQuickCards } from "@/components/home-quick-cards";
import { HomeNewsTicker } from "@/components/home-news-ticker";
import { getHomeTickerLines } from "@/lib/home-ticker";

const BASE_URL = "https://ozelguvenlik.online";

const HOME_STATE_KEY = "home_page_state";
const HOME_SCROLL_KEY = "home_scroll_y";

type HomeSavedState = {
  page: number;
  activePill: string;
  otherCity: string | null;
  sortNewest: "new" | "old";
};

function getSavedHomeState(): HomeSavedState {
  try {
    const saved = sessionStorage.getItem(HOME_STATE_KEY);
    if (!saved) return { page: 1, activePill: "all", otherCity: null, sortNewest: "new" };
    const parsed = JSON.parse(saved) as Partial<HomeSavedState>;
    return {
      page: Math.max(1, parsed.page ?? 1),
      activePill: parsed.activePill ?? "all",
      otherCity: parsed.otherCity ?? null,
      sortNewest: parsed.sortNewest === "old" ? "old" : "new",
    };
  } catch {
    return { page: 1, activePill: "all", otherCity: null, sortNewest: "new" };
  }
}

function saveHomeScroll() {
  sessionStorage.setItem(HOME_SCROLL_KEY, String(window.scrollY));
}

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
  const gpuSafeMode = useGpuSafeMode();

  const next = useCallback(() => {
    setCurrent(c => (c + 1) % banners.length);
  }, [banners.length]);

  useEffect(() => {
    if (banners.length < 2) return;
    const id = setInterval(next, 4000);
    return () => clearInterval(id);
  }, [next, banners.length]);

  if (banners.length === 0) return null;

  const banner = banners[current]!;
  const imageFailed = failedImages.has(banner.id);

  return (
    <div className="og-banner-carousel">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={current}
          initial={gpuSafeMode ? { opacity: 0 } : { opacity: 0, x: 36 }}
          animate={gpuSafeMode ? { opacity: 1 } : { opacity: 1, x: 0 }}
          exit={gpuSafeMode ? { opacity: 0 } : { opacity: 0, x: -36 }}
          transition={{ duration: 0.45, ease: "easeInOut" }}
          className="og-banner-carousel__slide"
        >
          <div className="og-banner-carousel__media pointer-events-none select-none">
            {imageFailed ? (
              <div
                className="absolute inset-0"
                style={{ background: bannerFallbacks[current % bannerFallbacks.length] }}
              />
            ) : (
              <img
                src={banner.imageUrl}
                alt={banner.title ?? "Banner"}
                decoding="async"
                onError={() => setFailedImages(prev => new Set(prev).add(banner.id))}
              />
            )}
            {banner.title && (
              <>
                <div className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 px-4 py-3">
                  <p className="text-white text-sm font-extrabold leading-snug drop-shadow md:text-base">{banner.title}</p>
                </div>
              </>
            )}
          </div>
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
    title: buildHomeTitle(),
    description: buildHomeDescription(),
    keywords: "özel güvenlik iş ilanları, ozelguvenlik.online, özelgüvenlik.online, güvenlik görevlisi alımı, bay bayan güvenlik ilanları, silahlı güvenlik iş ilanları, silahsız güvenlik iş ilanları, İstanbul özel güvenlik iş ilanları, Kocaeli özel güvenlik iş ilanları, Gebze güvenlik iş ilanları, GOSB güvenlik ilanları, TOSB güvenlik ilanları, avm güvenlik, fabrika güvenlik, site güvenlik, özel güvenlik maaşları, ögg iş ilanları",
    canonical: SEO_BASE_URL,
    ogImage: SEO_OG_IMAGE,
    ogType: "website",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": "Özel Güvenlik İş İlanları",
        "alternateName": ["ozelguvenlik.online", "ÖzelGüvenlik.Online", "özel güvenlik iş ilanları"],
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
        "alternateName": ["ozelguvenlik.online", "ÖzelGüvenlik.Online"],
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
  const announcements = Array.isArray(announcementsData) ? announcementsData : [];
  const tickerLines = useMemo(() => getHomeTickerLines(announcements), [announcements]);

  const savedHome = getSavedHomeState();
  const [page, setPage] = useState(savedHome.page);
  const pageSize = 10;
  const [activePill, setActivePill] = useState<string>(savedHome.activePill);
  const [otherCity, setOtherCity] = useState<string | null>(savedHome.otherCity);
  const [otherSheetOpen, setOtherSheetOpen] = useState(false);
  const [sortNewest, setSortNewest] = useState<"new" | "old">(savedHome.sortNewest);
  const [cityFilters, setCityFilters] = useState<{ city: string; count: number }[]>([]);
  const listingsTopRef = useRef<HTMLElement | null>(null);
  const prevPageRef = useRef<number | null>(null);
  const gpuSafeMode = useGpuSafeMode();

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

  const { data: listingsData, isLoading, isFetching, refetch } = useGetListings({
    page,
    limit: pageSize,
    ...(cityFilter ? { city: cityFilter } : {}),
  } as Parameters<typeof useGetListings>[0]);

  const { data: featuredData } = useGetListings({
    page: 1,
    limit: 20,
    featured: true,
  } as Parameters<typeof useGetListings>[0]);

  useEffect(() => {
    sessionStorage.setItem(HOME_STATE_KEY, JSON.stringify({ page, activePill, otherCity, sortNewest }));
  }, [page, activePill, otherCity, sortNewest]);

  // İlk yüklemede detaydan dönüş scroll'unu geri yükle; her sayfa değişiminde ilk ilana git
  useEffect(() => {
    if (isLoading || isFetching) return;

    if (prevPageRef.current === null) {
      prevPageRef.current = page;
      const raw = sessionStorage.getItem(HOME_SCROLL_KEY);
      if (raw) {
        const y = parseInt(raw, 10);
        sessionStorage.removeItem(HOME_SCROLL_KEY);
        if (Number.isFinite(y) && y > 0) {
          requestAnimationFrame(() => window.scrollTo(0, y));
        }
      }
      return;
    }

    if (prevPageRef.current === page) return;
    prevPageRef.current = page;
    sessionStorage.removeItem(HOME_SCROLL_KEY);
    const el = listingsTopRef.current;
    requestAnimationFrame(() => {
      if (el) {
        const top = el.getBoundingClientRect().top + window.scrollY - 72;
        window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
      } else {
        window.scrollTo({ top: 0, behavior: "auto" });
      }
    });
  }, [page, isLoading, isFetching]);

  const [banners, setBanners] = useState<Banner[]>([]);

  /* Favorites */
  const { data: favData } = useGetMyFavorites({
    query: { queryKey: getGetMyFavoritesQueryKey(), enabled: !!user }
  });
  const favListings = Array.isArray(favData) ? favData : [];
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
      .catch(() => setBanners([]));
  }, []);

  useEffect(() => {
    const id = setInterval(() => { void refetch(); }, 30000);
    return () => clearInterval(id);
  }, [refetch]);

  /* Local filtering for pills that don't map to server-side city query */
  const apiListings = listingsData?.listings ?? [];
  const apiTotal = listingsData?.total ?? 0;
  const allListings = apiListings;
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

  const featuredList = useMemo(() => featuredData?.listings ?? [], [featuredData]);
  const totalCount = apiTotal;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  /* Stats */
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  const newToday = allListings.filter(l => new Date(l.createdAt).getTime() > dayAgo).length;

  const scrollToListings = useCallback(() => {
    listingsTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleNearClick = useCallback(() => {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        () => scrollToListings(),
        () => scrollToListings(),
        { timeout: 8000, maximumAge: 60000 },
      );
      return;
    }
    scrollToListings();
  }, [scrollToListings]);

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

  return (
    <Layout>
      <HomeNewsTicker lines={tickerLines} />

      {banners.length > 0 && (
        <div className="px-4 pt-4 w-full box-border">
          <BannerCarousel banners={banners} />
        </div>
      )}

      <div className="p-4 space-y-4">

        {/* ── Hızlı kartlar (referans) ───────────────────────── */}
        <HomeQuickCards
          totalCount={totalCount}
          showNewsBadge={announcements.length > 0 || newToday > 0}
          onTotalClick={scrollToListings}
          onNearClick={handleNearClick}
        />

        {/* ── Filter Pills ─────────────────────────────────── */}
        <section className="og-pills hide-scrollbar">
          {QUICK_CITY_PILLS.map(p => {
            const active = activePill === p.id;
            const href =
              p.id === "istanbul" ? "/istanbul"
              : p.id === "anadolu" ? "/istanbul-anadolu-yakasi"
              : p.id === "avrupa" ? "/istanbul-avrupa-yakasi"
              : null;
            const className = `og-pill ${active ? "og-pill-active" : ""}`;
            if (href) {
              return (
                <Link key={p.id} href={href} className={className}>
                  {p.id === "istanbul" && <MapPin className="w-3 h-3" />}
                  {p.label}
                </Link>
              );
            }
            return (
              <button
                key={p.id}
                onClick={() => { sessionStorage.removeItem(HOME_SCROLL_KEY); setActivePill(p.id); setOtherCity(null); setPage(1); }}
                className={className}
              >
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
                      <Link
                        key={c.city}
                        href={`/${toSlug(c.city)}`}
                        onClick={() => setOtherSheetOpen(false)}
                        className={`og-city-btn ${otherCity === c.city ? "og-city-btn-active" : ""}`}
                      >
                        <MapPin className="w-3.5 h-3.5" />
                        <span className="text-sm font-semibold">{c.city}</span>
                      </Link>
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

        {/* ── Öne çıkan + canlı destek + tüm ilanlar (sıkı aralık) ── */}
        <div className="flex flex-col gap-1">
        {featuredList.length > 0 && (
          <section className="space-y-1">
            <div className="featured-section-head">
              <h2 className="og-section-title flex items-center gap-1.5 text-sm mb-0">
                <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                Öne Çıkan İlanlar
              </h2>
              <Link href="/ilanlar?featured=1" className="featured-section-head__link">
                Tümünü Gör
                <ChevronDown className="w-3.5 h-3.5 -rotate-90" />
              </Link>
            </div>
            <FeaturedJobCarousel
              listings={featuredList}
              onNavigate={saveHomeScroll}
              savedIds={favIds}
              onToggleSave={handleToggleFav}
            />
          </section>
        )}

        <LiveSupportBar />

        {/* ── Tüm İlanlar ──────────────────────────────────── */}
        <section ref={listingsTopRef}>
          <div className="flex items-center justify-between mb-1">
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

          <div className="space-y-2">
            {isLoading ? (
              [1,2,3,4,5].map(i => (
                <div key={i} className="og-list-skeleton" style={{ minHeight: 140 }} />
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
                const card = (
                  <JobListingCard
                    listing={listing}
                    onNavigate={saveHomeScroll}
                    saved={favIds.has(listing.id) || !!listing.isFavoritedByMe}
                    onToggleSave={handleToggleFav}
                    adminOverlay={canQuickEditCity ? (
                      <>
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
                      </>
                    ) : undefined}
                  />
                );

                if (gpuSafeMode) {
                  return (
                    <div key={listing.id} className="og-list-row-wrap">
                      {card}
                    </div>
                  );
                }

                return (
                  <motion.div
                    key={listing.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(idx * 0.02, 0.2) }}
                    className="og-list-row-wrap"
                  >
                    {card}
                  </motion.div>
                );
              })
            )}
          </div>

          {/* Pagination */}
          {!isLoading && totalPages > 1 && (
            <div className="flex items-center justify-center gap-1.5 sm:gap-2 mt-5 flex-wrap">
              <button
                onClick={() => { sessionStorage.removeItem(HOME_SCROLL_KEY); setPage(1); }}
                disabled={page <= 1}
                className="og-page-btn"
                title="İlk sayfa"
              >
                « İlk
              </button>
              <button
                onClick={() => { sessionStorage.removeItem(HOME_SCROLL_KEY); setPage(p => Math.max(1, p - 1)); }}
                disabled={page <= 1}
                className="og-page-btn"
              >
                Önceki
              </button>
              <div className="og-page-current">
                Sayfa {page} / {totalPages}
              </div>
              <button
                onClick={() => { sessionStorage.removeItem(HOME_SCROLL_KEY); setPage(p => Math.min(totalPages, p + 1)); }}
                disabled={page >= totalPages}
                className="og-page-btn"
              >
                Sonraki
              </button>
              <button
                onClick={() => { sessionStorage.removeItem(HOME_SCROLL_KEY); setPage(totalPages); }}
                disabled={page >= totalPages}
                className="og-page-btn"
                title="Son sayfa"
              >
                Son »
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

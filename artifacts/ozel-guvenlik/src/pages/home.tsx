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
import { buildHomeTitle, buildHomeDescription, SEO_BASE_URL, SEO_OG_IMAGE } from "@/lib/seo-config";
import { toSlug } from "@/lib/seo-cities";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { useQueryClient } from "@tanstack/react-query";
import type { JobCardListing } from "@/components/job-listing-card";
import { FeaturedJobCarousel } from "@/components/featured-job-card";
import { LiveSupportBar } from "@/components/live-support-bar";
import { HomeQuickCards } from "@/components/home-quick-cards";
import { HomeNewsCards } from "@/components/home-news-cards";
import { DisplayModeToggle } from "@/components/display-mode-toggle";
import { useDisplayMode } from "@/contexts/DisplayModeContext";
import { NearbySearchModal } from "@/components/nearby/nearby-search-modal";
import {
  matchesIstanbulSide,
  type IstanbulSide,
} from "@/lib/istanbul-side";
import { getHomeBannerSeeds } from "@/lib/banner-assets";
import "@/styles/desktop-home.css";

const BASE_URL = "https://ozelguvenlik.online";

const HOME_STATE_KEY = "home_page_state";
const HOME_SCROLL_KEY = "home_scroll_y";

type HomeSavedState = {
  page: number;
  activePill: string;
  otherCity: string | null;
  sortMode: "recommended" | "newest" | "oldest";
};

function getSavedHomeState(): HomeSavedState {
  try {
    const saved = sessionStorage.getItem(HOME_STATE_KEY);
    if (!saved) return { page: 1, activePill: "all", otherCity: null, sortMode: "newest" };
    const parsed = JSON.parse(saved) as Partial<HomeSavedState> & { sortNewest?: "new" | "old" };
    const sortMode =
      parsed.sortMode === "newest" || parsed.sortMode === "oldest" || parsed.sortMode === "recommended"
        ? (parsed.sortMode === "recommended" ? "newest" : parsed.sortMode)
        : parsed.sortNewest === "old"
          ? "oldest"
          : "newest";
    return {
      page: Math.max(1, parsed.page ?? 1),
      activePill: parsed.activePill ?? "all",
      otherCity: parsed.otherCity ?? null,
      sortMode,
    };
  } catch {
    return { page: 1, activePill: "all", otherCity: null, sortMode: "newest" };
  }
}

function saveHomeScroll() {
  sessionStorage.setItem(HOME_SCROLL_KEY, String(window.scrollY));
}

interface Banner {
  id: number;
  title: string | null;
  subtitle?: string | null;
  ctaLabel?: string | null;
  altText?: string | null;
  imageUrl: string;
  mobileImageUrl?: string | null;
  linkUrl: string | null;
}

const bannerFallbacks = [
  "linear-gradient(135deg,#0759aa 0%,#0878e8 55%,#25a8ff 100%)",
  "linear-gradient(135deg,#0b467d 0%,#0878e8 55%,#65c7ff 100%)",
  "linear-gradient(135deg,#102f58 0%,#0568ce 55%,#25a8ff 100%)",
];

function BannerCarousel({ banners }: { banners: Banner[] }) {
  const [current, setCurrent] = useState(0);
  const [failedImages, setFailedImages] = useState<Set<number>>(new Set());
  const [srcOverrides, setSrcOverrides] = useState<Record<number, string>>({});
  const { isLite } = useDisplayMode();
  const gpuSafeMode = useGpuSafeMode();
  const reduceMotion = isLite || gpuSafeMode;

  const next = useCallback(() => {
    setCurrent(c => (c + 1) % banners.length);
  }, [banners.length]);

  useEffect(() => {
    if (isLite || banners.length < 2) return;
    const id = setInterval(next, 4000);
    return () => clearInterval(id);
  }, [next, banners.length, isLite]);

  // iOS/Safari: lazy + absolute slide = yüklenmeme; bannerı önceden çek
  useEffect(() => {
    for (const b of banners) {
      for (const url of [b.imageUrl, b.mobileImageUrl]) {
        if (!url) continue;
        const img = new Image();
        img.decoding = "async";
        img.src = url;
      }
    }
  }, [banners]);

  if (banners.length === 0) return null;

  const slideIndex = isLite ? 0 : current;
  const banner = banners[slideIndex]!;
  const imageFailed = failedImages.has(banner.id);
  const imgSrc = srcOverrides[banner.id] ?? banner.imageUrl;

  const handleImgError = () => {
    const fallback = `/banners/banner-${(slideIndex % 3) + 1}.jpg`;
    if (imgSrc !== fallback && !srcOverrides[banner.id]) {
      setSrcOverrides((prev) => ({ ...prev, [banner.id]: fallback }));
      return;
    }
    setFailedImages((prev) => new Set(prev).add(banner.id));
  };

  const media = (
    <div className="og-banner-carousel__media select-none">
      {imageFailed ? (
        <div
          className="absolute inset-0"
          style={{ background: bannerFallbacks[slideIndex % bannerFallbacks.length] }}
        />
      ) : (
        <picture>
          {banner.mobileImageUrl && (
            <source media="(max-width: 767px)" srcSet={banner.mobileImageUrl} />
          )}
          <source
            type="image/avif"
            srcSet="/banners/career-hero-512.avif 512w, /banners/career-hero-1024.avif 1024w"
            sizes="100vw"
          />
          <source
            type="image/webp"
            srcSet="/banners/career-hero-512.webp 512w, /banners/career-hero-1024.webp 1024w"
            sizes="100vw"
          />
          <img
            src={imgSrc}
            alt={banner.altText || banner.title || "Özel Güvenlik duyurusu"}
            decoding="async"
            loading="eager"
            fetchPriority="high"
            width={1024}
            height={341}
            onError={handleImgError}
          />
        </picture>
      )}
      {(banner.title || banner.subtitle || banner.ctaLabel) && (
        <>
          {(banner.title || banner.subtitle) && <div className="og-banner-carousel__shade" aria-hidden />}
          <div className={`og-banner-carousel__copy${!banner.title && !banner.subtitle ? " og-banner-carousel__copy--cta-only" : ""}`}>
            {banner.title && (
              <h2 style={{ margin: 0, fontSize: "clamp(19px, 3.3vw, 42px)", fontWeight: 900, lineHeight: 1.05, letterSpacing: "-0.035em" }}>
                {banner.title}
              </h2>
            )}
            {banner.subtitle && <p>{banner.subtitle}</p>}
            {banner.ctaLabel && banner.linkUrl && <span>{banner.ctaLabel}</span>}
          </div>
        </>
      )}
    </div>
  );
  const slideContent = banner.linkUrl ? (
    <a className="og-banner-carousel__link" href={banner.linkUrl} aria-label={banner.ctaLabel || banner.title || "Banner bağlantısını aç"}>
      {media}
    </a>
  ) : media;

  // Mobil / Lite: AnimatePresence remount iOS'ta img'yi düşürebiliyor — sabit slide kullan
  if (isLite || reduceMotion) {
    return (
      <div className={`og-banner-carousel${banner.mobileImageUrl ? " og-banner-carousel--responsive" : " og-banner-carousel--legacy"}`}>
        <div className="og-banner-carousel__slide">{slideContent}</div>
      </div>
    );
  }

  return (
    <div className={`og-banner-carousel${banner.mobileImageUrl ? " og-banner-carousel--responsive" : " og-banner-carousel--legacy"}`}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={current}
          initial={{ opacity: 0, x: 36 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -36 }}
          transition={{ duration: 0.45, ease: "easeInOut" }}
          className="og-banner-carousel__slide"
        >
          {slideContent}
        </motion.div>
      </AnimatePresence>

    </div>
  );
}

function formatDate(iso: string) {
  const t = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - (Number.isFinite(t) ? t : Date.now()));
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
  { id: "istanbul",   label: "İstanbul",        match: (c: string) => /istanbul|anadolu|avrupa/i.test(c) || matchesIstanbulSide(c, "anadolu") || matchesIstanbulSide(c, "avrupa") },
  { id: "anadolu",    label: "Anadolu Yakası",  match: (c: string) => matchesIstanbulSide(c, "anadolu") },
  { id: "avrupa",     label: "Avrupa Yakası",   match: (c: string) => matchesIstanbulSide(c, "avrupa") },
];

const OTHER_CITIES = [
  "Ankara", "İzmir", "Bursa", "Kocaeli", "Antalya", "Adana", "Konya", "Gaziantep",
  "Mersin", "Kayseri", "Eskişehir", "Sakarya", "Tekirdağ", "Samsun", "Trabzon",
];

export default function Home() {
  useDocumentMeta({
    title: buildHomeTitle(),
    description: buildHomeDescription(),
    canonical: `${SEO_BASE_URL}/`,
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
        "logo": `${BASE_URL}/brand-logo.png`,
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
  const savedHome = getSavedHomeState();
  const [page, setPage] = useState(savedHome.page);
  const pageSize = 10;
  const [activePill, setActivePill] = useState<string>(savedHome.activePill);
  const [otherCity, setOtherCity] = useState<string | null>(savedHome.otherCity);
  const [otherSheetOpen, setOtherSheetOpen] = useState(false);
  const [nearbyOpen, setNearbyOpen] = useState(false);
  const [sortMode, setSortMode] = useState<"recommended" | "newest" | "oldest">(savedHome.sortMode);
  const [cityFilters, setCityFilters] = useState<{ city: string; count: number }[]>([]);
  const listingsTopRef = useRef<HTMLElement | null>(null);
  const prevPageRef = useRef<number | null>(null);
  useEffect(() => {
    fetch("/api/listings/cities")
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setCityFilters(data); })
      .catch(() => setCityFilters([]));
  }, []);

  const cityFilter = useMemo(() => {
    if (activePill === "other" && otherCity) return otherCity;
    if (activePill === "istanbul") return "İstanbul";
    if (activePill === "anadolu") return "İstanbul Anadolu Yakası";
    if (activePill === "avrupa") return "İstanbul Avrupa Yakası";
    return undefined;
  }, [activePill, otherCity]);

  const { data: listingsData, isLoading, isFetching, refetch } = useGetListings({
    page,
    limit: pageSize,
    sort: sortMode,
    ...(cityFilter ? { city: cityFilter } : {}),
  } as Parameters<typeof useGetListings>[0]);

  const { data: featuredData } = useGetListings({
    page: 1,
    limit: 20,
    featured: true,
    sort: "newest",
    includeTotal: false,
  } as Parameters<typeof useGetListings>[0]);

  useEffect(() => {
    sessionStorage.setItem(HOME_STATE_KEY, JSON.stringify({ page, activePill, otherCity, sortMode }));
  }, [page, activePill, otherCity, sortMode]);

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

  const [banners, setBanners] = useState<Banner[]>(() => {
    const seeds = getHomeBannerSeeds();
    const primary = seeds.find((banner) => banner.ctaLabel && banner.linkUrl) ?? seeds[0];
    return primary ? [primary] : [];
  });

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
      .then(r => {
        if (!r.ok) throw new Error("Bannerlar yüklenemedi");
        return r.json();
      })
      .then(data => {
        const available: Banner[] = Array.isArray(data) && data.length > 0 ? data : [...getHomeBannerSeeds()];
        const primary = available.find((banner) => banner.ctaLabel && banner.linkUrl) ?? available[0];
        setBanners(primary ? [{
          ...primary,
          imageUrl: "/banners/career-hero.png",
          mobileImageUrl: null,
        }] : []);
      })
      .catch(() => {
        const primary = getHomeBannerSeeds().find((banner) => banner.ctaLabel && banner.linkUrl)
          ?? getHomeBannerSeeds()[0];
        setBanners(primary ? [primary] : []);
      });
  }, []);

  useEffect(() => {
    const refreshVisibleListings = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    const id = window.setInterval(refreshVisibleListings, 120_000);
    document.addEventListener("visibilitychange", refreshVisibleListings);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", refreshVisibleListings);
    };
  }, [refetch]);

  /* Local filtering for pills that don't map to server-side city query */
  const apiListings = listingsData?.listings ?? [];
  const apiTotal = listingsData?.total ?? 0;
  const allListings = apiListings;
  const filtered = useMemo(() => {
    const norm = (s: string) => s.toLocaleLowerCase("tr-TR");
    const primary = (city: string) => norm(city).split(/[\/,|]/)[0]?.trim() || "";

    if (activePill === "other" && otherCity) {
      const needle = norm(otherCity);
      return allListings.filter((l) => {
        const c = norm(l.city || "");
        const head = primary(l.city || "");
        // Başka il ile başlayanları ele (İstanbul / … → Kocaeli filtresine düşmez)
        if (head && !head.includes(needle) && !c.includes(` ${needle}`) && !c.includes(`/${needle}`) && !c.startsWith(needle)) {
          // benzersiz OSB/ilçe city alanında olabilir (Kocaeli / TAYSAD)
          return c.includes(needle);
        }
        return c.includes(needle) || head.includes(needle);
      });
    }

    if (activePill === "istanbul") {
      return allListings.filter((l) => {
        const c = norm(l.city || "");
        const head = primary(l.city || "");
        if (/^(kocaeli|ankara|izmir|bursa|sakarya|tekirdag|yalova|konya|antalya|adana|mersin)\b/.test(head)) {
          return false;
        }
        return /istanbul|anadolu|avrupa/.test(c)
          || matchesIstanbulSide(l.city, "anadolu")
          || matchesIstanbulSide(l.city, "avrupa");
      });
    }

    if (activePill === "anadolu" || activePill === "avrupa") {
      return allListings.filter((l) => matchesIstanbulSide(l.city, activePill as IstanbulSide));
    }

    if (activePill === "all") return allListings;

    const pill = QUICK_CITY_PILLS.find(p => p.id === activePill);
    if (pill?.match) {
      return allListings.filter(l => pill.match!(l.city));
    }
    return allListings;
  }, [allListings, activePill, otherCity]);

  const sorted = useMemo(() => {
    if (sortMode === "recommended") return filtered;
    const arr = [...filtered];
    arr.sort((a, b) => {
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      return sortMode === "newest" ? tb - ta : ta - tb;
    });
    return arr;
  }, [filtered, sortMode]);
  const totalCount = apiTotal;
  const displayListings: JobCardListing[] = sorted;

  const featuredList = useMemo(() => featuredData?.listings ?? [], [featuredData]);
  const homeFeaturedListings = useMemo(() => {
    const source = featuredList.length > 0 ? featuredList : displayListings;
    return [...source]
      .sort((a, b) => {
        const aTs = new Date((a as { sourcePublishedAt?: string }).sourcePublishedAt || a.createdAt).getTime();
        const bTs = new Date((b as { sourcePublishedAt?: string }).sourcePublishedAt || b.createdAt).getTime();
        return bTs - aTs;
      })
      .slice(0, 8);
  }, [featuredList, displayListings]);

  /* Stats */
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  const newToday = allListings.filter(l => new Date(l.createdAt).getTime() > dayAgo).length;

  const scrollToListings = useCallback(() => {
    listingsTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleNearClick = useCallback(() => {
    setNearbyOpen(true);
  }, []);

  return (
    <Layout>
      <h1 className="sr-only">Türkiye Geneli Güncel Özel Güvenlik İş İlanları</h1>
      <div className="og-home-top">
        {banners.length > 0 && (
          <div className="og-home-banner desktop-hero">
            <BannerCarousel banners={banners} />
          </div>
        )}

        <div className="og-home-body">
        <div className="og-home-mode-row mobile-home">
          <button type="button" className="og-home-total-count" onClick={scrollToListings}>
            <span>Toplam İlan</span>
            <strong>{totalCount.toLocaleString("tr-TR")}</strong>
          </button>
          <DisplayModeToggle />
        </div>
        {/* ── Hızlı kartlar — kart HTML/CSS'ine dokunulmaz; yalnızca dış wrap ── */}
        <div className="desktop-coming-soon-wrap">
        <HomeQuickCards
          showNewsBadge={announcements.length > 0 || newToday > 0}
          onNearClick={handleNearClick}
        />
        </div>
        <HomeNewsCards />
        <div className="mobile-home mt-4">
          <LiveSupportBar />
        </div>
        {/* ── Filter Pills ─────────────────────────────────── */}
        <section className="og-pills og-home-filter-pills hide-scrollbar" aria-hidden="true">
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

        {/* ── En yeni öne çıkan ilanlar: tüm cihazlarda yatay kompakt kartlar ── */}
        <div className="flex flex-col gap-1">
        {homeFeaturedListings.length > 0 && (
          <section ref={listingsTopRef} className="space-y-1 og-home-featured-newest">
            <div className="featured-section-head">
              <h2 className="og-section-title flex items-center gap-1.5 text-sm mb-0">
                <Star className="w-3.5 h-3.5 text-sky-500 fill-sky-500" />
                En Yeni Öne Çıkan İlanlar
              </h2>
              <Link href="/ilanlar?featured=1" className="featured-section-head__link">
                Tümünü Gör
                <ChevronDown className="w-3.5 h-3.5 -rotate-90" />
              </Link>
            </div>
            <FeaturedJobCarousel
              listings={homeFeaturedListings}
              isLite
              onNavigate={saveHomeScroll}
              savedIds={favIds}
              onToggleSave={handleToggleFav}
            />
          </section>
        )}
          {/* Trust strip */}
          {!isLoading && displayListings.length > 0 && (
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
        </div>
        </div>
      </div>
      <NearbySearchModal open={nearbyOpen} onClose={() => setNearbyOpen(false)} />
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

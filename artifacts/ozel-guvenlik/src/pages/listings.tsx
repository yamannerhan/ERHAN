import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  useGetListings,
  useGetMyFavorites,
  getGetMyFavoritesQueryKey,
  useToggleListingFavorite,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useGpuSafeMode } from "@/hooks/use-gpu-safe-mode";
import {
  MapPin, Briefcase, Star, Search,
  ChevronDown, Check, Zap, ArrowUpDown,
} from "lucide-react";
import { toSlug } from "@/lib/seo-cities";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { JobListingCard } from "@/components/job-listing-card";
import { FeaturedJobCarousel } from "@/components/featured-job-card";
import { DesktopListingsTable } from "@/components/desktop-listings-table";
import { LiveSupportBar } from "@/components/live-support-bar";
import {
  isIstanbulSideLabel,
  matchesIstanbulSide,
  resolveIstanbulSideFromLabel,
  type IstanbulSide,
} from "@/lib/istanbul-side";
import "@/components/listings-page.css";

const LISTINGS_STATE_KEY = "listings_page_state";

const CATEGORY_PILLS = [
  { id: "all", label: "Tümü" },
  { id: "silahli", label: "Silahlı" },
  { id: "silahsiz", label: "Silahsız" },
  { id: "bay", label: "Bay / Bayan" },
  { id: "vardiyali", label: "Vardiyalı" },
  { id: "parttime", label: "PartTime" },
] as const;

const LOCATION_PILLS = [
  { id: "", label: "Tümü" },
  { id: "İstanbul", label: "İstanbul", icon: true },
  { id: "Kocaeli", label: "Kocaeli", icon: true },
  { id: "Ankara", label: "Ankara", icon: true },
  { id: "İzmir", label: "İzmir", icon: true },
] as const;

const OTHER_CITIES = [
  "Ankara", "İzmir", "Bursa", "Kocaeli", "Antalya", "Adana", "Konya", "Gaziantep",
  "Mersin", "Kayseri", "Eskişehir", "Sakarya", "Tekirdağ", "Samsun", "Trabzon",
];

type CategoryId = (typeof CATEGORY_PILLS)[number]["id"];

function getSavedListingsState() {
  try {
    const saved = sessionStorage.getItem(LISTINGS_STATE_KEY);
    if (!saved) return { search: "", city: "", page: 1 };
    const parsed = JSON.parse(saved) as { search?: string; city?: string; page?: number };
    return {
      search: parsed.search ?? "",
      city: parsed.city ?? "",
      page: Math.max(1, parsed.page ?? 1),
    };
  } catch {
    return { search: "", city: "", page: 1 };
  }
}

function listingBlob(l: { title?: string | null; description?: string | null; requirements?: string | null }) {
  return `${l.title ?? ""} ${l.description ?? ""} ${l.requirements ?? ""}`.toLocaleLowerCase("tr-TR");
}

function isListingNew(createdAt: string) {
  return Date.now() - new Date(createdAt).getTime() < 86_400_000;
}

function isListingUrgent(l: { title?: string | null; description?: string | null; requirements?: string | null }) {
  return /acil|urgent/i.test(listingBlob(l));
}

function matchesCategory(
  l: { title?: string | null; description?: string | null; requirements?: string | null; workType?: string | null },
  cat: CategoryId,
) {
  if (cat === "all") return true;
  const t = listingBlob(l);
  if (cat === "silahli") return /silahl[ıi]/.test(t) && !/silahs[ıi]z/.test(t);
  if (cat === "silahsiz") return /silahs[ıi]z/.test(t);
  if (cat === "bay") return /\bbay\b|\bbayan\b|\berkek\b|\bkad[ıi]n\b/.test(t);
  if (cat === "vardiyali") return /vardiya/.test(t) || (l.workType ?? "").toLocaleLowerCase("tr-TR").includes("vardiya");
  if (cat === "parttime") return /part\s*time|yarı\s*zamanlı|parttime/i.test(t);
  return true;
}

function ListingStatusBadges({ listing }: { listing: { title?: string | null; description?: string | null; requirements?: string | null; createdAt: string } }) {
  const urgent = isListingUrgent(listing);
  const isNew = isListingNew(listing.createdAt);
  if (!urgent && !isNew) return null;
  return (
    <div className="og-lp-card-badges">
      {urgent && <span className="og-lp-badge og-lp-badge--urgent">ACİL</span>}
      {isNew && <span className="og-lp-badge og-lp-badge--new">YENİ</span>}
    </div>
  );
}

export default function Listings({ initialCity, initialSearch }: { initialCity?: string; initialSearch?: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const savedState = getSavedListingsState();
  const [search, setSearch] = useState(initialSearch ?? savedState.search);
  const [city, setCity] = useState(initialCity ?? savedState.city);
  const [page, setPage] = useState(initialCity || initialSearch ? 1 : savedState.page);
  const [cityFilters, setCityFilters] = useState<{ city: string; count: number }[]>([]);
  const [otherSheetOpen, setOtherSheetOpen] = useState(false);
  const [activeSubFilter, setActiveSubFilter] = useState<IstanbulSide | null>(() =>
    resolveIstanbulSideFromLabel(initialCity ?? savedState.city),
  );
  const [categoryFilter, setCategoryFilter] = useState<CategoryId>("all");
  const [sortMode, setSortMode] = useState<"recommended" | "newest" | "oldest">("recommended");
  const listingsTopRef = useRef<HTMLElement | null>(null);
  const prevPageRef = useRef<number | null>(null);
  const gpuSafeMode = useGpuSafeMode();

  useEffect(() => {
    if (!initialCity) return;
    setCity(initialCity);
    setPage(1);
    setActiveSubFilter(resolveIstanbulSideFromLabel(initialCity));
  }, [initialCity]);

  useEffect(() => {
    if (initialSearch == null) return;
    setSearch(initialSearch);
    setPage(1);
  }, [initialSearch]);

  const sideFilter = activeSubFilter ?? resolveIstanbulSideFromLabel(city);

  const effectiveCity = useMemo(() => {
    if (!city && !sideFilter) return undefined;
    if (sideFilter) {
      /* API yaka filtresini (ilçe bazlı) destekler — tam SEO etiketini gönder */
      if (sideFilter === "anadolu") return "İstanbul Anadolu Yakası";
      return "İstanbul Avrupa Yakası";
    }
    if (isIstanbulSideLabel(city)) {
      return resolveIstanbulSideFromLabel(city) === "anadolu"
        ? "İstanbul Anadolu Yakası"
        : "İstanbul Avrupa Yakası";
    }
    return city || undefined;
  }, [city, sideFilter]);

  const { data, isLoading, isFetching, refetch } = useGetListings({
    page,
    limit: 20,
    search: search || undefined,
    city: effectiveCity,
    sort: sortMode,
  } as Parameters<typeof useGetListings>[0]);

  const { data: featuredData } = useGetListings({
    page: 1,
    limit: 20,
    featured: true,
    sort: "recommended",
  } as Parameters<typeof useGetListings>[0]);

  const canQuickEditCity = user?.role === "admin" || user?.role === "moderator";
  const canQuickDeleteListing = user?.role === "admin";

  const { data: favData } = useGetMyFavorites({
    query: { queryKey: getGetMyFavoritesQueryKey(), enabled: !!user },
  });
  const favListings = Array.isArray(favData) ? favData : [];
  const favIds = useMemo(() => {
    return new Set<number>(favListings.map((l: { id?: number }) => Number(l?.id)).filter((n: number) => Number.isFinite(n)));
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

  useEffect(() => {
    sessionStorage.setItem(LISTINGS_STATE_KEY, JSON.stringify({ search, city, page }));
  }, [search, city, page]);

  useEffect(() => {
    fetch("/api/listings/cities")
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setCityFilters(d); })
      .catch(() => setCityFilters([]));
  }, []);

  const apiListings = data?.listings ?? [];
  const apiTotal = data?.total ?? 0;
  const listings = apiListings;
  const totalCount = apiTotal;
  const totalPages = Math.max(1, Math.ceil(totalCount / 20));

  const featuredList = useMemo(() => featuredData?.listings ?? [], [featuredData]);

  useEffect(() => {
    if (isLoading || isFetching) return;
    if (totalCount === 0) return;
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages, totalCount, isLoading, isFetching]);

  useEffect(() => {
    if (isLoading || isFetching) return;
    if (prevPageRef.current === null) {
      prevPageRef.current = page;
      return;
    }
    if (prevPageRef.current === page) return;
    prevPageRef.current = page;
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

  const displayListings = useMemo(() => {
    let list = [...listings];
    if (sideFilter) {
      list = list.filter((l) => matchesIstanbulSide(l.city, sideFilter));
    } else if (city && !isIstanbulSideLabel(city)) {
      list = list.filter((l) =>
        l.city.toLocaleLowerCase("tr-TR").includes(city.toLocaleLowerCase("tr-TR")),
      );
    }
    if (categoryFilter !== "all") list = list.filter(l => matchesCategory(l, categoryFilter));
    if (search.trim()) {
      const q = search.trim().toLocaleLowerCase("tr-TR");
      list = list.filter(l =>
        `${l.title} ${l.company} ${l.city}`.toLocaleLowerCase("tr-TR").includes(q),
      );
    }
    if (sortMode !== "recommended") {
      list.sort((a, b) => {
        const ta = new Date((a as { sourcePublishedAt?: string }).sourcePublishedAt || a.createdAt).getTime();
        const tb = new Date((b as { sourcePublishedAt?: string }).sourcePublishedAt || b.createdAt).getTime();
        return sortMode === "newest" ? tb - ta : ta - tb;
      });
    }
    return list;
  }, [listings, sideFilter, city, categoryFilter, search, sortMode]);

  const dayAgo = Date.now() - 86_400_000;
  const newToday = displayListings.filter(l => new Date(l.createdAt).getTime() > dayAgo).length;
  const urgentCount = displayListings.filter(l => isListingUrgent(l)).length;

  const statActive = totalCount;
  const statNew = newToday;
  const statUrgent = urgentCount;

  const activeLocation = city && LOCATION_PILLS.some(p => p.id === city) ? city : "";

  const renderListingCard = (listing: (typeof listings)[0], idx: number) => {
    const card = (
      <div className="og-lp-card-wrap">
        <ListingStatusBadges listing={listing} />
        <JobListingCard
          listing={listing}
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
              {canQuickDeleteListing && (
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
              )}
            </>
          ) : undefined}
        />
      </div>
    );

    if (gpuSafeMode) {
      return <div key={listing.id} className="og-list-row-wrap">{card}</div>;
    }
    return (
      <motion.div
        key={listing.id}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: Math.min(idx * 0.02, 0.15) }}
        className="og-list-row-wrap"
      >
        {card}
      </motion.div>
    );
  };

  return (
    <Layout headerVariant="listings">
      <div className="og-listings-page">

        {/* Arama */}
        <div className="og-lp-search">
          <Search className="og-lp-search__ico" aria-hidden />
          <input
            id="og-listings-search"
            type="search"
            className="og-lp-search__input"
            placeholder="Pozisyon, firma veya şehir ara..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>

        {/* Kategori filtreleri */}
        <div className="og-lp-filters">
          {CATEGORY_PILLS.map(p => (
            <button
              key={p.id}
              type="button"
              className={`og-lp-pill${categoryFilter === p.id ? " og-lp-pill--active" : ""}`}
              onClick={() => { setCategoryFilter(p.id); setPage(1); }}
            >
              {categoryFilter === p.id && p.id === "all" && <Check className="w-3 h-3" />}
              {p.label}
            </button>
          ))}
        </div>

        {/* Şehir + sıralama */}
        <div className="og-lp-filters og-lp-filters--loc">
          <div className="og-lp-pills-scroll">
            {LOCATION_PILLS.map(p => (
              <button
                key={p.id || "all"}
                type="button"
                className={`og-lp-pill${activeLocation === p.id ? " og-lp-pill--active" : ""}`}
                onClick={() => {
                  setCity(p.id);
                  setActiveSubFilter(null);
                  setPage(1);
                }}
              >
                {p.icon && <MapPin />}
                {p.label}
              </button>
            ))}
            <button
              type="button"
              className="og-lp-pill"
              onClick={() => setOtherSheetOpen(true)}
            >
              ··· Diğer
            </button>
          </div>
          <button
            type="button"
            className="og-lp-sort"
            onClick={() => setSortMode((s) => (s === "recommended" ? "newest" : s === "newest" ? "oldest" : "recommended"))}
          >
            <ArrowUpDown className="w-3 h-3" />
            {sortMode === "recommended" ? "Önerilen" : sortMode === "newest" ? "En Yeni" : "En Eski"}
          </button>
        </div>

        {/* İstatistikler */}
        <section className="og-lp-stats" aria-label="İlan istatistikleri">
          <div className="og-lp-stat">
            <div className="og-lp-stat__ico og-lp-stat__ico--gold"><Briefcase /></div>
            <div className="og-lp-stat__val">{statActive.toLocaleString("tr-TR")}</div>
            <div className="og-lp-stat__lbl">Aktif İlan</div>
          </div>
          <div className="og-lp-stat">
            <div className="og-lp-stat__ico og-lp-stat__ico--green"><Star /></div>
            <div className="og-lp-stat__val">{statNew.toLocaleString("tr-TR")}</div>
            <div className="og-lp-stat__lbl">Yeni İlan</div>
          </div>
          <div className="og-lp-stat">
            <div className="og-lp-stat__ico og-lp-stat__ico--red"><Zap /></div>
            <div className="og-lp-stat__val">{statUrgent.toLocaleString("tr-TR")}</div>
            <div className="og-lp-stat__lbl">Acil İlan</div>
          </div>
        </section>

        {/* Öne çıkan */}
        {featuredList.length > 0 && (
          <section>
            <div className="og-lp-section-head">
              <h2 className="og-lp-section-title">
                <Star fill="currentColor" />
                Öne Çıkan İlanlar
              </h2>
              <Link href="/ilanlar?featured=1" className="og-lp-section-link">Tümünü Gör &gt;</Link>
            </div>
            <FeaturedJobCarousel
              listings={featuredList}
              savedIds={favIds}
              onToggleSave={handleToggleFav}
            />
          </section>
        )}

        {/* Tüm ilanlar */}
        <section ref={listingsTopRef}>
          {/* Mobil kart listesi */}
          <div className="mobile-home">
            <div className="og-lp-section-head">
              <h2 className="og-lp-section-title">Tüm İlanlar</h2>
              <span className="og-lp-section-meta">{statActive.toLocaleString("tr-TR")} ilan</span>
            </div>

            <div className="space-y-0">
              {isLoading ? (
                [1, 2, 3, 4].map(i => <div key={i} className="og-list-skeleton" style={{ minHeight: 140, marginBottom: 10 }} />)
              ) : displayListings.length === 0 ? (
                <div className="og-lp-empty">
                  <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p>Bu filtreye uygun ilan bulunamadı</p>
                  <button
                    type="button"
                    onClick={() => {
                      setCity("");
                      setSearch("");
                      setCategoryFilter("all");
                      setPage(1);
                      setActiveSubFilter(null);
                    }}
                    className="text-amber-400 text-xs mt-2 hover:underline"
                  >
                    Filtreyi Temizle
                  </button>
                </div>
              ) : (
                displayListings.map((listing, idx) => renderListingCard(listing, idx))
              )}
            </div>
          </div>

          {/* Masaüstü tablo — anasayfa ile aynı */}
          {!isLoading && displayListings.length > 0 && (
            <DesktopListingsTable
              listings={displayListings}
              totalCount={statActive}
              sortNewest={sortMode === "oldest" ? "old" : "new"}
              sortLabel={sortMode === "recommended" ? "Önerilen" : sortMode === "newest" ? "En Yeni" : "En Eski"}
              onToggleSort={() => setSortMode((s) => (s === "recommended" ? "newest" : s === "newest" ? "oldest" : "recommended"))}
              savedIds={favIds}
              onToggleSave={handleToggleFav}
            />
          )}
          {isLoading && (
            <div className="desktop-home desktop-listings-table" aria-hidden>
              <div className="og-list-skeleton" style={{ minHeight: 200 }} />
            </div>
          )}
          {!isLoading && displayListings.length === 0 && (
            <div className="desktop-home og-lp-empty">
              <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>Bu filtreye uygun ilan bulunamadı</p>
            </div>
          )}

          {!isLoading && totalPages > 1 && (
            <div className="flex items-center justify-center gap-1.5 mt-5 mb-4 flex-wrap">
              <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1 || isFetching} className="og-page-btn">Önceki</button>
              <div className="og-page-current">Sayfa {page} / {totalPages}</div>
              <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages || isFetching} className="og-page-btn">
                {isFetching ? "Yükleniyor…" : "Sonraki"}
              </button>
            </div>
          )}
        </section>

        <div className="og-lp-support">
          <LiveSupportBar />
        </div>
      </div>

      {/* Diğer şehirler */}
      <AnimatePresence>
        {otherSheetOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOtherSheetOpen(false)} className="fixed inset-0 z-[70] bg-black/60" />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 280 }}
              className="og-sheet fixed bottom-0 left-0 right-0 z-[80] rounded-t-3xl p-5 max-w-md mx-auto"
            >
              <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3" />
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-base">Şehir Seç</h3>
                <button type="button" onClick={() => setOtherSheetOpen(false)} className="og-icon-btn p-1"><ChevronDown className="w-5 h-5" /></button>
              </div>
              <div className="grid grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto">
                {cityFilters.filter(c => OTHER_CITIES.includes(c.city)).map(c => (
                  <Link
                    key={c.city}
                    href={`/${toSlug(c.city)}`}
                    onClick={() => { setCity(c.city); setOtherSheetOpen(false); setPage(1); }}
                    className={`og-city-btn ${city === c.city ? "og-city-btn-active" : ""}`}
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span className="text-sm font-semibold flex-1 text-left">{c.city}</span>
                  </Link>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </Layout>
  );
}

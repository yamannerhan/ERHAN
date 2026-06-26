import React, { useEffect, useMemo, useState } from "react";
import { useGetListings, useGetMyFavorites, getGetMyFavoritesQueryKey, useToggleListingFavorite } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin, Briefcase, Clock, Star, Bookmark, Building2, Search,
  SlidersHorizontal, ChevronDown, ChevronRight, X, Filter,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { displayCompany } from "@/lib/utils";
import { getListingImage } from "@/lib/listing-image";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const LISTINGS_STATE_KEY = "listings_page_state";

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

function formatDate(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(h / 24);
  if (h < 1) return "Az önce";
  if (h < 24) return `${h} saat önce`;
  if (d < 7) return `${d} gün önce`;
  return new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
}

function detectArmed(title?: string | null, desc?: string | null, req?: string | null): string {
  const haystack = `${title ?? ""} ${desc ?? ""} ${req ?? ""}`.toLocaleLowerCase("tr-TR");
  const isArmed = /silahl[ıi]/.test(haystack);
  const isUnarmed = /silahs[ıi]z/.test(haystack);
  if (isArmed && !isUnarmed) return "Silahlı Görev";
  return "Silahsız Görev";
}

const QUICK_PILLS = [
  { id: "all", label: "Tümü", serverCity: undefined as string | undefined },
  { id: "İstanbul", label: "İstanbul", icon: true, serverCity: "İstanbul" },
  { id: "Anadolu Yakası", label: "Anadolu Yakası", serverCity: "İstanbul" },
  { id: "Avrupa Yakası", label: "Avrupa Yakası", serverCity: "İstanbul" },
];

const OTHER_CITIES = [
  "Ankara", "İzmir", "Bursa", "Kocaeli", "Antalya", "Adana", "Konya", "Gaziantep",
  "Mersin", "Kayseri", "Eskişehir", "Sakarya", "Tekirdağ", "Samsun", "Trabzon",
];

export default function Listings({ initialCity }: { initialCity?: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const savedState = getSavedListingsState();
  const [search, setSearch] = useState(savedState.search);
  const [city, setCity] = useState(initialCity ?? savedState.city);
  const [page, setPage] = useState(savedState.page);
  const [cityFilters, setCityFilters] = useState<{ city: string; count: number }[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [otherSheetOpen, setOtherSheetOpen] = useState(false);
  const [activeSubFilter, setActiveSubFilter] = useState<null | "anadolu" | "avrupa">(null);
  const [otherCity, setOtherCity] = useState("");

  const effectiveCity = useMemo(() => {
    if (!city) return undefined;
    if (city === "Anadolu Yakası" || city === "Avrupa Yakası") return "İstanbul";
    return city;
  }, [city]);

  const { data, isLoading, refetch } = useGetListings({
    page,
    limit: 20,
    search: search || undefined,
    city: effectiveCity,
  });
  const canQuickEditCity = user?.role === "admin" || user?.role === "moderator";

  /* Favorites */
  const { data: favData } = useGetMyFavorites({
    query: { queryKey: getGetMyFavoritesQueryKey(), enabled: !!user },
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
      .then(data => { if (Array.isArray(data)) setCityFilters(data); })
      .catch(() => setCityFilters([]));
  }, []);

  const listings = data?.listings ?? [];
  const totalCount = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / 20));

  // Client-side sub-filter for Anadolu/Avrupa
  const displayListings = useMemo(() => {
    if (activeSubFilter === "anadolu") {
      return listings.filter(l => /anadolu/i.test(l.city));
    }
    if (activeSubFilter === "avrupa") {
      return listings.filter(l => /avrupa/i.test(l.city));
    }
    return listings;
  }, [listings, activeSubFilter]);

  /* Stats */
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  const newToday = displayListings.filter(l => new Date(l.createdAt).getTime() > dayAgo).length;
  const companies = useMemo(() => {
    const set = new Set<string>();
    displayListings.forEach(l => {
      const c = displayCompany(l.company);
      if (c) set.add(c);
    });
    return set.size;
  }, [displayListings]);

  // Quick pills active state
  const activePill = !city ? "all" : QUICK_PILLS.find(p => p.id === city)?.id ?? "other";

  const handlePillClick = (id: string) => {
    if (id === "all") {
      setCity("");
      setActiveSubFilter(null);
      setOtherCity("");
    } else if (id === "İstanbul") {
      setCity("İstanbul");
      setActiveSubFilter(null);
      setOtherCity("");
    } else if (id === "Anadolu Yakası") {
      setCity("Anadolu Yakası");
      setActiveSubFilter("anadolu");
      setOtherCity("");
    } else if (id === "Avrupa Yakası") {
      setCity("Avrupa Yakası");
      setActiveSubFilter("avrupa");
      setOtherCity("");
    } else {
      setCity(id);
      setActiveSubFilter(null);
      setOtherCity("");
    }
    setPage(1);
  };

  return (
    <Layout>
      <div className="p-4 space-y-5">

        {/* ── Page Heading ─────────────────────────────────── */}
        <section className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="og-page-title">İlanlar</h1>
            <p className="og-page-sub">Size uygun özel güvenlik ilanlarını keşfedin</p>
          </div>
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            className="og-filter-btn shrink-0"
            aria-label="Filtrele"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Filtrele
          </button>
        </section>

        {/* ── Filter Pills ─────────────────────────────────── */}
        <section className="og-pills hide-scrollbar">
          {QUICK_PILLS.map(p => (
            <button
              key={p.id}
              onClick={() => handlePillClick(p.id)}
              className={`og-pill ${activePill === p.id ? "og-pill-active" : ""}`}
            >
              {p.icon && <MapPin className="w-3 h-3" />}
              {p.label}
            </button>
          ))}
          <button
            onClick={() => {
              if (activePill === "other") {
                setCity("");
                setActiveSubFilter(null);
                setOtherCity("");
                setPage(1);
              } else {
                setOtherSheetOpen(true);
              }
            }}
            className={`og-pill ${activePill === "other" ? "og-pill-active" : ""}`}
          >
            ··· {activePill === "other" && city ? city : "Diğer"}
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
                    .filter(c => OTHER_CITIES.includes(c.city))
                    .map(c => (
                      <button
                        key={c.city}
                        onClick={() => {
                          setCity(c.city);
                          setPage(1);
                          setOtherSheetOpen(false);
                        }}
                        className={`og-city-btn ${city === c.city ? "og-city-btn-active" : ""}`}
                      >
                        <MapPin className="w-3.5 h-3.5" />
                        <span className="text-sm font-semibold flex-1 text-left">{c.city}</span>
                        <span className="text-[10px] og-text-muted font-bold">({c.count})</span>
                      </button>
                    ))}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* ── Stats Row ────────────────────────────────────── */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="og-stat-card">
            <div className="og-stat-icon"><Briefcase className="w-4 h-4" /></div>
            <div className="og-stat-value">{totalCount}</div>
            <div className="og-stat-label">Açık İlan</div>
          </div>
          <div className="og-stat-card">
            <div className="og-stat-icon"><Building2 className="w-4 h-4" /></div>
            <div className="og-stat-value">{companies}</div>
            <div className="og-stat-label">Firma</div>
          </div>
          <div className="og-stat-card">
            <div className="og-stat-icon"><Clock className="w-4 h-4" /></div>
            <div className="og-stat-value">{newToday}</div>
            <div className="og-stat-label">Yeni İlan</div>
          </div>
          <div className="og-stat-card">
            <div className="og-stat-icon"><Bookmark className="w-4 h-4" /></div>
            <div className="og-stat-value">{favCount}</div>
            <div className="og-stat-label">Kaydedilen</div>
          </div>
        </section>

        {/* ── Listings list ────────────────────────────────── */}
        <section>
          <div className="space-y-2.5">
            {isLoading ? (
              [1, 2, 3, 4, 5].map(i => <div key={i} className="og-list-skeleton" />)
            ) : displayListings.length === 0 ? (
              <div className="og-empty">
                <Briefcase className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm font-semibold">Bu filtreye uygun ilan bulunamadı</p>
                <button onClick={() => { setCity(""); setSearch(""); setPage(1); setActiveSubFilter(null); setOtherCity(""); }} className="text-amber-400 text-xs mt-1 hover:underline">
                  Filtreyi Temizle
                </button>
              </div>
            ) : (
              displayListings.map((listing, idx) => {
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

                      <div className="flex-1 min-w-0">
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
                          <span className="og-text-muted text-[10px] truncate inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" />
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

                      <div className="og-list-salary text-right shrink-0">
                        <div className="og-list-salary-amount">{listing.salary || "—"}</div>
                        <div className="og-text-muted text-[10px] font-semibold">Aylık</div>
                      </div>

                      <span
                        className="absolute top-2 right-2 z-10 rounded-full bg-amber-400/90 text-slate-900 px-1.5 py-0.5 text-[8px] font-black shadow-md"
                        style={{ display: canQuickEditCity ? "none" : undefined }}
                      >
                        ▶
                      </span>

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
        </section>
      </div>

      {/* ── Filter sheet ─────────────────────────────────── */}
      <AnimatePresence>
        {filterOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setFilterOpen(false)}
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
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-base flex items-center gap-2">
                  <Filter className="w-4 h-4 text-amber-400" />
                  Filtrele
                </h3>
                <button onClick={() => setFilterOpen(false)} className="og-icon-btn p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs og-text-muted mb-1.5 block font-semibold">Ara</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={e => { setSearch(e.target.value); setPage(1); }}
                      placeholder="İlan başlığı, firma..."
                      className="pl-9"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs og-text-muted mb-1.5 block font-semibold">Şehir</label>
                  <div className="grid grid-cols-2 gap-2 max-h-[40vh] overflow-y-auto">
                    <button
                      onClick={() => { setCity(""); setPage(1); }}
                      className={`og-city-btn ${!city ? "og-city-btn-active" : ""}`}
                    >
                      <span className="text-sm font-semibold flex-1 text-left">Tümü</span>
                      <span className="text-[10px] font-bold">({totalCount})</span>
                    </button>
                    {cityFilters
                      .filter(c => OTHER_CITIES.includes(c.city))
                      .map(c => (
                        <button
                          key={c.city}
                          onClick={() => { setCity(c.city); setPage(1); }}
                          className={`og-city-btn ${city === c.city ? "og-city-btn-active" : ""}`}
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          <span className="text-sm font-semibold flex-1 text-left">{c.city}</span>
                          <span className="text-[10px] font-bold">({c.count})</span>
                        </button>
                      ))}
                  </div>
                </div>

                <Button
                  onClick={() => setFilterOpen(false)}
                  className="w-full bg-gradient-to-r from-amber-400 to-amber-600 text-slate-900 font-bold"
                >
                  Uygula
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </Layout>
  );
}

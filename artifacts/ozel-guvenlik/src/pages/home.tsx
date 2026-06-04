import React, { useState, useEffect, useCallback } from "react";
import { useGetListings, useGetAnnouncements } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Briefcase, ChevronRight, Clock, Star, Calendar, Users } from "lucide-react";
import { getListingImage } from "@/lib/listing-image";
import { extractGender, displayCompany } from "@/lib/utils";

interface Banner {
  id: number;
  title: string | null;
  imageUrl: string;
  linkUrl: string | null;
}

function BannerCarousel({ banners }: { banners: Banner[] }) {
  const [current, setCurrent] = useState(0);

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
          {banners[current]!.linkUrl ? (
            <a href={banners[current]!.linkUrl!} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
              <img src={banners[current]!.imageUrl} alt={banners[current]!.title ?? "Banner"} className="w-full h-full object-cover rounded-2xl" />
            </a>
          ) : (
            <img src={banners[current]!.imageUrl} alt={banners[current]!.title ?? "Banner"} className="w-full h-full object-cover rounded-2xl" />
          )}
          {banners[current]!.title && (
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent rounded-b-2xl px-4 py-2.5">
              <p className="text-white text-xs font-semibold">{banners[current]!.title}</p>
            </div>
          )}
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
  if (mins < 1) return "Az önce";
  if (mins < 60) return `${mins} dk önce`;
  if (hours < 24) return `${hours} sa önce`;
  if (days < 7) return `${days} gün önce`;
  return new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
}

function isExpiringSoon(expiresAt: string | null) {
  if (!expiresAt) return false;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return diff > 0 && diff < 3 * 24 * 60 * 60 * 1000;
}

export default function Home() {
  const { data: announcementsData } = useGetAnnouncements();
  const { data: listingsData, isLoading, refetch } = useGetListings({ limit: 20 });
  const [banners, setBanners] = useState<Banner[]>([]);
  const announcements = announcementsData || [];

  useEffect(() => {
    fetch("/api/banners")
      .then(r => r.json())
      .then(data => setBanners(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // Son İlanlar otomatik yenileme — 30 saniyede bir
  useEffect(() => {
    const id = setInterval(() => { void refetch(); }, 30000);
    return () => clearInterval(id);
  }, [refetch]);

  const featured = listingsData?.listings?.filter(l => l.isFeatured) ?? [];
  // Öne çıkanları Son İlanlar'dan çıkar — ikisinde de görünmesin
  const recent = (listingsData?.listings?.filter(l => !l.isFeatured) ?? []).slice(0, 10);

  return (
    <Layout>
      {announcements.length > 0 && (
        <div className="bg-primary/10 border-b border-primary/20 overflow-hidden relative h-9 flex items-center">
          <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
          <div className="flex animate-ticker whitespace-nowrap" style={{ animationDelay: `-${((Date.now() / 1000) % 60).toFixed(2)}s` }}>
            {[...announcements, ...announcements].map((a, i) => (
              <span key={i} className="inline-flex items-center gap-2 mx-8 text-xs font-medium text-primary/90">
                <span className="text-primary">●</span>{a.content}
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

      <div className="p-4 space-y-6">

        {/* ── Öne Çıkanlar: sürekli kayan ── */}
        {(isLoading || featured.length > 0) && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                <h2 className="text-base font-bold">Öne Çıkanlar</h2>
              </div>
              <Link href="/ilanlar?featured=true" className="text-xs text-accent flex items-center gap-0.5 font-medium">
                Tümü <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="overflow-hidden -mx-4">
              {isLoading ? (
                <div className="flex px-4 gap-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="min-w-[220px] h-[160px] glass-card rounded-2xl animate-pulse bg-white/5 shrink-0" />
                  ))}
                </div>
              ) : (
                <div className="flex animate-featured-scroll gap-3 px-4">
                  {/* İki kopya = seamless loop */}
                  {[...featured, ...featured].map((listing, i) => {
                    const img = getListingImage(listing.title, listing.company, listing.companyLogoUrl);
                    return (
                      <Link
                        href={`/ilan/${listing.id}`}
                        key={`${listing.id}-${i}`}
                        className="min-w-[220px] shrink-0 glass-card rounded-2xl overflow-hidden group relative border-primary/20 hover:border-primary/40 transition-all block"
                      >
                        <div className="relative h-24">
                          <img src={img} alt={listing.title} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-gradient-to-t from-card/90 via-card/30 to-transparent" />
                          <div className="absolute top-2 right-2">
                            <span className="text-[9px] font-bold bg-amber-500/90 text-amber-950 px-1.5 py-0.5 rounded-full">
                              ÖNE ÇIKAN
                            </span>
                          </div>
                        </div>
                        <div className="p-3">
                          <h3 className="font-semibold text-xs line-clamp-1">{listing.title}</h3>
                          {displayCompany(listing.company) && (
                            <p className="text-muted-foreground text-[10px] mt-0.5 line-clamp-1">{displayCompany(listing.company)}</p>
                          )}
                          <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span className="flex items-center gap-0.5 text-accent">
                              <MapPin className="w-2.5 h-2.5" />{listing.city}
                            </span>
                            {listing.salary && (
                              <span className="bg-primary/20 text-primary-foreground px-1.5 py-0.5 rounded font-semibold ml-auto">
                                {listing.salary}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex items-center gap-0.5 text-[10px] text-muted-foreground">
                            <Users className="w-2.5 h-2.5 text-primary" />Cinsiyet {extractGender(listing.requirements)}
                          </div>
                          <div className="mt-1.5 flex items-center text-[9px] text-muted-foreground/60">
                            <Clock className="w-2.5 h-2.5 mr-1" />
                            {formatDate(listing.createdAt)}
                            {(listing as any).expiresAt && isExpiringSoon((listing as any).expiresAt) && (
                              <span className="ml-1.5 text-amber-400">· Son günler!</span>
                            )}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Son İlanlar ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-1 h-5 bg-gradient-to-b from-primary to-secondary rounded-full" />
              <h2 className="text-base font-bold">Son İlanlar</h2>
            </div>
            <Link href="/ilanlar" className="text-xs text-accent flex items-center gap-0.5 font-medium">
              Tümü <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="space-y-3 md:space-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-4">
            {isLoading
              ? [1, 2, 3, 4].map(i => (
                  <div key={i} className="h-[110px] glass-card rounded-2xl animate-pulse bg-white/5" />
                ))
              : recent.map((listing, i) => {
                  const img = getListingImage(listing.title, listing.company, listing.companyLogoUrl);
                  return (
                    <motion.div
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      key={listing.id}
                      className="glass-card rounded-2xl overflow-hidden hover:border-primary/30 transition-all"
                    >
                      <Link href={`/ilan/${listing.id}`} className="flex">
                        <div className="relative w-24 shrink-0">
                          <img src={img} alt={listing.title} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-card/50" />
                          {listing.isFeatured && (
                            <Star className="absolute top-2 left-2 w-3 h-3 text-amber-400 fill-amber-400" />
                          )}
                        </div>
                        <div className="flex-1 p-3 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-0.5">
                            <h3 className="font-semibold text-sm line-clamp-2 flex-1">{listing.title}</h3>
                            {listing.salary && (
                              <span className="text-[10px] font-bold bg-primary/20 text-primary-foreground px-1.5 py-0.5 rounded shrink-0">
                                {listing.salary}
                              </span>
                            )}
                          </div>
                          {displayCompany(listing.company) && (
                            <p className="text-xs text-muted-foreground line-clamp-1 mb-2">{displayCompany(listing.company)}</p>
                          )}
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span className="flex items-center gap-0.5">
                              <MapPin className="w-2.5 h-2.5 text-accent" />{listing.city}
                            </span>
                            <span className="flex items-center gap-0.5">
                              <Briefcase className="w-2.5 h-2.5 text-secondary" />{listing.workType}
                            </span>
                            <span className="flex items-center gap-0.5">
                              <Users className="w-2.5 h-2.5 text-primary" />Cinsiyet {extractGender(listing.requirements)}
                            </span>
                            <span className="flex items-center gap-0.5 ml-auto">
                              <Clock className="w-2.5 h-2.5" />{formatDate(listing.createdAt)}
                            </span>
                          </div>
                          {(listing as any).expiresAt && (
                            <div className={`mt-1 flex items-center gap-1 text-[9px] font-medium ${isExpiringSoon((listing as any).expiresAt) ? "text-amber-400" : "text-muted-foreground/50"}`}>
                              <Calendar className="w-2.5 h-2.5" />
                              {isExpiringSoon((listing as any).expiresAt) ? "Son günler!" : `Bitiş: ${new Date((listing as any).expiresAt).toLocaleDateString("tr-TR")}`}
                            </div>
                          )}
                        </div>
                      </Link>
                    </motion.div>
                  );
                })}
          </div>
        </section>
      </div>
    </Layout>
  );
}

import React, { useState } from "react";
import { useGetListings } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { MapPin, Briefcase, Search, Clock, Star, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getListingImage } from "@/lib/listing-image";
import { extractGender, displayCompany } from "@/lib/utils";

function formatDate(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(h / 24);
  if (h < 1) return "Az önce";
  if (h < 24) return `${h} sa önce`;
  if (d < 7) return `${d} gün önce`;
  return new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
}

export default function Listings() {
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useGetListings({
    page,
    limit: 20,
    search: search || undefined,
    city: city || undefined,
  });

  return (
    <Layout>
      <div className="p-4 space-y-4">
        <div className="space-y-3 sticky top-14 z-30 bg-background/90 backdrop-blur-md pb-3 pt-2 -mx-4 px-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="İlan ara..."
              className="pl-9 glass-card border-white/10"
              data-testid="input-search"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
            {["Tümü", "İstanbul", "Ankara", "İzmir", "Bursa", "Antalya", "Kocaeli", "Gaziantep"].map((c) => (
              <Button
                key={c}
                variant={city === (c === "Tümü" ? "" : c) ? "default" : "outline"}
                className={`rounded-full shrink-0 text-xs h-7 px-3 ${
                  city === (c === "Tümü" ? "" : c)
                    ? "bg-gradient-to-r from-primary to-secondary text-white border-transparent"
                    : "glass-card border-white/10"
                }`}
                onClick={() => { setCity(c === "Tümü" ? "" : c); setPage(1); }}
                size="sm"
                data-testid={`btn-filter-${c}`}
              >
                {c}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-3 md:space-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-4">
          {isLoading ? (
            [1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-[130px] glass-card rounded-2xl animate-pulse bg-white/5" />
            ))
          ) : data?.listings?.length === 0 ? (
            <div className="text-center py-12 glass-card rounded-2xl md:col-span-2 lg:col-span-3">
              <p className="text-muted-foreground">İlan bulunamadı</p>
            </div>
          ) : (
            data?.listings?.map((listing, i) => {
              const img = getListingImage(listing.title, listing.company, listing.companyLogoUrl);
              return (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.04, 0.3) }}
                  key={listing.id}
                  className="glass-card rounded-2xl overflow-hidden hover:border-primary/30 transition-all"
                >
                  <Link href={`/ilan/${listing.id}`} className="flex gap-0">
                    <div className="relative w-28 shrink-0">
                      <img src={img} alt={listing.title} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent to-card/60" />
                      {listing.isFeatured && (
                        <div className="absolute top-2 left-2">
                          <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 drop-shadow" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 p-3 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-0.5">
                        <h3 className="font-semibold text-sm leading-snug line-clamp-2 flex-1">{listing.title}</h3>
                        {listing.salary && (
                          <span className="text-[10px] font-bold bg-primary/20 text-primary-foreground px-1.5 py-0.5 rounded shrink-0">
                            {listing.salary}
                          </span>
                        )}
                      </div>
                      {displayCompany(listing.company) && (
                        <p className="text-xs text-muted-foreground mb-2 line-clamp-1">{displayCompany(listing.company)}</p>
                      )}
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-0.5">
                          <MapPin className="w-3 h-3 text-accent" />{listing.city}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Briefcase className="w-3 h-3 text-secondary" />{listing.workType}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Users className="w-3 h-3 text-primary" />Cinsiyet {extractGender(listing.requirements)}
                        </span>
                        <span className="flex items-center gap-0.5 ml-auto">
                          <Clock className="w-3 h-3" />{formatDate(listing.createdAt)}
                        </span>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })
          )}
        </div>

        {data && data.total > 20 && (
          <div className="flex justify-center gap-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="glass-card border-white/10"
            >
              Önceki
            </Button>
            <span className="flex items-center text-sm text-muted-foreground">
              {page} / {Math.ceil(data.total / 20)}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= Math.ceil(data.total / 20)}
              onClick={() => setPage(p => p + 1)}
              className="glass-card border-white/10"
            >
              Sonraki
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
}

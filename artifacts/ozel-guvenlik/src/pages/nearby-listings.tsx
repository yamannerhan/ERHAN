import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Layout } from "@/components/layout";
import { JobListingCard, type JobCardListing } from "@/components/job-listing-card";
import { NearbySearchModal } from "@/components/nearby/nearby-search-modal";
import { useToast } from "@/hooks/use-toast";
import "@/components/nearby/nearby.css";

const RADII = [5, 10, 25, 50, 100] as const;

type NearbyResponse = {
  success: boolean;
  location?: { radiusKm: number; label: string };
  pagination?: { page: number; limit: number; total: number; totalPages: number };
  listings?: Array<JobCardListing & { distanceKm?: number | null; sameDistrict?: boolean; approximate?: boolean; hasService?: boolean }>;
  error?: string;
};

export default function NearbyListingsPage() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const params = useMemo(() => new URLSearchParams(search.startsWith("?") ? search.slice(1) : search), [search]);

  const radius = Number(params.get("radius") || 25);
  const sort = params.get("sort") || "distance";
  const [page, setPage] = useState(1);
  const [data, setData] = useState<NearbyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryBase = useMemo(() => {
    const sp = new URLSearchParams(params);
    sp.delete("page");
    return sp;
  }, [params]);

  const fetchListings = useCallback(async (pageNum: number) => {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams(queryBase);
      sp.set("page", String(pageNum));
      sp.set("limit", "24");
      if (!sp.get("radius")) sp.set("radius", "25");
      if (!sp.get("sort")) sp.set("sort", "distance");
      const res = await fetch(`/api/listings/nearby?${sp.toString()}`);
      const json = (await res.json()) as NearbyResponse;
      if (!res.ok || !json.success) {
        setError(json.error || "İlanlar yüklenemedi. Lütfen tekrar deneyin.");
        toast({ title: "İlanlar yüklenemedi. Lütfen tekrar deneyin." });
        setData(null);
        return;
      }
      setData(json);
    } catch {
      setError("İnternet bağlantısı yok veya sunucuya ulaşılamadı.");
      toast({ title: "İlanlar yüklenemedi. Lütfen tekrar deneyin." });
    } finally {
      setLoading(false);
    }
  }, [queryBase, toast]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    void fetchListings(page);
  }, [fetchListings, page]);

  const changeRadius = (r: number) => {
    const sp = new URLSearchParams(queryBase);
    sp.set("radius", String(r));
    navigate(`/yakindaki-ilanlar?${sp.toString()}`);
    toast({ title: "Mesafe filtresi güncellendi." });
    setPage(1);
  };

  const total = data?.pagination?.total ?? 0;
  const radiusKm = data?.location?.radiusKm ?? (RADII.includes(radius as (typeof RADII)[number]) ? radius : 25);
  const label = data?.location?.label ?? "Konumunuz civarı";
  const listings = data?.listings ?? [];

  return (
    <Layout>
      <div className="og-nearby-page">
        <div className="og-nearby-page__head">
          <h1 className="og-nearby-page__title">Yakınımdaki İlanlar</h1>
          <p className="og-nearby-page__meta">
            {radiusKm} km çevrende {total.toLocaleString("tr-TR")} ilan bulundu
          </p>
          <p className="og-nearby-page__loc">{label}</p>
        </div>

        <div className="og-nearby-filters-bar" aria-label="Mesafe">
          {RADII.map((r) => (
            <button
              key={r}
              type="button"
              className={`og-nearby-radius${radiusKm === r ? " is-on" : ""}`}
              onClick={() => changeRadius(r)}
            >
              {r} km
            </button>
          ))}
          <button type="button" className="og-nearby-chip" onClick={() => setModalOpen(true)}>
            Filtreler
          </button>
          <select
            className="og-nearby-chip"
            style={{ height: 36 }}
            value={sort}
            aria-label="Sıralama"
            onChange={(e) => {
              const sp = new URLSearchParams(queryBase);
              sp.set("sort", e.target.value);
              navigate(`/yakindaki-ilanlar?${sp.toString()}`);
              setPage(1);
            }}
          >
            <option value="distance">En yakın</option>
            <option value="newest">En yeni</option>
            <option value="salary">En yüksek maaş</option>
            <option value="views">En çok görüntülenen</option>
          </select>
        </div>

        {loading && (
          <div className="og-nearby-list" aria-busy="true">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="og-list-skeleton" style={{ minHeight: 140 }} />
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="og-nearby-empty">
            <h3>Bir sorun oluştu</h3>
            <p>{error}</p>
            <div className="og-nearby-empty__actions">
              <button type="button" className="og-nearby-primary" onClick={() => void fetchListings(page)}>
                Tekrar Dene
              </button>
              <button type="button" className="og-nearby-secondary" onClick={() => setModalOpen(true)}>
                Konumu veya İli Değiştir
              </button>
            </div>
          </div>
        )}

        {!loading && !error && listings.length === 0 && (
          <div className="og-nearby-empty">
            <h3>Bu mesafede aktif ilan bulunamadı.</h3>
            <p>Arama mesafesini artırarak daha fazla ilan görüntüleyebilirsin.</p>
            <div className="og-nearby-empty__actions">
              {radiusKm < 25 && (
                <button type="button" className="og-nearby-primary" onClick={() => changeRadius(25)}>
                  Mesafeyi 25 km Yap
                </button>
              )}
              {radiusKm < 50 && (
                <button type="button" className="og-nearby-secondary" onClick={() => changeRadius(50)}>
                  50 km Çevresinde Ara
                </button>
              )}
              {radiusKm >= 100 ? (
                <Link href="/ilanlar" className="og-nearby-primary" style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
                  Şehirdeki Tüm İlanları Gör
                </Link>
              ) : (
                <Link href="/ilanlar" className="og-nearby-secondary" style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
                  Şehirdeki Tüm İlanları Gör
                </Link>
              )}
            </div>
          </div>
        )}

        {!loading && !error && listings.length > 0 && (
          <>
            <div className="og-nearby-list">
              {listings.map((listing) => (
                <JobListingCard
                  key={listing.id}
                  listing={{
                    ...listing,
                    company: listing.company || (listing as { companyName?: string }).companyName || "Firma",
                  }}
                />
              ))}
            </div>
            {(data?.pagination?.totalPages ?? 1) > 1 && (
              <div className="flex items-center justify-center gap-2 mt-5 flex-wrap">
                <button
                  type="button"
                  className="og-page-btn"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Önceki
                </button>
                <div className="og-page-current">
                  Sayfa {page} / {data?.pagination?.totalPages}
                </div>
                <button
                  type="button"
                  className="og-page-btn"
                  disabled={page >= (data?.pagination?.totalPages ?? 1)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Sonraki
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <NearbySearchModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </Layout>
  );
}

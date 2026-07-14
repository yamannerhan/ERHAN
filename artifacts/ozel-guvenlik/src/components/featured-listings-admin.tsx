import React, { useCallback, useEffect, useState } from "react";
import { Star, StarOff, Trash2, RefreshCw, Building2, User, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

type FeaturedListing = {
  id: number;
  title: string;
  company: string;
  city: string;
  status: string;
  isFeatured: boolean;
  featuredUntil: string | null;
  authorUsername: string | null;
  authorDisplayName: string | null;
  companyProfileName: string | null;
  companyPhone: string | null;
  contactName: string | null;
  isUserListing: boolean;
  sourceTag: string | null;
  createdAt: string;
};

type ToastFn = (opts: { title: string; description?: string; variant?: "default" | "destructive" }) => void;

export function FeaturedListingsAdminSection({
  apiCall,
  toast,
  canDelete = false,
}: {
  apiCall: (path: string, method: string, body?: unknown) => Promise<unknown>;
  toast: ToastFn;
  canDelete?: boolean;
}) {
  const [listings, setListings] = useState<FeaturedListing[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiCall("/admin/listings?featured=true&limit=100&page=1", "GET") as {
        listings: FeaturedListing[];
        total: number;
      };
      setListings(data.listings ?? []);
      setTotal(data.total ?? 0);
    } catch (e: unknown) {
      toast({
        title: "Öne çıkanlar yüklenemedi",
        description: e instanceof Error ? e.message : "Hata",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [apiCall, toast]);

  useEffect(() => { void load(); }, [load]);

  const unfeature = async (id: number) => {
    setBusyId(id);
    try {
      await apiCall(`/admin/listings/${id}/unfeature`, "POST");
      toast({ title: "Öne çıkarma kaldırıldı" });
      await load();
    } catch (e: unknown) {
      toast({
        title: "Kaldırılamadı",
        description: e instanceof Error ? e.message : "Hata",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const removeListing = async (id: number) => {
    if (!window.confirm(`#${id} ilanı tamamen silinsin mi?`)) return;
    setBusyId(id);
    try {
      await apiCall(`/admin/listings/${id}`, "DELETE");
      toast({ title: `İlan #${id} silindi` });
      await load();
    } catch (e: unknown) {
      toast({
        title: "Silinemedi",
        description: e instanceof Error ? e.message : "Hata",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const formatUntil = (iso: string | null) => {
    if (!iso) return "Süresiz / işaretli";
    try {
      return new Date(iso).toLocaleString("tr-TR");
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Aktif öne çıkan: <strong className="text-amber-300">{total}</strong> · Kaldırma veya silme buradan yapılır.
        </p>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading} className="h-8 text-xs">
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
          Yenile
        </Button>
      </div>

      {loading && !listings.length && (
        <p className="text-xs text-muted-foreground py-6 text-center">Yükleniyor…</p>
      )}

      {!loading && !listings.length && (
        <p className="text-xs text-muted-foreground py-6 text-center">Şu an öne çıkan ilan yok.</p>
      )}

      <div className="space-y-2">
        {listings.map((l) => (
          <div key={l.id} className="bg-white/5 rounded-xl p-3 space-y-2 border border-amber-500/15">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded-lg bg-primary/20 text-primary">#{l.id}</span>
                  <span className="text-sm font-medium break-words">{l.title}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium inline-flex items-center gap-0.5">
                    <Star className="w-2.5 h-2.5 fill-amber-400" /> Öne Çıkan
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1 break-words flex items-start gap-1">
                  <Building2 className="w-3 h-3 mt-0.5 shrink-0 text-emerald-400" />
                  <span>
                    <strong className="text-emerald-300">{l.companyProfileName || l.company}</strong>
                    {" · "}{l.city}
                  </span>
                </div>
                {(l.isUserListing || l.authorUsername) && (
                  <div className="text-[11px] text-sky-300/90 mt-1 break-words flex items-start gap-1">
                    <User className="w-3 h-3 mt-0.5 shrink-0" />
                    <span>
                      Kullanıcı ilanı
                      {l.authorUsername ? ` · @${l.authorUsername}` : ""}
                      {l.contactName ? ` · ${l.contactName}` : ""}
                      {l.companyPhone ? ` · ${l.companyPhone}` : ""}
                    </span>
                  </div>
                )}
                <div className="text-[10px] text-muted-foreground mt-1">
                  Bitiş: {formatUntil(l.featuredUntil)}
                </div>
              </div>
              <a
                href={`/ilan/${l.id}`}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground hover:text-white shrink-0 p-1"
                title="İlanı aç"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={busyId === l.id}
                onClick={() => void unfeature(l.id)}
                className="text-[10px] flex items-center gap-0.5 px-2 py-1 bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 transition-colors disabled:opacity-50"
              >
                <StarOff className="w-3 h-3" /> Öne çıkarmayı kaldır
              </button>
              {canDelete && (
                <button
                  type="button"
                  disabled={busyId === l.id}
                  onClick={() => void removeListing(l.id)}
                  className="text-[10px] flex items-center gap-0.5 px-2 py-1 bg-destructive/20 text-destructive rounded-lg hover:bg-destructive/30 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-3 h-3" /> Sil
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

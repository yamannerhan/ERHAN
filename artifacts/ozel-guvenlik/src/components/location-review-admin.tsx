import React, { useEffect, useState } from "react";
import { MapPin, RefreshCw, CheckCircle, XCircle, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type ReviewItem = {
  unresolvedId: number;
  jobId: number;
  title: string;
  description: string;
  oldCity: string;
  reason: string | null;
  candidates: unknown;
  suggested: unknown;
  rejected: unknown;
  confidence: number | null;
  status: string | null;
  method: string;
  detectedText: string | null;
};

function getToken() {
  return localStorage.getItem("auth_token") ?? "";
}

export function LocationReviewSection({
  apiCall,
  toast,
}: {
  apiCall: (path: string, opts?: RequestInit) => Promise<unknown>;
  toast: (opts: { title: string; description?: string; variant?: string }) => void;
}) {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [alias, setAlias] = useState("");
  const [aliasLocationId, setAliasLocationId] = useState("");
  const [search, setSearch] = useState("");
  const [searchHits, setSearchHits] = useState<{ id: number; name: string; locationType: string }[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const data = (await apiCall("/api/admin/location-reviews")) as { items: ReviewItem[] };
      setItems(data.items ?? []);
    } catch (e) {
      toast({ title: "Konum kuyruğu yüklenemedi", description: String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const confirm = async (jobId: number, payload: Record<string, unknown>) => {
    await apiCall(`/api/admin/location-reviews/${jobId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    toast({ title: "Kaydedildi" });
    await load();
  };

  const runSearch = async () => {
    if (!search.trim()) return;
    const rows = (await apiCall(`/api/admin/locations/search?q=${encodeURIComponent(search)}`)) as {
      id: number;
      name: string;
      locationType: string;
    }[];
    setSearchHits(rows ?? []);
  };

  const addAlias = async () => {
    if (!alias || !aliasLocationId) return;
    await apiCall("/api/admin/location-aliases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alias, locationId: Number(aliasLocationId) }),
    });
    toast({ title: "Alias eklendi" });
    setAlias("");
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-amber-400" />
          <h2 className="text-lg font-semibold text-white">Konum Doğrulama</h2>
          <span className="text-xs text-white/50">{items.length} kayıt</span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Yenile
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await apiCall("/api/admin/locations/sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ force: false }),
              });
              toast({ title: "Konum sync başlatıldı" });
            }}
          >
            OSM Sync
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-2">
        <div className="text-sm text-white/70">Yeni alias bağla</div>
        <div className="flex flex-wrap gap-2">
          <Input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Alias (örn. GOSB)" className="max-w-[180px]" />
          <Input value={aliasLocationId} onChange={(e) => setAliasLocationId(e.target.value)} placeholder="locationId" className="max-w-[120px]" />
          <Button size="sm" onClick={() => void addAlias()}>
            <LinkIcon className="w-4 h-4 mr-1" /> Ekle
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Konum ara…" className="max-w-[220px]" />
          <Button size="sm" variant="secondary" onClick={() => void runSearch()}>Ara</Button>
        </div>
        {searchHits.length > 0 && (
          <ul className="text-xs text-white/70 space-y-1 max-h-28 overflow-auto">
            {searchHits.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  className="hover:text-amber-300"
                  onClick={() => setAliasLocationId(String(h.id))}
                >
                  #{h.id} · {h.name} · {h.locationType}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3">
        {items.length === 0 && !loading && (
          <p className="text-sm text-white/50">Doğrulama bekleyen ilan yok.</p>
        )}
        {items.map((item) => (
          <article key={item.unresolvedId} className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-white font-medium">#{item.jobId} — {item.title}</div>
                <div className="text-xs text-white/50">
                  Eski: {item.oldCity || "—"} · status={item.status} · güven={item.confidence ?? "—"} · {item.method}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => void confirm(item.jobId, { city: item.oldCity, leaveUnresolved: false })}
                >
                  <CheckCircle className="w-4 h-4 mr-1" /> Eski konumu onayla
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => void confirm(item.jobId, { leaveUnresolved: true })}
                >
                  <XCircle className="w-4 h-4 mr-1" /> Konumsuz bırak
                </Button>
              </div>
            </div>
            <Textarea readOnly value={item.description?.slice(0, 1200) ?? ""} className="min-h-[90px] text-xs" />
            <div className="text-xs text-amber-200/80">Neden: {item.reason} · {item.detectedText}</div>
            <pre className="text-[11px] text-white/60 overflow-auto max-h-36 bg-black/30 p-2 rounded">
              {JSON.stringify({ suggested: item.suggested, candidates: item.candidates, rejected: item.rejected }, null, 2)}
            </pre>
            <div className="flex flex-wrap gap-2 items-center">
              <Input
                id={`city-${item.jobId}`}
                placeholder="Örn. Kocaeli / Gebze / GOSB"
                className="max-w-xs text-sm"
                defaultValue=""
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  const el = document.getElementById(`city-${item.jobId}`) as HTMLInputElement | null;
                  void confirm(item.jobId, { city: el?.value, leaveUnresolved: false });
                }}
              >
                Bu konumu kaydet
              </Button>
            </div>
          </article>
        ))}
      </div>
      <p className="text-[11px] text-white/40">Konum verisi: © OpenStreetMap contributors · Geofabrik</p>
    </section>
  );
}

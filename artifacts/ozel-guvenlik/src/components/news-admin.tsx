import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Newspaper } from "lucide-react";

function getToken() {
  return localStorage.getItem("auth_token") ?? "";
}

async function api(path: string, method = "GET", body?: unknown) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || "İstek başarısız");
  return json;
}

type Source = {
  id: number;
  name: string;
  baseUrl: string;
  listingUrl?: string | null;
  isActive: boolean;
  scanIntervalMinutes: number;
  initialLookbackDays: number;
  importMode: string;
  publishMode: string;
  showSource: boolean;
  showSourceLink: boolean;
  lastScanAt?: string | null;
  lastError?: string | null;
  initialScanDone?: boolean;
};

type Article = {
  id: number;
  title: string;
  slug: string;
  status: string;
  category: string;
  publicationType: string;
  isManual: boolean;
  publishedAt?: string | null;
  importedAt?: string | null;
  sourceName?: string | null;
  coverImage?: string | null;
  excerpt?: string | null;
};

type Log = {
  id: number;
  status: string;
  startedAt: string;
  finishedAt?: string | null;
  importedCount: number;
  duplicateCount: number;
  failedCount: number;
  discoveredCount: number;
  errorMessage?: string | null;
};

export function NewsAdminSection() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"list" | "sources" | "logs" | "create">("list");
  const [articles, setArticles] = useState<Article[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [form, setForm] = useState({
    title: "",
    excerpt: "",
    content: "",
    linkUrl: "",
    category: "Genel Haberler",
    status: "draft",
  });

  const load = async () => {
    setLoading(true);
    try {
      const [a, s, l] = await Promise.all([
        api("/admin/news"),
        api("/admin/news-sources"),
        api("/admin/news-import-logs"),
      ]);
      setArticles((a as { articles: Article[] }).articles ?? []);
      setSources((s as { sources: Source[] }).sources ?? []);
      setLogs((l as { logs: Log[] }).logs ?? []);
    } catch (e) {
      toast({ title: "Haberler yüklenemedi", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const scanNow = async () => {
    setScanning(true);
    try {
      await api("/admin/news/scan-now", "POST");
      toast({ title: "Tarama başlatıldı", description: "Birkaç dakika içinde sonuçlar güncellenir." });
      setTimeout(() => { void load(); }, 4000);
    } catch (e) {
      toast({ title: "Tarama başlatılamadı", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setScanning(false);
    }
  };

  const repairNow = async () => {
    setScanning(true);
    try {
      await api("/admin/news/repair", "POST");
      toast({ title: "Onarım başladı", description: "Eksik kapak ve haber metinleri yeniden çekiliyor." });
      setTimeout(() => { void load(); }, 8000);
    } catch (e) {
      toast({ title: "Onarım başlatılamadı", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setScanning(false);
    }
  };

  const resetNow = async () => {
    const ok = window.confirm(
      "Tüm otomatik haberler silinecek ve kaynaklardan sıfırdan yeniden yüklenecek.\nManuel eklediğin haberler kalır.\nDevam edilsin mi?",
    );
    if (!ok) return;
    setScanning(true);
    try {
      const res = await api("/admin/news/reset", "POST") as { deleted?: number; message?: string };
      toast({
        title: "Haberler sıfırlandı",
        description: res.message || `${res.deleted ?? 0} haber silindi; yeniden tarama sürüyor.`,
      });
      setArticles([]);
      setTimeout(() => { void load(); }, 12_000);
      setTimeout(() => { void load(); }, 45_000);
    } catch (e) {
      toast({ title: "Sıfırlama başarısız", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setScanning(false);
    }
  };

  const saveSource = async (source: Source, patch: Partial<Source>) => {
    try {
      await api(`/admin/news-sources/${source.id}`, "PATCH", patch);
      toast({ title: "Kaynak güncellendi" });
      await load();
    } catch (e) {
      toast({ title: "Kayıt başarısız", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
  };

  const createManual = async () => {
    try {
      await api("/admin/news", "POST", form);
      toast({ title: "Haber eklendi" });
      setForm({ title: "", excerpt: "", content: "", linkUrl: "", category: "Genel Haberler", status: "draft" });
      setTab("list");
      await load();
    } catch (e) {
      toast({ title: "Eklenemedi", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
  };

  const setStatus = async (id: number, status: string) => {
    await api(`/admin/news/${id}`, "PATCH", { status });
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-[#131831]/90 p-5 flex flex-wrap gap-3 items-start justify-between">
        <div>
          <h3 className="text-lg font-extrabold text-white flex items-center gap-2"><Newspaper className="w-5 h-5" /> Haber Yönetimi</h3>
          <p className="text-xs text-slate-400 mt-1">
            Kaynak: ozelguvenlikajans.com/haberler/guncel · tam içerik · otomatik yayın · 20 gün · manuel haberlerde link eklenebilir
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCw className="w-3.5 h-3.5 mr-1" /> Yenile</Button>
          <Button size="sm" onClick={() => void scanNow()} disabled={scanning}>
            {scanning ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
            Şimdi Tara
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void repairNow()} disabled={scanning}>
            Kapak / Metin Onar
          </Button>
          <Button size="sm" variant="destructive" onClick={() => void resetNow()} disabled={scanning}>
            Sıfırla
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          ["list", "Tüm Haberler"],
          ["create", "Yeni Haber"],
          ["sources", "Kaynaklar"],
          ["logs", "Tarama Geçmişi"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${tab === id ? "bg-sky-500 text-black" : "bg-white/10 text-slate-200"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-slate-400">Yükleniyor…</p>}

      {tab === "list" && !loading && (
        <div className="space-y-2">
          {articles.map((a) => (
            <div key={a.id} className="rounded-xl border border-white/10 bg-[#131831]/80 p-3 flex flex-wrap gap-2 items-center justify-between">
              <div className="min-w-0">
                <div className="text-sm font-bold text-white truncate">{a.title}</div>
                <div className="text-[10px] text-slate-400">
                  {a.status} · {a.category} · {a.isManual ? "manuel" : a.sourceName || "otomatik"}
                  {" · "}
                  <span className={a.coverImage ? "text-emerald-400" : "text-amber-400"}>
                    {a.coverImage ? "kapak ✓" : "kapak yok"}
                  </span>
                  {" · "}
                  <span className={(a.excerpt?.length || 0) >= 40 ? "text-emerald-400" : "text-amber-400"}>
                    {(a.excerpt?.length || 0) >= 40 ? "özet ✓" : "özet yok"}
                  </span>
                </div>
              </div>
              <div className="flex gap-1.5">
                {a.status !== "published" && (
                  <button type="button" className="text-[10px] px-2 py-1 rounded bg-emerald-500/20 text-emerald-300" onClick={() => void setStatus(a.id, "published")}>Yayınla</button>
                )}
                {a.status === "published" && (
                  <button type="button" className="text-[10px] px-2 py-1 rounded bg-amber-500/20 text-amber-300" onClick={() => void setStatus(a.id, "hidden")}>Gizle</button>
                )}
                <a href={`/haberler/${a.slug}`} target="_blank" rel="noreferrer" className="text-[10px] px-2 py-1 rounded bg-sky-500/20 text-sky-300">Aç</a>
              </div>
            </div>
          ))}
          {!articles.length && <p className="text-xs text-slate-500">Henüz haber yok. «Şimdi Tara» ile kaynak tarayın.</p>}
        </div>
      )}

      {tab === "create" && (
        <div className="rounded-xl border border-white/10 bg-[#131831]/80 p-4 space-y-3">
          <Input placeholder="Başlık" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="bg-white/5 border-white/10" />
          <Input placeholder="Özet" value={form.excerpt} onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))} className="bg-white/5 border-white/10" />
          <Input
            placeholder="Link (isteğe bağlı — https://...)"
            value={form.linkUrl}
            onChange={(e) => setForm((f) => ({ ...f, linkUrl: e.target.value }))}
            className="bg-white/5 border-white/10"
          />
          <textarea
            placeholder="İçerik (HTML veya düz metin)"
            value={form.content}
            onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            className="w-full min-h-[120px] rounded-lg bg-white/5 border border-white/10 p-2 text-sm text-white"
          />
          <div className="flex gap-2">
            <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className="rounded-lg bg-white/5 border border-white/10 text-sm px-2 py-2 text-white">
              <option value="draft">Taslak</option>
              <option value="published">Yayınla</option>
            </select>
            <Button onClick={() => void createManual()}>Kaydet</Button>
          </div>
        </div>
      )}

      {tab === "sources" && sources.map((s) => (
        <div key={s.id} className="rounded-xl border border-white/10 bg-[#131831]/80 p-4 space-y-3 text-sm text-slate-200">
          <div className="font-bold text-white">{s.name}</div>
          <label className="block text-xs text-slate-400">Kaynak adı</label>
          <Input
            defaultValue={s.name}
            onBlur={(e) => void saveSource(s, { name: e.target.value })}
            className="bg-white/5 border-white/10 h-8 text-xs"
          />
          <label className="block text-xs text-slate-400">Ana site adresi</label>
          <Input
            defaultValue={s.baseUrl}
            onBlur={(e) => void saveSource(s, { baseUrl: e.target.value })}
            className="bg-white/5 border-white/10 h-8 text-xs"
          />
          <label className="block text-xs text-slate-400">Liste / Sitemap URL</label>
          <Input
            defaultValue={s.listingUrl || ""}
            onBlur={(e) => void saveSource(s, { listingUrl: e.target.value })}
            className="bg-white/5 border-white/10 h-8 text-xs"
          />
          <div className="flex flex-wrap gap-3 text-xs">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={s.isActive} onChange={(e) => void saveSource(s, { isActive: e.target.checked })} /> Aktif
            </label>
            <label className="flex items-center gap-1.5">
              Aktarım
              <select
                value={s.importMode}
                onChange={(e) => void saveSource(s, { importMode: e.target.value })}
                className="bg-white/5 border border-white/10 rounded px-1 py-0.5"
              >
                <option value="excerpt">Sadece özet</option>
                <option value="full">Tam içerik</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              Yayın
              <select
                value={s.publishMode}
                onChange={(e) => void saveSource(s, { publishMode: e.target.value })}
                className="bg-white/5 border border-white/10 rounded px-1 py-0.5"
              >
                <option value="draft">Önce taslak</option>
                <option value="auto">Otomatik yayınla</option>
              </select>
            </label>
          </div>
          <div className="text-[10px] text-slate-500">
            Son tarama: {s.lastScanAt ? new Date(s.lastScanAt).toLocaleString("tr-TR") : "—"}
            {s.lastError ? ` · Hata: ${s.lastError}` : ""}
            {s.initialScanDone ? " · İlk tarama tamam" : " · İlk tarama bekleniyor"}
          </div>
          <Button size="sm" onClick={() => void api(`/admin/news-sources/${s.id}/scan-now`, "POST").then(() => toast({ title: "Kaynak taraması başladı" }))}>
            Bu kaynağı tara
          </Button>
        </div>
      ))}

      {tab === "logs" && (
        <div className="space-y-2">
          {logs.map((l) => (
            <div key={l.id} className="rounded-lg border border-white/10 p-3 text-xs text-slate-300">
              <div className="font-bold text-white">{l.status} · {new Date(l.startedAt).toLocaleString("tr-TR")}</div>
              <div>Bulunan {l.discoveredCount} · Eklenen {l.importedCount} · Çift {l.duplicateCount} · Hata {l.failedCount}</div>
              {l.errorMessage && <div className="text-rose-300">{l.errorMessage}</div>}
            </div>
          ))}
          {!logs.length && <p className="text-xs text-slate-500">Henüz log yok.</p>}
        </div>
      )}
    </div>
  );
}

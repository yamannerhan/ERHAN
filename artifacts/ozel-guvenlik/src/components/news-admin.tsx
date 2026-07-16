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
  content?: string | null;
  sourceUrl?: string | null;
};

type Log = {
  id: number;
  sourceId?: number | null;
  status: string;
  startedAt: string;
  finishedAt?: string | null;
  importedCount: number;
  duplicateCount: number;
  failedCount: number;
  discoveredCount: number;
  skippedCount?: number;
  errorMessage?: string | null;
};

const emptyForm = {
  title: "",
  excerpt: "",
  content: "",
  linkUrl: "",
  coverImage: "",
  category: "Genel Haberler",
  status: "draft",
};

export function NewsAdminSection() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"list" | "sources" | "logs" | "create">("list");
  const [articles, setArticles] = useState<Article[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);

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
      toast({ title: "Tarama başlatıldı", description: "4 kaynak sırayla taranıyor." });
      setTimeout(() => { void load(); }, 5000);
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
      toast({ title: "Onarım başladı" });
      setTimeout(() => { void load(); }, 8000);
    } catch (e) {
      toast({ title: "Onarım başlatılamadı", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setScanning(false);
    }
  };

  const resetNow = async () => {
    const ok = window.confirm(
      "Tüm otomatik haberler silinecek ve 4 kaynaktan (5 gün) yeniden yüklenecek.\nManuel haberler kalır.\nDevam?",
    );
    if (!ok) return;
    setScanning(true);
    try {
      const res = await api("/admin/news/reset", "POST") as { deleted?: number; message?: string };
      toast({ title: "Sıfırlandı", description: res.message });
      setArticles([]);
      setTimeout(() => { void load(); }, 15_000);
      setTimeout(() => { void load(); }, 60_000);
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

  const startEdit = (a: Article) => {
    setEditingId(a.id);
    setForm({
      title: a.title || "",
      excerpt: a.excerpt || "",
      content: a.content || "",
      linkUrl: a.sourceUrl || "",
      coverImage: a.coverImage || "",
      category: a.category || "Genel Haberler",
      status: a.status || "draft",
    });
    setTab("create");
  };

  const saveArticle = async () => {
    try {
      if (editingId) {
        await api(`/admin/news/${editingId}`, "PATCH", {
          title: form.title,
          excerpt: form.excerpt,
          content: form.content,
          coverImage: form.coverImage || null,
          category: form.category,
          status: form.status,
          sourceUrl: form.linkUrl || null,
        });
        toast({ title: "Haber güncellendi" });
      } else {
        await api("/admin/news", "POST", form);
        toast({ title: "Haber eklendi" });
      }
      setForm(emptyForm);
      setEditingId(null);
      setTab("list");
      await load();
    } catch (e) {
      toast({ title: "Kaydedilemedi", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
  };

  const setStatus = async (id: number, status: string) => {
    await api(`/admin/news/${id}`, "PATCH", { status });
    await load();
  };

  const deleteArticle = async (id: number) => {
    if (!window.confirm("Bu haber silinsin mi?")) return;
    try {
      await api(`/admin/news/${id}`, "DELETE");
      toast({ title: "Haber silindi" });
      await load();
    } catch (e) {
      toast({ title: "Silinemedi", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
  };

  const sourceName = (id?: number | null) =>
    sources.find((s) => s.id === id)?.name || (id ? `#${id}` : "—");

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-[#131831]/90 p-5 flex flex-wrap gap-3 items-start justify-between">
        <div>
          <h3 className="text-lg font-extrabold text-white flex items-center gap-2"><Newspaper className="w-5 h-5" /> Haber Yönetimi</h3>
          <p className="text-xs text-slate-400 mt-1">
            4 kaynak · 5 gün lookback · 30 dk tarama · 20g arşiv + 7g silme · mükerrer engeli
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
          ["create", editingId ? "Haberi Düzenle" : "Yeni Haber"],
          ["sources", "Kaynaklar"],
          ["logs", "Tarama Geçmişi"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              if (id === "create" && tab !== "create") {
                setEditingId(null);
                setForm(emptyForm);
              }
              setTab(id);
            }}
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
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" className="text-[10px] px-2 py-1 rounded bg-white/10 text-slate-200" onClick={() => startEdit(a)}>Düzenle</button>
                {a.status !== "published" && (
                  <button type="button" className="text-[10px] px-2 py-1 rounded bg-emerald-500/20 text-emerald-300" onClick={() => void setStatus(a.id, "published")}>Yayınla</button>
                )}
                {a.status === "published" && (
                  <button type="button" className="text-[10px] px-2 py-1 rounded bg-amber-500/20 text-amber-300" onClick={() => void setStatus(a.id, "draft")}>Taslak</button>
                )}
                {a.status === "published" && (
                  <button type="button" className="text-[10px] px-2 py-1 rounded bg-slate-500/20 text-slate-300" onClick={() => void setStatus(a.id, "hidden")}>Gizle</button>
                )}
                <button type="button" className="text-[10px] px-2 py-1 rounded bg-rose-500/20 text-rose-300" onClick={() => void deleteArticle(a.id)}>Sil</button>
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
          <Input placeholder="Özet / açıklama" value={form.excerpt} onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))} className="bg-white/5 border-white/10" />
          <Input
            placeholder="Kapak resmi URL (isteğe bağlı)"
            value={form.coverImage}
            onChange={(e) => setForm((f) => ({ ...f, coverImage: e.target.value }))}
            className="bg-white/5 border-white/10"
          />
          <Input
            placeholder="Haber linki (isteğe bağlı — https://...)"
            value={form.linkUrl}
            onChange={(e) => setForm((f) => ({ ...f, linkUrl: e.target.value }))}
            className="bg-white/5 border-white/10"
          />
          <Input
            placeholder="Kategori"
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            className="bg-white/5 border-white/10"
          />
          <textarea
            placeholder="İçerik (HTML veya düz metin)"
            value={form.content}
            onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            className="w-full min-h-[120px] rounded-lg bg-white/5 border border-white/10 p-2 text-sm text-white"
          />
          <div className="flex flex-wrap gap-2">
            <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className="rounded-lg bg-white/5 border border-white/10 text-sm px-2 py-2 text-white">
              <option value="draft">Taslak</option>
              <option value="published">Yayınla</option>
              <option value="hidden">Gizli</option>
            </select>
            <Button onClick={() => void saveArticle()}>{editingId ? "Güncelle" : "Kaydet"}</Button>
            {editingId && (
              <Button variant="secondary" onClick={() => { setEditingId(null); setForm(emptyForm); }}>İptal</Button>
            )}
          </div>
        </div>
      )}

      {tab === "sources" && (
        <div className="space-y-3">
          {sources.map((s) => (
            <div key={s.id} className="rounded-xl border border-white/10 bg-[#131831]/80 p-4 space-y-3 text-sm text-slate-200">
              <div className="font-bold text-white flex justify-between gap-2">
                <span>{s.name}</span>
                <span className={`text-[10px] ${s.isActive ? "text-emerald-400" : "text-slate-500"}`}>{s.isActive ? "aktif" : "pasif"}</span>
              </div>
              <div className="text-[11px] text-slate-400 break-all">{s.listingUrl || s.baseUrl}</div>
              <div className="flex flex-wrap gap-3 text-xs">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={s.isActive} onChange={(e) => void saveSource(s, { isActive: e.target.checked })} /> Aktif
                </label>
                <label className="flex items-center gap-1.5">
                  Lookback (gün)
                  <Input
                    type="number"
                    className="w-16 h-7 bg-white/5 border-white/10 text-xs"
                    defaultValue={s.initialLookbackDays}
                    onBlur={(e) => void saveSource(s, { initialLookbackDays: Number(e.target.value) || 5 })}
                  />
                </label>
              </div>
              <div className="text-[10px] text-slate-500">
                Son tarama: {s.lastScanAt ? new Date(s.lastScanAt).toLocaleString("tr-TR") : "—"}
                {s.lastError ? ` · Hata: ${s.lastError}` : " · Hata yok"}
              </div>
              <Button size="sm" onClick={() => void api(`/admin/news-sources/${s.id}/scan-now`, "POST").then(() => toast({ title: "Kaynak taraması başladı" }))}>
                Bu kaynağı tara
              </Button>
            </div>
          ))}
          {!sources.length && <p className="text-xs text-slate-500">Kaynak yok — sunucu açılışında otomatik eklenir.</p>}
        </div>
      )}

      {tab === "logs" && (
        <div className="space-y-2">
          {logs.map((l) => (
            <div key={l.id} className="rounded-lg border border-white/10 p-3 text-xs text-slate-300">
              <div className="font-bold text-white">
                {l.status} · {sourceName(l.sourceId)} · {new Date(l.startedAt).toLocaleString("tr-TR")}
              </div>
              <div>
                Bulunan {l.discoveredCount} · Eklenen {l.importedCount} · Mükerrer {l.duplicateCount}
                {" · "}Atlanan {l.skippedCount ?? 0} · Hata {l.failedCount}
              </div>
              {l.errorMessage && <div className="text-rose-300 mt-1">Kaynak hatası: {l.errorMessage}</div>}
            </div>
          ))}
          {!logs.length && <p className="text-xs text-slate-500">Henüz log yok.</p>}
        </div>
      )}
    </div>
  );
}

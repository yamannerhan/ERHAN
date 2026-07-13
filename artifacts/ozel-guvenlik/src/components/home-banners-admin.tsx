import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus, Trash2, RefreshCw, GripVertical, Eye, EyeOff, Image as ImageIcon,
  Upload, Save, X, Loader2,
} from "lucide-react";

type Banner = {
  id: number;
  title: string | null;
  imageUrl: string;
  linkUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
};

type ToastFn = (opts: { title: string; description?: string; variant?: "default" | "destructive" }) => void;

const emptyForm = () => ({
  title: "",
  imageUrl: "",
  isActive: true,
});

export function HomeBannersAdminSection({
  apiCall,
  toast,
  getToken,
}: {
  apiCall: (path: string, method: string, body?: unknown) => Promise<any>;
  toast: ToastFn;
  getToken: () => string | null;
}) {
  const [items, setItems] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [form, setForm] = useState(emptyForm());
  const dragId = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiCall("/admin/banners", "GET");
      setItems(Array.isArray(data) ? data : []);
    } catch (e: any) {
      toast({ title: "Bannerlar yüklenemedi", description: e?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [apiCall, toast]);

  useEffect(() => { void load(); }, [load]);

  const uploadImage = async (file: File): Promise<string> => {
    const token = getToken();
    const formData = new FormData();
    formData.append("image", file);
    const res = await fetch("/api/admin/banners/upload", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || "Yükleme başarısız");
    }
    const data = (await res.json()) as { url: string };
    return data.url;
  };

  const handleFileSelect = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Sadece resim dosyası yükleyebilirsiniz", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const url = await uploadImage(file);
      setForm((f) => ({ ...f, imageUrl: url }));
      if (editingId === null) setEditingId("new");
      toast({ title: "Resim yüklendi", description: "1200×400 (3:1) olarak otomatik ayarlandı" });
    } catch (e: any) {
      toast({ title: "Yükleme başarısız", description: e?.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleReplaceImage = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file);
      setForm((f) => ({ ...f, imageUrl: url }));
      toast({ title: "Resim güncellendi" });
    } catch (e: any) {
      toast({ title: "Yükleme başarısız", description: e?.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const startNew = () => {
    setEditingId("new");
    setForm(emptyForm());
  };

  const startEdit = (banner: Banner) => {
    setEditingId(banner.id);
    setForm({
      title: banner.title ?? "",
      imageUrl: banner.imageUrl,
      isActive: banner.isActive,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm());
  };

  const save = async () => {
    if (!form.imageUrl.trim()) {
      toast({ title: "Önce banner resmi yükleyin", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (editingId === "new") {
        await apiCall("/admin/banners", "POST", {
          title: form.title.trim() || null,
          imageUrl: form.imageUrl,
          linkUrl: null,
          isActive: form.isActive,
          sortOrder: items.length + 1,
        });
        toast({ title: form.isActive ? "Banner yayınlandı" : "Banner kaydedildi (yayında değil)" });
      } else if (typeof editingId === "number") {
        await apiCall(`/admin/banners/${editingId}`, "PATCH", {
          title: form.title.trim() || null,
          imageUrl: form.imageUrl,
          linkUrl: null,
          isActive: form.isActive,
        });
        toast({ title: "Banner güncellendi" });
      }
      cancelEdit();
      await load();
    } catch (e: any) {
      toast({ title: "Kayıt başarısız", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (id: number, current: boolean) => {
    try {
      await apiCall(`/admin/banners/${id}`, "PATCH", { isActive: !current });
      toast({ title: !current ? "Banner yayında" : "Banner yayından kaldırıldı" });
      await load();
    } catch (e: any) {
      toast({ title: "İşlem başarısız", description: e?.message, variant: "destructive" });
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Bu banner kalıcı olarak silinsin mi?")) return;
    try {
      await apiCall(`/admin/banners/${id}`, "DELETE");
      toast({ title: "Banner silindi" });
      if (editingId === id) cancelEdit();
      await load();
    } catch (e: any) {
      toast({ title: "Silinemedi", description: e?.message, variant: "destructive" });
    }
  };

  const onDropReorder = async (targetId: number) => {
    const fromId = dragId.current;
    dragId.current = null;
    if (fromId == null || fromId === targetId) return;
    const next = [...items];
    const fromIdx = next.findIndex((i) => i.id === fromId);
    const toIdx = next.findIndex((i) => i.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved!);
    setItems(next);
    try {
      await apiCall("/admin/banners/reorder", "POST", { order: next.map((b) => b.id) });
    } catch (e: any) {
      toast({ title: "Sıralama kaydedilemedi", description: e?.message, variant: "destructive" });
      await load();
    }
  };

  const showForm = editingId !== null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-violet-400" />
            Anasayfa Banner Yönetimi
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Banner ekleyin, düzenleyin veya yayından kaldırın.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Yenile
          </Button>
          {!showForm && (
            <Button size="sm" onClick={startNew} className="bg-violet-600 hover:bg-violet-500">
              <Plus className="w-4 h-4 mr-1" />
              Yeni Banner
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 text-xs">
        <p className="font-semibold text-amber-200/90 mb-2">Banner boyutu hatırlatması</p>
        <ul className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5 text-muted-foreground">
          <li><span className="text-foreground/90">Oran:</span> 3:1 (1200÷400)</li>
          <li><span className="text-foreground/90">Maks genişlik:</span> 1200px</li>
          <li><span className="text-foreground/90">Yükleme boyutu:</span> 1200×400 otomatik</li>
          <li><span className="text-foreground/90">Admin önizleme:</span> Aynı oran</li>
        </ul>
        <p className="text-[11px] text-muted-foreground mt-2">
          En net görünüm için görselleri <span className="text-foreground/80">1200×400 px</span> olarak hazırlayıp yükleyin.
        </p>
      </div>

      {showForm && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">{editingId === "new" ? "Yeni Banner" : "Banner Düzenle"}</p>
            <button type="button" onClick={cancelEdit} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => { void handleFileSelect(e.target.files?.[0] ?? null); e.target.value = ""; }}
          />
          <input
            ref={replaceInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => { void handleReplaceImage(e.target.files?.[0] ?? null); e.target.value = ""; }}
          />

          {form.imageUrl ? (
            <div className="space-y-2">
              <div className="relative w-full overflow-hidden rounded-xl border border-white/10 aspect-[3/1] bg-[#0b0e14]">
                <img
                  src={form.imageUrl}
                  alt="Önizleme"
                  className="absolute inset-0 w-full h-full object-cover object-center"
                />
                {uploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <Loader2 className="w-8 h-8 animate-spin text-white" />
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={() => replaceInputRef.current?.click()}
                >
                  <Upload className="w-4 h-4 mr-1" />
                  Resmi Değiştir
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void handleFileSelect(e.dataTransfer.files?.[0] ?? null);
              }}
              className="w-full rounded-xl border-2 border-dashed border-violet-500/40 bg-violet-500/5 hover:bg-violet-500/10 transition-colors aspect-[3/1] flex flex-col items-center justify-center gap-2 text-muted-foreground"
            >
              {uploading ? (
                <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
              ) : (
                <>
                  <Upload className="w-8 h-8 text-violet-400" />
                  <span className="text-sm font-medium text-foreground">Resim yükle veya sürükle-bırak</span>
                  <span className="text-xs">JPG, PNG, WebP — max 25 MB</span>
                </>
              )}
            </button>
          )}

          <Input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Üst yazı (opsiyonel)"
            className="border-white/[0.06] bg-[#0d1321]/60 rounded-xl"
          />

          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              className="rounded border-white/20"
            />
            <span>Anasayfada yayınla</span>
          </label>

          <div className="flex gap-2">
            <Button onClick={() => void save()} disabled={saving || uploading || !form.imageUrl} className="flex-1 bg-violet-600 hover:bg-violet-500">
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
              {editingId === "new" ? "Yayınla" : "Kaydet"}
            </Button>
            <Button variant="outline" onClick={cancelEdit}>İptal</Button>
          </div>
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
          Yükleniyor...
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-8 rounded-xl border border-dashed border-white/10 text-muted-foreground text-sm">
          Henüz banner yok. &quot;Yeni Banner&quot; ile başlayın.
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Yayınlanan sıra ({items.filter((b) => b.isActive).length} aktif / {items.length} toplam)
          </p>
          {items.map((banner) => (
            <div
              key={banner.id}
              draggable
              onDragStart={() => { dragId.current = banner.id; }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => void onDropReorder(banner.id)}
              className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-2 hover:border-white/12 transition-colors"
            >
              <GripVertical className="w-4 h-4 text-muted-foreground shrink-0 cursor-grab" />
              <div className="relative w-28 shrink-0 overflow-hidden rounded-lg aspect-[3/1] bg-[#0b0e14]">
                <img
                  src={banner.imageUrl}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover object-center"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{banner.title || "—"}</div>
                <div className="text-[10px] text-muted-foreground">Sıra: {banner.sortOrder}</div>
              </div>
              <button
                type="button"
                onClick={() => void toggleActive(banner.id, banner.isActive)}
                className={banner.isActive ? "text-emerald-400" : "text-muted-foreground"}
                title={banner.isActive ? "Yayından kaldır" : "Yayınla"}
              >
                {banner.isActive ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
              </button>
              <Button variant="ghost" size="sm" onClick={() => startEdit(banner)} className="h-8 px-2 text-blue-400">
                Düzenle
              </Button>
              <button
                type="button"
                onClick={() => void remove(banner.id)}
                className="text-destructive hover:text-destructive/80 p-1"
                title="Sil"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

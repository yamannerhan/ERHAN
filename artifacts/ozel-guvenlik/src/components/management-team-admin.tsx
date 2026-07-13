import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus, Trash2, Save, RefreshCw, GripVertical, Eye, EyeOff, Upload, X, Users,
} from "lucide-react";

type TeamItem = {
  id: number;
  displayName: string;
  roleName: string;
  title: string | null;
  avatarPath: string | null;
  nameColor: string;
  badgeColor: string;
  profileUrl: string | null;
  isOnlineVisible: boolean;
  isVisible: boolean;
  isActive: boolean;
  sortOrder: number;
};

type ToastFn = (opts: { title: string; description?: string; variant?: "default" | "destructive" }) => void;

const ROLE_OPTIONS = [
  "Kurucu", "Admin", "Baş Moderatör", "Moderatör", "Destek Ekibi", "Editör", "Yönetici",
];

const emptyForm = (): Omit<TeamItem, "id" | "sortOrder"> & { sortOrder?: number } => ({
  displayName: "",
  roleName: "Moderatör",
  title: null,
  avatarPath: null,
  nameColor: "#7DD3FC",
  badgeColor: "#94A3B8",
  profileUrl: "",
  isOnlineVisible: true,
  isVisible: true,
  isActive: true,
});

async function fileToSquareWebp(file: File, size = 256): Promise<string> {
  if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
    throw new Error("Sadece JPG, PNG veya WEBP");
  }
  if (file.size > 2 * 1024 * 1024) {
    throw new Error("Maksimum dosya boyutu 2 MB");
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Görsel okunamadı"));
      el.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (side < 64) throw new Error("Görsel çok küçük");
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas desteklenmiyor");
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
    return canvas.toDataURL("image/webp", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ManagementTeamAdminSection({
  apiCall,
  toast,
}: {
  apiCall: (path: string, method: string, body?: unknown) => Promise<any>;
  toast: ToastFn;
}) {
  const [items, setItems] = useState<TeamItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragId = useRef<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiCall("/admin/management-team", "GET");
      setItems(data.items ?? []);
    } catch (e: any) {
      toast({ title: "Yönetim ekibi yüklenemedi", description: e?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [apiCall, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const openNew = () => {
    setEditingId("new");
    setForm(emptyForm());
    setPreviewSrc(null);
  };

  const openEdit = (item: TeamItem) => {
    setEditingId(item.id);
    setForm({
      displayName: item.displayName,
      roleName: item.roleName,
      title: item.title,
      avatarPath: item.avatarPath,
      nameColor: item.nameColor,
      badgeColor: item.badgeColor,
      profileUrl: item.profileUrl ?? "",
      isOnlineVisible: item.isOnlineVisible,
      isVisible: item.isVisible,
      isActive: item.isActive,
    });
    setPreviewSrc(item.avatarPath);
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await fileToSquareWebp(file, 256);
      setForm((f) => ({ ...f, avatarPath: dataUrl }));
      setPreviewSrc(dataUrl);
    } catch (err: any) {
      toast({ title: "Fotoğraf yüklenemedi", description: err?.message, variant: "destructive" });
    }
  };

  const save = async () => {
    if (!form.displayName.trim()) {
      toast({ title: "Görünen ad gerekli", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        displayName: form.displayName.trim(),
        roleName: form.roleName,
        title: form.title || null,
        avatarPath: form.avatarPath,
        nameColor: form.nameColor,
        badgeColor: form.badgeColor,
        profileUrl: form.profileUrl || null,
        isOnlineVisible: form.isOnlineVisible,
        isVisible: form.isVisible,
        isActive: form.isActive,
        sortOrder: editingId === "new" ? items.length : undefined,
      };
      if (editingId === "new") {
        await apiCall("/admin/management-team", "POST", payload);
      } else if (typeof editingId === "number") {
        await apiCall(`/admin/management-team/${editingId}`, "PUT", payload);
      }
      toast({ title: "Kaydedildi" });
      setEditingId(null);
      await load();
    } catch (e: any) {
      toast({ title: "Kayıt başarısız", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const softDelete = async (id: number) => {
    if (!confirm("Bu ekip üyesini silmek istiyor musunuz?")) return;
    try {
      await apiCall(`/admin/management-team/${id}`, "DELETE");
      toast({ title: "Silindi" });
      await load();
    } catch (e: any) {
      toast({ title: "Silinemedi", description: e?.message, variant: "destructive" });
    }
  };

  const toggleFlag = async (item: TeamItem, key: "isVisible" | "isActive" | "isOnlineVisible") => {
    try {
      await apiCall(`/admin/management-team/${item.id}`, "PUT", { [key]: !item[key] });
      await load();
    } catch (e: any) {
      toast({ title: "Güncellenemedi", description: e?.message, variant: "destructive" });
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
      await apiCall("/admin/management-team/reorder", "POST", { order: next.map((i) => i.id) });
      toast({ title: "Sıra güncellendi" });
    } catch (e: any) {
      toast({ title: "Sıralama kaydedilemedi", description: e?.message, variant: "destructive" });
      await load();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-amber-400" />
            Yönetim Ekibi Yönetimi
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Hamburger menüde en fazla 3 aktif ve görünür üye gösterilir. Sıra numarasına göre listelenir.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
            Yenile
          </Button>
          <Button type="button" size="sm" onClick={openNew} className="bg-amber-500/90 hover:bg-amber-500 text-slate-900 font-bold">
            <Plus className="w-3.5 h-3.5 mr-1" />
            Yeni Üye
          </Button>
        </div>
      </div>

      {editingId != null && (
        <div className="rounded-2xl border border-amber-500/30 bg-[#0f1424] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-amber-300">
              {editingId === "new" ? "Yeni ekip üyesi" : `Düzenle #${editingId}`}
            </div>
            <button type="button" onClick={() => setEditingId(null)} className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400" aria-label="Kapat">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-wrap gap-4 items-start">
            <div className="flex flex-col items-center gap-2">
              {previewSrc ? (
                <img src={previewSrc} alt="" className="w-20 h-20 rounded-full object-cover border-2 border-amber-400/50" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-xl font-bold text-amber-300">
                  {(form.displayName || "?").slice(0, 1).toUpperCase()}
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" className="hidden" onChange={(e) => void onPickFile(e)} />
              <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload className="w-3.5 h-3.5 mr-1" />
                Fotoğraf
              </Button>
              <p className="text-[10px] text-slate-500 text-center max-w-[140px]">JPG/PNG/WEBP · max 2MB · 1:1 kırpılır · 256px WEBP</p>
            </div>

            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-[220px]">
              <label className="text-xs text-slate-400 space-y-1">
                <span>Görünen ad</span>
                <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="Erhan Yaman" />
              </label>
              <label className="text-xs text-slate-400 space-y-1">
                <span>Rol</span>
                <select
                  className="w-full h-10 rounded-md border border-white/10 bg-[#0a0e1c] px-3 text-sm text-white"
                  value={form.roleName}
                  onChange={(e) => setForm({ ...form, roleName: e.target.value })}
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-400 space-y-1">
                <span>Unvan (opsiyonel)</span>
                <Input value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </label>
              <label className="text-xs text-slate-400 space-y-1">
                <span>Profil URL</span>
                <Input value={form.profileUrl ?? ""} onChange={(e) => setForm({ ...form, profileUrl: e.target.value })} placeholder="/profil/erhan" />
              </label>
              <label className="text-xs text-slate-400 space-y-1">
                <span>İsim rengi</span>
                <div className="flex gap-2 items-center">
                  <input type="color" value={form.nameColor} onChange={(e) => setForm({ ...form, nameColor: e.target.value })} className="h-10 w-12 rounded border border-white/10 bg-transparent" />
                  <Input value={form.nameColor} onChange={(e) => setForm({ ...form, nameColor: e.target.value })} />
                </div>
              </label>
              <label className="text-xs text-slate-400 space-y-1">
                <span>Rozet rengi</span>
                <div className="flex gap-2 items-center">
                  <input type="color" value={form.badgeColor} onChange={(e) => setForm({ ...form, badgeColor: e.target.value })} className="h-10 w-12 rounded border border-white/10 bg-transparent" />
                  <Input value={form.badgeColor} onChange={(e) => setForm({ ...form, badgeColor: e.target.value })} />
                </div>
              </label>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-xs text-slate-300">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isVisible} onChange={(e) => setForm({ ...form, isVisible: e.target.checked })} />
              Menüde görünür
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              Aktif
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isOnlineVisible} onChange={(e) => setForm({ ...form, isOnlineVisible: e.target.checked })} />
              Çevrimiçi noktası
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEditingId(null)}>İptal</Button>
            <Button type="button" onClick={() => void save()} disabled={saving} className="bg-amber-500 text-slate-900 font-bold hover:bg-amber-400">
              <Save className="w-3.5 h-3.5 mr-1" />
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-white/[0.06] overflow-hidden">
        <div className="hidden sm:grid grid-cols-[28px_44px_1fr_110px_70px_70px_56px_100px] gap-2 px-3 py-2 text-[10px] font-bold tracking-wider text-slate-500 bg-white/[0.02]">
          <span />
          <span>FOTO</span>
          <span>AD / ROL</span>
          <span>DURUM</span>
          <span>GÖRÜNÜR</span>
          <span>ONLINE</span>
          <span>SIRA</span>
          <span>İŞLEM</span>
        </div>
        {loading && <div className="p-6 text-sm text-slate-400">Yükleniyor…</div>}
        {!loading && items.length === 0 && (
          <div className="p-6 text-sm text-slate-400">Henüz ekip üyesi yok. “Yeni Üye” ile ekleyin.</div>
        )}
        <ul className="divide-y divide-white/[0.04]">
          {items.map((item, idx) => (
            <li
              key={item.id}
              draggable
              onDragStart={() => { dragId.current = item.id; }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => void onDropReorder(item.id)}
              className="grid grid-cols-1 sm:grid-cols-[28px_44px_1fr_110px_70px_70px_56px_100px] gap-2 items-center px-3 py-3 hover:bg-white/[0.02]"
            >
              <button type="button" className="text-slate-500 cursor-grab active:cursor-grabbing p-1" aria-label="Sürükle">
                <GripVertical className="w-4 h-4" />
              </button>
              {item.avatarPath ? (
                <img src={item.avatarPath} alt="" className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-sm font-bold" style={{ color: item.nameColor }}>
                  {item.displayName.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-sm font-bold truncate" style={{ color: item.nameColor }}>{item.displayName}</div>
                <div className="text-[11px] mt-0.5 inline-flex px-2 py-0.5 rounded-full border" style={{ color: item.badgeColor, borderColor: `${item.badgeColor}55` }}>
                  {item.roleName}
                </div>
              </div>
              <div className="text-xs">
                <span className={item.isActive ? "text-emerald-400" : "text-slate-500"}>
                  {item.isActive ? "Aktif" : "Pasif"}
                </span>
              </div>
              <button type="button" onClick={() => void toggleFlag(item, "isVisible")} className="text-slate-300 p-1.5" title="Görünürlük">
                {item.isVisible ? <Eye className="w-4 h-4 text-amber-400" /> : <EyeOff className="w-4 h-4 text-slate-500" />}
              </button>
              <button type="button" onClick={() => void toggleFlag(item, "isOnlineVisible")} className="text-xs text-left">
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${item.isOnlineVisible ? "bg-emerald-400" : "bg-slate-600"}`} />
              </button>
              <div className="text-xs text-slate-400 font-mono">{idx + 1}</div>
              <div className="flex gap-1">
                <Button type="button" size="sm" variant="outline" className="h-8 px-2" onClick={() => openEdit(item)}>Düzenle</Button>
                <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-red-400 border-red-500/30" onClick={() => void softDelete(item.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

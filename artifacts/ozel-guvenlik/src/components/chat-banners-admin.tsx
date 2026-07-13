import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Save, RefreshCw, GripVertical, Eye, EyeOff, Megaphone } from "lucide-react";

type Banner = {
  id: number;
  title: string;
  description: string;
  icon: string;
  iconColor: string;
  titleColor: string;
  linkType: string | null;
  linkUrl: string | null;
  sortOrder: number;
  startsAt: string | null;
  endsAt: string | null;
  durationSeconds: number;
  isActive: boolean;
};

type ToastFn = (opts: { title: string; description?: string; variant?: "default" | "destructive" }) => void;

const ICONS = ["megaphone", "shield", "briefcase", "bell", "info"];

const empty = () => ({
  title: "",
  description: "",
  icon: "megaphone",
  iconColor: "#F5C518",
  titleColor: "#F5C518",
  linkType: "",
  linkUrl: "",
  startsAt: "",
  endsAt: "",
  durationSeconds: 5,
  isActive: true,
});

export function ChatBannersAdminSection({
  apiCall,
  toast,
}: {
  apiCall: (path: string, method: string, body?: unknown) => Promise<any>;
  toast: ToastFn;
}) {
  const [items, setItems] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [form, setForm] = useState(empty());
  const [saving, setSaving] = useState(false);
  const dragId = useRef<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiCall("/admin/chat-banners", "GET");
      setItems(data.items ?? []);
    } catch (e: any) {
      toast({ title: "Bannerlar yüklenemedi", description: e?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [apiCall, toast]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!form.title.trim()) {
      toast({ title: "Başlık gerekli", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        icon: form.icon,
        iconColor: form.iconColor,
        titleColor: form.titleColor,
        linkType: form.linkType || null,
        linkUrl: form.linkUrl || null,
        startsAt: form.startsAt || null,
        endsAt: form.endsAt || null,
        durationSeconds: form.durationSeconds,
        isActive: form.isActive,
        sortOrder: editingId === "new" ? items.length : undefined,
      };
      if (editingId === "new") await apiCall("/admin/chat-banners", "POST", payload);
      else if (typeof editingId === "number") await apiCall(`/admin/chat-banners/${editingId}`, "PUT", payload);
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
    if (!confirm("Banner silinsin mi?")) return;
    try {
      await apiCall(`/admin/chat-banners/${id}`, "DELETE");
      toast({ title: "Silindi" });
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
      await apiCall("/admin/chat-banners/reorder", "POST", { order: next.map((i) => i.id) });
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
            <Megaphone className="w-5 h-5 text-amber-400" />
            Sohbet Banner Yönetimi
          </h2>
          <p className="text-xs text-slate-400 mt-1">Topluluk sohbetinde tek yatay banner slider olarak görünür (yan yana 3 kart değil).</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
            Yenile
          </Button>
          <Button type="button" size="sm" className="bg-amber-500 text-slate-900 font-bold" onClick={() => { setEditingId("new"); setForm(empty()); }}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Yeni Banner
          </Button>
        </div>
      </div>

      {editingId != null && (
        <div className="rounded-2xl border border-amber-500/30 bg-[#0f1424] p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs text-slate-400 space-y-1">
              <span>Başlık</span>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <label className="text-xs text-slate-400 space-y-1">
              <span>İkon</span>
              <select className="w-full h-10 rounded-md border border-white/10 bg-[#0a0e1c] px-3 text-sm text-white" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })}>
                {ICONS.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-400 space-y-1 sm:col-span-2">
              <span>Açıklama</span>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <label className="text-xs text-slate-400 space-y-1">
              <span>İkon rengi</span>
              <div className="flex gap-2"><input type="color" value={form.iconColor} onChange={(e) => setForm({ ...form, iconColor: e.target.value })} /><Input value={form.iconColor} onChange={(e) => setForm({ ...form, iconColor: e.target.value })} /></div>
            </label>
            <label className="text-xs text-slate-400 space-y-1">
              <span>Başlık rengi</span>
              <div className="flex gap-2"><input type="color" value={form.titleColor} onChange={(e) => setForm({ ...form, titleColor: e.target.value })} /><Input value={form.titleColor} onChange={(e) => setForm({ ...form, titleColor: e.target.value })} /></div>
            </label>
            <label className="text-xs text-slate-400 space-y-1">
              <span>Link</span>
              <Input value={form.linkUrl} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} placeholder="/destek" />
            </label>
            <label className="text-xs text-slate-400 space-y-1">
              <span>Geçiş süresi (sn)</span>
              <Input type="number" min={2} max={60} value={form.durationSeconds} onChange={(e) => setForm({ ...form, durationSeconds: Number(e.target.value) || 5 })} />
            </label>
            <label className="text-xs text-slate-400 space-y-1">
              <span>Başlangıç</span>
              <Input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
            </label>
            <label className="text-xs text-slate-400 space-y-1">
              <span>Bitiş</span>
              <Input type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
            </label>
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            Aktif
          </label>
          <div className="rounded-xl border border-white/10 p-3 bg-black/30">
            <div className="text-[10px] text-slate-500 mb-2">Ön izleme</div>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: `${form.iconColor}22`, color: form.iconColor, border: `1px solid ${form.iconColor}55` }}>
                <Megaphone className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-bold" style={{ color: form.titleColor }}>{form.title || "Başlık"}</div>
                <div className="text-[11px] text-slate-400 line-clamp-2">{form.description || "Açıklama"}</div>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEditingId(null)}>İptal</Button>
            <Button type="button" className="bg-amber-500 text-slate-900 font-bold" disabled={saving} onClick={() => void save()}>
              <Save className="w-3.5 h-3.5 mr-1" /> Kaydet
            </Button>
          </div>
        </div>
      )}

      <ul className="rounded-2xl border border-white/[0.06] divide-y divide-white/[0.04]">
        {loading && <li className="p-4 text-sm text-slate-400">Yükleniyor…</li>}
        {!loading && items.length === 0 && <li className="p-4 text-sm text-slate-400">Banner yok.</li>}
        {items.map((item) => (
          <li
            key={item.id}
            draggable
            onDragStart={() => { dragId.current = item.id; }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => void onDropReorder(item.id)}
            className="flex items-center gap-3 px-3 py-3"
          >
            <GripVertical className="w-4 h-4 text-slate-500 cursor-grab" />
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ color: item.iconColor, background: `${item.iconColor}22` }}>
              <Megaphone className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold truncate" style={{ color: item.titleColor }}>{item.title}</div>
              <div className="text-[11px] text-slate-400 truncate">{item.description}</div>
            </div>
            <button type="button" onClick={() => void apiCall(`/admin/chat-banners/${item.id}`, "PUT", { isActive: !item.isActive }).then(load)} className="p-1.5">
              {item.isActive ? <Eye className="w-4 h-4 text-amber-400" /> : <EyeOff className="w-4 h-4 text-slate-500" />}
            </button>
            <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => {
              setEditingId(item.id);
              setForm({
                title: item.title,
                description: item.description,
                icon: item.icon,
                iconColor: item.iconColor,
                titleColor: item.titleColor,
                linkType: item.linkType ?? "",
                linkUrl: item.linkUrl ?? "",
                startsAt: item.startsAt ? item.startsAt.slice(0, 16) : "",
                endsAt: item.endsAt ? item.endsAt.slice(0, 16) : "",
                durationSeconds: item.durationSeconds,
                isActive: item.isActive,
              });
            }}>Düzenle</Button>
            <Button type="button" size="sm" variant="outline" className="h-8 text-red-400" onClick={() => void softDelete(item.id)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

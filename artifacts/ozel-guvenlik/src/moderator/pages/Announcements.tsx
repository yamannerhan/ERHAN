import React, { useCallback, useEffect, useState } from "react";
import { Plus, Eye, EyeOff, Pencil } from "lucide-react";
import { modFetch, modPost, modPatch } from "../api";
import { PermissionGuard } from "../PermissionGuard";
import { PageShell, DataTable, fmtDate } from "../components/PageShell";
import { useModerator } from "../context";
import { useToast } from "@/hooks/use-toast";

interface Announcement {
  id: number;
  content: string;
  isActive: boolean;
  isPinned: boolean;
  createdAt: string;
}

export default function Announcements() {
  const { hasPermission } = useModerator();
  const { toast } = useToast();
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{ id?: number; content: string; isPinned: boolean } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await modFetch<{ items: Announcement[] }>("/announcements");
      setItems(data.items);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form?.content.trim()) return;
    setActionLoading(true);
    try {
      if (form.id) {
        await modPatch(`/announcements/${form.id}`, { content: form.content, isPinned: form.isPinned });
        toast({ title: "Güncellendi" });
      } else {
        await modPost("/announcements", { content: form.content, isPinned: form.isPinned });
        toast({ title: "Oluşturuldu" });
      }
      setForm(null);
      await load();
    } catch (e) {
      toast({ title: "Hata", description: e instanceof Error ? e.message : "Başarısız", variant: "destructive" });
    } finally { setActionLoading(false); }
  };

  const togglePublish = async (id: number, publish: boolean) => {
    setActionLoading(true);
    try {
      await modPost(`/announcements/${id}/${publish ? "publish" : "unpublish"}`);
      toast({ title: publish ? "Yayınlandı" : "Yayından kaldırıldı" });
      await load();
    } catch (e) {
      toast({ title: "Hata", description: e instanceof Error ? e.message : "Başarısız", variant: "destructive" });
    } finally { setActionLoading(false); }
  };

  return (
    <PermissionGuard permission="announcements.view">
      <PageShell
        title="Duyurular"
        onRefresh={load}
        loading={loading}
        actions={
          hasPermission("announcements.create") ? (
            <button type="button" className="mod-btn mod-btn-gold mod-btn-sm" onClick={() => setForm({ content: "", isPinned: false })}>
              <Plus size={14} /> Yeni Duyuru
            </button>
          ) : undefined
        }
      >
        {form && (
          <div className="mod-card" style={{ marginBottom: 16 }}>
            <textarea className="mod-input" rows={4} placeholder="Duyuru içeriği..." value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} style={{ marginBottom: 8, resize: "vertical" }} />
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 10 }}>
              <input type="checkbox" checked={form.isPinned} onChange={(e) => setForm({ ...form, isPinned: e.target.checked })} />
              Sabitle
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="mod-btn mod-btn-gold mod-btn-sm" onClick={save} disabled={actionLoading}>Kaydet</button>
              <button type="button" className="mod-btn mod-btn-ghost mod-btn-sm" onClick={() => setForm(null)}>Vazgeç</button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="mod-loading-center"><div className="mod-spinner" /></div>
        ) : items.length === 0 ? (
          <div className="mod-empty">Duyuru yok</div>
        ) : (
          <DataTable>
            <thead>
              <tr><th>İçerik</th><th>Durum</th><th>Sabit</th><th>Tarih</th><th>İşlemler</th></tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontSize: 13, maxWidth: 360 }}>{a.content.slice(0, 100)}{a.content.length > 100 ? "…" : ""}</td>
                  <td>
                    <span style={{ fontSize: 12, color: a.isActive ? "var(--mod-success)" : "var(--mod-text-dim)" }}>
                      {a.isActive ? "Yayında" : "Taslak"}
                    </span>
                  </td>
                  <td>{a.isPinned ? "📌" : "—"}</td>
                  <td style={{ fontSize: 12, color: "var(--mod-text-dim)" }}>{fmtDate(a.createdAt)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      {hasPermission("announcements.edit") && (
                        <button type="button" className="mod-btn mod-btn-ghost mod-btn-sm" onClick={() => setForm({ id: a.id, content: a.content, isPinned: a.isPinned })}>
                          <Pencil size={14} />
                        </button>
                      )}
                      {hasPermission("announcements.publish") && !a.isActive && (
                        <button type="button" className="mod-btn mod-btn-success mod-btn-sm" onClick={() => togglePublish(a.id, true)} disabled={actionLoading}>
                          <Eye size={14} />
                        </button>
                      )}
                      {hasPermission("announcements.unpublish") && a.isActive && (
                        <button type="button" className="mod-btn mod-btn-ghost mod-btn-sm" onClick={() => togglePublish(a.id, false)} disabled={actionLoading}>
                          <EyeOff size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </PageShell>
    </PermissionGuard>
  );
}

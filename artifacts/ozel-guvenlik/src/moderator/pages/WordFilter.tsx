import React, { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
import { modFetch, modPost, modPatch, modDelete } from "../api";
import { PermissionGuard } from "../PermissionGuard";
import { PageShell, DataTable, fmtDate } from "../components/PageShell";
import { ConfirmationModal } from "../components/ConfirmationModal";
import { useModerator } from "../context";
import { useToast } from "@/hooks/use-toast";

interface FilterWord {
  id: number;
  word: string;
  category: string;
  action: string;
  isRegex: boolean;
  createdAt: string;
}

export default function WordFilter() {
  const { hasPermission } = useModerator();
  const { toast } = useToast();
  const [items, setItems] = useState<FilterWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{ id?: number; word: string; category: string; action: string; isRegex: boolean } | null>(null);
  const [removeId, setRemoveId] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await modFetch<{ items: FilterWord[] }>("/word-filter");
      setItems(data.items);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form?.word.trim()) return;
    setActionLoading(true);
    try {
      if (form.id) {
        await modPatch(`/word-filter/${form.id}`, { word: form.word, category: form.category, action: form.action, isRegex: form.isRegex });
        toast({ title: "Güncellendi" });
      } else {
        await modPost("/word-filter", form);
        toast({ title: "Eklendi" });
      }
      setForm(null);
      await load();
    } catch (e) {
      toast({ title: "Hata", description: e instanceof Error ? e.message : "Başarısız", variant: "destructive" });
    } finally { setActionLoading(false); }
  };

  const remove = async () => {
    if (removeId == null) return;
    setActionLoading(true);
    try {
      await modDelete(`/word-filter/${removeId}`);
      toast({ title: "Silindi" });
      setRemoveId(null);
      await load();
    } catch (e) {
      toast({ title: "Hata", description: e instanceof Error ? e.message : "Başarısız", variant: "destructive" });
    } finally { setActionLoading(false); }
  };

  return (
    <PermissionGuard permission="word_filter.view">
      <PageShell
        title="Kelime Filtresi"
        onRefresh={load}
        loading={loading}
        actions={
          hasPermission("word_filter.add") ? (
            <button type="button" className="mod-btn mod-btn-gold mod-btn-sm" onClick={() => setForm({ word: "", category: "custom", action: "log", isRegex: false })}>
              <Plus size={14} /> Ekle
            </button>
          ) : undefined
        }
      >
        {form && (
          <div className="mod-card" style={{ marginBottom: 16 }}>
            <h3 style={{ fontWeight: 600, marginBottom: 12 }}>{form.id ? "Düzenle" : "Yeni Kelime"}</h3>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
              <input className="mod-input" placeholder="Kelime veya regex" value={form.word} onChange={(e) => setForm({ ...form, word: e.target.value })} />
              <select className="mod-input mod-select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="custom">Özel</option>
                <option value="profanity">Küfür</option>
                <option value="spam">Spam</option>
              </select>
              <select className="mod-input mod-select" value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })}>
                <option value="log">Log</option>
                <option value="block">Engelle</option>
                <option value="replace">Değiştir</option>
              </select>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 10 }}>
              <input type="checkbox" checked={form.isRegex} onChange={(e) => setForm({ ...form, isRegex: e.target.checked })} />
              Regex modu
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
          <div className="mod-empty">Filtre kelimesi yok</div>
        ) : (
          <DataTable>
            <thead>
              <tr><th>Kelime</th><th>Kategori</th><th>Aksiyon</th><th>Regex</th><th>Tarih</th><th></th></tr>
            </thead>
            <tbody>
              {items.map((w) => (
                <tr key={w.id}>
                  <td style={{ fontFamily: "monospace", fontSize: 13 }}>{w.word}</td>
                  <td style={{ fontSize: 12 }}>{w.category}</td>
                  <td style={{ fontSize: 12, color: "var(--mod-text-muted)" }}>{w.action}</td>
                  <td>{w.isRegex ? "✓" : "—"}</td>
                  <td style={{ fontSize: 12, color: "var(--mod-text-dim)" }}>{fmtDate(w.createdAt)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      {hasPermission("word_filter.edit") && (
                        <button type="button" className="mod-btn mod-btn-ghost mod-btn-sm" onClick={() => setForm({ id: w.id, word: w.word, category: w.category, action: w.action, isRegex: w.isRegex })}>
                          <Pencil size={14} />
                        </button>
                      )}
                      {hasPermission("word_filter.remove") && (
                        <button type="button" className="mod-btn mod-btn-danger mod-btn-sm" onClick={() => setRemoveId(w.id)}>
                          <Trash2 size={14} />
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

      <ConfirmationModal
        open={removeId != null}
        title="Kelimeyi Sil"
        message="Bu filtreyi kaldırmak istediğinize emin misiniz?"
        variant="danger"
        loading={actionLoading}
        onConfirm={remove}
        onCancel={() => setRemoveId(null)}
      />
    </PermissionGuard>
  );
}

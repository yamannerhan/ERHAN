import React, { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { modFetch, modPost, modDelete } from "../api";
import { PermissionGuard } from "../PermissionGuard";
import { PageShell, DataTable, fmtDate } from "../components/PageShell";
import { ConfirmationModal } from "../components/ConfirmationModal";
import { useModerator } from "../context";
import { useToast } from "@/hooks/use-toast";

interface BlacklistEntry {
  id: number;
  entryType: string;
  value: string;
  reason: string | null;
  createdAt: string;
}

export default function Blacklist() {
  const { hasPermission } = useModerator();
  const { toast } = useToast();
  const [items, setItems] = useState<BlacklistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [entryType, setEntryType] = useState("ip");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [removeId, setRemoveId] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await modFetch<{ items: BlacklistEntry[] }>("/blacklist");
      setItems(data.items);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!value.trim()) return;
    setActionLoading(true);
    try {
      await modPost("/blacklist", { entryType, value, reason });
      toast({ title: "Kara listeye eklendi" });
      setShowAdd(false);
      setValue("");
      setReason("");
      await load();
    } catch (e) {
      toast({ title: "Hata", description: e instanceof Error ? e.message : "Başarısız", variant: "destructive" });
    } finally { setActionLoading(false); }
  };

  const remove = async () => {
    if (removeId == null) return;
    setActionLoading(true);
    try {
      await modDelete(`/blacklist/${removeId}`);
      toast({ title: "Kaldırıldı" });
      setRemoveId(null);
      await load();
    } catch (e) {
      toast({ title: "Hata", description: e instanceof Error ? e.message : "Başarısız", variant: "destructive" });
    } finally { setActionLoading(false); }
  };

  return (
    <PermissionGuard permission="blacklist.view">
      <PageShell
        title="Kara Liste"
        onRefresh={load}
        loading={loading}
        actions={
          hasPermission("blacklist.add") ? (
            <button type="button" className="mod-btn mod-btn-gold mod-btn-sm" onClick={() => setShowAdd(true)}>
              <Plus size={14} /> Ekle
            </button>
          ) : undefined
        }
      >
        {showAdd && (
          <div className="mod-card" style={{ marginBottom: 16 }}>
            <h3 style={{ fontWeight: 600, marginBottom: 12 }}>Yeni Kayıt</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8, marginBottom: 8 }}>
              <select className="mod-input mod-select" value={entryType} onChange={(e) => setEntryType(e.target.value)}>
                <option value="ip">IP</option>
                <option value="email">E-posta</option>
                <option value="username">Kullanıcı adı</option>
                <option value="device">Cihaz</option>
              </select>
              <input className="mod-input" placeholder="Değer" value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
            <input className="mod-input" placeholder="Sebep (opsiyonel)" value={reason} onChange={(e) => setReason(e.target.value)} style={{ marginBottom: 10 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="mod-btn mod-btn-gold mod-btn-sm" onClick={add} disabled={actionLoading || !value.trim()}>Kaydet</button>
              <button type="button" className="mod-btn mod-btn-ghost mod-btn-sm" onClick={() => setShowAdd(false)}>Vazgeç</button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="mod-loading-center"><div className="mod-spinner" /></div>
        ) : items.length === 0 ? (
          <div className="mod-empty">Kara liste boş</div>
        ) : (
          <DataTable>
            <thead>
              <tr><th>Tür</th><th>Değer</th><th>Sebep</th><th>Tarih</th><th></th></tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id}>
                  <td style={{ fontSize: 12, textTransform: "uppercase", color: "var(--mod-gold)" }}>{e.entryType}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 13 }}>{e.value}</td>
                  <td style={{ fontSize: 12, color: "var(--mod-text-muted)" }}>{e.reason ?? "—"}</td>
                  <td style={{ fontSize: 12, color: "var(--mod-text-dim)" }}>{fmtDate(e.createdAt)}</td>
                  <td>
                    {hasPermission("blacklist.remove") && (
                      <button type="button" className="mod-btn mod-btn-danger mod-btn-sm" onClick={() => setRemoveId(e.id)}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </PageShell>

      <ConfirmationModal
        open={removeId != null}
        title="Kara Listeden Kaldır"
        message="Bu kaydı kaldırmak istediğinize emin misiniz?"
        variant="danger"
        confirmLabel="Kaldır"
        loading={actionLoading}
        onConfirm={remove}
        onCancel={() => setRemoveId(null)}
      />
    </PermissionGuard>
  );
}

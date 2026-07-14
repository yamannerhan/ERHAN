import React, { useCallback, useEffect, useState } from "react";
import { EyeOff, RotateCcw } from "lucide-react";
import { modFetch, modPost } from "../api";
import { PermissionGuard } from "../PermissionGuard";
import { PageShell, DataTable, fmtDate } from "../components/PageShell";
import { ReasonModal } from "../components/ReasonModal";
import { useModerator } from "../context";
import { useToast } from "@/hooks/use-toast";

interface Comment {
  id: number;
  content: string;
  userId: number;
  isDeleted: boolean;
  createdAt: string;
}

export default function Comments() {
  const { hasPermission, refreshBadges } = useModerator();
  const { toast } = useToast();
  const [items, setItems] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [hideId, setHideId] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await modFetch<{ items: Comment[] }>("/comments");
      setItems(data.items);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const hide = async (id: number, reason: string) => {
    setActionLoading(true);
    try {
      await modPost(`/comments/${id}/hide`, { reason });
      toast({ title: "Yorum gizlendi" });
      setHideId(null);
      await load();
      await refreshBadges();
    } catch (e) {
      toast({ title: "Hata", description: e instanceof Error ? e.message : "Başarısız", variant: "destructive" });
    } finally { setActionLoading(false); }
  };

  const restore = async (id: number) => {
    setActionLoading(true);
    try {
      await modPost(`/comments/${id}/restore`);
      toast({ title: "Yorum geri yüklendi" });
      await load();
    } catch (e) {
      toast({ title: "Hata", description: e instanceof Error ? e.message : "Başarısız", variant: "destructive" });
    } finally { setActionLoading(false); }
  };

  return (
    <PermissionGuard permission="comments.view">
      <PageShell title="Yorumlar" onRefresh={load} loading={loading}>
        {loading ? (
          <div className="mod-loading-center"><div className="mod-spinner" /></div>
        ) : items.length === 0 ? (
          <div className="mod-empty">Yorum bulunamadı</div>
        ) : (
          <DataTable>
            <thead>
              <tr><th>İçerik</th><th>Kullanıcı</th><th>Tarih</th><th>İşlemler</th></tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td style={{ maxWidth: 360, fontSize: 13 }}>{c.content?.slice(0, 120)}{c.content?.length > 120 ? "…" : ""}</td>
                  <td style={{ fontSize: 12, color: "var(--mod-text-muted)" }}>#{c.userId}</td>
                  <td style={{ fontSize: 12, color: "var(--mod-text-dim)" }}>{fmtDate(c.createdAt)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      {hasPermission("comments.hide") && !c.isDeleted && (
                        <button type="button" className="mod-btn mod-btn-danger mod-btn-sm" onClick={() => setHideId(c.id)} disabled={actionLoading}>
                          <EyeOff size={14} />
                        </button>
                      )}
                      {hasPermission("comments.restore") && c.isDeleted && (
                        <button type="button" className="mod-btn mod-btn-success mod-btn-sm" onClick={() => restore(c.id)} disabled={actionLoading}>
                          <RotateCcw size={14} />
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

      <ReasonModal
        open={hideId != null}
        title="Yorumu Gizle"
        loading={actionLoading}
        onConfirm={(reason) => hideId != null && hide(hideId, reason)}
        onCancel={() => setHideId(null)}
      />
    </PermissionGuard>
  );
}

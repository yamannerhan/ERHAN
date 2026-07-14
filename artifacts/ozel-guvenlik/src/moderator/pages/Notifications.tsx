import React, { useCallback, useEffect, useState } from "react";
import { modFetch, modPost } from "../api";
import { PermissionGuard } from "../PermissionGuard";
import { PageShell, DataTable, fmtDate } from "../components/PageShell";
import { useModerator } from "../context";
import { useToast } from "@/hooks/use-toast";

interface Notif {
  id: number;
  type: string;
  title: string | null;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export default function Notifications() {
  const { hasPermission } = useModerator();
  const { toast } = useToast();
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [userId, setUserId] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await modFetch<{ items: Notif[] }>("/notifications");
      setItems(data.items);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const send = async () => {
    const uid = Number(userId);
    if (!message.trim() || !Number.isInteger(uid) || uid <= 0) {
      toast({ title: "Kullanıcı ID ve mesaj gerekli", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      await modPost("/notifications/send", { title: title.trim() || undefined, message: message.trim(), userId: uid });
      toast({ title: "Bildirim gönderildi" });
      setTitle("");
      setMessage("");
      setUserId("");
      await load();
    } catch (e) {
      toast({ title: "Hata", description: e instanceof Error ? e.message : "Başarısız", variant: "destructive" });
    } finally { setSending(false); }
  };

  return (
    <PermissionGuard permission="notifications.view">
      <PageShell title="Bildirimler" onRefresh={load} loading={loading}>
        {hasPermission("notifications.send") && (
          <div className="mod-card" style={{ marginBottom: 20, padding: 16, display: "grid", gap: 10, maxWidth: 520 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Bildirim gönder (senior+)</div>
            <input className="mod-input" placeholder="Başlık" value={title} onChange={(e) => setTitle(e.target.value)} />
            <input className="mod-input" placeholder="Hedef kullanıcı ID" value={userId} onChange={(e) => setUserId(e.target.value)} />
            <textarea className="mod-input" placeholder="Mesaj" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
            <button type="button" className="mod-btn mod-btn-gold" onClick={send} disabled={sending} style={{ width: "fit-content" }}>
              {sending ? "Gönderiliyor…" : "Gönder"}
            </button>
          </div>
        )}
        {loading ? (
          <div className="mod-loading-center"><div className="mod-spinner" /></div>
        ) : items.length === 0 ? (
          <div className="mod-empty">Bildirim yok</div>
        ) : (
          <DataTable>
            <thead>
              <tr><th>Başlık</th><th>İçerik</th><th>Tür</th><th>Okundu</th><th>Tarih</th></tr>
            </thead>
            <tbody>
              {items.map((n) => (
                <tr key={n.id} style={{ opacity: n.isRead ? 0.65 : 1 }}>
                  <td style={{ fontWeight: n.isRead ? 400 : 600, fontSize: 13 }}>{n.title ?? "—"}</td>
                  <td style={{ fontSize: 12, color: "var(--mod-text-muted)", maxWidth: 280 }}>{n.message?.slice(0, 80)}</td>
                  <td style={{ fontSize: 11, color: "var(--mod-text-dim)" }}>{n.type}</td>
                  <td>{n.isRead ? "✓" : "●"}</td>
                  <td style={{ fontSize: 12, color: "var(--mod-text-dim)" }}>{fmtDate(n.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </PageShell>
    </PermissionGuard>
  );
}

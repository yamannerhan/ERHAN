import React, { useState } from "react";
import { Send, User, Shield } from "lucide-react";
import { modPost } from "../api";
import { PermissionGuard } from "../PermissionGuard";
import { PageShell } from "../components/PageShell";
import { RoleBadge } from "../components/StatusBadge";
import { useModerator } from "../context";
import { useToast } from "@/hooks/use-toast";

export default function Settings() {
  const { me } = useModerator();
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);

  const sendTicket = async () => {
    if (!subject.trim() || !description.trim()) return;
    setSending(true);
    try {
      await modPost("/support-tickets", { subject, description, category: "other", priority: "normal" });
      toast({ title: "Destek talebi gönderildi" });
      setSubject("");
      setDescription("");
    } catch (e) {
      toast({ title: "Hata", description: e instanceof Error ? e.message : "Başarısız", variant: "destructive" });
    } finally { setSending(false); }
  };

  return (
    <PermissionGuard permission="settings.profile">
      <PageShell title="Ayarlar" subtitle="Profil bilgileri ve destek talebi">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 }}>
          <div className="mod-card">
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
              {me?.avatarUrl ? (
                <img src={me.avatarUrl} alt="" style={{ width: 64, height: 64, borderRadius: 14, objectFit: "cover", border: "2px solid var(--mod-border)" }} />
              ) : (
                <div style={{ width: 64, height: 64, borderRadius: 14, background: "var(--mod-gold-dim)", border: "2px solid var(--mod-border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <User size={28} style={{ color: "var(--mod-gold)" }} />
                </div>
              )}
              <div>
                <h2 style={{ fontFamily: "var(--mod-font-display)", fontWeight: 700, fontSize: 18 }}>{me?.displayName ?? me?.username}</h2>
                <p style={{ fontSize: 13, color: "var(--mod-text-muted)" }}>@{me?.username}</p>
                {me?.role && <div style={{ marginTop: 6 }}><RoleBadge role={me.role} /></div>}
              </div>
            </div>
            <p style={{ fontSize: 13, color: "var(--mod-text-muted)", lineHeight: 1.6 }}>
              Bu panelde yalnızca profil görüntüleme ve bildirim tercihleri yönetilebilir. Rol veya izin değişiklikleri için sistem yöneticisine başvurun.
            </p>
            <div style={{ marginTop: 16, padding: 12, background: "var(--mod-bg-elevated)", borderRadius: 8, fontSize: 12, color: "var(--mod-text-dim)", display: "flex", gap: 8 }}>
              <Shield size={14} style={{ flexShrink: 0, color: "var(--mod-gold)" }} />
              {me?.permissions.length ?? 0} izin atanmış
            </div>
          </div>

          <div className="mod-card">
            <h3 style={{ fontFamily: "var(--mod-font-display)", fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Destek Talebi</h3>
            <input className="mod-input" placeholder="Konu" value={subject} onChange={(e) => setSubject(e.target.value)} style={{ marginBottom: 8 }} />
            <textarea className="mod-input" rows={5} placeholder="Sorununuzu açıklayın..." value={description} onChange={(e) => setDescription(e.target.value)} style={{ marginBottom: 12, resize: "vertical" }} />
            <button type="button" className="mod-btn mod-btn-gold" onClick={sendTicket} disabled={sending || !subject.trim() || !description.trim()} style={{ width: "100%" }}>
              <Send size={14} /> Gönder
            </button>
          </div>
        </div>
      </PageShell>
    </PermissionGuard>
  );
}

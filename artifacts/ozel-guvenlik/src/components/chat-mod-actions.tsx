import React, { useState } from "react";
import { Ban, Trash2, ShieldOff } from "lucide-react";

function getToken() {
  return localStorage.getItem("auth_token") ?? "";
}

export const CHAT_MUTE_PRESETS = [
  { label: "1 saat", hours: 1 },
  { label: "1 gün", days: 1 },
  { label: "1 ay", days: 30 },
  { label: "1 yıl", days: 365 },
] as const;

type Props = {
  messageId: number;
  targetUserId: number;
  targetRole?: string | null;
  /** Mesaj sahibi kendisi mi */
  isOwn?: boolean;
  align?: "start" | "end";
  onDeleted?: (messageId: number) => void;
  onMuted?: (userId: number) => void;
  onUnmuted?: (userId: number) => void;
  compact?: boolean;
};

/**
 * Admin / moderatör: tek mesaj sil + sohbet yasağı (mute) / kaldırma.
 * Hesap banı değil — sadece sohbet yazma yasağı (mutedUntil).
 */
export function ChatModActions({
  messageId,
  targetUserId,
  targetRole,
  isOwn,
  align = "start",
  onDeleted,
  onMuted,
  onUnmuted,
  compact,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canMuteTarget =
    targetUserId > 0 &&
    targetRole !== "admin" &&
    targetRole !== "bot" &&
    !isOwn;

  const deleteMessage = async () => {
    if (!window.confirm("Bu mesaj silinsin mi?")) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/chat/messages/${messageId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!r.ok && r.status !== 204) {
        const d = await r.json().catch(() => ({})) as { error?: string };
        setErr(d.error ?? "Silinemedi");
        return;
      }
      onDeleted?.(messageId);
      setOpen(false);
    } catch {
      setErr("Bağlantı hatası");
    } finally {
      setBusy(false);
    }
  };

  const muteUser = async (preset: (typeof CHAT_MUTE_PRESETS)[number]) => {
    if (!canMuteTarget) return;
    const label = preset.label;
    if (!window.confirm(`Kullanıcıya ${label} sohbet yasağı uygulansın mı?`)) return;
    setBusy(true);
    setErr(null);
    try {
      const body =
        "hours" in preset && preset.hours
          ? { hours: preset.hours }
          : { days: (preset as { days: number }).days };
      const r = await fetch(`/api/admin/users/${targetUserId}/mute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({})) as { error?: string };
        setErr(d.error ?? "Yasak uygulanamadı");
        return;
      }
      onMuted?.(targetUserId);
      setOpen(false);
    } catch {
      setErr("Bağlantı hatası");
    } finally {
      setBusy(false);
    }
  };

  const unmuteUser = async () => {
    if (!canMuteTarget) return;
    if (!window.confirm("Sohbet yasağı kaldırılsın mı?")) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/admin/users/${targetUserId}/unmute`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({})) as { error?: string };
        setErr(d.error ?? "Kaldırılamadı");
        return;
      }
      onUnmuted?.(targetUserId);
      setOpen(false);
    } catch {
      setErr("Bağlantı hatası");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`relative flex flex-col gap-0.5 ${align === "end" ? "items-end" : "items-start"}`}>
      <div className={`flex items-center gap-1 flex-wrap ${align === "end" ? "justify-end" : "justify-start"}`}>
        <button
          type="button"
          onClick={() => void deleteMessage()}
          disabled={busy}
          className={`flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold text-red-400/90 hover:bg-red-500/15 disabled:opacity-50 ${compact ? "text-[9px]" : "text-[10px]"}`}
          title="Mesajı sil"
        >
          <Trash2 className={compact ? "w-2.5 h-2.5" : "w-3 h-3"} />
          Sil
        </button>
        {canMuteTarget && (
          <button
            type="button"
            onClick={() => { setOpen((v) => !v); setErr(null); }}
            disabled={busy}
            className={`flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold text-orange-400/90 hover:bg-orange-500/15 disabled:opacity-50 ${compact ? "text-[9px]" : "text-[10px]"}`}
            title="Sohbet yasağı"
          >
            <Ban className={compact ? "w-2.5 h-2.5" : "w-3 h-3"} />
            Yasak
          </button>
        )}
      </div>

      {open && canMuteTarget && (
        <div
          className="z-20 mt-0.5 rounded-xl border border-white/10 bg-[#1a1f2e] p-2 shadow-xl"
          style={{ minWidth: compact ? 168 : 190 }}
        >
          <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wider text-white/40">
            Sohbet yasağı süresi
          </p>
          <div className="flex flex-wrap gap-1">
            {CHAT_MUTE_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                disabled={busy}
                onClick={() => void muteUser(p)}
                className="rounded-lg bg-orange-500/15 px-2 py-1 text-[10px] font-semibold text-orange-300 hover:bg-orange-500/25 disabled:opacity-50"
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void unmuteUser()}
            className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-lg bg-emerald-500/15 px-2 py-1 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
          >
            <ShieldOff className="h-3 w-3" />
            Yasağı kaldır
          </button>
        </div>
      )}

      {err && <p className="text-[9px] text-red-400 px-0.5">{err}</p>}
    </div>
  );
}

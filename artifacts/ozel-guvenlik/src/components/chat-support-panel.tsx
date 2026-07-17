import React, { useCallback, useEffect, useRef, useState } from "react";
import { Headphones, Plus, Send, ChevronLeft, Lock, CheckCircle2, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { io, type Socket } from "socket.io-client";
import { useAuth } from "@/contexts/AuthContext";

const CATEGORIES = [
  "Hesap Sorunu", "İlan Sorunu", "Ödeme / Paket", "Teknik Hata",
  "Şikâyet", "Öneri", "Moderasyon", "Diğer",
];

const STATUS_LABEL: Record<string, string> = {
  waiting: "Bekliyor",
  reviewing: "İnceleniyor",
  answered: "Yanıtlandı",
  awaiting_user: "Kullanıcı Yanıtı Bekleniyor",
  resolved: "Çözüldü",
  closed: "Kapatıldı",
  cancelled: "İptal Edildi",
};

const STATUS_COLOR: Record<string, string> = {
  waiting: "#F59E0B",
  reviewing: "#3B82F6",
  answered: "#A855F7",
  awaiting_user: "#EAB308",
  resolved: "#22C55E",
  closed: "#94A3B8",
  cancelled: "#EF4444",
};

const ACTIVE = new Set(["waiting", "reviewing", "answered", "awaiting_user"]);

type Ticket = {
  id: number;
  ticketNumber?: string;
  subject: string;
  category?: string;
  status: string;
  username?: string | null;
  msgCount?: number;
  createdAt: string;
  updatedAt: string;
};

type Msg = {
  id: number;
  message: string;
  isStaff: boolean;
  isInternalNote?: boolean;
  username: string | null;
  avatarUrl?: string | null;
  createdAt: string;
};

function getToken() {
  return localStorage.getItem("auth_token") ?? "";
}

export function ChatSupportPanel({ onCloseChat }: { onCloseChat?: () => void }) {
  const { user } = useAuth();
  const isStaff = user?.role === "admin" || user?.role === "moderator" || user?.role === "senior_moderator";
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [active, setActive] = useState<(Ticket & { messages: Msg[] }) | null>(null);
  const [mode, setMode] = useState<"list" | "create" | "thread">("list");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("Diğer");
  const [subject, setSubject] = useState("");
  const [firstMsg, setFirstMsg] = useState("");
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmResolve, setConfirmResolve] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<number | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const openTicket = tickets.find((t) => ACTIVE.has(t.status)) ?? null;

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    try {
      const path = isStaff ? "/api/admin/support" : "/api/support";
      const r = await fetch(path, {
        headers: { Authorization: `Bearer ${getToken()}` },
        cache: "no-store",
      });
      const data = await r.json();
      setTickets(Array.isArray(data) ? data : []);
    } catch {
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [user, isStaff]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    activeIdRef.current = active?.id ?? null;
  }, [active?.id]);

  useEffect(() => {
    if (!user) return;
    const s = io(window.location.origin, {
      path: "/ws",
      auth: { token: getToken() },
      transports: ["polling", "websocket"],
      upgrade: true,
      secure: window.location.protocol === "https:",
      withCredentials: true,
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      timeout: 25000,
    });
    socketRef.current = s;
    const auth = () => {
      if (s.connected) s.emit("authenticate", { userId: user.id });
      if (activeIdRef.current) s.emit("support:join", { ticketId: activeIdRef.current });
    };
    s.on("connect", auth);
    s.on("support:message", (msg: Msg & { ticketId?: number; status?: string }) => {
      const ticketId = msg.ticketId;
      if (!ticketId) return;
      setTickets((prev) => prev.map((t) =>
        t.id === ticketId
          ? { ...t, status: msg.status ?? t.status, msgCount: (t.msgCount ?? 0) + 1, updatedAt: msg.createdAt }
          : t,
      ));
      if (activeIdRef.current !== ticketId) return;
      setActive((prev) => {
        if (!prev || prev.id !== ticketId) return prev;
        if (prev.messages.some((m) => m.id === msg.id)) return prev;
        return {
          ...prev,
          status: msg.status ?? prev.status,
          messages: [...prev.messages, msg],
        };
      });
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    });
    s.on("support:ticket-update", () => { void load(); });
    if (s.connected) auth();
    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [user?.id, load]);

  useEffect(() => {
    const id = active?.id;
    const s = socketRef.current;
    if (id && s?.connected) s.emit("support:join", { ticketId: id });
    if (!id || mode !== "thread") return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void (async () => {
        try {
          const r = await fetch(`/api/support/${id}`, {
            headers: { Authorization: `Bearer ${getToken()}` },
            cache: "no-store",
          });
          if (!r.ok) return;
          const data = await r.json();
          const messages = Array.isArray(data?.messages) ? data.messages as Msg[] : [];
          setActive((prev) => {
            if (!prev || prev.id !== id) return prev;
            const prevIds = new Set(prev.messages.map((m) => m.id));
            const hasNew = messages.some((m) => !prevIds.has(m.id));
            if (!hasNew && prev.status === data.status) return prev;
            return { ...data, messages };
          });
        } catch { /* ignore */ }
      })();
    }, 3500);
    return () => {
      window.clearInterval(timer);
      if (id && s?.connected) s.emit("support:leave", { ticketId: id });
    };
  }, [active?.id, mode]);

  const openThread = async (id: number) => {
    try {
      const r = await fetch(`/api/support/${id}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
        cache: "no-store",
      });
      if (!r.ok) throw new Error("Yüklenemedi");
      const data = await r.json();
      setActive({
        ...data,
        messages: Array.isArray(data?.messages) ? data.messages : [],
      });
      setMode("thread");
      socketRef.current?.emit("support:join", { ticketId: id });
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
    } catch (e: any) {
      setError(e?.message || "Hata");
    }
  };

  const createTicket = async () => {
    if (isStaff) return;
    setError("");
    if (subject.trim().length < 5) { setError("Başlık en az 5 karakter olmalı"); return; }
    if (firstMsg.trim().length < 10) { setError("Mesaj en az 10 karakter olmalı"); return; }
    setSending(true);
    try {
      const r = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ category, subject: subject.trim(), message: firstMsg.trim() }),
      });
      const data = await r.json();
      if (r.status === 409) {
        setError(data.error || "Açık talebiniz var");
        if (data.existingTicketId) await openThread(data.existingTicketId);
        await load();
        return;
      }
      if (!r.ok) throw new Error(data.error || "Oluşturulamadı");
      setSubject("");
      setFirstMsg("");
      await load();
      await openThread(data.id);
    } catch (e: any) {
      setError(e?.message || "Hata");
    } finally {
      setSending(false);
    }
  };

  const sendReply = async () => {
    if (!active || !reply.trim()) return;
    setSending(true);
    try {
      const r = await fetch(`/api/support/${active.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ message: reply.trim() }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Gönderilemedi");
      setReply("");
      setActive((prev) => {
        if (!prev) return prev;
        if (prev.messages.some((m) => m.id === data.id)) {
          return { ...prev, status: data.isStaff ? "answered" : "reviewing" };
        }
        return {
          ...prev,
          status: data.isStaff ? "answered" : "reviewing",
          messages: [...prev.messages, data],
        };
      });
      await load();
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (e: any) {
      setError(e?.message || "Hata");
    } finally {
      setSending(false);
    }
  };

  const setStatus = async (status: string) => {
    if (!active || !isStaff) return;
    setSending(true);
    setError("");
    try {
      const r = await fetch(`/api/support/${active.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ status }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Durum güncellenemedi");
      setActive((prev) => prev ? { ...prev, status } : prev);
      setConfirmResolve(false);
      await load();
    } catch (e: any) {
      setError(e?.message || "Hata");
    } finally {
      setSending(false);
    }
  };

  const requestResolve = () => {
    setConfirmResolve(true);
  };

  const deleteTicket = async (id: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!isStaff) return;
    if (!window.confirm("Bu destek talebi silinsin mi?")) return;
    setSending(true);
    setError("");
    try {
      const r = await fetch(`/api/support/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!r.ok && r.status !== 204) {
        const data = await r.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || "Silinemedi");
      }
      if (active?.id === id) {
        setActive(null);
        setMode("list");
      }
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Hata");
    } finally {
      setSending(false);
    }
  };

  if (!user) {
    return (
      <div className="og-cs-empty">
        <Lock className="w-8 h-8 text-amber-400 mb-2" />
        <p className="text-sm font-bold text-white">Canlı Destek</p>
        <p className="text-xs text-white/50 mt-1 mb-3">Destek talebi için giriş yapın.</p>
        <Link href="/giris" onClick={onCloseChat} className="og-cs-primary-btn">Giriş Yap</Link>
      </div>
    );
  }

  if (loading) {
    return <div className="og-cs-empty text-xs text-white/40">Yükleniyor…</div>;
  }

  if (!isStaff && mode === "create") {
    return (
      <div className="og-cs-panel">
        <div className="og-cs-toolbar">
          <button type="button" onClick={() => setMode("list")} className="og-cs-back" aria-label="Geri">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-bold text-white">Yeni Destek Talebi</span>
        </div>
        {error && <div className="og-cs-error">{error}</div>}
        <label className="og-cs-label">
          Konu kategorisi
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="og-cs-input">
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="og-cs-label">
          Başlık
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className="og-cs-input" maxLength={120} placeholder="Kısa başlık" />
        </label>
        <label className="og-cs-label">
          Mesaj
          <textarea value={firstMsg} onChange={(e) => setFirstMsg(e.target.value)} className="og-cs-input og-cs-textarea" maxLength={2000} rows={4} placeholder="Sorununuzu anlatın…" />
        </label>
        <button type="button" className="og-cs-primary-btn" disabled={sending} onClick={() => void createTicket()}>
          {sending ? "Gönderiliyor…" : "Talep Oluştur"}
        </button>
      </div>
    );
  }

  if (mode === "thread" && active) {
    const closed = ["resolved", "closed", "cancelled"].includes(active.status);
    const userLocked = closed && !isStaff;
    return (
      <div className="og-cs-panel">
        <div className="og-cs-toolbar">
          <button type="button" onClick={() => { setMode("list"); setActive(null); setConfirmResolve(false); }} className="og-cs-back" aria-label="Geri">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold text-white truncate">{active.subject}</div>
            <div className="text-[10px] text-white/45 truncate">
              {active.ticketNumber ?? `#${active.id}`}
              {active.category ? ` · ${active.category}` : ""}
              {isStaff && active.username ? ` · @${active.username}` : ""}
            </div>
          </div>
          <span className="og-cs-status" style={{ color: STATUS_COLOR[active.status], borderColor: `${STATUS_COLOR[active.status]}55` }}>
            {STATUS_LABEL[active.status] ?? active.status}
          </span>
        </div>
        {error && <div className="og-cs-error">{error}</div>}
        <div className="og-cs-msgs">
          {active.messages.filter((m) => !m.isInternalNote || isStaff).map((m) => (
            <div key={m.id} className={`og-cs-msg ${m.isStaff ? "is-staff" : "is-user"}`}>
              <div className="og-cs-msg-meta">
                {m.username ?? "Kullanıcı"}{m.isStaff ? " · Destek" : ""}
                <span>{new Date(m.createdAt).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <div className="og-cs-msg-body">{m.message}</div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {userLocked ? (
          <div className="og-cs-closed">Bu talep kapatıldı.</div>
        ) : (
          <>
            {isStaff && (
              <div className="og-cs-staff-safe">
                {!confirmResolve ? (
                  <div className="og-cs-staff-safe-row">
                    {closed ? (
                      <button
                        type="button"
                        className="og-cs-reopen-btn"
                        disabled={sending}
                        onClick={() => void setStatus("answered")}
                      >
                        Yeniden Aç
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="og-cs-resolve-btn og-cs-resolve-btn--safe"
                        disabled={sending}
                        onClick={requestResolve}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Çözüldü olarak işaretle
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="og-cs-confirm">
                    <p className="og-cs-confirm-title">Talebi çözüldü yap?</p>
                    <p className="og-cs-confirm-sub">İstersen sonra yeniden açıp yanıtlamaya devam edebilirsin.</p>
                    <div className="og-cs-confirm-actions">
                      <button type="button" className="og-cs-confirm-no" disabled={sending} onClick={() => setConfirmResolve(false)}>
                        Hayır
                      </button>
                      <button type="button" className="og-cs-confirm-yes" disabled={sending} onClick={() => void setStatus("resolved")}>
                        Evet, çözüldü
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="og-cs-composer">
              <input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendReply(); } }}
                placeholder={isStaff ? (closed ? "Yanıt yaz (talep yeniden açılır)…" : "Destek yanıtı yaz…") : "Yanıt yaz…"}
                className="og-cs-input"
                maxLength={2000}
              />
              <button type="button" className="og-cs-send" disabled={sending || !reply.trim()} onClick={() => void sendReply()} aria-label="Gönder">
                <Send className="w-4 h-4" />
              </button>
            </div>
            {isStaff && closed && (
              <div className="og-cs-closed og-cs-closed--soft">Çözüldü — yanıt yazınca talep yeniden açılır.</div>
            )}
          </>
        )}
      </div>
    );
  }

  /* Staff inbox — sohbet kutusundan yanıt */
  if (isStaff) {
    const activeTickets = tickets.filter((t) => ACTIVE.has(t.status));
    const resolvedTickets = tickets.filter((t) => t.status === "resolved").slice(0, 20);
    return (
      <div className="og-cs-panel">
        <div className="og-cs-hero">
          <Headphones className="w-5 h-5 text-amber-400" />
          <div>
            <div className="text-xs font-bold text-white">Destek Talepleri</div>
            <div className="text-[10px] text-white/45">Çözülenleri yeniden açıp yanıtlayabilirsiniz.</div>
          </div>
        </div>
        {error && <div className="og-cs-error">{error}</div>}
        {activeTickets.length === 0 && resolvedTickets.length === 0 ? (
          <div className="og-cs-empty text-xs text-white/40">Destek talebi yok.</div>
        ) : (
          <div className="og-cs-list">
            {activeTickets.length > 0 && (
              <>
                <div className="text-[10px] font-bold text-amber-400/80 uppercase tracking-wide mb-1.5">Aktif</div>
                {activeTickets.map((t) => (
                  <button key={t.id} type="button" className="og-cs-ticket-row" onClick={() => void openThread(t.id)}>
                    <span className="min-w-0 truncate">
                      <span className="text-white/90">{t.subject}</span>
                      {t.username ? <span className="text-white/35"> · @{t.username}</span> : null}
                    </span>
                    <span style={{ color: STATUS_COLOR[t.status] }}>{STATUS_LABEL[t.status] ?? t.status}</span>
                  </button>
                ))}
              </>
            )}
            {resolvedTickets.length > 0 && (
              <>
                <div className="text-[10px] font-bold text-emerald-400/80 uppercase tracking-wide mb-1.5 mt-3">Çözülenler</div>
                {resolvedTickets.map((t) => (
                  <div key={t.id} className="og-cs-ticket-row flex items-center gap-2">
                    <button type="button" className="min-w-0 flex-1 text-left truncate" onClick={() => void openThread(t.id)}>
                      <span className="text-white/90">{t.subject}</span>
                      {t.username ? <span className="text-white/35"> · @{t.username}</span> : null}
                    </button>
                    <span className="shrink-0 text-[10px]" style={{ color: STATUS_COLOR[t.status] }}>
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                    <button
                      type="button"
                      className="shrink-0 p-1.5 rounded-md text-rose-300 hover:bg-rose-500/15"
                      title="Talebi sil"
                      disabled={sending}
                      onClick={(e) => void deleteTicket(t.id, e)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="og-cs-panel">
      <div className="og-cs-hero">
        <Headphones className="w-5 h-5 text-amber-400" />
        <div>
          <div className="text-xs font-bold text-white">Canlı Destek</div>
          <div className="text-[10px] text-white/45">Talepleriniz yalnızca size ve destek ekibine görünür.</div>
        </div>
      </div>
      {error && <div className="og-cs-error">{error}</div>}

      {openTicket ? (
        <button type="button" className="og-cs-ticket-card" onClick={() => void openThread(openTicket.id)}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-amber-300">{openTicket.ticketNumber ?? `#${openTicket.id}`}</span>
            <span className="og-cs-status" style={{ color: STATUS_COLOR[openTicket.status], borderColor: `${STATUS_COLOR[openTicket.status]}55` }}>
              {STATUS_LABEL[openTicket.status]}
            </span>
          </div>
          <div className="text-xs text-white mt-1 truncate">{openTicket.subject}</div>
          <div className="text-[10px] text-white/40 mt-1">Açık talebinize devam etmek için dokunun</div>
        </button>
      ) : (
        <button type="button" className="og-cs-primary-btn" onClick={() => setMode("create")}>
          <Plus className="w-4 h-4" />
          Yeni Destek Talebi Oluştur
        </button>
      )}

      {tickets.filter((t) => ACTIVE.has(t.status)).length > 0 && (
        <div className="og-cs-list">
          <div className="text-[10px] font-bold text-white/40 uppercase tracking-wide mb-1.5">Açık talepler</div>
          {tickets.filter((t) => ACTIVE.has(t.status)).map((t) => (
            <button key={t.id} type="button" className="og-cs-ticket-row" onClick={() => void openThread(t.id)}>
              <span className="truncate">{t.subject}</span>
              <span style={{ color: STATUS_COLOR[t.status] }}>{STATUS_LABEL[t.status] ?? t.status}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

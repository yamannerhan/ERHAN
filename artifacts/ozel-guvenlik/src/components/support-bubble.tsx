import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, Send, ChevronLeft, Clock, CheckCircle, AlertCircle, Headphones } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "wouter";

function getToken() {
  return localStorage.getItem("auth_token") ?? "";
}

interface Ticket {
  id: number;
  subject: string;
  status: "waiting" | "answered" | "resolved";
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: number;
  message: string;
  isStaff: boolean;
  userId: number;
  username: string | null;
  createdAt: string;
}

interface TicketDetail extends Ticket {
  messages: Message[];
}

function StatusBadge({ status }: { status: string }) {
  const cfg = {
    waiting:  { label: "Bekliyor",   cls: "bg-amber-500/20 text-amber-400",   icon: Clock },
    answered: { label: "Yanıtlandı", cls: "bg-blue-500/20 text-blue-400",     icon: CheckCircle },
    resolved: { label: "Çözüldü",    cls: "bg-green-500/20 text-green-400",   icon: CheckCircle },
  }[status] ?? { label: status, cls: "bg-white/10 text-muted-foreground", icon: AlertCircle };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.cls}`}>
      <Icon className="w-2.5 h-2.5" /> {cfg.label}
    </span>
  );
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "şimdi";
  if (mins < 60) return `${mins} dk`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} sa`;
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
}

export function SupportBubble() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"list" | "detail" | "new">("list");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [activeTicket, setActiveTicket] = useState<TicketDetail | null>(null);
  const [subject, setSubject] = useState("");
  const [firstMsg, setFirstMsg] = useState("");
  const [replyText, setReplyText] = useState("");
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const api = async (path: string, method = "GET", body?: unknown) => {
    const r = await fetch(`/api${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Hata");
    return r.status === 204 ? null : r.json();
  };

  const loadTickets = async () => {
    if (!user) return;
    try {
      const data = await api("/support");
      setTickets(data);
      setUnread(data.filter((t: Ticket) => t.status === "answered").length);
    } catch {}
  };

  const loadTicket = async (id: number) => {
    try {
      const data = await api(`/support/${id}`);
      setActiveTicket(data);
      setView("detail");
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch {}
  };

  useEffect(() => {
    if (open && user) loadTickets();
  }, [open, user]);

  useEffect(() => {
    if (activeTicket) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }, [activeTicket?.messages?.length]);

  const createTicket = async () => {
    if (!subject.trim() || !firstMsg.trim()) return;
    setLoading(true);
    try {
      await api("/support", "POST", { subject: subject.trim(), message: firstMsg.trim() });
      setSubject(""); setFirstMsg("");
      await loadTickets();
      setView("list");
    } catch {} finally { setLoading(false); }
  };

  const sendReply = async () => {
    if (!replyText.trim() || !activeTicket) return;
    setLoading(true);
    try {
      const msg = await api(`/support/${activeTicket.id}/reply`, "POST", { message: replyText.trim() });
      setReplyText("");
      setActiveTicket(prev => prev ? {
        ...prev,
        status: "waiting",
        messages: [...prev.messages, msg],
      } : prev);
    } catch {} finally { setLoading(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, action: () => void) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); action(); }
  };

  return (
    <>
      {/* Bubble button */}
      <button
        onClick={() => { setOpen(o => !o); if (!open) setView("list"); }}
        className="fixed bottom-24 right-4 z-50 w-13 h-13 rounded-full shadow-xl flex items-center justify-center transition-all"
        style={{ width: 52, height: 52, background: "linear-gradient(135deg,#4F46E5,#7C3AED)" }}
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.2 }}>
              <X className="w-5 h-5 text-white" />
            </motion.div>
          ) : (
            <motion.div key="open" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.2 }} className="relative">
              <Headphones className="w-5 h-5 text-white" />
              {unread > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {unread}
                </span>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </button>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed bottom-[calc(6rem+52px)] right-4 z-50 w-80 max-h-[500px] flex flex-col rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
            style={{ background: "#1E293B" }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 shrink-0"
              style={{ background: "linear-gradient(135deg,#4F46E5,#7C3AED)" }}>
              {view !== "list" && (
                <button onClick={() => { setView("list"); setActiveTicket(null); }} className="text-white/80 hover:text-white mr-1">
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              <Headphones className="w-5 h-5 text-white shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm leading-tight">Destek Merkezi</p>
                <p className="text-white/70 text-[10px]">
                  {view === "list" ? "Talepleriniz" : view === "new" ? "Yeni Talep" : `Talep #${activeTicket?.id}`}
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            {!user ? (
              <div className="flex flex-col items-center justify-center py-10 px-6 text-center gap-3">
                <MessageCircle className="w-10 h-10 text-primary" />
                <p className="text-sm font-semibold">Destek almak için giriş yapın</p>
                <p className="text-xs text-muted-foreground">Hesabınızla giriş yaparak destek talebi oluşturabilirsiniz.</p>
                <Link href="/giris" onClick={() => setOpen(false)}
                  className="bg-primary text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-primary/90 transition-colors">
                  Giriş Yap
                </Link>
              </div>

            ) : view === "list" ? (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {tickets.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-xs">
                      <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      Henüz destek talebiniz yok.
                    </div>
                  ) : (
                    tickets.map(t => (
                      <button key={t.id} onClick={() => loadTicket(t.id)}
                        className="w-full text-left bg-white/5 hover:bg-white/10 rounded-xl p-3 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-semibold line-clamp-1 flex-1">{t.subject}</p>
                          <StatusBadge status={t.status} />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">{formatTime(t.updatedAt)}</p>
                      </button>
                    ))
                  )}
                </div>
                <div className="p-3 border-t border-white/10 shrink-0">
                  <button onClick={() => setView("new")}
                    className="w-full py-2 rounded-xl text-sm font-semibold text-white transition-colors"
                    style={{ background: "linear-gradient(135deg,#4F46E5,#7C3AED)" }}>
                    + Yeni Destek Talebi
                  </button>
                </div>
              </div>

            ) : view === "new" ? (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1 block">Konu</label>
                    <input
                      value={subject}
                      onChange={e => setSubject(e.target.value)}
                      placeholder="Talebinizin konusu..."
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1 block">Mesajınız</label>
                    <textarea
                      value={firstMsg}
                      onChange={e => setFirstMsg(e.target.value)}
                      placeholder="Sorununuzu veya talebinizi detaylı açıklayın..."
                      rows={4}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 resize-none"
                    />
                  </div>
                </div>
                <div className="p-3 border-t border-white/10 shrink-0">
                  <button onClick={createTicket} disabled={loading || !subject.trim() || !firstMsg.trim()}
                    className="w-full py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-all"
                    style={{ background: "linear-gradient(135deg,#4F46E5,#7C3AED)" }}>
                    {loading ? "Gönderiliyor..." : "Talebi Oluştur"}
                  </button>
                </div>
              </div>

            ) : activeTicket ? (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 shrink-0">
                  <p className="text-xs text-muted-foreground flex-1 line-clamp-1">{activeTicket.subject}</p>
                  <StatusBadge status={activeTicket.status} />
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {activeTicket.messages.map(m => (
                    <div key={m.id} className={`flex ${m.isStaff ? "justify-start" : "justify-end"}`}>
                      <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                        m.isStaff
                          ? "bg-white/10 text-foreground rounded-tl-sm"
                          : "text-white rounded-tr-sm"
                      }`} style={!m.isStaff ? { background: "linear-gradient(135deg,#4F46E5,#7C3AED)" } : {}}>
                        {m.isStaff && <p className="text-[9px] font-bold text-primary mb-0.5">{m.username ?? "Destek"} · Ekip</p>}
                        <p>{m.message}</p>
                        <p className={`text-[9px] mt-1 ${m.isStaff ? "text-muted-foreground" : "text-white/60"}`}>{formatTime(m.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
                {activeTicket.status !== "resolved" ? (
                  <div className="p-3 border-t border-white/10 shrink-0 flex gap-2">
                    <textarea
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      onKeyDown={e => handleKeyDown(e, sendReply)}
                      placeholder="Yanıt yazın..."
                      rows={2}
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 resize-none"
                    />
                    <button onClick={sendReply} disabled={loading || !replyText.trim()}
                      className="w-9 h-9 self-end rounded-xl flex items-center justify-center disabled:opacity-40 shrink-0"
                      style={{ background: "linear-gradient(135deg,#4F46E5,#7C3AED)" }}>
                      <Send className="w-3.5 h-3.5 text-white" />
                    </button>
                  </div>
                ) : (
                  <div className="p-3 border-t border-white/10 shrink-0 text-center text-xs text-green-400 font-semibold">
                    Bu talep çözüldü olarak kapatıldı.
                  </div>
                )}
              </div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

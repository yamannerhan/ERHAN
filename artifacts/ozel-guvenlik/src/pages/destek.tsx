import React, { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/layout";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Headphones, Plus, ChevronLeft, Send, Clock, CheckCircle, MessageCircle } from "lucide-react";

function getToken() { return localStorage.getItem("auth_token") ?? ""; }

interface Ticket { id: number; subject: string; status: string; createdAt: string; updatedAt: string; }
interface Message { id: number; message: string; isStaff: boolean; userId: number; username: string | null; createdAt: string; }
interface TicketDetail extends Ticket { messages: Message[]; }

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    waiting:  { label: "Bekliyor",   cls: "bg-amber-500/20 text-amber-400" },
    answered: { label: "Yanıtlandı", cls: "bg-blue-500/20 text-blue-400" },
    resolved: { label: "Çözüldü",    cls: "bg-green-500/20 text-green-400" },
  };
  const { label, cls } = cfg[status] ?? { label: status, cls: "bg-white/10 text-muted-foreground" };
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
}

function formatTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Az önce";
  if (mins < 60) return `${mins} dk önce`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} sa önce`;
  return new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
}

export default function Destek() {
  const { user } = useAuth();
  const [view, setView] = useState<"list" | "detail" | "new">("list");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [activeTicket, setActiveTicket] = useState<TicketDetail | null>(null);
  const [subject, setSubject] = useState("");
  const [firstMsg, setFirstMsg] = useState("");
  const [replyText, setReplyText] = useState("");
  const [loading, setLoading] = useState(false);
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
    try { const d = await api("/support"); setTickets(d); } catch {}
  };

  const loadTicket = async (id: number) => {
    try {
      const d = await api(`/support/${id}`);
      setActiveTicket(d);
      setView("detail");
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch {}
  };

  useEffect(() => { loadTickets(); }, [user]);

  useEffect(() => {
    if (view === "detail") setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
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
      setActiveTicket(prev => prev ? { ...prev, status: "waiting", messages: [...prev.messages, msg] } : prev);
    } catch {} finally { setLoading(false); }
  };

  return (
    <Layout>
      <div className="p-4 pb-8 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          {view !== "list" && (
            <button onClick={() => { setView("list"); setActiveTicket(null); }}
              className="text-muted-foreground hover:text-foreground">
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Headphones className="w-5 h-5 text-primary" />
              {view === "list" ? "Destek Merkezi" : view === "new" ? "Yeni Talep" : `Talep #${activeTicket?.id}`}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {view === "list" ? "Sorularınız için buradan destek alın" : view === "new" ? "Talebinizi oluşturun" : activeTicket?.subject}
            </p>
          </div>
        </div>

        {!user ? (
          <div className="glass-card rounded-2xl p-8 text-center space-y-4">
            <Headphones className="w-12 h-12 text-primary mx-auto" />
            <div>
              <p className="font-semibold">Destek almak için giriş yapın</p>
              <p className="text-xs text-muted-foreground mt-1">Hesabınızla giriş yaparak destek talebi oluşturabilirsiniz.</p>
            </div>
            <Link href="/giris" className="inline-flex items-center gap-2 bg-primary text-white text-sm font-semibold px-6 py-2.5 rounded-xl hover:bg-primary/90 transition-colors">
              Giriş Yap
            </Link>
          </div>
        ) : view === "list" ? (
          <>
            <button onClick={() => setView("new")}
              className="w-full py-3 rounded-2xl text-sm font-semibold text-white flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg,#4F46E5,#7C3AED)" }}>
              <Plus className="w-4 h-4" /> Yeni Destek Talebi Oluştur
            </button>

            <div className="space-y-3">
              {tickets.length === 0 ? (
                <div className="glass-card rounded-2xl p-8 text-center">
                  <MessageCircle className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Henüz destek talebiniz yok.</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Yukarıdaki butona tıklayarak yeni bir talep oluşturabilirsiniz.</p>
                </div>
              ) : (
                tickets.map((t, i) => (
                  <motion.button
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    key={t.id}
                    onClick={() => loadTicket(t.id)}
                    className="w-full text-left glass-card rounded-2xl p-4 hover:border-primary/30 transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm line-clamp-1">{t.subject}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <Clock className="w-3 h-3 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">{formatTime(t.updatedAt)}</p>
                        </div>
                      </div>
                      <StatusBadge status={t.status} />
                    </div>
                  </motion.button>
                ))
              )}
            </div>
          </>
        ) : view === "new" ? (
          <div className="glass-card rounded-2xl p-4 space-y-4">
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1.5 block">Konu</label>
              <input value={subject} onChange={e => setSubject(e.target.value)}
                placeholder="Talebinizin konusu..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1.5 block">Mesajınız</label>
              <textarea value={firstMsg} onChange={e => setFirstMsg(e.target.value)}
                placeholder="Sorununuzu veya talebinizi detaylı açıklayın..."
                rows={5}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 resize-none" />
            </div>
            <button onClick={createTicket} disabled={loading || !subject.trim() || !firstMsg.trim()}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-all"
              style={{ background: "linear-gradient(135deg,#4F46E5,#7C3AED)" }}>
              {loading ? "Gönderiliyor..." : "Talebi Oluştur"}
            </button>
          </div>
        ) : activeTicket ? (
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
              <StatusBadge status={activeTicket.status} />
              {activeTicket.status === "answered" && (
                <p className="text-xs text-blue-400">Yanıt bekleniyor</p>
              )}
            </div>
            <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
              <AnimatePresence>
                {activeTicket.messages.map((m, i) => (
                  <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                    className={`flex ${m.isStaff ? "justify-start" : "justify-end"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      m.isStaff ? "bg-white/10 text-foreground rounded-tl-sm" : "text-white rounded-tr-sm"
                    }`} style={!m.isStaff ? { background: "linear-gradient(135deg,#4F46E5,#7C3AED)" } : {}}>
                      {m.isStaff && <p className="text-[9px] font-bold text-primary mb-1">{m.username ?? "Destek Ekibi"} · Ekip</p>}
                      <p>{m.message}</p>
                      <p className={`text-[10px] mt-1 ${m.isStaff ? "text-muted-foreground" : "text-white/60"}`}>{formatTime(m.createdAt)}</p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>
            {activeTicket.status !== "resolved" ? (
              <div className="p-4 border-t border-white/10 flex gap-2">
                <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); }}}
                  placeholder="Yanıt yazın..."
                  rows={2}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 resize-none" />
                <button onClick={sendReply} disabled={loading || !replyText.trim()}
                  className="w-10 h-10 self-end rounded-xl flex items-center justify-center disabled:opacity-40 shrink-0"
                  style={{ background: "linear-gradient(135deg,#4F46E5,#7C3AED)" }}>
                  <Send className="w-4 h-4 text-white" />
                </button>
              </div>
            ) : (
              <div className="p-4 border-t border-white/10 text-center">
                <span className="flex items-center justify-center gap-2 text-sm text-green-400 font-semibold">
                  <CheckCircle className="w-4 h-4" /> Bu talep çözüldü olarak kapatıldı
                </span>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </Layout>
  );
}

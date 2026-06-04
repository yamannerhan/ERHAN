import React, { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/layout";
import { useAuth } from "@/contexts/AuthContext";
import { Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Users, Briefcase, MessageSquare, Settings, Image, Plus, Trash2,
  ToggleLeft, ToggleRight, Star, StarOff, CheckCircle, XCircle, Clock,
  ChevronDown, ChevronUp, Calendar, Infinity, Headphones, ChevronLeft, Send,
  Sparkles, Eye, RefreshCw, Phone, User, MapPin, Building2, Lock, Shield, Search,
  MessageSquareDot, ListChecks, Eraser, Pin,
  Link, Globe, Radio, AlertCircle, Edit2, ExternalLink, Filter, Zap
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function getToken() {
  return localStorage.getItem("auth_token") ?? "";
}

function useAdminApi<T>(path: string, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const refetch = () => {
    const tok = getToken();
    if (!tok) return;
    setLoading(true);
    fetch(`/api${path}`, { headers: { Authorization: `Bearer ${tok}` } })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { if (user) refetch(); }, [user, ...deps]);
  return { data, loading, refetch };
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ElementType; color: string }) {
  return (
    <div className="glass-card rounded-xl p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-lg font-bold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children, defaultOpen = false }: { title: string; icon: React.ElementType; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2 font-semibold text-sm">
          <Icon className="w-4 h-4 text-primary" />
          {title}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-4 border-t border-white/5 pt-4">{children}</div>}
    </div>
  );
}

interface ParsedListing {
  title: string; company: string; city: string; district: string;
  salary: string; workType: string; description: string;
  contactPhone: string; contactName: string; applyUrl: string;
  gender: string;
}

// Field bileşeni SmartListingSection DIŞINDA tanımlanmalı —
// içinde tanımlanırsa her render'da yeniden mount olur, focus kaybolur.
function ParseField({ icon: Icon, label, value, onChange, required }: {
  icon: React.ElementType; label: string; value: string;
  onChange: (v: string) => void; required?: boolean;
}) {
  return (
    <div>
      <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1 flex items-center gap-1">
        <Icon className="w-3 h-3" /> {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        autoComplete="off"
        required={required}
        className={`w-full bg-white/5 border rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors ${
          required && !value.trim() ? "border-red-500/50" : "border-white/10"
        }`}
      />
    </div>
  );
}

function SmartListingSection({ apiCall, toast, refetchListings, refetchStats }: {
  apiCall: (path: string, method: string, body?: unknown) => Promise<unknown>;
  toast: (opts: { title: string; description?: string; variant?: "default" | "destructive" }) => void;
  refetchListings: () => void;
  refetchStats: () => void;
}) {
  const [step, setStep] = useState<"input" | "preview" | "done">("input");
  const [rawText, setRawText] = useState("");
  const [parsed, setParsed] = useState<ParsedListing | null>(null);
  const [loading, setLoading] = useState(false);
  const [isFeatured, setIsFeatured] = useState(false);
  const [isTimed, setIsTimed] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");

  const parseText = async () => {
    if (!rawText.trim()) return;
    setLoading(true);
    try {
      const data = await apiCall("/admin/listings/parse", "POST", { text: rawText }) as ParsedListing;
      setParsed(data);
      setStep("preview");
    } catch (e: any) {
      toast({ title: "Ayıklama başarısız", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const publish = async () => {
    if (!parsed) return;
    const missing: string[] = [];
    if (!parsed.title.trim()) missing.push("İlan Başlığı");
    if (!parsed.city.trim()) missing.push("Şehir (İl)");
    if (!parsed.district.trim()) missing.push("İlçe");
    if (missing.length > 0) {
      toast({ title: "Zorunlu alanlar boş", description: missing.join(", ") + " doldurulmalıdır.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await apiCall("/admin/listings", "POST", {
        title: parsed.title,
        company: parsed.company || "Belirtilmedi",
        city: parsed.city,
        workType: parsed.workType || "Tam Zamanlı",
        salary: parsed.salary || null,
        description: [
          parsed.description,
          parsed.gender ? `Cinsiyet: ${parsed.gender}` : null,
          parsed.contactName ? `İletişim: ${parsed.contactName}` : null,
          parsed.contactPhone ? `Tel: ${parsed.contactPhone}` : null,
          parsed.district ? `İlçe: ${parsed.district}` : null,
        ].filter(Boolean).join("\n\n") || null,
        applyUrl: parsed.applyUrl || null,
        isFeatured,
        expiresAt: isTimed && expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      toast({ title: "İlan yayınlandı!" });
      setStep("done");
      setRawText(""); setParsed(null); setIsFeatured(false); setIsTimed(false); setExpiresAt("");
      refetchListings(); refetchStats();
      setTimeout(() => setStep("input"), 1500);
    } catch (e: any) {
      toast({ title: "Yayınlama başarısız", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-white/5">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <Sparkles className="w-4 h-4 text-primary" />
          Akıllı İlan Oluştur
          <span className="text-[9px] font-bold bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">AKTİF</span>
        </div>
        {step !== "input" && (
          <button onClick={() => { setStep("input"); setParsed(null); }}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Sıfırla
          </button>
        )}
      </div>

      <div className="p-4 space-y-3">
        {step === "input" ? (
          <>
            <p className="text-xs text-muted-foreground">WhatsApp mesajı, Telegram gönderisi veya herhangi bir iş ilanı metnini yapıştırın. Bilgiler otomatik olarak çıkarılacak.</p>
            <textarea
              value={rawText}
              onChange={e => setRawText(e.target.value)}
              placeholder={"Örnek:\n\"Acil! İstanbul Kadıköy'de güvenlik şirketi arıyor. Silahlı güvenlik görevlisi. 25.000 TL maaş. Tam zamanlı. İletişim: Ahmet Bey 0532 123 45 67\""}
              rows={6}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 resize-none"
            />
            <Button onClick={parseText} disabled={loading || !rawText.trim()}
              className="w-full bg-gradient-to-r from-primary to-secondary text-white text-sm disabled:opacity-40">
              {loading ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Ayıklanıyor...</> : <><Sparkles className="w-4 h-4 mr-2" /> Bilgileri Ayıkla</>}
            </Button>
          </>
        ) : step === "preview" && parsed ? (
          <>
            <div className="flex items-center gap-2 p-2.5 bg-green-500/10 rounded-xl text-xs text-green-400 font-medium">
              <Eye className="w-3.5 h-3.5 shrink-0" /> Bilgiler ayıklandı — kontrol edip düzenleyebilirsiniz. <span className="text-red-400">* Zorunlu alan</span>
            </div>
            <div className="space-y-2">
              <ParseField icon={Briefcase} label="İlan Başlığı" required value={parsed.title} onChange={v => setParsed(p => p ? { ...p, title: v } : p)} />
              <div className="grid grid-cols-2 gap-2">
                <ParseField icon={Building2} label="Şirket" value={parsed.company} onChange={v => setParsed(p => p ? { ...p, company: v } : p)} />
                <ParseField icon={MapPin} label="Şehir (İl)" required value={parsed.city} onChange={v => setParsed(p => p ? { ...p, city: v } : p)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <ParseField icon={MapPin} label="İlçe" required value={parsed.district} onChange={v => setParsed(p => p ? { ...p, district: v } : p)} />
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1 flex items-center gap-1">
                    <Briefcase className="w-3 h-3" /> Çalışma Tipi
                  </label>
                  <select value={parsed.workType} onChange={e => setParsed(p => p ? { ...p, workType: e.target.value } : p)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary/50">
                    <option value="Tam Zamanlı">Tam Zamanlı</option>
                    <option value="Yarı Zamanlı">Yarı Zamanlı</option>
                    <option value="Vardiyalı">Vardiyalı</option>
                    <option value="Proje Bazlı">Proje Bazlı</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <ParseField icon={Star} label="Maaş" value={parsed.salary} onChange={v => setParsed(p => p ? { ...p, salary: v } : p)} />
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1 flex items-center gap-1">
                    <User className="w-3 h-3" /> Cinsiyet
                  </label>
                  <select value={parsed.gender} onChange={e => setParsed(p => p ? { ...p, gender: e.target.value } : p)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary/50">
                    <option value="">Belirtilmemiş</option>
                    <option value="Bay">Bay</option>
                    <option value="Bayan">Bayan</option>
                    <option value="Bay / Bayan">Bay / Bayan</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1 flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" /> Açıklama
                </label>
                <textarea value={parsed.description} onChange={e => setParsed(p => p ? { ...p, description: e.target.value } : p)}
                  rows={3} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary/50 resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <ParseField icon={User} label="İletişim Kişisi" value={parsed.contactName} onChange={v => setParsed(p => p ? { ...p, contactName: v } : p)} />
                <ParseField icon={Phone} label="Telefon" value={parsed.contactPhone} onChange={v => setParsed(p => p ? { ...p, contactPhone: v } : p)} />
              </div>
              <ParseField icon={CheckCircle} label="Başvuru / Telefon URL" value={parsed.applyUrl} onChange={v => setParsed(p => p ? { ...p, applyUrl: v } : p)} />

              <div className="flex gap-2 pt-1">
                <button onClick={() => setIsTimed(false)}
                  className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-xl border text-xs font-medium transition-all ${!isTimed ? "border-primary bg-primary/20 text-primary" : "border-white/10 text-muted-foreground"}`}>
                  <Infinity className="w-3 h-3" /> Süresiz
                </button>
                <button onClick={() => setIsTimed(true)}
                  className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-xl border text-xs font-medium transition-all ${isTimed ? "border-accent bg-accent/20 text-accent" : "border-white/10 text-muted-foreground"}`}>
                  <Clock className="w-3 h-3" /> Süreli
                </button>
              </div>
              {isTimed && (
                <input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none" />
              )}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isFeatured} onChange={e => setIsFeatured(e.target.checked)} className="w-4 h-4 rounded accent-amber-400" />
                <span className="text-sm flex items-center gap-1"><Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" /> Öne çıkarılsın</span>
              </label>
              <Button onClick={publish} disabled={loading}
                className="w-full bg-gradient-to-r from-primary to-secondary text-white text-sm disabled:opacity-40">
                {loading ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Yayınlanıyor...</> : <><CheckCircle className="w-4 h-4 mr-2" /> İlanı Yayınla</>}
              </Button>
            </div>
          </>
        ) : (
          <div className="text-center py-6 text-green-400 font-semibold text-sm">
            <CheckCircle className="w-10 h-10 mx-auto mb-2" />
            İlan başarıyla yayınlandı!
          </div>
        )}
      </div>
    </div>
  );
}

interface AdminSupportTicket {
  id: number; subject: string; status: string; userId: number;
  username: string | null; msgCount: number; createdAt: string; updatedAt: string;
}
interface AdminSupportMessage {
  id: number; message: string; isStaff: boolean; userId: number;
  username: string | null; createdAt: string;
}
interface AdminSupportDetail extends AdminSupportTicket { messages: AdminSupportMessage[]; }

function SupportAdminSection({ apiCall, toast }: {
  apiCall: (path: string, method: string, body?: unknown) => Promise<unknown>;
  toast: (opts: { title: string; description?: string; variant?: "default" | "destructive" }) => void;
}) {
  const [tickets, setTickets] = useState<AdminSupportTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [activeTicket, setActiveTicket] = useState<AdminSupportDetail | null>(null);
  const [reply, setReply] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadTickets = async () => {
    setLoading(true);
    try {
      const path = filter === "all" ? "/admin/support" : `/admin/support?status=${filter}`;
      const data = await apiCall(path, "GET") as AdminSupportTicket[];
      setTickets(data);
    } catch {} finally { setLoading(false); }
  };

  const loadTicketDetail = async (id: number) => {
    try {
      const data = await apiCall(`/support/${id}`, "GET") as AdminSupportDetail;
      setActiveTicket(data);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch {}
  };

  const sendReply = async () => {
    if (!reply.trim() || !activeTicket) return;
    try {
      const msg = await apiCall(`/support/${activeTicket.id}/reply`, "POST", { message: reply.trim() }) as AdminSupportMessage;
      setReply("");
      setActiveTicket(prev => prev ? { ...prev, status: "answered", messages: [...prev.messages, msg] } : prev);
      loadTickets();
    } catch (e: any) { toast({ title: "Hata", description: e.message, variant: "destructive" }); }
  };

  const changeStatus = async (id: number, status: string) => {
    try {
      await apiCall(`/support/${id}/status`, "PATCH", { status });
      toast({ title: "Durum güncellendi" });
      if (activeTicket?.id === id) setActiveTicket(prev => prev ? { ...prev, status } : prev);
      loadTickets();
    } catch (e: any) { toast({ title: "Hata", description: e.message, variant: "destructive" }); }
  };

  const formatTime = (iso: string) => new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  const StatusBadge = ({ status }: { status: string }) => {
    const cfg = { waiting: "bg-amber-500/20 text-amber-400", answered: "bg-blue-500/20 text-blue-400", resolved: "bg-green-500/20 text-green-400" }[status] ?? "bg-white/10 text-muted-foreground";
    const labels = { waiting: "Bekliyor", answered: "Yanıtlandı", resolved: "Çözüldü" } as Record<string, string>;
    return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg}`}>{labels[status] ?? status}</span>;
  };

  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <button onClick={() => { loadTickets(); }}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <Headphones className="w-4 h-4 text-primary" />
          Destek Talepleri
        </div>
        <ChevronDown className="w-4 h-4 text-muted-foreground" />
      </button>

      <div className="px-4 pb-4 border-t border-white/5 pt-4 space-y-3">
        {activeTicket ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button onClick={() => setActiveTicket(null)} className="text-muted-foreground hover:text-foreground">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold line-clamp-1">{activeTicket.subject}</p>
                <p className="text-[10px] text-muted-foreground">{activeTicket.username} · #{ activeTicket.id}</p>
              </div>
              <StatusBadge status={activeTicket.status} />
            </div>

            <div className="space-y-1.5 flex gap-1 flex-wrap">
              {["waiting", "answered", "resolved"].map(s => (
                <button key={s} onClick={() => changeStatus(activeTicket.id, s)}
                  disabled={activeTicket.status === s}
                  className={`text-[10px] px-2 py-1 rounded-lg font-medium disabled:opacity-40 transition-colors ${
                    s === "waiting" ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30" :
                    s === "answered" ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30" :
                    "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                  }`}>
                  { { waiting: "Bekliyor", answered: "Yanıtlandı", resolved: "Çözüldü" }[s] }
                </button>
              ))}
            </div>

            <div className="max-h-60 overflow-y-auto space-y-2 bg-white/5 rounded-xl p-3">
              {activeTicket.messages.map(m => (
                <div key={m.id} className={`flex ${m.isStaff ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                    m.isStaff ? "bg-primary/20 text-foreground rounded-tl-sm" : "bg-white/10 text-foreground rounded-tr-sm"
                  }`}>
                    <p className="text-[9px] font-bold text-muted-foreground mb-0.5">{m.username ?? "Kullanıcı"}{m.isStaff ? " · Ekip" : ""}</p>
                    <p>{m.message}</p>
                    <p className="text-[9px] text-muted-foreground mt-0.5">{formatTime(m.createdAt)}</p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {activeTicket.status !== "resolved" && (
              <div className="flex gap-2">
                <textarea value={reply} onChange={e => setReply(e.target.value)}
                  placeholder="Yanıt yaz..."
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); }}}
                  rows={2} className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-primary/50 resize-none text-foreground placeholder:text-muted-foreground" />
                <button onClick={sendReply} disabled={!reply.trim()}
                  className="w-9 h-9 self-end rounded-xl bg-primary flex items-center justify-center disabled:opacity-40">
                  <Send className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex gap-1.5 flex-wrap">
              {[["all","Tümü"],["waiting","Bekliyor"],["answered","Yanıtlandı"],["resolved","Çözüldü"]].map(([v,l]) => (
                <button key={v} onClick={() => { setFilter(v!); }}
                  className={`text-[10px] px-2.5 py-1 rounded-full font-medium transition-colors ${filter === v ? "bg-primary text-white" : "bg-white/10 text-muted-foreground hover:bg-white/15"}`}>
                  {l}
                </button>
              ))}
              <button onClick={loadTickets} className="text-[10px] px-2.5 py-1 rounded-full bg-white/10 text-muted-foreground hover:bg-white/15 ml-auto">
                Yenile
              </button>
            </div>

            {loading ? (
              <p className="text-xs text-center text-muted-foreground py-4">Yükleniyor...</p>
            ) : tickets.length === 0 ? (
              <p className="text-xs text-center text-muted-foreground py-4">Destek talebi bulunamadı.</p>
            ) : (
              <div className="space-y-2">
                {tickets.map(t => (
                  <button key={t.id} onClick={() => loadTicketDetail(t.id)}
                    className="w-full text-left bg-white/5 hover:bg-white/10 rounded-xl p-3 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold line-clamp-1">{t.subject}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{t.username} · {t.msgCount} mesaj · {formatTime(t.updatedAt)}</p>
                      </div>
                      <StatusBadge status={t.status} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── Sohbet Yönetimi Bölümü ──────────────────────────────── */
interface ChatRule { id: number; content: string; sortOrder: number; }

function ChatManagementSection({ apiCall, toast }: {
  apiCall: (path: string, method: string, body?: unknown) => Promise<unknown>;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [rules, setRules] = useState<ChatRule[]>([]);
  const [newRule, setNewRule] = useState("");
  const [newOrder, setNewOrder] = useState("0");
  const [clearing, setClearing] = useState(false);
  const [addingRule, setAddingRule] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");

  const loadRules = async () => {
    try {
      const d = await apiCall("/admin/chat/rules", "GET") as ChatRule[];
      setRules(d ?? []);
    } catch {}
  };

  useEffect(() => { loadRules(); }, []);

  const clearChat = async () => {
    if (!confirm("Tüm sohbet mesajları silinecek. Devam?")) return;
    setClearing(true);
    try {
      await apiCall("/admin/chat/messages/all", "DELETE");
      toast({ title: "Sohbet temizlendi" });
    } catch (e: any) { toast({ title: "Hata", description: e.message, variant: "destructive" }); }
    finally { setClearing(false); }
  };

  const addRule = async () => {
    if (!newRule.trim()) { toast({ title: "İçerik zorunludur", variant: "destructive" }); return; }
    setAddingRule(true);
    try {
      const r = await apiCall("/admin/chat/rules", "POST", { content: newRule.trim(), sortOrder: parseInt(newOrder, 10) || 0 }) as ChatRule;
      setRules(prev => [...prev, r].sort((a, b) => a.sortOrder - b.sortOrder));
      setNewRule(""); setNewOrder("0");
      toast({ title: "Kural eklendi" });
    } catch (e: any) { toast({ title: "Hata", description: e.message, variant: "destructive" }); }
    finally { setAddingRule(false); }
  };

  const deleteRule = async (id: number) => {
    try {
      await apiCall(`/admin/chat/rules/${id}`, "DELETE");
      setRules(prev => prev.filter(r => r.id !== id));
      toast({ title: "Kural silindi" });
    } catch (e: any) { toast({ title: "Hata", description: e.message, variant: "destructive" }); }
  };

  const saveEdit = async (id: number) => {
    if (!editContent.trim()) return;
    try {
      await apiCall(`/admin/chat/rules/${id}`, "PATCH", { content: editContent.trim() });
      setRules(prev => prev.map(r => r.id === id ? { ...r, content: editContent.trim() } : r));
      setEditingId(null);
      toast({ title: "Kural güncellendi" });
    } catch (e: any) { toast({ title: "Hata", description: e.message, variant: "destructive" }); }
  };

  return (
    <Section title="Sohbet Yönetimi" icon={MessageSquareDot}>
      <div className="space-y-4">
        {/* Clear chat */}
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-destructive flex items-center gap-1.5"><Eraser className="w-4 h-4" /> Sohbeti Temizle</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Tüm mesajlar kalıcı olarak gizlenir.</p>
          </div>
          <button
            onClick={clearChat}
            disabled={clearing}
            className="text-xs font-semibold px-3 py-2 bg-destructive/20 text-destructive rounded-xl hover:bg-destructive/30 transition-colors disabled:opacity-50 shrink-0"
          >
            {clearing ? "Siliniyor..." : "Temizle"}
          </button>
        </div>

        {/* Chat rules */}
        <div className="bg-white/5 rounded-xl p-3 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <ListChecks className="w-3.5 h-3.5 text-primary" /> Sohbet Kuralları
          </p>

          {/* Existing rules */}
          {rules.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">Henüz kural eklenmemiş.</p>
          ) : (
            <div className="space-y-1.5">
              {rules.map((r, idx) => (
                <div key={r.id} className="flex items-start gap-2 bg-white/5 rounded-lg px-2 py-1.5">
                  <span className="text-[10px] font-bold text-primary mt-0.5 shrink-0">{idx + 1}.</span>
                  {editingId === r.id ? (
                    <div className="flex-1 flex gap-1">
                      <input
                        value={editContent}
                        onChange={e => setEditContent(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") saveEdit(r.id); if (e.key === "Escape") setEditingId(null); }}
                        autoFocus
                        className="flex-1 bg-white/10 border border-primary/30 rounded-lg px-2 py-0.5 text-xs text-foreground focus:outline-none"
                      />
                      <button onClick={() => saveEdit(r.id)} className="text-[10px] px-2 bg-primary/20 text-primary rounded-lg hover:bg-primary/30">Kaydet</button>
                      <button onClick={() => setEditingId(null)} className="text-[10px] px-1.5 bg-white/10 text-muted-foreground rounded-lg hover:bg-white/20">İptal</button>
                    </div>
                  ) : (
                    <>
                      <p className="flex-1 text-xs leading-relaxed">{r.content}</p>
                      <button onClick={() => { setEditingId(r.id); setEditContent(r.content); }} className="text-[10px] text-primary hover:text-primary/70 shrink-0">Düz</button>
                      <button onClick={() => deleteRule(r.id)} className="text-[10px] text-destructive hover:text-destructive/70 shrink-0"><Trash2 className="w-3 h-3" /></button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add new rule */}
          <div className="flex gap-1.5">
            <input
              value={newRule}
              onChange={e => setNewRule(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addRule()}
              placeholder="Yeni kural..."
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
            />
            <input
              type="number"
              value={newOrder}
              onChange={e => setNewOrder(e.target.value)}
              placeholder="Sıra"
              className="w-14 bg-white/5 border border-white/10 rounded-xl px-2 py-2 text-xs text-foreground focus:outline-none focus:border-primary/40"
            />
            <button
              onClick={addRule}
              disabled={addingRule}
              className="px-3 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,#4F46E5,#7C3AED)" }}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </Section>
  );
}

interface AdminUser {
  id: number; username: string; email: string; displayName: string | null; role: string;
  isBanned: boolean; createdAt: string; avatarUrl: string | null;
  mutedUntil: string | null; lastKnownIp: string | null; lastDeviceId: string | null;
}

function UserManagementSection({ apiCall, toast, viewerIsAdmin }: {
  apiCall: (path: string, method: string, body?: unknown) => Promise<unknown>;
  toast: ReturnType<typeof useToast>["toast"];
  viewerIsAdmin: boolean;
}) {
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [newMod, setNewMod] = useState({ username: "", email: "", password: "" });
  const [creating, setCreating] = useState(false);

  const [resetPw, setResetPw] = useState<Record<number, string>>({});
  const [resetLoading, setResetLoading] = useState<number | null>(null);
  const [editDN, setEditDN] = useState<Record<number, string>>({});
  const [dnLoading, setDnLoading] = useState<number | null>(null);
  const [muteLoading, setMuteLoading] = useState<number | null>(null);
  const [ipBanLoading, setIpBanLoading] = useState<number | null>(null);
  const [deviceBanLoading, setDeviceBanLoading] = useState<number | null>(null);

  const searchUsers = async () => {
    setLoading(true);
    try {
      const q = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
      const d = await apiCall(`/admin/users${q}`, "GET") as { users: AdminUser[] };
      setUsers(d.users ?? []);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { searchUsers(); }, []);

  const changeRole = async (id: number, role: string) => {
    try {
      await apiCall(`/admin/users/${id}/role`, "PATCH", { role });
      toast({ title: "Rol güncellendi" });
      setUsers(prev => prev.map(u => u.id === id ? { ...u, role } : u));
    } catch (e: any) { toast({ title: "Hata", description: e.message, variant: "destructive" }); }
  };

  const banUser = async (id: number, isBanned: boolean) => {
    try {
      if (isBanned) {
        await apiCall(`/admin/users/${id}/unban`, "POST");
        setUsers(prev => prev.map(u => u.id === id ? { ...u, isBanned: false } : u));
        toast({ title: "Yasak kaldırıldı" });
      } else {
        await apiCall(`/admin/users/${id}/ban`, "POST", { reason: "Admin tarafından engellendi" });
        setUsers(prev => prev.map(u => u.id === id ? { ...u, isBanned: true } : u));
        toast({ title: "Kullanıcı yasaklandı" });
      }
    } catch (e: any) { toast({ title: "Hata", description: e.message, variant: "destructive" }); }
  };

  const muteUser = async (id: number, hours?: number, days?: number) => {
    setMuteLoading(id);
    try {
      const res = await apiCall(`/admin/users/${id}/mute`, "POST", { hours, days }) as { mutedUntil: string };
      setUsers(prev => prev.map(u => u.id === id ? { ...u, mutedUntil: res.mutedUntil } : u));
      toast({ title: "Kullanıcı susturuldu" });
    } catch (e: any) { toast({ title: "Hata", description: e.message, variant: "destructive" }); }
    finally { setMuteLoading(null); }
  };

  const unmuteUser = async (id: number) => {
    setMuteLoading(id);
    try {
      await apiCall(`/admin/users/${id}/unmute`, "POST");
      setUsers(prev => prev.map(u => u.id === id ? { ...u, mutedUntil: null } : u));
      toast({ title: "Susturma kaldırıldı" });
    } catch (e: any) { toast({ title: "Hata", description: e.message, variant: "destructive" }); }
    finally { setMuteLoading(null); }
  };

  const ipBanUser = async (id: number) => {
    if (!confirm("Bu kullanıcının IP adresi kalıcı olarak yasaklanacak. Emin misiniz?")) return;
    setIpBanLoading(id);
    try {
      await apiCall(`/admin/users/${id}/ip-ban`, "POST", {});
      toast({ title: "IP adresi yasaklandı" });
    } catch (e: any) { toast({ title: "Hata", description: e.message, variant: "destructive" }); }
    finally { setIpBanLoading(null); }
  };

  const deviceBanUser = async (id: number) => {
    if (!confirm("Bu kullanıcının cihazı kalıcı olarak yasaklanacak. Emin misiniz?")) return;
    setDeviceBanLoading(id);
    try {
      await apiCall(`/admin/users/${id}/device-ban`, "POST", {});
      toast({ title: "Cihaz yasaklandı" });
    } catch (e: any) { toast({ title: "Hata", description: e.message, variant: "destructive" }); }
    finally { setDeviceBanLoading(null); }
  };

  const resetPassword = async (id: number) => {
    const pw = resetPw[id]?.trim();
    if (!pw || pw.length < 6) { toast({ title: "Şifre en az 6 karakter olmalıdır", variant: "destructive" }); return; }
    setResetLoading(id);
    try {
      await apiCall(`/admin/users/${id}/reset-password`, "POST", { newPassword: pw });
      toast({ title: "Şifre sıfırlandı" });
      setResetPw(prev => { const n = { ...prev }; delete n[id]; return n; });
    } catch (e: any) { toast({ title: "Hata", description: e.message, variant: "destructive" }); }
    finally { setResetLoading(null); }
  };

  const saveDisplayName = async (id: number) => {
    const dn = editDN[id] ?? "";
    setDnLoading(id);
    try {
      await apiCall(`/admin/users/${id}/display-name`, "PATCH", { displayName: dn.trim() || null });
      toast({ title: "İsim güncellendi" });
      setUsers(prev => prev.map(u => u.id === id ? { ...u, displayName: dn.trim() || null } : u));
      setEditDN(prev => { const n = { ...prev }; delete n[id]; return n; });
    } catch (e: any) { toast({ title: "Hata", description: e.message, variant: "destructive" }); }
    finally { setDnLoading(null); }
  };

  const createModerator = async () => {
    if (!newMod.username.trim() || !newMod.email.trim() || !newMod.password.trim()) {
      toast({ title: "Tüm alanlar zorunlu", variant: "destructive" }); return;
    }
    setCreating(true);
    try {
      await apiCall("/admin/create-staff", "POST", { ...newMod, role: "moderator" });
      toast({ title: "Moderatör oluşturuldu" });
      setNewMod({ username: "", email: "", password: "" });
      searchUsers();
    } catch (e: any) { toast({ title: "Hata", description: e.message, variant: "destructive" }); }
    finally { setCreating(false); }
  };

  const roleLabel: Record<string, string> = { admin: "Admin", moderator: "Moderatör", user: "Üye" };
  const roleBg: Record<string, string> = { admin: "text-red-400 bg-red-500/20", moderator: "text-blue-400 bg-blue-500/20", user: "text-muted-foreground bg-white/10" };

  return (
    <Section title="Kullanıcı Yönetimi" icon={Users}>
      <div className="space-y-4">
        {/* Create moderator */}
        <div className="bg-white/5 rounded-xl p-3 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-blue-400" /> Yeni Moderatör Ekle
          </p>
          <input value={newMod.username} onChange={e => setNewMod(m => ({ ...m, username: e.target.value }))}
            placeholder="Kullanıcı adı" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50" />
          <input value={newMod.email} onChange={e => setNewMod(m => ({ ...m, email: e.target.value }))}
            placeholder="E-posta" type="email" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50" />
          <input value={newMod.password} onChange={e => setNewMod(m => ({ ...m, password: e.target.value }))}
            placeholder="Şifre" type="password" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50" />
          <button onClick={createModerator} disabled={creating}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: "linear-gradient(135deg,#3B82F6,#2563EB)" }}>
            {creating ? "Oluşturuluyor..." : "Moderatör Oluştur"}
          </button>
        </div>

        {/* Search */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === "Enter" && searchUsers()}
              placeholder="Kullanıcı ara..." className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50" />
          </div>
          <button onClick={searchUsers} disabled={loading}
            className="px-3 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg,#4F46E5,#7C3AED)" }}>
            Ara
          </button>
        </div>

        {/* User list */}
        <div className="space-y-2">
          {loading ? (
            <div className="flex justify-center py-4"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
          ) : users.length === 0 ? (
            <p className="text-xs text-center text-muted-foreground py-4">Kullanıcı bulunamadı</p>
          ) : users.map(u => {
            const isMuted = !!u.mutedUntil && new Date(u.mutedUntil) > new Date();
            return (
              <div key={u.id} className={`bg-white/5 rounded-xl p-3 space-y-2 ${u.isBanned ? "opacity-60" : ""}`}>
                {/* Header row */}
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold shrink-0">
                    {u.username.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-semibold truncate">{u.displayName || u.username}</p>
                      {u.displayName && <p className="text-[10px] text-muted-foreground">@{u.username}</p>}
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${roleBg[u.role] ?? "bg-white/10 text-muted-foreground"}`}>
                        {roleLabel[u.role] ?? u.role}
                      </span>
                      {u.isBanned && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-destructive/20 text-destructive">Yasaklı</span>}
                      {isMuted && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400">Susturulmuş</span>}
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">{u.email}</p>
                    {u.lastKnownIp && viewerIsAdmin && (
                      <p className="text-[9px] text-muted-foreground/60 truncate">IP: {u.lastKnownIp}</p>
                    )}
                  </div>
                </div>

                {/* Display name edit */}
                <div className="flex gap-1.5">
                  <input
                    value={editDN[u.id] ?? u.displayName ?? ""}
                    onChange={e => setEditDN(prev => ({ ...prev, [u.id]: e.target.value }))}
                    placeholder="Sohbet adı (displayName)"
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
                  />
                  <button
                    onClick={() => saveDisplayName(u.id)}
                    disabled={dnLoading === u.id}
                    className="text-[10px] px-2 py-1 bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors disabled:opacity-50"
                  >
                    {dnLoading === u.id ? "..." : "Kaydet"}
                  </button>
                </div>

                {/* Password reset */}
                <div className="flex gap-1.5">
                  <input
                    type="password"
                    value={resetPw[u.id] ?? ""}
                    onChange={e => setResetPw(prev => ({ ...prev, [u.id]: e.target.value }))}
                    placeholder="Yeni şifre (en az 6 karakter)"
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-500/40"
                  />
                  <button
                    onClick={() => resetPassword(u.id)}
                    disabled={resetLoading === u.id}
                    className="text-[10px] px-2 py-1 bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 transition-colors disabled:opacity-50 flex items-center gap-0.5"
                  >
                    <Lock className="w-3 h-3" />
                    {resetLoading === u.id ? "..." : "Şifre"}
                  </button>
                </div>

                {/* Mute row (admin + moderator, non-admin targets only) */}
                {u.role !== "admin" && (
                  <div className="flex gap-1 flex-wrap">
                    {isMuted ? (
                      <button onClick={() => unmuteUser(u.id)} disabled={muteLoading === u.id}
                        className="text-[10px] px-2 py-1 bg-orange-500/20 text-orange-400 rounded-lg hover:bg-orange-500/30 transition-colors flex items-center gap-0.5 disabled:opacity-50">
                        {muteLoading === u.id ? "..." : "Susturmayı Kaldır"}
                      </button>
                    ) : (
                      <>
                        <span className="text-[9px] text-muted-foreground self-center pr-0.5">Sustir:</span>
                        {[{ label: "1s", hours: 1 }, { label: "8s", hours: 8 }, { label: "24s", hours: 24 }, { label: "7g", days: 7 }].map(opt => (
                          <button key={opt.label}
                            onClick={() => muteUser(u.id, opt.hours, opt.days)}
                            disabled={muteLoading === u.id}
                            className="text-[10px] px-2 py-1 bg-orange-500/10 text-orange-400 rounded-lg hover:bg-orange-500/20 transition-colors disabled:opacity-50">
                            {muteLoading === u.id ? "..." : opt.label}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}

                {/* Role + ban + IP/device ban buttons */}
                {u.role !== "admin" && (
                  <div className="flex gap-1.5 flex-wrap">
                    {u.role !== "moderator" ? (
                      <button onClick={() => changeRole(u.id, "moderator")}
                        className="text-[10px] px-2 py-1 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors flex items-center gap-0.5">
                        <Shield className="w-3 h-3" /> Mod Yap
                      </button>
                    ) : (
                      <button onClick={() => changeRole(u.id, "user")}
                        className="text-[10px] px-2 py-1 bg-white/10 text-muted-foreground rounded-lg hover:bg-white/20 transition-colors flex items-center gap-0.5">
                        <User className="w-3 h-3" /> Üye Yap
                      </button>
                    )}
                    <button onClick={() => banUser(u.id, u.isBanned)}
                      className={`text-[10px] px-2 py-1 rounded-lg transition-colors flex items-center gap-0.5 ${u.isBanned ? "bg-green-500/20 text-green-400 hover:bg-green-500/30" : "bg-destructive/20 text-destructive hover:bg-destructive/30"}`}>
                      {u.isBanned ? <><CheckCircle className="w-3 h-3" /> Yasağı Kaldır</> : <><XCircle className="w-3 h-3" /> Yasakla</>}
                    </button>
                    {viewerIsAdmin && (
                      <>
                        <button onClick={() => ipBanUser(u.id)} disabled={ipBanLoading === u.id || !u.lastKnownIp}
                          title={u.lastKnownIp ? `IP: ${u.lastKnownIp}` : "IP henüz bilinmiyor"}
                          className="text-[10px] px-2 py-1 bg-red-900/30 text-red-400 rounded-lg hover:bg-red-900/50 transition-colors flex items-center gap-0.5 disabled:opacity-40">
                          <Shield className="w-3 h-3" /> {ipBanLoading === u.id ? "..." : "IP Ban"}
                        </button>
                        <button onClick={() => deviceBanUser(u.id)} disabled={deviceBanLoading === u.id || !u.lastDeviceId}
                          title={u.lastDeviceId ? "Cihaz kimliği biliniyor" : "Cihaz kimliği henüz bilinmiyor"}
                          className="text-[10px] px-2 py-1 bg-red-900/30 text-red-400 rounded-lg hover:bg-red-900/50 transition-colors flex items-center gap-0.5 disabled:opacity-40">
                          <Lock className="w-3 h-3" /> {deviceBanLoading === u.id ? "..." : "Cihaz Ban"}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

interface PTWorker {
  id: number; userId: number; fullName: string; age: number; isRetired: boolean;
  gender: string; phone: string; city: string; district: string; hasVehicle: string;
  description: string | null; photoUrl: string | null; isFeatured: boolean;
  isBanned: boolean; status: string; createdAt: string;
}

function PartTimeAdminSection({ apiCall, toast }: {
  apiCall: (path: string, method?: string, body?: unknown) => Promise<unknown>;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const { data: workers, loading, refetch } = useAdminApi<PTWorker[]>("/admin/parttime");

  const handleFeature = async (id: number, current: boolean) => {
    try {
      await apiCall(`/parttime/${id}/feature`, "POST");
      toast({ title: current ? "Öne çıkarma kaldırıldı" : "Öne çıkarıldı" });
      refetch();
    } catch { toast({ title: "Hata", variant: "destructive" }); }
  };

  const handleBan = async (id: number, currentlyBanned: boolean) => {
    try {
      const reason = !currentlyBanned ? (prompt("Yasaklama sebebi:") || "Kural ihlali") : "";
      await apiCall(`/parttime/${id}/ban`, "POST", { ban: !currentlyBanned, reason });
      toast({ title: currentlyBanned ? "Yasak kaldırıldı" : "Yasaklandı" });
      refetch();
    } catch { toast({ title: "Hata", variant: "destructive" }); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Bu kaydı silmek istediğinize emin misiniz?")) return;
    try {
      await apiCall(`/parttime/${id}`, "DELETE");
      toast({ title: "Kayıt silindi" });
      refetch();
    } catch { toast({ title: "Hata", variant: "destructive" }); }
  };

  return (
    <Section title="Part Time Yönetimi" icon={Clock}>
      {loading && <p className="text-xs text-muted-foreground py-2">Yükleniyor...</p>}
      {!loading && !workers?.length && <p className="text-xs text-muted-foreground py-2 text-center">Henüz kayıt yok</p>}
      <div className="space-y-2">
        {workers?.map(w => (
          <div key={w.id} className={`rounded-xl p-3 space-y-2 ${w.isBanned ? "bg-red-500/10 border border-red-500/20" : "bg-white/5"}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-semibold">{w.fullName}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${w.gender === "Bayan" ? "bg-pink-500/20 text-pink-300" : "bg-blue-500/20 text-blue-300"}`}>{w.gender}</span>
                  {w.isRetired && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-medium">Emekli</span>}
                  {w.isFeatured && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium">Öne Çıkan</span>}
                  {w.isBanned && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 font-medium">Yasaklı</span>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {w.age} yaş · {w.city}/{w.district} · {w.hasVehicle} · {w.phone}
                </p>
                {w.description && <p className="text-[11px] text-foreground/60 line-clamp-1 mt-0.5">{w.description}</p>}
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Kayıt: {new Date(w.createdAt).toLocaleDateString("tr-TR")} · ID:{w.id}
                </p>
              </div>
              {w.photoUrl && <img src={w.photoUrl} className="w-12 h-12 rounded-lg object-cover ring-1 ring-white/10 shrink-0" alt="" />}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              <button onClick={() => handleFeature(w.id, w.isFeatured)}
                className={`text-[10px] flex items-center gap-0.5 px-2 py-1 rounded-lg transition-colors ${w.isFeatured ? "bg-amber-500/20 text-amber-400" : "bg-white/10 text-muted-foreground hover:bg-white/20"}`}>
                {w.isFeatured ? <><StarOff className="w-3 h-3" /> Öne çıkarmayı kaldır</> : <><Star className="w-3 h-3" /> Öne çıkar</>}
              </button>
              <button onClick={() => handleBan(w.id, w.isBanned)}
                className={`text-[10px] flex items-center gap-0.5 px-2 py-1 rounded-lg transition-colors ${w.isBanned ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                {w.isBanned ? <><CheckCircle className="w-3 h-3" /> Yasağı Kaldır</> : <><XCircle className="w-3 h-3" /> Yasakla</>}
              </button>
              <button onClick={() => handleDelete(w.id)} className="text-[10px] flex items-center gap-0.5 px-2 py-1 bg-destructive/10 text-destructive/80 rounded-lg hover:bg-destructive/20 transition-colors ml-auto">
                <Trash2 className="w-3 h-3" /> Sil
              </button>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── İlan Kaynakları ───────────────────────────────────────────────
interface Source {
  id: number; name: string; platform: string; url: string;
  active: boolean; checkInterval: number; autoPublish: boolean;
  requireApproval: boolean; lastCheckedAt: string | null;
  lastError: string | null; totalImported: number; createdAt: string;
}

type TgAuthStateType = "disconnected" | "awaiting_code" | "awaiting_password" | "connected";

function TelegramAuthSection({ apiCall, toast }: { apiCall: (path: string, method?: string, body?: unknown) => Promise<unknown>; toast: ReturnType<typeof useToast>["toast"] }) {
  const [state, setState] = useState<TgAuthStateType>("disconnected");
  const [phone, setPhone] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [passInput, setPassInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  const loadStatus = async () => {
    try {
      const d = await apiCall("/admin/telegram/status") as { state: TgAuthStateType; phone: string | null; connected: boolean };
      setState(d.state ?? "disconnected");
      setPhone(d.phone);
    } catch { /* ignore */ } finally { setChecking(false); }
  };

  useEffect(() => { void loadStatus(); }, []);

  const sendCode = async () => {
    if (!phoneInput.trim()) return;
    setLoading(true);
    try {
      await apiCall("/admin/telegram/auth/start", "POST", { phone: phoneInput.trim() });
      toast({ title: "Kod gönderildi", description: "Telegram'dan gelen kodu girin" });
      setState("awaiting_code");
      setPhone(phoneInput.trim());
    } catch (e: unknown) { toast({ title: "Hata", description: (e as Error).message, variant: "destructive" }); }
    finally { setLoading(false); }
  };

  const verifyCode = async () => {
    if (!codeInput.trim()) return;
    setLoading(true);
    try {
      const r = await apiCall("/admin/telegram/auth/verify", "POST", { code: codeInput.trim() }) as { needs2FA: boolean };
      if (r.needs2FA) {
        setState("awaiting_password");
        toast({ title: "2FA gerekli", description: "Telegram şifrenizi girin" });
      } else {
        setState("connected");
        toast({ title: "Telegram bağlantısı kuruldu" });
      }
      setCodeInput("");
    } catch (e: unknown) { toast({ title: "Hata", description: (e as Error).message, variant: "destructive" }); }
    finally { setLoading(false); }
  };

  const verifyPassword = async () => {
    if (!passInput) return;
    setLoading(true);
    try {
      await apiCall("/admin/telegram/auth/password", "POST", { password: passInput });
      setState("connected");
      setPassInput("");
      toast({ title: "Telegram bağlantısı kuruldu" });
    } catch (e: unknown) { toast({ title: "Hata", description: (e as Error).message, variant: "destructive" }); }
    finally { setLoading(false); }
  };

  const doLogout = async () => {
    setLoading(true);
    try {
      await apiCall("/admin/telegram/auth/logout", "POST");
      setState("disconnected");
      setPhone(null);
      toast({ title: "Telegram bağlantısı kesildi" });
    } catch (e: unknown) { toast({ title: "Hata", description: (e as Error).message, variant: "destructive" }); }
    finally { setLoading(false); }
  };

  if (checking) return null;

  return (
    <Section title="Telegram Hesabı" icon={Radio}>
      {state === "connected" ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl p-3">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <div className="flex-1 text-xs text-green-300">
              <strong>Bağlı</strong>{phone && ` — ${phone}`}
              <p className="text-[10px] text-green-400/70 mt-0.5">Tüm kanallar ve özel gruplar taranabilir</p>
            </div>
          </div>
          <Button onClick={doLogout} disabled={loading} size="sm" variant="outline" className="text-xs h-8 border-destructive/30 text-destructive hover:bg-destructive/10 w-full">
            Bağlantıyı Kes
          </Button>
        </div>
      ) : state === "awaiting_code" ? (
        <div className="space-y-3">
          <div className="flex items-start gap-2 bg-primary/10 border border-primary/20 rounded-xl p-3">
            <Radio className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <p className="text-xs text-primary/80">{phone} numarasına Telegram'dan doğrulama kodu gönderildi</p>
          </div>
          <Input value={codeInput} onChange={e => setCodeInput(e.target.value)} placeholder="Telegram'dan gelen kod (örn: 12345)" className="h-9 text-sm bg-white/5 border-white/10 tracking-widest" inputMode="numeric" onKeyDown={e => e.key === "Enter" && void verifyCode()} />
          <div className="flex gap-2">
            <Button onClick={verifyCode} disabled={loading || !codeInput.trim()} size="sm" className="flex-1 text-xs h-8 bg-gradient-to-r from-primary to-secondary">
              {loading ? "Doğrulanıyor…" : "Kodu Doğrula"}
            </Button>
            <Button onClick={() => { setState("disconnected"); setCodeInput(""); }} size="sm" variant="outline" className="text-xs h-8 border-white/10">İptal</Button>
          </div>
        </div>
      ) : state === "awaiting_password" ? (
        <div className="space-y-3">
          <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
            <Lock className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-300">İki adımlı doğrulama (2FA) etkin. Telegram şifrenizi girin.</p>
          </div>
          <Input type="password" value={passInput} onChange={e => setPassInput(e.target.value)} placeholder="Telegram 2FA şifresi" className="h-9 text-sm bg-white/5 border-white/10" onKeyDown={e => e.key === "Enter" && void verifyPassword()} />
          <Button onClick={verifyPassword} disabled={loading || !passInput} size="sm" className="w-full text-xs h-8 bg-gradient-to-r from-primary to-secondary">
            {loading ? "Doğrulanıyor…" : "Şifreyi Doğrula"}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-start gap-2 bg-white/5 border border-white/10 rounded-xl p-3">
            <Radio className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-xs text-muted-foreground">
              Kendi Telegram hesabınızla giriş yapın. Üye olduğunuz <strong>tüm gruplar ve kanallardan</strong> (özel dahil) ilan çekilebilir.
            </div>
          </div>
          <div className="flex gap-2">
            <Input value={phoneInput} onChange={e => setPhoneInput(e.target.value)} placeholder="+90 5XX XXX XX XX" className="h-9 text-sm bg-white/5 border-white/10 flex-1" inputMode="tel" onKeyDown={e => e.key === "Enter" && void sendCode()} />
            <Button onClick={sendCode} disabled={loading || !phoneInput.trim()} size="sm" className="text-xs h-9 px-4 bg-gradient-to-r from-primary to-secondary whitespace-nowrap">
              {loading ? "Gönderiliyor…" : "Kod Gönder"}
            </Button>
          </div>
        </div>
      )}
    </Section>
  );
}

function SourcesSection({ apiCall, toast }: { apiCall: (path: string, method?: string, body?: unknown) => Promise<unknown>; toast: ReturnType<typeof useToast>["toast"] }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [telegramTokenSet, setTelegramTokenSet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const defaultForm = { name: "", platform: "telegram", url: "", active: true, checkInterval: 15, autoPublish: false, requireApproval: true };
  const [form, setForm] = useState<typeof defaultForm>(defaultForm);

  const load = async () => {
    setLoading(true);
    try {
      const d = await apiCall("/admin/sources") as { sources: Source[]; telegramTokenSet: boolean };
      setSources(d.sources ?? []);
      setTelegramTokenSet(d.telegramTokenSet ?? false);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const saveSource = async () => {
    if (!form.name.trim() || !form.url.trim()) { toast({ title: "Hata", description: "Ad ve URL zorunlu", variant: "destructive" }); return; }
    try {
      if (editingId) {
        await apiCall(`/admin/sources/${editingId}`, "PATCH", form);
        toast({ title: "Kaynak güncellendi" });
      } else {
        await apiCall("/admin/sources", "POST", form);
        toast({ title: "Kaynak eklendi" });
      }
      setForm(defaultForm); setEditingId(null); setShowAddForm(false);
      void load();
    } catch (e: unknown) { toast({ title: "Hata", description: (e as Error).message, variant: "destructive" }); }
  };

  const toggleActive = async (id: number) => {
    try {
      const r = await apiCall(`/admin/sources/${id}/toggle`, "POST") as { active: boolean };
      setSources(ss => ss.map(s => s.id === id ? { ...s, active: r.active } : s));
    } catch (e: unknown) { toast({ title: "Hata", description: (e as Error).message, variant: "destructive" }); }
  };

  const deleteSource = async (id: number) => {
    if (!confirm("Bu kaynağı silmek istediğinizden emin misiniz?")) return;
    try { await apiCall(`/admin/sources/${id}`, "DELETE"); void load(); toast({ title: "Kaynak silindi" }); }
    catch (e: unknown) { toast({ title: "Hata", description: (e as Error).message, variant: "destructive" }); }
  };

  const [resetting, setResetting] = useState(false);
  const [reparsing, setReparsing] = useState(false);

  const resetBots = async () => {
    if (!confirm("Botlar sıfırlanacak: içe aktarma geçmişi ve bekleyen (onaylanmamış) ilanlar silinip tüm kanallar yeniden taranacak. Yayındaki ilanlar SİLİNMEZ ve aynı ilanlar tekrar eklenmez. Devam edilsin mi?")) return;
    setResetting(true);
    try {
      const r = await apiCall("/admin/sources/reset", "POST") as { message?: string };
      toast({ title: "Botlar sıfırlandı", description: r.message ?? "Yeniden tarama başlatıldı." });
      void load();
    } catch (e: unknown) { toast({ title: "Hata", description: (e as Error).message, variant: "destructive" }); }
    finally { setResetting(false); }
  };

  const reparseListings = async () => {
    setReparsing(true);
    try {
      const r = await apiCall("/admin/sources/reparse", "POST") as { message?: string };
      toast({ title: "İlanlar yeniden kontrol edildi", description: r.message ?? "Tamamlandı." });
    } catch (e: unknown) { toast({ title: "Hata", description: (e as Error).message, variant: "destructive" }); }
    finally { setReparsing(false); }
  };

  const startEdit = (s: Source) => {
    setForm({ name: s.name, platform: s.platform, url: s.url, active: s.active, checkInterval: s.checkInterval, autoPublish: s.autoPublish, requireApproval: s.requireApproval });
    setEditingId(s.id); setShowAddForm(true);
  };

  const INTERVALS = [{ v: 1, l: "1 dakika" }, { v: 5, l: "5 dakika" }, { v: 15, l: "15 dakika" }, { v: 30, l: "30 dakika" }, { v: 60, l: "1 saat" }];

  return (
    <Section title="İlan Kaynakları" icon={Radio}>
      <div className="flex items-start gap-2 bg-primary/10 border border-primary/20 rounded-xl p-3 mb-4">
        <Radio className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <div className="text-xs text-primary/80">
          Telegram için bot gerekmez. <strong>Herkese açık</strong> kanal veya grup linkini ekleyin, sistem otomatik tarar. Örnek: <code className="bg-white/10 px-1 rounded">https://t.me/kanal_adi</code>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <button onClick={resetBots} disabled={resetting} className="flex items-center justify-center gap-1.5 text-xs px-3 py-2 bg-amber-500/15 text-amber-300 rounded-lg hover:bg-amber-500/25 transition-colors disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${resetting ? "animate-spin" : ""}`} /> {resetting ? "Sıfırlanıyor…" : "Botları Sıfırla"}
        </button>
        <button onClick={reparseListings} disabled={reparsing} className="flex items-center justify-center gap-1.5 text-xs px-3 py-2 bg-primary/15 text-primary rounded-lg hover:bg-primary/25 transition-colors disabled:opacity-50">
          <ListChecks className={`w-3.5 h-3.5 ${reparsing ? "animate-pulse" : ""}`} /> {reparsing ? "Kontrol ediliyor…" : "İlanları Yeniden Kontrol Et"}
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground mb-3 leading-relaxed">
        <strong>Botları Sıfırla:</strong> içe aktarma geçmişini temizler ve kanalları baştan tarar (yayındaki ilanlar silinmez, mükerrer ilan eklenmez). <strong>Yeniden Kontrol Et:</strong> içe aktarılan ilanları tekrar okuyup eksik maaş/cinsiyet bilgisini doldurur.
      </p>

      <div className="flex justify-between items-center mb-3">
        <span className="text-xs text-muted-foreground">{sources.length} kaynak</span>
        <button onClick={() => { setForm(defaultForm); setEditingId(null); setShowAddForm(s => !s); }} className="flex items-center gap-1 text-xs px-3 py-1.5 bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors">
          <Plus className="w-3 h-3" /> Kaynak Ekle
        </button>
      </div>

      {showAddForm && (
        <div className="bg-white/5 rounded-xl p-3 mb-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground">{editingId ? "Kaynağı Düzenle" : "Yeni Kaynak"}</p>
          <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Kaynak adı" className="h-8 text-sm bg-white/5 border-white/10" />
          <div className="grid grid-cols-2 gap-2">
            <Select value={form.platform} onValueChange={v => setForm(f => ({ ...f, platform: v }))}>
              <SelectTrigger className="h-8 text-xs bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="telegram">Telegram</SelectItem>
                <SelectItem value="facebook">Facebook</SelectItem>
              </SelectContent>
            </Select>
            <Select value={String(form.checkInterval)} onValueChange={v => setForm(f => ({ ...f, checkInterval: Number(v) }))}>
              <SelectTrigger className="h-8 text-xs bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {INTERVALS.map(i => <SelectItem key={i.v} value={String(i.v)}>{i.l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder={form.platform === "telegram" ? "https://t.me/kanal_adi" : "https://facebook.com/sayfaadi"} className="h-8 text-sm bg-white/5 border-white/10" />
          <div className="flex gap-4 flex-wrap">
            <label className="flex items-center gap-1.5 cursor-pointer text-xs">
              <input type="checkbox" checked={form.autoPublish} onChange={e => setForm(f => ({ ...f, autoPublish: e.target.checked }))} className="w-3.5 h-3.5 rounded accent-primary" />
              <Zap className="w-3 h-3 text-amber-400" /> Otomatik yayınla
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer text-xs">
              <input type="checkbox" checked={form.requireApproval} onChange={e => setForm(f => ({ ...f, requireApproval: e.target.checked }))} className="w-3.5 h-3.5 rounded accent-primary" />
              <Shield className="w-3 h-3 text-primary" /> Admin onayı
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer text-xs">
              <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} className="w-3.5 h-3.5 rounded accent-green-400" />
              Aktif
            </label>
          </div>
          {form.platform === "facebook" && (
            <div className="flex items-start gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg p-2">
              <AlertCircle className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
              <p className="text-[10px] text-blue-300">Facebook kaynaklarını çekmek için Meta erişim tokenı gereklidir. <code className="bg-white/10 px-0.5 rounded">FACEBOOK_ACCESS_TOKEN</code> ortam değişkeni ayarlanmamışsa bu kaynak pasif kalır.</p>
            </div>
          )}
          <div className="flex gap-2">
            <Button onClick={saveSource} size="sm" className="flex-1 text-xs h-8 bg-gradient-to-r from-primary to-secondary">{editingId ? "Güncelle" : "Ekle"}</Button>
            <Button onClick={() => { setShowAddForm(false); setEditingId(null); }} size="sm" variant="outline" className="text-xs h-8 border-white/10">İptal</Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-muted-foreground text-center py-4">Yükleniyor…</p>
      ) : sources.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">Henüz kaynak eklenmemiş</p>
      ) : (
        <div className="space-y-2">
          {sources.map(s => (
            <div key={s.id} className="bg-white/5 rounded-xl p-3">
              <div className="flex items-start gap-2">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${s.platform === "telegram" ? "bg-sky-500/20 text-sky-400" : "bg-blue-600/20 text-blue-400"}`}>
                  {s.platform === "telegram" ? <Radio className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{s.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${s.active ? "bg-green-500/20 text-green-400" : "bg-white/10 text-muted-foreground"}`}>{s.active ? "Aktif" : "Pasif"}</span>
                    {s.autoPublish && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400"><Zap className="w-2.5 h-2.5 inline" /> Oto</span>}
                    {s.requireApproval && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary"><Shield className="w-2.5 h-2.5 inline" /> Onay</span>}
                  </div>
                  <a href={s.url} target="_blank" rel="noreferrer" className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-0.5 truncate mt-0.5">
                    <Link className="w-2.5 h-2.5 shrink-0" />{s.url}
                  </a>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{s.checkInterval}dk</span>
                    <span className="text-[10px] text-muted-foreground">{s.totalImported} ilan çekildi</span>
                    {s.lastCheckedAt && <span className="text-[10px] text-muted-foreground">Son: {new Date(s.lastCheckedAt).toLocaleString("tr-TR")}</span>}
                  </div>
                  {s.lastError && (
                    <div className="flex items-start gap-1 mt-1 bg-destructive/10 rounded p-1.5">
                      <AlertCircle className="w-3 h-3 text-destructive shrink-0 mt-0.5" />
                      <p className="text-[10px] text-destructive">{s.lastError}</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-1.5 mt-2 flex-wrap">
                <button onClick={() => toggleActive(s.id)} className={`text-[10px] flex items-center gap-0.5 px-2 py-1 rounded-lg transition-colors ${s.active ? "bg-white/10 text-muted-foreground hover:bg-white/20" : "bg-green-500/20 text-green-400 hover:bg-green-500/30"}`}>
                  {s.active ? <><ToggleRight className="w-3 h-3" /> Pasif yap</> : <><ToggleLeft className="w-3 h-3" /> Aktif yap</>}
                </button>
                <button onClick={() => startEdit(s)} className="text-[10px] flex items-center gap-0.5 px-2 py-1 bg-white/10 text-muted-foreground rounded-lg hover:bg-white/20 transition-colors">
                  <Edit2 className="w-3 h-3" /> Düzenle
                </button>
                <button onClick={() => deleteSource(s.id)} className="text-[10px] flex items-center gap-0.5 px-2 py-1 bg-destructive/10 text-destructive/80 rounded-lg hover:bg-destructive/20 transition-colors ml-auto">
                  <Trash2 className="w-3 h-3" /> Sil
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ── Bekleyen İlanlar ──────────────────────────────────────────────
interface PendingJob {
  id: number; sourceId: number; sourceName: string; platform: string;
  title: string | null; company: string | null; city: string | null;
  salary: string | null; phone: string | null; description: string | null;
  applicationUrl: string | null; sourceUrl: string | null;
  status: string; rawText: string; createdAt: string;
}

function PendingJobsSection({ apiCall, toast }: { apiCall: (path: string, method?: string, body?: unknown) => Promise<unknown>; toast: ReturnType<typeof useToast>["toast"] }) {
  const [jobs, setJobs] = useState<PendingJob[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [statusFilter, setStatusFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [editingJob, setEditingJob] = useState<PendingJob | null>(null);
  const [editForm, setEditForm] = useState<{ title: string; company: string; city: string; salary: string; phone: string; description: string; applicationUrl: string }>({ title: "", company: "", city: "", salary: "", phone: "", description: "", applicationUrl: "" });
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = async (status = statusFilter) => {
    setLoading(true);
    try {
      const [d, c] = await Promise.all([
        apiCall(`/admin/pending-jobs?status=${status}`) as Promise<PendingJob[]>,
        apiCall("/admin/pending-jobs/counts") as Promise<Record<string, number>>,
      ]);
      setJobs(d ?? []); setCounts(c ?? {});
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [statusFilter]);

  const approve = async (id: number) => {
    try { await apiCall(`/admin/pending-jobs/${id}/approve`, "POST"); toast({ title: "İlan yayınlandı" }); void load(); }
    catch (e: unknown) { toast({ title: "Hata", description: (e as Error).message, variant: "destructive" }); }
  };

  const reject = async (id: number) => {
    try { await apiCall(`/admin/pending-jobs/${id}/reject`, "POST"); toast({ title: "İlan reddedildi" }); void load(); }
    catch (e: unknown) { toast({ title: "Hata", description: (e as Error).message, variant: "destructive" }); }
  };

  const saveEdit = async () => {
    if (!editingJob) return;
    try {
      await apiCall(`/admin/pending-jobs/${editingJob.id}`, "PATCH", editForm);
      toast({ title: "İlan güncellendi" });
      setEditingJob(null); void load();
    } catch (e: unknown) { toast({ title: "Hata", description: (e as Error).message, variant: "destructive" }); }
  };

  const startEdit = (job: PendingJob) => {
    setEditForm({ title: job.title ?? "", company: job.company ?? "", city: job.city ?? "", salary: job.salary ?? "", phone: job.phone ?? "", description: job.description ?? job.rawText, applicationUrl: job.applicationUrl ?? "" });
    setEditingJob(job);
  };

  const STATUS_TABS = [
    { v: "pending", l: "Bekleyenler" }, { v: "published", l: "Yayınlandı" },
    { v: "rejected", l: "Reddedildi" },
  ];

  const platformBadge = (platform: string) => platform === "telegram"
    ? <span className="text-[9px] px-1 py-0.5 bg-sky-500/20 text-sky-400 rounded-full"><Radio className="w-2 h-2 inline" /> Telegram</span>
    : <span className="text-[9px] px-1 py-0.5 bg-blue-600/20 text-blue-400 rounded-full"><Globe className="w-2 h-2 inline" /> Facebook</span>;

  return (
    <Section title="Bekleyen İlanlar" icon={ListChecks}>
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {STATUS_TABS.map(t => (
          <button key={t.v} onClick={() => { setStatusFilter(t.v); void load(t.v); }} className={`flex items-center gap-1 whitespace-nowrap text-xs px-3 py-1.5 rounded-lg transition-colors ${statusFilter === t.v ? "bg-primary/30 text-primary font-medium" : "bg-white/5 text-muted-foreground hover:bg-white/10"}`}>
            {t.l}
            {counts[t.v] !== undefined && <span className="bg-white/10 px-1.5 py-0.5 rounded-full text-[10px]">{counts[t.v]}</span>}
          </button>
        ))}
      </div>

      {editingJob && (
        <div className="bg-white/5 rounded-xl p-3 mb-4 space-y-2 border border-primary/20">
          <p className="text-xs font-semibold text-primary">İlanı Düzenle — #{editingJob.id}</p>
          <div className="grid grid-cols-2 gap-2">
            <Input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} placeholder="Başlık" className="h-8 text-xs bg-white/5 border-white/10" />
            <Input value={editForm.company} onChange={e => setEditForm(f => ({ ...f, company: e.target.value }))} placeholder="Firma" className="h-8 text-xs bg-white/5 border-white/10" />
            <Input value={editForm.city} onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))} placeholder="Şehir" className="h-8 text-xs bg-white/5 border-white/10" />
            <Input value={editForm.salary} onChange={e => setEditForm(f => ({ ...f, salary: e.target.value }))} placeholder="Maaş" className="h-8 text-xs bg-white/5 border-white/10" />
            <Input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} placeholder="Telefon" className="h-8 text-xs bg-white/5 border-white/10" />
            <Input value={editForm.applicationUrl} onChange={e => setEditForm(f => ({ ...f, applicationUrl: e.target.value }))} placeholder="Başvuru linki" className="h-8 text-xs bg-white/5 border-white/10" />
          </div>
          <Textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} placeholder="Açıklama" rows={4} className="text-xs bg-white/5 border-white/10 resize-none" />
          <div className="flex gap-2">
            <Button onClick={saveEdit} size="sm" className="flex-1 text-xs h-8 bg-primary/20 text-primary hover:bg-primary/30">Kaydet</Button>
            <Button onClick={() => setEditingJob(null)} size="sm" variant="outline" className="text-xs h-8 border-white/10">İptal</Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-muted-foreground text-center py-4">Yükleniyor…</p>
      ) : jobs.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">Bu durumda ilan yok</p>
      ) : (
        <div className="space-y-2">
          {jobs.map(job => (
            <div key={job.id} className="bg-white/5 rounded-xl overflow-hidden">
              <div className="p-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{job.title ?? "Başlık çıkarılamadı"}</span>
                      {platformBadge(job.platform)}
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${job.status === "pending" ? "bg-amber-500/20 text-amber-400" : job.status === "published" ? "bg-green-500/20 text-green-400" : "bg-destructive/20 text-destructive"}`}>
                        {job.status === "pending" ? "Bekliyor" : job.status === "published" ? "Yayında" : "Reddedildi"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {job.city && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{job.city}</span>}
                      {job.salary && <span className="text-[10px] text-muted-foreground">{job.salary}</span>}
                      {job.phone && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Phone className="w-2.5 h-2.5" />{job.phone}</span>}
                      <span className="text-[10px] text-muted-foreground">{job.sourceName}</span>
                    </div>
                  </div>
                  <button onClick={() => setExpandedId(expandedId === job.id ? null : job.id)} className="shrink-0 text-muted-foreground hover:text-foreground">
                    {expandedId === job.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>

                {expandedId === job.id && (
                  <div className="mt-2 pt-2 border-t border-white/5">
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-6">{job.rawText}</p>
                    {job.sourceUrl && (
                      <a href={job.sourceUrl} target="_blank" rel="noreferrer" className="text-[10px] text-primary flex items-center gap-0.5 mt-1 hover:underline">
                        <ExternalLink className="w-2.5 h-2.5" /> Kaynağa git
                      </a>
                    )}
                  </div>
                )}

                {job.status === "pending" && (
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    <button onClick={() => approve(job.id)} className="text-[10px] flex items-center gap-0.5 px-2 py-1 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors">
                      <CheckCircle className="w-3 h-3" /> Onayla & Yayınla
                    </button>
                    <button onClick={() => startEdit(job)} className="text-[10px] flex items-center gap-0.5 px-2 py-1 bg-white/10 text-muted-foreground rounded-lg hover:bg-white/20 transition-colors">
                      <Edit2 className="w-3 h-3" /> Düzenle
                    </button>
                    <button onClick={() => reject(job.id)} className="text-[10px] flex items-center gap-0.5 px-2 py-1 bg-destructive/10 text-destructive/80 rounded-lg hover:bg-destructive/20 transition-colors ml-auto">
                      <XCircle className="w-3 h-3" /> Reddet
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

export default function AdminDashboard() {
  const { user, isAdmin, isLoading } = useAuth();
  const { toast } = useToast();

  const { data: stats, refetch: refetchStats } = useAdminApi<{
    totalUsers: number; onlineUsers: number; totalListings: number;
    todayListings: number; totalMessages: number; bannedUsers: number; pendingListings: number;
  }>("/admin/stats");

  const { data: settings, refetch: refetchSettings } = useAdminApi<{
    chatLocked: boolean; fakeOnlineBonus: number; fakeOnlineMin: number; fakeOnlineMax: number;
    maintenanceMode: boolean; welcomeMessage: string | null; hasOpenaiKey: boolean;
    spamCooldown: number; chatAnnounceListings: boolean;
  }>("/admin/settings");

  const { data: bannersData, refetch: refetchBanners } = useAdminApi<{
    id: number; title: string | null; imageUrl: string; linkUrl: string | null; isActive: boolean; sortOrder: number;
  }[]>("/admin/banners");

  const { data: listingsData, refetch: refetchListings } = useAdminApi<{
    listings: { id: number; title: string; company: string; city: string; status: string; isFeatured: boolean; createdAt: string; expiresAt: string | null }[];
    total: number;
  }>("/admin/listings");

  const { data: grantsData, refetch: refetchGrants } = useAdminApi<{
    id: number; userId: number; username: string | null; grantType: string; usesRemaining: number | null; expiresAt: string | null; note: string | null; createdAt: string;
  }[]>("/admin/grants");

  const [newGrant, setNewGrant] = useState({
    userId: "", grantType: "unlimited" as "unlimited" | "limited" | "timed",
    usesRemaining: "5", expiresAt: "", note: "",
  });

  const [fakeBonus, setFakeBonus] = useState("");
  const [fakeOnlineMin, setFakeOnlineMin] = useState("");
  const [fakeOnlineMax, setFakeOnlineMax] = useState("");
  const [welcomeMsg, setWelcomeMsg] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [spamCooldown, setSpamCooldown] = useState("3");
  useEffect(() => {
    if (settings) {
      setFakeBonus(String(settings.fakeOnlineBonus));
      setFakeOnlineMin(String(settings.fakeOnlineMin ?? 0));
      setFakeOnlineMax(String(settings.fakeOnlineMax ?? 0));
      setWelcomeMsg(settings.welcomeMessage ?? "");
      setSpamCooldown(String(settings.spamCooldown ?? 3));
    }
  }, [settings]);

  const [newBanner, setNewBanner] = useState({ title: "", imageUrl: "", linkUrl: "", sortOrder: "0" });
  const [newListing, setNewListing] = useState({
    title: "", company: "", city: "", workType: "Tam Zamanlı",
    salary: "", description: "", isFeatured: false, isTimed: false, expiresAt: ""
  });
  const [selectedListings, setSelectedListings] = useState<Set<number>>(new Set());
  useEffect(() => {
    const valid = new Set(listingsData?.listings?.map(l => l.id) ?? []);
    setSelectedListings(prev => {
      const next = new Set([...prev].filter(id => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [listingsData]);

  if (isLoading) return null;
  if (!user || !isAdmin) return <Redirect to="/" />;

  const apiCall = async (path: string, method: string, body?: unknown) => {
    const r = await fetch(`/api${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error((err as any).error || "İşlem başarısız");
    }
    return r.status === 204 ? null : r.json();
  };

  const saveSettings = async () => {
    try {
      const body: Record<string, unknown> = {
        fakeOnlineBonus: parseInt(fakeBonus, 10) || 0,
        fakeOnlineMin: parseInt(fakeOnlineMin, 10) || 0,
        fakeOnlineMax: parseInt(fakeOnlineMax, 10) || 0,
        welcomeMessage: welcomeMsg || null,
        spamCooldown: parseInt(spamCooldown, 10) || 0,
      };
      if (openaiKey) body.openaiApiKey = openaiKey;
      await apiCall("/admin/settings", "PATCH", body);
      toast({ title: "Ayarlar kaydedildi" });
      setOpenaiKey("");
      refetchSettings();
      refetchStats();
    } catch (e: any) { toast({ title: "Hata", description: e.message, variant: "destructive" }); }
  };

  const toggleChatAnnounceListings = async () => {
    try {
      await apiCall("/admin/settings", "PATCH", { chatAnnounceListings: !(settings?.chatAnnounceListings ?? true) });
      refetchSettings();
    } catch (e: any) { toast({ title: "Hata", description: e.message, variant: "destructive" }); }
  };

  const removeOpenaiKey = async () => {
    try {
      await apiCall("/admin/settings", "PATCH", { openaiApiKey: "" });
      toast({ title: "API anahtarı silindi" });
      refetchSettings();
    } catch (e: any) { toast({ title: "Hata", description: e.message, variant: "destructive" }); }
  };

  const toggleChatLock = async () => {
    try {
      await apiCall("/admin/chat/lock", "POST");
      toast({ title: "Sohbet durumu değiştirildi" });
      refetchSettings();
    } catch (e: any) { toast({ title: "Hata", description: e.message, variant: "destructive" }); }
  };

  const addBanner = async () => {
    if (!newBanner.imageUrl) { toast({ title: "Resim URL zorunludur", variant: "destructive" }); return; }
    try {
      await apiCall("/admin/banners", "POST", {
        title: newBanner.title || null,
        imageUrl: newBanner.imageUrl,
        linkUrl: newBanner.linkUrl || null,
        sortOrder: parseInt(newBanner.sortOrder, 10) || 0,
        isActive: true,
      });
      toast({ title: "Banner eklendi" });
      setNewBanner({ title: "", imageUrl: "", linkUrl: "", sortOrder: "0" });
      refetchBanners();
    } catch (e: any) { toast({ title: "Hata", description: e.message, variant: "destructive" }); }
  };

  const deleteBanner = async (id: number) => {
    try {
      await apiCall(`/admin/banners/${id}`, "DELETE");
      toast({ title: "Banner silindi" });
      refetchBanners();
    } catch (e: any) { toast({ title: "Hata", description: e.message, variant: "destructive" }); }
  };

  const toggleBanner = async (id: number, current: boolean) => {
    try {
      await apiCall(`/admin/banners/${id}`, "PATCH", { isActive: !current });
      refetchBanners();
    } catch (e: any) { toast({ title: "Hata", description: e.message, variant: "destructive" }); }
  };

  const addListing = async () => {
    if (!newListing.title || !newListing.company || !newListing.city) {
      toast({ title: "Başlık, şirket ve şehir zorunludur", variant: "destructive" }); return;
    }
    try {
      await apiCall("/admin/listings", "POST", {
        title: newListing.title,
        company: newListing.company,
        city: newListing.city,
        workType: newListing.workType,
        salary: newListing.salary || null,
        description: newListing.description || null,
        isFeatured: newListing.isFeatured,
        expiresAt: newListing.isTimed && newListing.expiresAt ? new Date(newListing.expiresAt).toISOString() : null,
      });
      toast({ title: "İlan eklendi ve yayında" });
      setNewListing({ title: "", company: "", city: "", workType: "Tam Zamanlı", salary: "", description: "", isFeatured: false, isTimed: false, expiresAt: "" });
      refetchListings();
      refetchStats();
    } catch (e: any) { toast({ title: "Hata", description: e.message, variant: "destructive" }); }
  };

  const toggleFeatured = async (id: number, cur: boolean) => {
    try {
      await apiCall(`/admin/listings/${id}/status`, "PATCH", { isFeatured: !cur });
      refetchListings();
    } catch (e: any) { toast({ title: "Hata", description: e.message, variant: "destructive" }); }
  };

  const setListingStatus = async (id: number, status: string) => {
    try {
      await apiCall(`/admin/listings/${id}/status`, "PATCH", { status });
      refetchListings();
      refetchStats();
    } catch (e: any) { toast({ title: "Hata", description: e.message, variant: "destructive" }); }
  };

  const deleteListing = async (id: number) => {
    try {
      await apiCall(`/admin/listings/${id}`, "DELETE");
      toast({ title: "İlan silindi" });
      refetchListings();
      refetchStats();
    } catch (e: any) { toast({ title: "Hata", description: e.message, variant: "destructive" }); }
  };

  const toggleSelectListing = (id: number) => {
    setSelectedListings(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const toggleSelectAllListings = () => {
    const all = listingsData?.listings?.map(l => l.id) ?? [];
    setSelectedListings(prev => prev.size === all.length ? new Set() : new Set(all));
  };
  const bulkDeleteListings = async () => {
    const ids = [...selectedListings];
    if (ids.length === 0) return;
    if (!confirm(`${ids.length} ilan silinecek. Emin misiniz?`)) return;
    try {
      const resp = await apiCall(`/admin/listings/bulk-delete`, "POST", { ids }) as { deleted?: number };
      toast({ title: `${resp?.deleted ?? ids.length} ilan silindi` });
      setSelectedListings(new Set());
      refetchListings();
      refetchStats();
    } catch (e: any) { toast({ title: "Hata", description: e.message, variant: "destructive" }); }
  };

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "2-digit" });

  return (
    <Layout>
      <div className="p-4 space-y-4 pb-8">
        <div>
          <h1 className="text-xl font-bold text-destructive">Admin Paneli</h1>
          <p className="text-xs text-muted-foreground mt-0.5">ÖzelGüvenlik.Online yönetim merkezi</p>
        </div>

        {stats && (
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Toplam Üye" value={stats.totalUsers} icon={Users} color="bg-primary/20 text-primary" />
            <StatCard label="Çevrimiçi" value={stats.onlineUsers} icon={Users} color="bg-green-500/20 text-green-400" />
            <StatCard label="Aktif İlan" value={stats.totalListings} icon={Briefcase} color="bg-accent/20 text-accent" />
            <StatCard label="Bekleyen" value={stats.pendingListings} icon={Clock} color="bg-amber-500/20 text-amber-400" />
            <StatCard label="Mesaj" value={stats.totalMessages} icon={MessageSquare} color="bg-secondary/20 text-secondary" />
            <StatCard label="Yasaklı" value={stats.bannedUsers} icon={XCircle} color="bg-destructive/20 text-destructive" />
          </div>
        )}

        <Section title="Genel Ayarlar" icon={Settings} defaultOpen>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Online Sayısı Aralığı (sürekli değişim)</label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    type="number"
                    value={fakeOnlineMin}
                    onChange={e => setFakeOnlineMin(e.target.value)}
                    placeholder="Min (örn. 150)"
                    className="glass-card border-white/10"
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Minimum</p>
                </div>
                <div className="flex-1">
                  <Input
                    type="number"
                    value={fakeOnlineMax}
                    onChange={e => setFakeOnlineMax(e.target.value)}
                    placeholder="Max (örn. 200)"
                    className="glass-card border-white/10"
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Maksimum</p>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">45 saniyede bir bu aralıkta rastgele değişir. 0-0 = devre dışı.</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Karşılama Mesajı</label>
              <Input
                value={welcomeMsg}
                onChange={e => setWelcomeMsg(e.target.value)}
                placeholder="Hoş geldiniz..."
                className="glass-card border-white/10"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Spam Koruması (saniye)</label>
              <Input
                type="number"
                min="0"
                max="60"
                value={spamCooldown}
                onChange={e => setSpamCooldown(e.target.value)}
                placeholder="3"
                className="glass-card border-white/10"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">Üyeler arasında minimum mesaj aralığı. 0 = kapalı.</p>
            </div>
            <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
              <div>
                <div className="text-sm font-medium">Sohbet Kilidi</div>
                <div className="text-xs text-muted-foreground">{settings?.chatLocked ? "Kilitli" : "Açık"}</div>
              </div>
              <button onClick={toggleChatLock} className="text-primary hover:text-primary/80 transition-colors">
                {settings?.chatLocked
                  ? <ToggleRight className="w-7 h-7 text-destructive" />
                  : <ToggleLeft className="w-7 h-7" />}
              </button>
            </div>
            <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
              <div>
                <div className="text-sm font-medium">İlan Sohbet Bildirimi</div>
                <div className="text-xs text-muted-foreground">Yeni ilan paylaşılınca sohbette duyursun</div>
              </div>
              <button onClick={toggleChatAnnounceListings} className="text-primary hover:text-primary/80 transition-colors">
                {settings?.chatAnnounceListings !== false
                  ? <ToggleRight className="w-7 h-7 text-green-400" />
                  : <ToggleLeft className="w-7 h-7" />}
              </button>
            </div>

            {/* OpenAI API Key */}
            <div className="bg-white/5 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: settings?.hasOpenaiKey ? "#22c55e" : "#ef4444" }} />
                  OpenAI API Anahtarı
                </label>
                {settings?.hasOpenaiKey && (
                  <button onClick={removeOpenaiKey} className="text-[10px] text-destructive hover:text-destructive/80">Sil</button>
                )}
              </div>
              {settings?.hasOpenaiKey ? (
                <p className="text-xs text-green-400">API anahtarı kayıtlı. Akıllı ilan oluşturma aktif.</p>
              ) : (
                <p className="text-xs text-amber-400">API anahtarı yok — akıllı ilan oluşturma devre dışı.</p>
              )}
              <div className="flex gap-2">
                <input
                  type={showOpenaiKey ? "text" : "password"}
                  value={openaiKey}
                  onChange={e => setOpenaiKey(e.target.value)}
                  placeholder={settings?.hasOpenaiKey ? "Yeni anahtar gir (değiştirmek için)" : "sk-..."}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                />
                <button onClick={() => setShowOpenaiKey(v => !v)}
                  className="px-2.5 py-1.5 bg-white/10 rounded-xl text-xs text-muted-foreground hover:bg-white/15">
                  {showOpenaiKey ? "Gizle" : "Göster"}
                </button>
              </div>
            </div>

            <Button onClick={saveSettings} className="w-full bg-primary/80 hover:bg-primary text-sm">
              Kaydet
            </Button>
          </div>
        </Section>

        <SmartListingSection apiCall={apiCall} toast={toast} refetchListings={refetchListings} refetchStats={refetchStats} />

        <ChatManagementSection apiCall={apiCall} toast={toast} />

        <Section title="Banner Yönetimi" icon={Image}>
          <div className="space-y-3">
            <div className="bg-white/5 rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Yeni Banner Ekle</p>
              <Input value={newBanner.imageUrl} onChange={e => setNewBanner(b => ({ ...b, imageUrl: e.target.value }))}
                placeholder="Resim URL (https://...)" className="glass-card border-white/10 text-sm" />
              <Input value={newBanner.title} onChange={e => setNewBanner(b => ({ ...b, title: e.target.value }))}
                placeholder="Başlık (opsiyonel)" className="glass-card border-white/10 text-sm" />
              <Input value={newBanner.linkUrl} onChange={e => setNewBanner(b => ({ ...b, linkUrl: e.target.value }))}
                placeholder="Link URL (opsiyonel)" className="glass-card border-white/10 text-sm" />
              <Input type="number" value={newBanner.sortOrder} onChange={e => setNewBanner(b => ({ ...b, sortOrder: e.target.value }))}
                placeholder="Sıra (0=önce)" className="glass-card border-white/10 text-sm" />
              {newBanner.imageUrl && (
                <img src={newBanner.imageUrl} alt="Önizleme" className="w-full h-24 object-cover rounded-lg" onError={e => (e.currentTarget.style.display = "none")} />
              )}
              <Button onClick={addBanner} className="w-full text-sm bg-accent/80 hover:bg-accent text-accent-foreground">
                <Plus className="w-4 h-4 mr-1" /> Banner Ekle
              </Button>
            </div>

            {bannersData && bannersData.length > 0 && (
              <div className="space-y-2">
                {bannersData.map(b => (
                  <div key={b.id} className="flex items-center gap-2 bg-white/5 rounded-xl p-2">
                    <img src={b.imageUrl} alt="" className="w-16 h-10 object-cover rounded-lg shrink-0" onError={e => (e.currentTarget.style.display = "none")} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{b.title || "—"}</div>
                      <div className="text-[10px] text-muted-foreground">Sıra: {b.sortOrder}</div>
                    </div>
                    <button onClick={() => toggleBanner(b.id, b.isActive)} className={b.isActive ? "text-green-400" : "text-muted-foreground"}>
                      {b.isActive ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                    </button>
                    <button onClick={() => deleteBanner(b.id)} className="text-destructive hover:text-destructive/80">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Section>

        <Section title="İlan Ekle (Admin)" icon={Briefcase}>
          <div className="space-y-3">
            <Input value={newListing.title} onChange={e => setNewListing(l => ({ ...l, title: e.target.value }))}
              placeholder="İlan başlığı" className="glass-card border-white/10 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <Input value={newListing.company} onChange={e => setNewListing(l => ({ ...l, company: e.target.value }))}
                placeholder="Şirket" className="glass-card border-white/10 text-sm" />
              <Input value={newListing.city} onChange={e => setNewListing(l => ({ ...l, city: e.target.value }))}
                placeholder="Şehir" className="glass-card border-white/10 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select value={newListing.workType} onValueChange={v => setNewListing(l => ({ ...l, workType: v }))}>
                <SelectTrigger className="glass-card border-white/10 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Tam Zamanlı">Tam Zamanlı</SelectItem>
                  <SelectItem value="Yarı Zamanlı">Yarı Zamanlı</SelectItem>
                  <SelectItem value="Vardiyalı">Vardiyalı</SelectItem>
                  <SelectItem value="Proje Bazlı">Proje Bazlı</SelectItem>
                </SelectContent>
              </Select>
              <Input value={newListing.salary} onChange={e => setNewListing(l => ({ ...l, salary: e.target.value }))}
                placeholder="Maaş (opsiyonel)" className="glass-card border-white/10 text-sm" />
            </div>
            <Textarea value={newListing.description} onChange={e => setNewListing(l => ({ ...l, description: e.target.value }))}
              placeholder="İş tanımı..." className="glass-card border-white/10 text-sm min-h-[80px]" />

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setNewListing(l => ({ ...l, isTimed: false }))}
                className={`flex items-center justify-center gap-2 py-2 rounded-xl border text-xs font-medium transition-all ${!newListing.isTimed ? "border-primary bg-primary/20 text-primary-foreground" : "border-white/10 text-muted-foreground"}`}
              >
                <Infinity className="w-3.5 h-3.5" /> Süresiz
              </button>
              <button
                type="button"
                onClick={() => setNewListing(l => ({ ...l, isTimed: true }))}
                className={`flex items-center justify-center gap-2 py-2 rounded-xl border text-xs font-medium transition-all ${newListing.isTimed ? "border-accent bg-accent/20 text-accent" : "border-white/10 text-muted-foreground"}`}
              >
                <Clock className="w-3.5 h-3.5" /> Süreli
              </button>
            </div>

            {newListing.isTimed && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Bitiş Tarihi
                </label>
                <input
                  type="datetime-local"
                  value={newListing.expiresAt}
                  onChange={e => setNewListing(l => ({ ...l, expiresAt: e.target.value }))}
                  min={new Date().toISOString().slice(0, 16)}
                  className="w-full glass-card border border-white/10 rounded-xl px-3 py-2 text-sm bg-transparent text-foreground"
                />
              </div>
            )}

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={newListing.isFeatured}
                onChange={e => setNewListing(l => ({ ...l, isFeatured: e.target.checked }))}
                className="w-4 h-4 rounded accent-amber-400"
              />
              <span className="text-sm flex items-center gap-1">
                <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" /> Öne çıkarılsın
              </span>
            </label>

            <Button onClick={addListing} className="w-full text-sm bg-gradient-to-r from-primary to-secondary">
              <Plus className="w-4 h-4 mr-1" /> İlanı Yayınla
            </Button>
          </div>
        </Section>

        <SupportAdminSection apiCall={apiCall} toast={toast} />

        <UserManagementSection apiCall={apiCall} toast={toast} viewerIsAdmin={isAdmin} />

        <Section title="Yetki Yönetimi (Akıllı İlan Hakkı)" icon={Shield}>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Kullanıcıya akıllı ilan paylaşım hakkı ver</p>
              <Input
                value={newGrant.userId}
                onChange={e => setNewGrant(g => ({ ...g, userId: e.target.value }))}
                placeholder="Kullanıcı ID (sayı)"
                className="h-8 text-sm bg-white/5 border-white/10"
              />
              <div className="grid grid-cols-3 gap-1.5">
                {(["unlimited", "limited", "timed"] as const).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setNewGrant(g => ({ ...g, grantType: type }))}
                    className={`flex items-center justify-center gap-1 py-1.5 rounded-lg border text-xs font-medium transition-all ${newGrant.grantType === type ? "border-primary bg-primary/20 text-primary-foreground" : "border-white/10 text-muted-foreground"}`}
                  >
                    {type === "unlimited" ? <><Infinity className="w-3 h-3" /> Süresiz</> : type === "limited" ? <><RefreshCw className="w-3 h-3" /> Adetli</> : <><Clock className="w-3 h-3" /> Süreli</>}
                  </button>
                ))}
              </div>
              {newGrant.grantType === "limited" && (
                <Input
                  type="number"
                  value={newGrant.usesRemaining}
                  onChange={e => setNewGrant(g => ({ ...g, usesRemaining: e.target.value }))}
                  placeholder="Kaç ilan hakkı?"
                  className="h-8 text-sm bg-white/5 border-white/10"
                />
              )}
              {newGrant.grantType === "timed" && (
                <input
                  type="datetime-local"
                  value={newGrant.expiresAt}
                  onChange={e => setNewGrant(g => ({ ...g, expiresAt: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-foreground"
                />
              )}
              <Input
                value={newGrant.note}
                onChange={e => setNewGrant(g => ({ ...g, note: e.target.value }))}
                placeholder="Not (isteğe bağlı)"
                className="h-8 text-sm bg-white/5 border-white/10"
              />
              <Button
                size="sm"
                onClick={async () => {
                  const uid = parseInt(newGrant.userId, 10);
                  if (!uid) { toast({ title: "Geçerli bir kullanıcı ID girin", variant: "destructive" }); return; }
                  try {
                    await apiCall("/admin/grants", "POST", {
                      userId: uid, grantType: newGrant.grantType,
                      usesRemaining: newGrant.grantType === "limited" ? parseInt(newGrant.usesRemaining, 10) || 1 : null,
                      expiresAt: newGrant.grantType === "timed" && newGrant.expiresAt ? newGrant.expiresAt : null,
                      note: newGrant.note || null,
                    });
                    toast({ title: "Yetki verildi" });
                    setNewGrant({ userId: "", grantType: "unlimited", usesRemaining: "5", expiresAt: "", note: "" });
                    refetchGrants();
                  } catch (e: any) { toast({ title: "Hata", description: e.message, variant: "destructive" }); }
                }}
                className="w-full h-8 text-xs bg-gradient-to-r from-primary to-secondary"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Yetki Ver
              </Button>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Aktif Yetkiler</p>
              {!grantsData?.length && <p className="text-xs text-muted-foreground text-center py-3">Henüz yetki verilmemiş</p>}
              {grantsData?.map(g => (
                <div key={g.id} className="bg-white/5 rounded-xl p-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold text-white">{g.username ?? `#${g.userId}`}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        g.grantType === "unlimited" ? "bg-primary/20 text-primary" :
                        g.grantType === "limited" ? "bg-cyan-500/20 text-cyan-400" :
                        "bg-amber-500/20 text-amber-400"
                      }`}>
                        {g.grantType === "unlimited" ? "Süresiz" : g.grantType === "limited" ? `${g.usesRemaining ?? 0} hak` : "Süreli"}
                      </span>
                    </div>
                    {g.expiresAt && <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" /> Bitiş: {new Date(g.expiresAt).toLocaleDateString("tr-TR")}</p>}
                    {g.note && <p className="text-[10px] text-muted-foreground mt-0.5">{g.note}</p>}
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        await apiCall(`/admin/grants/${g.id}`, "DELETE");
                        toast({ title: "Yetki iptal edildi" });
                        refetchGrants();
                      } catch (e: any) { toast({ title: "Hata", description: e.message, variant: "destructive" }); }
                    }}
                    className="text-red-400 hover:text-red-300 shrink-0"
                    title="Yetkiyi iptal et"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </Section>

        <PartTimeAdminSection apiCall={apiCall} toast={toast} />

        <TelegramAuthSection apiCall={apiCall} toast={toast} />

        <SourcesSection apiCall={apiCall} toast={toast} />

        <PendingJobsSection apiCall={apiCall} toast={toast} />

        <Section title="İlan Listesi" icon={Briefcase}>
          {!!listingsData?.listings?.length && (
            <div className="flex items-center justify-between gap-2 mb-2">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={listingsData.listings.every(l => selectedListings.has(l.id))}
                  onChange={toggleSelectAllListings}
                  className="w-4 h-4 rounded accent-primary"
                />
                Tümünü seç
              </label>
              {selectedListings.size > 0 && (
                <button onClick={bulkDeleteListings} className="text-[10px] flex items-center gap-0.5 px-2 py-1 bg-destructive/20 text-destructive rounded-lg hover:bg-destructive/30 transition-colors">
                  <Trash2 className="w-3 h-3" /> Seçilenleri Sil ({selectedListings.size})
                </button>
              )}
            </div>
          )}
          <div className="space-y-2">
            {listingsData?.listings?.map(l => (
              <div key={l.id} className="bg-white/5 rounded-xl p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={selectedListings.has(l.id)}
                    onChange={() => toggleSelectListing(l.id)}
                    className="w-4 h-4 mt-0.5 rounded accent-primary shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium line-clamp-1">{l.title}</div>
                    <div className="text-xs text-muted-foreground">{l.company} · {l.city}</div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        l.status === "active" ? "bg-green-500/20 text-green-400" :
                        l.status === "pending" ? "bg-amber-500/20 text-amber-400" :
                        "bg-destructive/20 text-destructive"
                      }`}>{l.status === "active" ? "Aktif" : l.status === "pending" ? "Bekliyor" : "Reddedildi"}</span>
                      {l.isFeatured && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium">Öne Çıkan</span>}
                      {l.expiresAt && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Calendar className="w-2.5 h-2.5" />{formatDate(l.expiresAt)}</span>}
                      <span className="text-[10px] text-muted-foreground">{formatDate(l.createdAt)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {l.status !== "active" && (
                    <button onClick={() => setListingStatus(l.id, "active")} className="text-[10px] flex items-center gap-0.5 px-2 py-1 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors">
                      <CheckCircle className="w-3 h-3" /> Onayla
                    </button>
                  )}
                  {l.status !== "rejected" && (
                    <button onClick={() => setListingStatus(l.id, "rejected")} className="text-[10px] flex items-center gap-0.5 px-2 py-1 bg-destructive/20 text-destructive rounded-lg hover:bg-destructive/30 transition-colors">
                      <XCircle className="w-3 h-3" /> Reddet
                    </button>
                  )}
                  <button onClick={() => toggleFeatured(l.id, l.isFeatured)} className={`text-[10px] flex items-center gap-0.5 px-2 py-1 rounded-lg transition-colors ${l.isFeatured ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30" : "bg-white/10 text-muted-foreground hover:bg-white/20"}`}>
                    {l.isFeatured ? <><StarOff className="w-3 h-3" /> Öne çıkarmayı kaldır</> : <><Star className="w-3 h-3" /> Öne çıkar</>}
                  </button>
                  <button onClick={() => deleteListing(l.id)} className="text-[10px] flex items-center gap-0.5 px-2 py-1 bg-destructive/10 text-destructive/80 rounded-lg hover:bg-destructive/20 transition-colors ml-auto">
                    <Trash2 className="w-3 h-3" /> Sil
                  </button>
                </div>
              </div>
            ))}
            {!listingsData?.listings?.length && (
              <p className="text-xs text-muted-foreground text-center py-4">İlan bulunamadı</p>
            )}
          </div>
        </Section>
      </div>
    </Layout>
  );
}

import React, { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/layout";
import { useAuth } from "@/contexts/AuthContext";
import { Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Briefcase, MapPin, CheckCircle, User, Phone, Search,
  Shield, ChevronDown, Sparkles, RefreshCw, Trash2,
  ToggleLeft, ToggleRight, Ban, UserCheck, Clock, Eye,
  Building2, MessageSquare, Star, Infinity,
  Headphones, ChevronLeft, Send,
} from "lucide-react";

function getToken() { return localStorage.getItem("auth_token") ?? ""; }

function useModApi<T>(path: string, deps: unknown[] = []) {
  const { user } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);

  const refetch = () => {
    if (!user) return;
    setLoading(true);
    fetch(`/api${path}`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (user) refetch(); }, [user, ...deps]);
  return { data, loading, refetch };
}

interface ModSupportTicket { id: number; subject: string; status: string; userId: number; username: string; msgCount: number; updatedAt: string; createdAt: string; }
interface ModSupportMsg { id: number; supportTicketId: number; userId: number; username: string; message: string; isStaff: boolean; createdAt: string; }
interface ModSupportDetail { id: number; subject: string; status: string; username: string; userId: number; messages: ModSupportMsg[]; }

function ModeratorSupportSection({ apiCall, toast }: {
  apiCall: (path: string, method: string, body?: unknown) => Promise<unknown>;
  toast: (opts: { title: string; description?: string; variant?: "default" | "destructive" }) => void;
}) {
  const [tickets, setTickets] = useState<ModSupportTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [active, setActive] = useState<ModSupportDetail | null>(null);
  const [reply, setReply] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadTickets = async () => {
    setLoading(true);
    try {
      const path = filter === "all" ? "/admin/support" : `/admin/support?status=${filter}`;
      const data = await apiCall(path, "GET") as ModSupportTicket[];
      setTickets(data);
    } catch {} finally { setLoading(false); }
  };

  const loadDetail = async (id: number) => {
    try {
      const data = await apiCall(`/support/${id}`, "GET") as ModSupportDetail;
      setActive(data);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch {}
  };

  const sendReply = async () => {
    if (!reply.trim() || !active) return;
    try {
      const msg = await apiCall(`/support/${active.id}/reply`, "POST", { message: reply.trim() }) as ModSupportMsg;
      setReply("");
      setActive(prev => prev ? { ...prev, status: "answered", messages: [...prev.messages, msg] } : prev);
      loadTickets();
    } catch (e: any) { toast({ title: "Hata", description: e.message, variant: "destructive" }); }
  };

  const changeStatus = async (id: number, status: string) => {
    try {
      await apiCall(`/support/${id}/status`, "PATCH", { status });
      toast({ title: "Durum güncellendi" });
      if (active?.id === id) setActive(prev => prev ? { ...prev, status } : prev);
      loadTickets();
    } catch (e: any) { toast({ title: "Hata", description: e.message, variant: "destructive" }); }
  };

  const fmt = (iso: string) => new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  const StatusBadge = ({ s }: { s: string }) => {
    const cfg: Record<string, string> = { waiting: "bg-amber-500/20 text-amber-400", answered: "bg-blue-500/20 text-blue-400", resolved: "bg-green-500/20 text-green-400" };
    const lbl: Record<string, string> = { waiting: "Bekliyor", answered: "Yanıtlandı", resolved: "Çözüldü" };
    return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg[s] ?? "bg-white/10 text-muted-foreground"}`}>{lbl[s] ?? s}</span>;
  };

  return (
    <div>
      {active ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setActive(null)} className="text-muted-foreground hover:text-foreground"><ChevronLeft className="w-4 h-4" /></button>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold line-clamp-1">{active.subject}</p>
              <p className="text-[10px] text-muted-foreground">{active.username} · #{active.id}</p>
            </div>
            <StatusBadge s={active.status} />
          </div>
          <div className="flex gap-1 flex-wrap">
            {["waiting", "answered", "resolved"].map(s => (
              <button key={s} onClick={() => changeStatus(active.id, s)} disabled={active.status === s}
                className={`text-[10px] px-2 py-1 rounded-lg font-medium disabled:opacity-40 transition-colors ${
                  s === "waiting" ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30" :
                  s === "answered" ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30" :
                  "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                }`}>
                {{ waiting: "Bekliyor", answered: "Yanıtlandı", resolved: "Çözüldü" }[s]}
              </button>
            ))}
          </div>
          <div className="max-h-60 overflow-y-auto space-y-2 bg-white/5 rounded-xl p-3">
            {active.messages.map(m => (
              <div key={m.id} className={`flex ${m.isStaff ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                  m.isStaff ? "bg-primary/20 text-foreground rounded-tl-sm" : "bg-white/10 text-foreground rounded-tr-sm"
                }`}>
                  <p className="text-[9px] font-bold text-muted-foreground mb-0.5">{m.username ?? "Kullanıcı"}{m.isStaff ? " · Ekip" : ""}</p>
                  <p>{m.message}</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">{fmt(m.createdAt)}</p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          {active.status !== "resolved" && (
            <div className="flex gap-2">
              <textarea value={reply} onChange={e => setReply(e.target.value)} placeholder="Yanıt yaz..."
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); }}}
                rows={2} className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-primary/50 resize-none text-foreground placeholder:text-muted-foreground" />
              <button onClick={sendReply} disabled={!reply.trim()} className="w-9 h-9 self-end rounded-xl bg-primary flex items-center justify-center disabled:opacity-40">
                <Send className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="flex gap-1.5 flex-wrap mb-3">
            {[["all","Tümü"],["waiting","Bekliyor"],["answered","Yanıtlandı"],["resolved","Çözüldü"]].map(([v,l]) => (
              <button key={v} onClick={() => setFilter(v)} className={`text-[10px] px-2.5 py-1 rounded-full font-medium transition-colors ${filter === v ? "bg-primary text-white" : "bg-white/10 text-muted-foreground hover:bg-white/15"}`}>{l}</button>
            ))}
            <button onClick={loadTickets} className="text-[10px] px-2.5 py-1 rounded-full bg-white/10 text-muted-foreground hover:bg-white/15 ml-auto">Yenile</button>
          </div>
          {loading ? (
            <p className="text-xs text-center text-muted-foreground py-4">Yükleniyor...</p>
          ) : tickets.length === 0 ? (
            <p className="text-xs text-center text-muted-foreground py-4">Destek talebi bulunamadı.</p>
          ) : (
            <div className="space-y-2">
              {tickets.map(t => (
                <button key={t.id} onClick={() => loadDetail(t.id)} className="w-full text-left bg-white/5 hover:bg-white/10 rounded-xl p-3 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold line-clamp-1">{t.subject}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{t.username} · {t.msgCount} mesaj · {fmt(t.updatedAt)}</p>
                    </div>
                    <StatusBadge s={t.status} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Section({ title, icon: Icon, children, defaultOpen = false }: { title: string; icon: React.ElementType; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl mb-4 overflow-hidden shadow-lg">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-5 py-4 text-left">
        <div className="flex items-center gap-2.5 font-bold text-sm text-white">
          <Icon className="w-4 h-4 text-amber-400" />
          {title}
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-5 pb-5 pt-1">{children}</div>}
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

function SmartListingSection({ apiCall, toast, refetchListings }: {
  apiCall: (path: string, method: string, body?: unknown) => Promise<unknown>;
  toast: (opts: { title: string; description?: string; variant?: "default" | "destructive" }) => void;
  refetchListings: () => void;
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
    } catch (e: unknown) {
      toast({ title: "Ayıklama başarısız", description: (e as Error).message, variant: "destructive" });
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
      refetchListings();
      setTimeout(() => setStep("input"), 1500);
    } catch (e: unknown) {
      toast({ title: "Yayınlama başarısız", description: (e as Error).message, variant: "destructive" });
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

export default function ModeratorDashboard() {
  const { user, isModerator, isAdmin, isLoading } = useAuth();
  const { toast } = useToast();

  const { data: listingsData, refetch: refetchListings } = useModApi<{
    listings: { id: number; title: string; company: string; city: string; status: string; isFeatured: boolean; createdAt: string; expiresAt: string | null }[];
    total: number;
  }>("/admin/listings");

  const [userSearch, setUserSearch] = useState("");
  const [userPage] = useState(1);
  const { data: usersData, refetch: refetchUsers } = useModApi<{
    users: { id: number; username: string; email: string; role: string; isBanned: boolean; banReason: string | null; banExpiresAt: string | null; createdAt: string }[];
    total: number;
  }>(`/admin/users?page=${userPage}&search=${encodeURIComponent(userSearch)}`);

  const [banReason, setBanReason] = useState("");
  const [banTarget, setBanTarget] = useState<number | null>(null);
  const [banExpiry, setBanExpiry] = useState("");
  const banInputRef = useRef<HTMLInputElement>(null);
  const [selectedListings, setSelectedListings] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (banTarget && banInputRef.current) banInputRef.current.focus();
  }, [banTarget]);

  useEffect(() => {
    const valid = new Set(listingsData?.listings?.map(l => l.id) ?? []);
    setSelectedListings(prev => {
      const next = new Set([...prev].filter(id => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [listingsData]);

  if (isLoading) return null;
  if (!user || (!isModerator && !isAdmin)) return <Redirect to="/" />;

  const apiCall = async (path: string, method: string, body?: unknown): Promise<unknown> => {
    const r = await fetch(`/api${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: "Bilinmeyen hata" }));
      throw new Error(err.error ?? "İstek başarısız");
    }
    return r.status === 204 ? null : r.json();
  };

  const changeListingStatus = async (id: number, status: string) => {
    try {
      await apiCall(`/admin/listings/${id}/status`, "PATCH", { status });
      toast({ title: "İlan durumu güncellendi" });
      refetchListings();
    } catch (e: unknown) { toast({ title: "Hata", description: (e as Error).message, variant: "destructive" }); }
  };

  const deleteListing = async (id: number) => {
    if (!confirm("Bu ilan silinecek. Emin misiniz?")) return;
    try {
      await apiCall(`/admin/listings/${id}`, "DELETE");
      toast({ title: "İlan silindi" });
      refetchListings();
    } catch (e: unknown) { toast({ title: "Hata", description: (e as Error).message, variant: "destructive" }); }
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
    } catch (e: unknown) { toast({ title: "Hata", description: (e as Error).message, variant: "destructive" }); }
  };

  const banUser = async (id: number) => {
    if (!banReason.trim()) { toast({ title: "Ban sebebi giriniz", variant: "destructive" }); return; }
    try {
      await apiCall(`/admin/users/${id}/ban`, "POST", { reason: banReason, expiresAt: banExpiry || null });
      toast({ title: "Kullanıcı yasaklandı" });
      setBanTarget(null); setBanReason(""); setBanExpiry("");
      refetchUsers();
    } catch (e: unknown) { toast({ title: "Hata", description: (e as Error).message, variant: "destructive" }); }
  };

  const unbanUser = async (id: number) => {
    try {
      await apiCall(`/admin/users/${id}/unban`, "POST");
      toast({ title: "Yasak kaldırıldı" });
      refetchUsers();
    } catch (e: unknown) { toast({ title: "Hata", description: (e as Error).message, variant: "destructive" }); }
  };

  const listings = listingsData?.listings ?? [];
  const usersList = usersData?.users ?? [];

  return (
    <Layout>
      <div className="px-4 py-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
            <Shield className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="font-extrabold text-xl text-white">Moderatör Paneli</h1>
            <p className="text-xs text-muted-foreground">{user.username} · Moderatör</p>
          </div>
        </div>

        <Section title="Akıllı İlan Oluştur" icon={Sparkles} defaultOpen={true}>
          <SmartListingSection
            apiCall={apiCall}
            toast={toast}
            refetchListings={refetchListings}
          />
        </Section>

        <Section title={`İlan Yönetimi${listingsData ? ` (${listingsData.total})` : ""}`} icon={Briefcase}>
          <div className="flex items-center justify-between gap-2 mb-3">
            {listings.length > 0 ? (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={listings.every(l => selectedListings.has(l.id))}
                  onChange={toggleSelectAllListings}
                  className="w-4 h-4 rounded accent-primary"
                />
                Tümünü seç
              </label>
            ) : <span />}
            <div className="flex items-center gap-2">
              {selectedListings.size > 0 && (
                <button onClick={bulkDeleteListings} className="text-[10px] flex items-center gap-0.5 px-2 py-1 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors">
                  <Trash2 className="w-3 h-3" /> Seçilenleri Sil ({selectedListings.size})
                </button>
              )}
              <Button size="sm" variant="ghost" onClick={refetchListings}>
                <RefreshCw className="w-3 h-3 mr-1" /> Yenile
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            {listings.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">İlan bulunamadı</p>}
            {listings.map(l => (
              <div key={l.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-start justify-between gap-2">
                  <input
                    type="checkbox"
                    checked={selectedListings.has(l.id)}
                    onChange={() => toggleSelectListing(l.id)}
                    className="w-4 h-4 mt-0.5 rounded accent-primary shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white truncate">{l.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="w-3 h-3" />{l.company} · {l.city}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        l.status === "active" ? "bg-green-500/20 text-green-400" :
                        l.status === "pending" ? "bg-yellow-500/20 text-yellow-400" :
                        "bg-red-500/20 text-red-400"
                      }`}>
                        {l.status === "active" ? "Aktif" : l.status === "pending" ? "Bekliyor" : "Reddedildi"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {l.status !== "active" && (
                      <button onClick={() => changeListingStatus(l.id, "active")} title="Onayla" className="text-green-400 hover:text-green-300">
                        <ToggleRight className="w-4 h-4" />
                      </button>
                    )}
                    {l.status === "active" && (
                      <button onClick={() => changeListingStatus(l.id, "pending")} title="Askıya Al" className="text-yellow-400 hover:text-yellow-300">
                        <ToggleLeft className="w-4 h-4" />
                      </button>
                    )}
                    <button onClick={() => deleteListing(l.id)} title="Sil" className="text-red-400 hover:text-red-300">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {new Date(l.createdAt).toLocaleDateString("tr-TR")}
                  {l.expiresAt && ` · Bitiş: ${new Date(l.expiresAt).toLocaleDateString("tr-TR")}`}
                </p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Kullanıcı Yönetimi" icon={User}>
          <div className="flex gap-2 mb-3">
            <Input
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              placeholder="Kullanıcı ara..."
              className="h-8 text-sm bg-white/5 border-white/10"
            />
            <Button size="sm" variant="ghost" onClick={refetchUsers}>
              <Search className="w-3 h-3" />
            </Button>
          </div>
          <div className="space-y-2">
            {usersList.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Kullanıcı bulunamadı</p>}
            {usersList.map(u => {
              const canModerate = u.role === "user";
              return (
                <div key={u.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-semibold text-white">{u.username}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          u.role === "admin" ? "bg-red-500/20 text-red-400" :
                          u.role === "moderator" ? "bg-amber-500/20 text-amber-400" :
                          "bg-blue-500/20 text-blue-400"
                        }`}>
                          {u.role === "admin" ? "Admin" : u.role === "moderator" ? "Moderatör" : "Kullanıcı"}
                        </span>
                        {u.isBanned && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-800/40 text-red-300">Yasaklı</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{u.email}</p>
                      {u.isBanned && u.banReason && (
                        <p className="text-xs text-red-400 mt-0.5">Sebep: {u.banReason}</p>
                      )}
                    </div>
                    {canModerate && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        {u.isBanned ? (
                          <button onClick={() => unbanUser(u.id)} title="Yasağı Kaldır" className="text-green-400 hover:text-green-300">
                            <UserCheck className="w-4 h-4" />
                          </button>
                        ) : (
                          <button onClick={() => setBanTarget(banTarget === u.id ? null : u.id)} title="Yasakla" className="text-red-400 hover:text-red-300">
                            <Ban className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {banTarget === u.id && !u.isBanned && canModerate && (
                    <div className="mt-2 space-y-1.5 border-t border-white/10 pt-2">
                      <Input
                        ref={banInputRef}
                        value={banReason}
                        onChange={e => setBanReason(e.target.value)}
                        placeholder="Ban sebebi *"
                        className="h-7 text-xs bg-white/5 border-white/10"
                      />
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
                        <Input
                          type="datetime-local"
                          value={banExpiry}
                          onChange={e => setBanExpiry(e.target.value)}
                          className="h-7 text-xs bg-white/5 border-white/10 flex-1"
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground">Bitiş tarihi boş = kalıcı yasak</p>
                      <div className="flex gap-1.5">
                        <Button size="sm" onClick={() => banUser(u.id)} className="flex-1 h-7 text-xs bg-red-700 hover:bg-red-600">
                          Yasakla
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setBanTarget(null); setBanReason(""); setBanExpiry(""); }} className="h-7 text-xs">
                          Vazgec
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {usersData && usersData.total > usersList.length && (
            <p className="text-xs text-muted-foreground text-center mt-3">
              {usersList.length} / {usersData.total} kullanıcı gösteriliyor
            </p>
          )}
        </Section>

        <Section title="Destek Talepleri" icon={Headphones}>
          <ModeratorSupportSection apiCall={apiCall} toast={toast} />
        </Section>

        <div className="text-center mt-6">
          <div className="inline-flex items-center gap-2 text-xs text-muted-foreground bg-white/5 px-3 py-2 rounded-full border border-white/10">
            <Eye className="w-3 h-3" />
            <span>Sadece yetkili işlemler gösterilmektedir</span>
          </div>
        </div>
      </div>
    </Layout>
  );
}

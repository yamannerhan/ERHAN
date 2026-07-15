import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { io, type Socket } from "socket.io-client";
import {
  Headphones, MessageCircle, Ticket, HelpCircle, Shield, Send,
  Paperclip, LogOut, Megaphone, FileText, User, ChevronDown,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import "./live-support-page.css";

function getToken() {
  return localStorage.getItem("auth_token") ?? "";
}

type Tab = "chat" | "ticket" | "faq";

type Message = {
  id: number;
  message: string;
  isStaff: boolean;
  username: string | null;
  createdAt: string;
};

type TicketDetail = {
  id: number;
  subject: string;
  category?: string;
  status: string;
  ticketNumber?: string;
  messages: Message[];
};

const QUICK_TOPICS: { label: string; category: string }[] = [
  { label: "İlan Sorunu", category: "İlan Sorunu" },
  { label: "CV Oluşturma", category: "Öneri" },
  { label: "Hesap", category: "Hesap Sorunu" },
  { label: "Ödeme", category: "Ödeme / Paket" },
  { label: "PartTime", category: "Diğer" },
  { label: "Diğer", category: "Diğer" },
];

const TICKET_CATEGORIES = [
  "Hesap Sorunu", "İlan Sorunu", "Ödeme / Paket", "Teknik Hata",
  "Şikâyet", "Öneri", "Moderasyon", "Diğer",
];

const FAQ_ITEMS = [
  {
    id: "ilan",
    icon: Megaphone,
    q: "İlan nasıl verilir?",
    a: "Alt menüdeki «İlan Oluştur» butonuna veya profilinizden «İlan Ekle» bölümüne giderek ilan metnini yapıştırıp yayınlayabilirsiniz. Admin onayından sonra ilanınız listede görünür.",
  },
  {
    id: "cv",
    icon: FileText,
    q: "CV nasıl oluşturulur?",
    a: "Alt menüden «CV» sayfasına girin. Adım adım bilgilerinizi doldurup şablon seçerek PDF olarak indirebilir veya kaydedebilirsiniz.",
  },
  {
    id: "basvuru",
    icon: User,
    q: "Başvuru nasıl yapılır?",
    a: "İlan detay sayfasındaki «Başvur» veya «Hemen Başvur» butonuna tıklayın. Telefon veya başvuru linki varsa doğrudan yönlendirilirsiniz.",
  },
];

function formatMsgTime(iso: string) {
  return new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

export function LiveSupportPageContent() {
  const { user } = useAuth();
  const isStaff = user?.role === "admin" || user?.role === "moderator";
  const [tab, setTab] = useState<Tab>("chat");
  const [activeTicket, setActiveTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [chatText, setChatText] = useState("");
  const [quickTopic, setQuickTopic] = useState(QUICK_TOPICS[0]!.label);
  const [ticketCategory, setTicketCategory] = useState("Diğer");
  const [ticketDesc, setTicketDesc] = useState("");
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const msgsEndRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLElement>(null);
  const ticketRef = useRef<HTMLElement>(null);
  const faqRef = useRef<HTMLElement>(null);

  const api = useCallback(async (path: string, method = "GET", body?: unknown) => {
    const r = await fetch(`/api${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((data as { error?: string }).error || "İşlem başarısız");
    return data;
  }, []);

  const loadActive = useCallback(async () => {
    if (!user || isStaff) {
      setActiveTicket(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { ticket } = await api("/support/active") as { ticket: { id: number } | null };
      if (ticket?.id) {
        const detail = await api(`/support/${ticket.id}`) as TicketDetail;
        setActiveTicket({
          ...detail,
          messages: Array.isArray(detail.messages) ? detail.messages : [],
        });
      } else {
        setActiveTicket(null);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Yüklenemedi");
      setActiveTicket(null);
    } finally {
      setLoading(false);
    }
  }, [api, user, isStaff]);

  useEffect(() => { void loadActive(); }, [loadActive]);

  useEffect(() => {
    if (!user || isStaff || !activeTicket) return;
    const id = setInterval(() => { void loadActive(); }, 4000);
    return () => clearInterval(id);
  }, [user, isStaff, activeTicket?.id, loadActive]);

  useEffect(() => {
    if (!user || isStaff) return;
    const s: Socket = io(window.location.origin, {
      path: "/ws",
      auth: { token: localStorage.getItem("auth_token") ?? "" },
      transports: ["polling", "websocket"],
      secure: window.location.protocol === "https:",
      withCredentials: true,
    });
    const auth = () => {
      if (s.connected) s.emit("authenticate", { userId: user.id });
      if (activeTicket?.id) s.emit("support:join", { ticketId: activeTicket.id });
    };
    s.on("connect", auth);
    s.on("support:message", (msg: Message & { ticketId?: number; status?: string }) => {
      if (!msg.ticketId) return;
      setActiveTicket((prev) => {
        if (!prev || prev.id !== msg.ticketId) return prev;
        if (prev.messages.some((m) => m.id === msg.id)) return prev;
        return {
          ...prev,
          status: msg.status ?? prev.status,
          messages: [...prev.messages, msg],
        };
      });
    });
    if (s.connected) auth();
    return () => { s.disconnect(); };
  }, [user?.id, isStaff, activeTicket?.id]);

  useEffect(() => {
    msgsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeTicket?.messages?.length]);

  const selectTab = (next: Tab) => {
    setTab(next);
    const ref = next === "chat" ? chatRef : next === "ticket" ? ticketRef : faqRef;
    setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const sendChat = async () => {
    if (!chatText.trim() || sending || isStaff) return;
    setSending(true);
    setError("");
    const text = chatText.trim();
    const topic = QUICK_TOPICS.find((t) => t.label === quickTopic) ?? QUICK_TOPICS[0]!;
    try {
      if (activeTicket && !["resolved", "closed", "cancelled"].includes(activeTicket.status)) {
        const msg = await api(`/support/${activeTicket.id}/reply`, "POST", { message: text }) as Message;
        setChatText("");
        setActiveTicket((prev) => prev ? {
          ...prev,
          messages: [...prev.messages, msg],
        } : prev);
      } else {
        const created = await api("/support", "POST", {
          category: topic.category,
          subject: `Canlı Destek — ${topic.label}`,
          message: text,
        }) as { id: number };
        setChatText("");
        const detail = await api(`/support/${created.id}`) as TicketDetail;
        setActiveTicket({ ...detail, messages: Array.isArray(detail.messages) ? detail.messages : [] });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Gönderilemedi";
      setError(msg);
      if (msg.includes("açık bir destek")) void loadActive();
    } finally {
      setSending(false);
    }
  };

  const endChat = async () => {
    if (!activeTicket || sending) return;
    if (!confirm("Sohbeti sonlandırmak istediğinize emin misiniz?")) return;
    setSending(true);
    setError("");
    try {
      await api(`/support/${activeTicket.id}/close`, "POST");
      setActiveTicket(null);
      setChatText("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Kapatılamadı");
    } finally {
      setSending(false);
    }
  };

  const submitTicket = async () => {
    if (!ticketDesc.trim() || sending || isStaff) return;
    setSending(true);
    setError("");
    try {
      const subject = TICKET_CATEGORIES.includes(ticketCategory)
        ? `${ticketCategory} talebi`
        : "Destek talebi";
      const created = await api("/support", "POST", {
        category: ticketCategory,
        subject,
        message: ticketDesc.trim(),
      }) as { id: number };
      setTicketDesc("");
      setTab("chat");
      const detail = await api(`/support/${created.id}`) as TicketDetail;
      setActiveTicket({ ...detail, messages: Array.isArray(detail.messages) ? detail.messages : [] });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gönderilemedi");
      void loadActive();
    } finally {
      setSending(false);
    }
  };

  const messages = activeTicket?.messages ?? [];
  const chatClosed = activeTicket && ["resolved", "closed", "cancelled"].includes(activeTicket.status);

  return (
    <div className="og-ls-page">
      {/* Hero */}
      <section className="og-ls-hero">
        <div className="og-ls-hero__icon-wrap" aria-hidden>
          <Headphones />
        </div>
        <div>
          <div className="og-ls-hero__title">Canlı Destek</div>
          <p className="og-ls-hero__sub">Sorununuzu bize yazın, en kısa sürede yardımcı olalım.</p>
          <span className="og-ls-hero__badge">
            <span className="og-ls-hero__badge-dot" />
            Destek Ekibi Aktif
          </span>
        </div>
        <div className="og-ls-hero__stats">
          <div className="og-ls-hero__stats-icon" aria-hidden>
            <Headphones size={20} />
          </div>
          <div className="og-ls-hero__stats-title">7/24 Canlı Destek</div>
          <div className="og-ls-hero__stats-sub">Ortalama Yanıt: 1 dk</div>
        </div>
      </section>

      {error && <div className="og-ls-error">{error}</div>}

      {/* Tabs */}
      <div className="og-ls-tabs" role="tablist" aria-label="Destek bölümleri">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "chat"}
          className={`og-ls-tab ${tab === "chat" ? "is-active" : ""}`}
          onClick={() => selectTab("chat")}
        >
          <MessageCircle />
          Canlı Destek
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "ticket"}
          className={`og-ls-tab ${tab === "ticket" ? "is-active" : ""}`}
          onClick={() => selectTab("ticket")}
        >
          <Ticket />
          Destek Talebi
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "faq"}
          className={`og-ls-tab ${tab === "faq" ? "is-active" : ""}`}
          onClick={() => selectTab("faq")}
        >
          <HelpCircle />
          SSS
        </button>
      </div>

      {!user ? (
        <div className="og-ls-gate">
          <Headphones className="w-10 h-10 text-[#f5c518] mx-auto mb-3" />
          <p className="text-sm font-bold text-white">Destek almak için giriş yapın</p>
          <p className="text-xs text-slate-400 mt-1">Canlı destek ve talep oluşturma için hesabınızla giriş yapın.</p>
          <Link href="/giris" className="og-ls-gate__btn">Giriş Yap</Link>
        </div>
      ) : isStaff ? (
        <div className="og-ls-gate">
          <Headphones className="w-10 h-10 text-amber-400 mx-auto mb-3" />
          <p className="text-sm font-bold text-white">Destek ekibi hesabı</p>
          <p className="text-xs text-slate-400 mt-1">
            Talepleri Admin panelindeki Destek bölümünden yanıtlayın.
          </p>
        </div>
      ) : (
        <>
          {/* Chat */}
          <section ref={chatRef} className="og-ls-chat" aria-label="Canlı destek sohbeti">
            <div className="og-ls-chat__head">
              <div>
                <div className="og-ls-chat__head-title">Sohbet</div>
                <div className="og-ls-chat__online">
                  <span className="og-ls-chat__online-dot" />
                  Çevrimiçi
                </div>
              </div>
              <button
                type="button"
                className="og-ls-chat__end"
                onClick={() => void endChat()}
                disabled={!activeTicket || !!chatClosed || sending}
              >
                <LogOut size={12} />
                Sohbeti Sonlandır
              </button>
            </div>

            <div className="og-ls-msgs">
              {loading ? (
                <div className="og-ls-empty-chat">Yükleniyor…</div>
              ) : messages.length === 0 ? (
                <div className="og-ls-empty-chat">
                  <p>Merhaba! Size nasıl yardımcı olabiliriz?</p>
                  <p>Konu seçip mesajınızı yazın; destek ekibimiz en kısa sürede yanıtlar.</p>
                </div>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className={`og-ls-msg ${m.isStaff ? "is-staff" : "is-user"}`}>
                    {m.isStaff && (
                      <div className="og-ls-msg__avatar" aria-hidden>
                        <Shield />
                      </div>
                    )}
                    <div>
                      <div className="og-ls-msg__bubble">{m.message}</div>
                      <div className="og-ls-msg__meta">
                        {!m.isStaff && <span className="og-ls-msg__checks">✓✓</span>}
                        <span>{formatMsgTime(m.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={msgsEndRef} />
            </div>

            <div className="og-ls-pills">
              {QUICK_TOPICS.map((t) => (
                <button
                  key={t.label}
                  type="button"
                  className={`og-ls-pill ${quickTopic === t.label ? "is-active" : ""}`}
                  onClick={() => setQuickTopic(t.label)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="og-ls-composer">
              <button type="button" className="og-ls-composer__attach" aria-label="Dosya ekle" tabIndex={-1}>
                <Paperclip size={16} />
              </button>
              <textarea
                className="og-ls-composer__input"
                placeholder="Mesajınızı yazın..."
                value={chatText}
                rows={1}
                onChange={(e) => setChatText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendChat();
                  }
                }}
              />
              <button
                type="button"
                className="og-ls-composer__send"
                disabled={sending || !chatText.trim()}
                onClick={() => void sendChat()}
                aria-label="Gönder"
              >
                <Send />
              </button>
            </div>
          </section>

          {/* Ticket form — referansta her zaman görünür */}
          <section ref={ticketRef} className="og-ls-ticket-box" aria-label="Destek talebi oluştur">
            <div className="og-ls-ticket-box__head">
              <div className="og-ls-ticket-box__icon" aria-hidden>
                <Ticket size={16} />
              </div>
              <div>
                <div className="og-ls-ticket-box__title">Destek Talebi Oluştur</div>
                <p className="og-ls-ticket-box__sub">
                  Canlı destek dışında talep oluşturup takip edebilirsiniz.
                </p>
              </div>
            </div>
            <div className="og-ls-form-grid">
              <label className="og-ls-label">
                Konu Seç
                <select
                  className="og-ls-select"
                  value={ticketCategory}
                  onChange={(e) => setTicketCategory(e.target.value)}
                >
                  <option value="">Bir konu seçin</option>
                  {TICKET_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="og-ls-label" style={{ gridColumn: "1 / -1" }}>
                Açıklama
                <textarea
                  className="og-ls-textarea"
                  placeholder="Sorununuzu kısaca yazın..."
                  value={ticketDesc}
                  onChange={(e) => setTicketDesc(e.target.value)}
                />
              </label>
            </div>
            <button
              type="button"
              className="og-ls-submit"
              disabled={sending || !ticketCategory || ticketDesc.trim().length < 10}
              onClick={() => void submitTicket()}
            >
              <Send size={16} />
              Talep Gönder
            </button>
          </section>

          {/* FAQ */}
          <section ref={faqRef} className="og-ls-faq" aria-label="Sık sorulan sorular">
            <div className="og-ls-faq__head">
              <span className="og-ls-faq__title">Sık Sorulan Sorular</span>
              <button
                type="button"
                className="og-ls-faq__link"
                onClick={() => {
                  selectTab("faq");
                  setOpenFaq(FAQ_ITEMS[0]!.id);
                }}
              >
                Tümünü Gör &gt;
              </button>
            </div>
            {FAQ_ITEMS.map((item) => {
              const Icon = item.icon;
              const open = openFaq === item.id;
              return (
                <div key={item.id} className={`og-ls-faq-item ${open ? "is-open" : ""}`}>
                  <button
                    type="button"
                    className="og-ls-faq-trigger"
                    onClick={() => setOpenFaq(open ? null : item.id)}
                  >
                    <Icon />
                    <span>{item.q}</span>
                    <ChevronDown className="chevron" />
                  </button>
                  {open && <div className="og-ls-faq-body">{item.a}</div>}
                </div>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}

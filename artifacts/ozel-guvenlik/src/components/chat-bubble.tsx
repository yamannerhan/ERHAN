import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Maximize2, Bot, Shield, Star, MessageSquareDot, CornerUpLeft, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useLocation } from "wouter";
import { io, Socket } from "socket.io-client";
import type { ChatMessage } from "@workspace/api-client-react";

function getToken() { return localStorage.getItem("auth_token") ?? ""; }
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

interface SystemMsg { id: number; type: "join" | "welcome"; text: string; createdAt: string; }
type AnyMsg = (ChatMessage & { isBot?: boolean }) | SystemMsg;
function isSystem(m: AnyMsg): m is SystemMsg { return "type" in m; }

/* ── Role badge ─────────────────────────────────────────── */
function RoleBadge({ role }: { role: string }) {
  if (role === "admin") return (
    <span className="badge-admin text-[7px] font-black tracking-widest uppercase">YÖNETİCİ</span>
  );
  if (role === "moderator") return (
    <span className="badge-mod text-[7px] font-black tracking-widest uppercase">MODERATÖR</span>
  );
  return (
    <span className="text-[7px] font-semibold tracking-wider uppercase text-white/70">ÜYE</span>
  );
}

/* ── User avatar ─────────────────────────────────────────── */
function UserAvatar({ src, username, role }: { src?: string | null; username: string; role: string }) {
  const ringColor =
    role === "admin" ? "rgba(239,68,68,0.9)" :
    role === "moderator" ? "rgba(59,130,246,0.85)" :
    "rgba(255,255,255,0.12)";

  return (
    <div
      className="w-7 h-7 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[10px] font-bold text-white"
      style={{
        boxShadow: `0 0 0 2px ${ringColor}`,
        background: src ? "transparent" : "linear-gradient(135deg,#4F46E5,#7C3AED)",
        flexShrink: 0,
      }}
    >
      {src ? (
        <img src={src} alt={username} className="w-full h-full object-cover" />
      ) : (
        username.substring(0, 2).toUpperCase()
      )}
    </div>
  );
}

/* ── Cool floating button icon ───────────────────────────── */
function ChatIcon({ unread, pulse }: { unread: number; pulse: boolean }) {
  return (
    <div className="relative flex items-center justify-center w-full h-full">
      {/* Glow ring */}
      <motion.div
        animate={pulse ? { scale: [1, 1.6, 1], opacity: [0.5, 0, 0] } : { scale: 1, opacity: 0 }}
        transition={{ duration: 0.6 }}
        className="absolute inset-0 rounded-2xl"
        style={{ background: "radial-gradient(circle,rgba(79,70,229,0.8),transparent)" }}
      />
      {/* Icon layers */}
      <div className="relative">
        <MessageSquareDot className="w-6 h-6 text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.6)]" />
        {/* live indicator dot */}
        <span
          className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#4F46E5] bg-green-400"
          style={{ boxShadow: "0 0 6px rgba(74,222,128,0.8)" }}
        />
      </div>
      {/* Unread badge */}
      {unread > 0 && (
        <motion.span
          initial={{ scale: 0 }} animate={{ scale: 1 }}
          className="absolute -top-2 -right-2 min-w-[18px] h-[18px] bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center px-1 border-2 border-[#4F46E5]"
          style={{ boxShadow: "0 0 8px rgba(239,68,68,0.7)" }}
        >
          {unread > 9 ? "9+" : unread}
        </motion.span>
      )}
    </div>
  );
}

export function ChatBubble() {
  const { user } = useAuth();
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AnyMsg[]>([]);
  const [content, setContent] = useState("");
  const [replyTo, setReplyTo] = useState<(ChatMessage & { isBot?: boolean }) | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [unread, setUnread] = useState(0);
  const [sending, setSending] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [sendError, setSendError] = useState("");
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sendErrorRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const msgContainerRef = useRef<HTMLDivElement>(null);
  const msgInnerRef = useRef<HTMLDivElement>(null);
  // Kullanıcı en altta mı (scroll event'iyle güncellenir) — resize/yeni mesajda zorla indirip indirmemeyi belirler
  const pinnedRef = useRef(true);
  const isOnChatPage = location === "/sohbet";

  const scrollToBottom = useCallback(() => {
    // Kapsayıcının kendi scrollTop'unu ayarla — popup zaten kendi overflow container'ı.
    // scrollIntoView KULLANMA: üst kapsayıcıları (canvas iframe/sayfa) da kaydırıp
    // scrollbar bozulmasına ve en sona inememeye yol açıyordu.
    pinnedRef.current = true;
    const jump = () => {
      const el = msgContainerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    };
    jump();
    requestAnimationFrame(jump);
    setTimeout(jump, 60);
    setTimeout(jump, 200);
  }, []);

  const addMsg = useCallback((msg: AnyMsg) => {
    setMessages(prev => {
      // Çift mesaj önleme: aynı id zaten varsa ekleme
      if (!isSystem(msg) && prev.some(m => !isSystem(m) && (m as ChatMessage).id === (msg as ChatMessage).id)) {
        return prev;
      }
      return [...prev.slice(-59), msg];
    });
    setPulse(true);
    setTimeout(() => setPulse(false), 600);
  }, []);

  useEffect(() => {
    fetch("/api/chat/messages?limit=100", {
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setMessages(data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const s = io({ path: "/ws" });
    setSocket(s);
    if (user?.id) s.emit("authenticate", { userId: user.id });

    s.on("chat:message", (msg: ChatMessage) => {
      addMsg(msg);
      if (!open) setUnread(n => n + 1);
    });
    s.on("chat:delete", ({ id }: { id: number }) => {
      setMessages(prev => prev.filter(m => !isSystem(m) && (m as ChatMessage).id !== id));
    });
    s.on("chat:cleared", () => {
      setMessages([]);
    });
    s.on("chat:join", ({ username }: { username: string }) => {
      addMsg({ id: Date.now(), type: "join", text: `${username} sohbete katıldı`, createdAt: new Date().toISOString() });
    });
    s.on("chat:welcome", ({ message }: { message: string }) => {
      addMsg({ id: Date.now() + 1, type: "welcome", text: message, createdAt: new Date().toISOString() });
    });
    return () => { s.disconnect(); };
  }, [user?.id]);

  useEffect(() => {
    if (open) {
      setUnread(0);
      scrollToBottom();
    }
  }, [open, scrollToBottom]);

  // Yeni mesajda en alta kaydır. messages.length 60'ta SABİTLENİR (slice(-59)) → uzunluğa
  // bağlanırsak yeni mesajlar tetiklemez. Son mesajın id'si değiştiğinde tetikle.
  // Kullanıcı geçmişi okumak için yukarı kaydırdıysa (pinnedRef false) zorla indirme.
  const lastMsg = messages[messages.length - 1] as { id?: number | string; createdAt?: string } | undefined;
  const lastMsgKey = lastMsg ? `${lastMsg.id ?? ""}|${lastMsg.createdAt ?? ""}` : "";
  useLayoutEffect(() => {
    if (pinnedRef.current) scrollToBottom();
  }, [lastMsgKey, scrollToBottom]);

  // İçerik sonradan büyüse (çok satırlı mesaj, yanıt önizleme, animasyon) ve kullanıcı
  // resize ÖNCESİ en alttaysa (pinnedRef), otomatik en altta kal — "altta kalmasını" engeller.
  useEffect(() => {
    const inner = msgInnerRef.current;
    const cont = msgContainerRef.current;
    if (!inner || !cont) return;
    const ro = new ResizeObserver(() => {
      if (pinnedRef.current) cont.scrollTop = cont.scrollHeight;
    });
    ro.observe(inner);
    return () => ro.disconnect();
  }, [open]);

  const startCooldown = (seconds: number) => {
    setCooldownLeft(seconds);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setCooldownLeft(prev => {
        if (prev <= 1) { clearInterval(cooldownRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const showSendError = (msg: string) => {
    setSendError(msg);
    if (sendErrorRef.current) clearTimeout(sendErrorRef.current);
    sendErrorRef.current = setTimeout(() => setSendError(""), 5000);
  };

  const sendMsg = async () => {
    if (!content.trim() || !user || sending || cooldownLeft > 0) return;
    setSending(true);
    try {
      const r = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ content: content.trim(), replyToId: replyTo?.id ?? null }),
      });
      if (r.status === 429) {
        const data = await r.json().catch(() => ({})) as { waitSeconds?: number };
        startCooldown(data.waitSeconds ?? 3);
        return;
      }
      if (r.ok) {
        const sent = await r.json().catch(() => null) as ChatMessage | null;
        if (sent) addMsg(sent); // anında ekle — soketten gelince çift olmaz (id kontrolü var)
        setContent("");
        setReplyTo(null);
        return;
      }
      // 403 (kilitli/susturulmuş), 400, 500 vb. — sebebi kullanıcıya göster
      const data = await r.json().catch(() => ({})) as { error?: string };
      showSendError(data.error ?? "Mesaj gönderilemedi. Lütfen tekrar deneyin.");
    } catch {
      showSendError("Bağlantı hatası. Lütfen tekrar deneyin.");
    } finally { setSending(false); }
  };

  const handleClearChat = async () => {
    if (!window.confirm("Tüm sohbet mesajları silinecek. Emin misiniz?")) return;
    try {
      await fetch("/api/chat/messages", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
    } catch {}
  };

  const startReply = (msg: ChatMessage & { isBot?: boolean }) => {
    setReplyTo(msg);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const replyName = (msg: ChatMessage & { isBot?: boolean }) =>
    (msg as any).displayName || msg.username;

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); }
  };

  if (isOnChatPage) return null;

  return (
    <>
      <style>{`
        @keyframes bubble-glow {
          0%, 100% { box-shadow: 0 8px 32px rgba(79,70,229,0.5), 0 0 0 1px rgba(255,255,255,0.1); }
          50% { box-shadow: 0 8px 40px rgba(124,58,237,0.7), 0 0 0 1px rgba(255,255,255,0.15), 0 0 0 4px rgba(79,70,229,0.15); }
        }
        @keyframes shimmer-blue {
          0%   { background-position: -250% 0; }
          100% { background-position: 250% 0; }
        }
        @keyframes shimmer-red {
          0%   { background-position: -250% 0; }
          100% { background-position: 250% 0; }
        }
        @keyframes smoke-yellow {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 220% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes smoke-mod {
          0%   { background-position: 0% 50%;   filter: drop-shadow(0 0 3px rgba(159,18,57,0.3)); }
          25%  { background-position: 80% 50%;  filter: drop-shadow(0 0 12px rgba(225,29,72,0.85)); }
          55%  { background-position: 200% 50%; filter: drop-shadow(0 0 18px rgba(253,164,175,0.9)); }
          80%  { background-position: 300% 50%; filter: drop-shadow(0 0 9px rgba(190,24,93,0.6));  }
          100% { background-position: 0% 50%;   filter: drop-shadow(0 0 3px rgba(159,18,57,0.3)); }
        }
        .badge-admin {
          background: linear-gradient(90deg,
            #7f1d1d 0%, #ef4444 20%, #fecaca 45%, #fca5a5 55%, #ef4444 80%, #7f1d1d 100%);
          background-size: 250% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer-red 2.8s linear infinite;
          filter: drop-shadow(0 0 5px rgba(239,68,68,0.8));
        }
        .badge-mod {
          background: linear-gradient(90deg,
            #1e3a8a 0%, #3b82f6 25%, #bfdbfe 50%, #93c5fd 65%, #3b82f6 80%, #1e3a8a 100%);
          background-size: 250% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer-blue 2.8s linear infinite;
          filter: drop-shadow(0 0 5px rgba(59,130,246,0.75));
        }
        .name-admin {
          background: linear-gradient(90deg,
            #111 0%, #111 30%, #f59e0b 50%, #111 70%, #111 100%);
          background-size: 250% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: smoke-yellow 3.5s ease-in-out infinite;
          filter: drop-shadow(0 0 6px rgba(245,158,11,0.55));
        }
        .name-mod {
          background: linear-gradient(90deg,
            #4c0519 0%, #9f1239 15%, #be185d 30%, #fb7185 50%, #fda4af 58%, #e11d48 73%, #9f1239 88%, #4c0519 100%);
          background-size: 350% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: smoke-mod 5s ease-in-out infinite;
        }
        .name-user {
          color: #e2e8f0;
          text-shadow: 0 0 8px rgba(148,163,184,0.3);
        }
      `}</style>

      {/* Floating button */}
      <motion.button
        onClick={() => setOpen(o => !o)}
        whileHover={{ scale: 1.08, rotate: open ? 0 : 5 }}
        whileTap={{ scale: 0.92 }}
        animate={pulse && !open ? { scale: [1, 1.18, 1] } : {}}
        transition={{ duration: 0.3 }}
        className="fixed bottom-24 right-4 z-50 w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{
          background: open
            ? "linear-gradient(135deg,#1E293B,#334155)"
            : "linear-gradient(135deg,#4F46E5,#7C3AED,#4F46E5)",
          backgroundSize: "200% 200%",
          animation: open ? "none" : "bubble-glow 3s ease-in-out infinite",
        }}
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.div key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.18 }}>
              <X className="w-5 h-5 text-white" />
            </motion.div>
          ) : (
            <motion.div key="chat" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.18 }}>
              <ChatIcon unread={unread} pulse={pulse} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.92 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="fixed right-4 z-50 w-[22rem] flex flex-col rounded-3xl overflow-hidden"
            style={{
              bottom: "calc(6rem + 56px)",
              background: "rgba(15,23,42,0.97)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 32px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(79,70,229,0.2)",
              // SABİT yükseklik (definite height): mesaj alanının min-h-full + justify-end'i güvenilir
              // çalışsın, en yeni mesaj daima input'un hemen üstünde dursun. dvh klavye/viewport'a uyar.
              height: "min(500px, calc(100dvh - 11rem))",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center gap-3 px-4 py-3.5 shrink-0"
              style={{ background: "linear-gradient(135deg,rgba(79,70,229,0.9),rgba(124,58,237,0.9))", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <MessageSquareDot className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm leading-tight">Topluluk Sohbeti</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  <p className="text-white/60 text-[10px]">Canlı</p>
                </div>
              </div>
              {(user?.role === "admin" || user?.role === "moderator") && (
                <button
                  onClick={handleClearChat}
                  className="w-7 h-7 rounded-lg bg-red-500/20 hover:bg-red-500/40 flex items-center justify-center transition-colors mr-1"
                  title="Sohbeti Temizle"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-300" />
                </button>
              )}
              <Link href="/sohbet" onClick={() => setOpen(false)}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors mr-1" title="Tam ekranda aç">
                <Maximize2 className="w-3 h-3 text-white/70" />
              </Link>
              <button onClick={() => setOpen(false)}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                <X className="w-3.5 h-3.5 text-white/70" />
              </button>
            </div>

            {/* Messages */}
            <div
              ref={msgContainerRef}
              onScroll={() => {
                const el = msgContainerRef.current;
                if (el) pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
              }}
              className="flex-1 overflow-y-auto min-h-0"
            >
              <div ref={msgInnerRef} className="flex flex-col justify-end min-h-full p-3 space-y-2.5">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-24 gap-2">
                  <MessageSquareDot className="w-8 h-8 text-white/10" />
                  <p className="text-xs text-muted-foreground">Henüz mesaj yok.</p>
                </div>
              ) : (
                messages.map(msg => {
                  /* ─── System messages ─── */
                  if (isSystem(msg)) {
                    return (
                      <motion.div key={msg.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="flex justify-center">
                        {msg.type === "join" ? (
                          <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-medium px-3 py-1 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            {msg.text}
                          </div>
                        ) : (
                          <div className="w-full bg-primary/10 border border-primary/20 rounded-2xl p-3 text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <Bot className="w-3 h-3 text-primary" />
                              <span className="text-[10px] font-bold text-primary">GuvenlikBot · Hoş Geldiniz</span>
                            </div>
                            {msg.text}
                          </div>
                        )}
                      </motion.div>
                    );
                  }

                  const chatMsg = msg as ChatMessage & { isBot?: boolean };
                  const isMe = user?.id === chatMsg.userId;
                  const isBot = chatMsg.isBot || chatMsg.userId === 0;

                  /* ─── Bot message ─── */
                  if (isBot) {
                    const isBilgiBot = chatMsg.userId === -999;
                    const botColor = isBilgiBot ? "#22C55E" : "#06B6D4";
                    const botBg    = isBilgiBot ? "rgba(34,197,94,0.10)"  : "rgba(6,182,212,0.10)";
                    const botBdr   = isBilgiBot ? "rgba(34,197,94,0.25)"  : "rgba(6,182,212,0.20)";
                    const botName  = (chatMsg as any).displayName ?? (chatMsg as any).username ?? (isBilgiBot ? "BİLGİ BOTU" : "GuvenlikBot");
                    const lines    = chatMsg.content.split("\n").filter((l: string) => l.trim() !== "");
                    const isInfo   = isBilgiBot && lines[0]?.startsWith("🔎");
                    return (
                      <motion.div key={chatMsg.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: botBg, border: `1px solid ${botBdr}` }}>
                          <Bot className="w-3.5 h-3.5" style={{ color: botColor }} />
                        </div>
                        <div className="max-w-[82%] rounded-2xl rounded-tl-sm px-3 py-2 text-xs" style={{ background: botBg, border: `1px solid ${botBdr}` }}>
                          <div className="flex items-center gap-1 mb-0.5">
                            <span className="text-[9px] font-bold" style={{ color: botColor }}>{botName}</span>
                            <span className="text-[8px]" style={{ color: `${botColor}60` }}>· Bot</span>
                          </div>
                          {isInfo ? (
                            <>
                              <p className="text-[10px] font-bold mb-1" style={{ color: botColor }}>{lines[0]}</p>
                              <p className="break-words text-foreground/90 leading-relaxed">{lines.slice(1).join(" ")}</p>
                            </>
                          ) : (
                            <p className="break-words text-foreground/90 leading-relaxed">{chatMsg.content}</p>
                          )}
                          <p className="text-[9px] text-white/25 mt-0.5">{formatTime(chatMsg.createdAt)}</p>
                        </div>
                      </motion.div>
                    );
                  }

                  /* ─── Regular user message ─── */
                  return (
                    <motion.div
                      key={chatMsg.id}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex items-end gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}
                    >
                      <UserAvatar
                        src={chatMsg.userAvatarUrl}
                        username={chatMsg.username}
                        role={chatMsg.userRole ?? "user"}
                      />
                      <div className={`flex flex-col max-w-[75%] ${isMe ? "items-end" : "items-start"}`}>
                        <div className="flex flex-col mb-1 px-1">
                          {isMe ? (
                            <span className="text-[9px] font-bold text-white/40">Sen</span>
                          ) : (
                            <>
                              <RoleBadge role={chatMsg.userRole ?? "user"} />
                              <span
                                className={`text-[13px] font-extrabold leading-tight tracking-wide ${
                                  chatMsg.userNameAnimated ? "animate-rainbow"
                                  : chatMsg.userNameColor ? ""
                                  : chatMsg.userRole === "admin" ? "name-admin"
                                  : chatMsg.userRole === "moderator" ? "name-mod"
                                  : "name-user"
                                }`}
                                style={chatMsg.userNameColor && !chatMsg.userNameAnimated ? { color: chatMsg.userNameColor } : {}}
                              >
                                {(chatMsg as any).displayName || chatMsg.username}
                              </span>
                            </>
                          )}
                        </div>
                        <div
                          className={`rounded-2xl px-3 py-2 text-xs backdrop-blur-md ${isMe ? "rounded-br-sm text-white" : "rounded-bl-sm"}`}
                          style={
                            isMe
                              ? { background: "linear-gradient(135deg,#4F46E5,#7C3AED)" }
                              : chatMsg.userRole === "admin"
                                ? { background: "linear-gradient(135deg,rgba(110,8,8,0.6),rgba(35,4,4,0.75))", border: "1px solid rgba(239,68,68,0.45)", boxShadow: "0 0 18px rgba(239,68,68,0.22), inset 0 1px 0 rgba(239,68,68,0.1)" }
                                : chatMsg.userRole === "moderator"
                                  ? { background: "linear-gradient(135deg,rgba(10,38,115,0.6),rgba(4,14,55,0.75))", border: "1px solid rgba(59,130,246,0.45)", boxShadow: "0 0 18px rgba(59,130,246,0.22), inset 0 1px 0 rgba(59,130,246,0.1)" }
                                  : { background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.06)" }
                          }
                        >
                          {chatMsg.replyToId && (chatMsg.replyToUsername || chatMsg.replyToContent) && (
                            <div className="mb-1.5 pl-2 border-l-2 border-blue-400 text-[10px] rounded-r-md py-0.5 pr-2 bg-white/5">
                              <div className="font-semibold text-blue-400 mb-0.5">
                                {chatMsg.replyToUsername === user?.username ? "Sen" : chatMsg.replyToUsername}
                              </div>
                              <div className="line-clamp-1 opacity-70">{chatMsg.replyToContent}</div>
                            </div>
                          )}
                          <p className="break-words leading-relaxed">
                            {chatMsg.content.split(/(@\w+)/g).map((part, i) =>
                              part.startsWith("@")
                                ? <span key={i} className={isMe ? "font-semibold text-white" : "font-semibold text-accent"}>{part}</span>
                                : <span key={i}>{part}</span>
                            )}
                          </p>
                          <p className={`text-[9px] mt-0.5 ${isMe ? "text-white/40" : "text-white/25"}`}>{formatTime(chatMsg.createdAt)}</p>
                        </div>
                        {user && (
                          <button
                            onClick={() => startReply(chatMsg)}
                            className={`flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold text-blue-400 hover:bg-blue-400/10 active:scale-95 transition-all ${isMe ? "self-end" : "self-start"}`}
                          >
                            <CornerUpLeft className="w-2.5 h-2.5" /> Yanıtla
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input */}
            <div className="p-3 shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              {!user ? (
                <Link href="/giris" onClick={() => setOpen(false)}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-bold text-white"
                  style={{ background: "linear-gradient(135deg,#4F46E5,#7C3AED)" }}>
                  <MessageSquareDot className="w-3.5 h-3.5" />
                  Giriş yap ve mesaj gönder
                </Link>
              ) : (
                <div className="space-y-1.5">
                  <AnimatePresence>
                    {replyTo && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                        className="flex items-start justify-between gap-2 px-2.5 py-1.5 rounded-lg"
                        style={{ background: "rgba(255,255,255,0.05)", borderLeft: "2px solid #60a5fa" }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-[10px] font-semibold text-blue-400">{replyName(replyTo)}'e yanıt</div>
                          <div className="text-[10px] text-white/50 line-clamp-1">{replyTo.content}</div>
                        </div>
                        <button onClick={() => setReplyTo(null)} className="shrink-0 p-0.5 text-white/40 hover:text-white/80">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {sendError && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 mb-1 rounded-lg bg-red-500/15 border border-red-500/30">
                      <span className="text-[11px] text-red-300 leading-snug">{sendError}</span>
                    </div>
                  )}
                  {cooldownLeft > 0 && (
                    <div className="flex items-center gap-1.5 px-1">
                      <div className="h-0.5 flex-1 bg-white/10 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-amber-400"
                          initial={{ width: "100%" }}
                          animate={{ width: "0%" }}
                          transition={{ duration: cooldownLeft, ease: "linear" }}
                        />
                      </div>
                      <span className="text-[10px] text-amber-400 font-bold shrink-0">{cooldownLeft}s</span>
                    </div>
                  )}
                  <div className="flex gap-2 items-center">
                    <input
                      ref={inputRef}
                      value={content}
                      onChange={e => setContent(e.target.value)}
                      onKeyDown={handleKey}
                      placeholder={cooldownLeft > 0 ? `${cooldownLeft}s bekle...` : replyTo ? `${replyName(replyTo)}'e yanıtla...` : "Bir şeyler yaz..."}
                      disabled={cooldownLeft > 0}
                      maxLength={500}
                      className="flex-1 rounded-xl px-3 py-2.5 text-xs text-foreground placeholder:text-white/30 focus:outline-none disabled:opacity-50"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                    />
                    <motion.button
                      onClick={sendMsg}
                      disabled={!content.trim() || sending || cooldownLeft > 0}
                      whileTap={{ scale: 0.9 }}
                      className="w-9 h-9 rounded-xl flex items-center justify-center disabled:opacity-30 shrink-0 transition-opacity"
                      style={{ background: "linear-gradient(135deg,#4F46E5,#7C3AED)" }}
                    >
                      <Send className="w-3.5 h-3.5 text-white" />
                    </motion.button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

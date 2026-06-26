import React, { useEffect, useLayoutEffect, useState, useRef, useCallback } from "react";
import { useGetChatMessages } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { useAuth } from "@/contexts/AuthContext";
import { io, Socket } from "socket.io-client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, X, Bot, Zap, CornerUpLeft, Trash2, Crown } from "lucide-react";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import type { ChatMessage } from "@workspace/api-client-react";

function getToken() { return localStorage.getItem("auth_token") ?? ""; }

interface SystemMsg { id: number; type: "join" | "welcome" | "cleared"; text: string; createdAt: string; }
type Reaction = { emoji: string; userId: number; username: string; displayName: string | null };
type ExtMsg = ChatMessage & { displayName?: string | null; isFake?: boolean; reactions?: Reaction[] };
type AnyMsg = ExtMsg | SystemMsg;
function isSystem(m: AnyMsg): m is SystemMsg { return "type" in m; }

function renderMessageContent(content: string) {
  return content.split(/(@\w+|\/ilan\/\d+)/g).map((part, i) => {
    if (/^\/ilan\/\d+$/.test(part)) {
      return <a key={i} href={part} className="ml-1 inline-flex rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary hover:bg-primary/30">İlana git</a>;
    }
    if (part.startsWith("@")) return <span key={i} className="text-accent font-semibold">{part}</span>;
    return part;
  });
}

interface UserSuggestion { id: number; username: string; displayName?: string | null; avatarUrl: string | null; role: string; }

/* ── Role badge ─────────────────────────────────────────────── */
function RoleBadge({ role, isVip }: { role: string; isVip?: boolean }) {
  if (role === "admin") return (
    <span className="badge-admin text-[7px] font-black tracking-widest uppercase">YÖNETİCİ</span>
  );
  if (role === "moderator") return (
    <span className="badge-mod text-[7px] font-black tracking-widest uppercase">MODERATÖR</span>
  );
  if (isVip) return (
    <span className="badge-vip text-[7px] font-black tracking-widest uppercase inline-flex items-center gap-0.5">
      <Crown className="w-2.5 h-2.5" /> VIP
    </span>
  );
  return (
    <span className="text-[7px] font-semibold tracking-wider uppercase" style={{ color: "rgba(148,163,184,0.35)" }}>ÜYE</span>
  );
}

function UserAvatar({ src, name, role, isVip }: { src?: string | null; name: string; role: string; isVip?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = !!src && !imageFailed;

  return (
    <div className="w-8 h-8 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[10px] font-bold text-white"
      style={{
        boxShadow: role === "admin" ? "0 0 0 2px rgba(239,68,68,0.7)" : role === "moderator" ? "0 0 0 2px rgba(59,130,246,0.7)" : isVip ? "0 0 0 2px rgba(250,204,21,0.9), 0 0 18px rgba(250,204,21,0.35)" : "0 0 0 2px rgba(255,255,255,0.1)",
        background: showImage ? "transparent" : "linear-gradient(135deg,#4F46E5,#7C3AED)",
        flexShrink: 0,
      }}>
      {showImage
        ? <img src={src} alt={name} className="w-full h-full object-cover" onError={() => setImageFailed(true)} />
        : name.substring(0, 2).toUpperCase()}
    </div>
  );
}

/* ── Swipeable row ────────────────────────────────────────────── */
// React'ın synthetic onTouchMove olayı PWA'da passive geldiğinden
// preventDefault() çalışmaz ve scroll swipe'ı yutar.
// Çözüm: native addEventListener ile { passive: false } kullanmak.
function SwipeableMessage({ children, onReply }: { children: React.ReactNode; onReply: () => void }) {
  const x = useMotionValue(0);
  const opacity = useTransform(x, [0, 50], [0, 1]);
  const scale = useTransform(x, [0, 50, 80], [0.5, 1, 1.2]);
  const iconBg = useTransform(x, [40, 65], ["rgba(79,70,229,0.6)", "rgba(79,70,229,1)"]);
  const containerRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const isHoriz = useRef<boolean | null>(null);
  const swiped = useRef(false);
  const vibrated = useRef(false);
  const onReplyRef = useRef(onReply);
  useEffect(() => { onReplyRef.current = onReply; }, [onReply]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onStart = (e: TouchEvent) => {
      startX.current = e.touches[0]!.clientX;
      startY.current = e.touches[0]!.clientY;
      isHoriz.current = null;
      swiped.current = false;
      vibrated.current = false;
    };

    const onMove = (e: TouchEvent) => {
      const dx = e.touches[0]!.clientX - startX.current;
      const dy = e.touches[0]!.clientY - startY.current;
      // 2px eşiğinde yön belirle — iOS için erken tespit şart
      if (isHoriz.current === null && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
        isHoriz.current = Math.abs(dx) >= Math.abs(dy);
      }
      if (!isHoriz.current || dx <= 0) return;
      e.preventDefault();
      x.set(Math.min(dx, 90));
      if (dx >= 60 && !vibrated.current) {
        vibrated.current = true;
        if (navigator.vibrate) navigator.vibrate(45);
      }
    };

    const onEnd = () => {
      if (isHoriz.current && x.get() >= 60 && !swiped.current) {
        swiped.current = true;
        onReplyRef.current();
      }
      animate(x, 0, { type: "spring", stiffness: 380, damping: 28 });
      isHoriz.current = null;
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false }); // ← kritik
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, []);

  return (
    // touch-action:pan-y → tarayıcı dikey scroll'u kendi yönetir,
    // yatay dokunuşları JS'e bırakır — iOS PWA için kritik
    <div ref={containerRef} className="relative" style={{ touchAction: "pan-y" }}>
      <motion.div
        style={{ opacity, scale, backgroundColor: iconBg }}
        className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center pointer-events-none z-10 shadow-lg"
      >
        <CornerUpLeft className="w-4 h-4 text-white" />
      </motion.div>
      <motion.div style={{ x }}>{children}</motion.div>
    </div>
  );
}

export default function Chat() {
  const { user } = useAuth();
  const [content, setContent] = useState("");
  const [replyTo, setReplyTo] = useState<ExtMsg | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const msgContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<AnyMsg[]>([]);
  const [sending, setSending] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
  const [activeMsg, setActiveMsg] = useState<number | null>(null);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncInFlightRef = useRef(false);
  const messageIdsRef = useRef<Set<number>>(new Set());
  const systemKeysRef = useRef<Set<string>>(new Set());
  const lastSeenMessageIdRef = useRef(0);

  const { data: initialData, isLoading } = useGetChatMessages({ limit: 100 });

  useEffect(() => { if (initialData) setMessages([...initialData as ExtMsg[]]); }, [initialData]);

  const scrollToBottom = useCallback(() => {
    const jump = () => {
      scrollRef.current?.scrollIntoView({ block: "end", behavior: "instant" });
    };
    jump();
    requestAnimationFrame(jump);
    setTimeout(jump, 60);
    setTimeout(jump, 200);
  }, []);

  // Çift mesaj önleme: aynı id'li mesaj zaten varsa ekleme
  const rememberMessageIds = (items: AnyMsg[]) => {
    const ids = items.filter(m => !isSystem(m)).map(m => (m as ExtMsg).id);
    messageIdsRef.current = new Set(ids);
    lastSeenMessageIdRef.current = Math.max(lastSeenMessageIdRef.current, ...ids, 0);
  };

  const addMsg = useCallback((msg: AnyMsg): boolean => {
    if (!isSystem(msg) && messageIdsRef.current.has((msg as ExtMsg).id)) {
      return false;
    }
    if (isSystem(msg)) {
      if (msg.type !== "welcome") {
        const key = `${msg.type}:${msg.text}`;
        if (systemKeysRef.current.has(key)) return false;
        systemKeysRef.current.add(key);
      }
    } else {
      const id = (msg as ExtMsg).id;
      messageIdsRef.current.add(id);
      lastSeenMessageIdRef.current = Math.max(lastSeenMessageIdRef.current, id);
    }

    setMessages(prev => {
      if (!isSystem(msg) && prev.some(m => !isSystem(m) && (m as ExtMsg).id === (msg as ExtMsg).id)) {
        return prev;
      }
      const next = [...prev, msg];
      rememberMessageIds(next);
      return next;
    });
    return true;
  }, []);

  const syncLatestMessages = useCallback(async () => {
    if (syncInFlightRef.current) return;
    syncInFlightRef.current = true;
    try {
      const after = lastSeenMessageIdRef.current;
      const url = after > 0 ? `/api/chat/messages?limit=25&after=${after}` : "/api/chat/messages?limit=50";
      const res = await fetch(url, {
        headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
        cache: "no-store",
      });
      const data = await res.json().catch(() => null) as ExtMsg[] | null;
      if (!Array.isArray(data)) return;
      setMessages(prev => {
        const existingIds = new Set(prev.filter(m => !isSystem(m)).map(m => (m as ExtMsg).id));
        const incoming = data.filter(m => !existingIds.has(m.id));
        if (incoming.length === 0) return prev;
        const next = [...prev, ...incoming];
        rememberMessageIds(next);
        return next;
      });
    } catch {
      // ignore transient network errors
    } finally {
      syncInFlightRef.current = false;
    }
  }, []);

  // Paint öncesi en alta kaydır (useLayoutEffect = DOM commit sonrası, paint öncesi)
  useLayoutEffect(() => {
    if (messages.length === 0) return;
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

  useEffect(() => {
    const s = io(window.location.origin, {
      path: "/ws",
      transports: ["websocket", "polling"],
      upgrade: true,
      secure: window.location.protocol === "https:",
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 3000,
      timeout: 20000,
      forceNew: true,
    });
    setSocket(s);
    const authenticate = () => {
      if (user?.id) s.emit("authenticate", { userId: user.id });
    };
    s.on("connect", authenticate);
    s.on("chat:message", (msg: ExtMsg) => addMsg(msg));
    s.on("chat:delete", ({ id }: { id: number }) => {
      setMessages(prev => prev.filter(m => isSystem(m) || (m as ExtMsg).id !== id));
    });
    s.on("chat:join", ({ username }: { username: string }) => {
      addMsg({ id: Date.now(), type: "join", text: `${username} sohbete katıldı`, createdAt: new Date().toISOString() });
    });
    s.on("chat:welcome", ({ message }: { message: string }) => {
      addMsg({ id: Date.now() + 1, type: "welcome", text: message, createdAt: new Date().toISOString() });
    });
    s.on("chat:react", ({ messageId, reactions }: { messageId: number; reactions: Reaction[] }) => {
      setMessages(prev => prev.map(m =>
        !isSystem(m) && (m as ExtMsg).id === messageId ? { ...(m as ExtMsg), reactions } : m
      ));
    });
    s.on("chat:cleared", () => {
      setMessages([]);
    });
    authenticate();
    return () => {
      s.off("connect", authenticate);
      s.disconnect();
    };
  }, [user?.id, addMsg]);

  useEffect(() => {
    void syncLatestMessages();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void syncLatestMessages();
    }, 15000);
    return () => window.clearInterval(id);
  }, [syncLatestMessages]);

  useEffect(() => { if (!isLoading) scrollToBottom(); }, [isLoading, scrollToBottom]);

  // @ mention search
  useEffect(() => {
    if (mentionQuery === null) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(mentionQuery)}`);
        if (res.ok) setSuggestions(await res.json());
      } catch {}
    }, 120);
    return () => clearTimeout(t);
  }, [mentionQuery]);

  const handleInputChange = (val: string) => {
    setContent(val);
    const lastAt = val.lastIndexOf("@");
    if (lastAt !== -1) {
      const after = val.slice(lastAt + 1);
      if (!after.includes(" ")) { setMentionQuery(after); return; }
    }
    setMentionQuery(null);
  };

  const insertMention = (username: string) => {
    const lastAt = content.lastIndexOf("@");
    setContent(content.slice(0, lastAt) + `@${username} `);
    setMentionQuery(null);
    setSuggestions([]);
    inputRef.current?.focus();
  };

  const handleClearChat = async () => {
    if (!window.confirm("Tüm sohbet mesajları silinecek. Emin misiniz?")) return;
    // Anında lokal temizle — yenileme gerektirmesin
    setMessages([]);
    localStorage.removeItem("chat_messages");
    try {
      await fetch("/api/chat/messages", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
    } catch {}
  };

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

  const handleReact = async (msgId: number, emoji: string) => {
    if (!user) return;
    try {
      await fetch(`/api/chat/messages/${msgId}/react`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ emoji }),
      });
    } catch {}
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !user || sending || cooldownLeft > 0) return;
    setSending(true);
    try {
      const r = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ content: content.trim(), replyToId: replyTo?.id }),
      });
      if (r.status === 429) {
        const data = await r.json().catch(() => ({})) as { waitSeconds?: number };
        startCooldown(data.waitSeconds ?? 5);
        return;
      }
      if (r.status === 403) {
        const data = await r.json().catch(() => ({})) as { error?: string };
        alert(data.error ?? "Mesaj gönderme yetkiniz yok.");
        return;
      }
      if (r.ok) {
        const sent = await r.json().catch(() => null) as ExtMsg | null;
        if (sent) addMsg(sent); // anında ekle — soketten gelince çift olmaz (id kontrolü var)
        setContent("");
        setReplyTo(null);
        setMentionQuery(null);
        // Spam koruması: admin/mod hariç 5 saniye bekleme
        if (user.role !== "admin" && user.role !== "moderator") {
          startCooldown(5);
        }
        // iOS/mobile: async sonrası focus kaybını önle
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    } catch {} finally { setSending(false); }
  };

  // Show displayName (first name) if available, otherwise username
  function chatName(msg: ExtMsg): string {
    return (msg as any).displayName || msg.username;
  }

  const renderMsg = (msg: AnyMsg) => {
    if (isSystem(msg)) {
      if (msg.type === "join") return (
        <motion.div key={msg.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex justify-center my-1">
          <div className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 text-green-400 text-[10px] font-semibold px-3 py-1 rounded-full">
            <Zap className="w-2.5 h-2.5" />{msg.text}
          </div>
        </motion.div>
      );
      if (msg.type === "cleared") return (
        <motion.div key={msg.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex justify-center my-3 px-4">
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/25 text-red-400 text-[11px] font-semibold px-4 py-2 rounded-xl">
            <Trash2 className="w-3 h-3 shrink-0" />
            <span>Yönetici tarafından sohbet temizlendi</span>
          </div>
        </motion.div>
      );
      return (
        <motion.div key={msg.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="my-2 px-2">
          <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4 text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
            <div className="flex items-center gap-2 mb-2">
              <Bot className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold text-primary">GuvenlikBot · Hoş Geldiniz!</span>
            </div>
            {msg.text}
          </div>
        </motion.div>
      );
    }

    const chatMsg = msg as ExtMsg;
    const isBot = (chatMsg as any).isBot || chatMsg.userId === 0;
    const isMe = !isBot && user?.id === chatMsg.userId;
    const name = chatName(chatMsg);

    if (isBot) {
      const isBilgiBot = chatMsg.userId === -999;
      const botColor = isBilgiBot ? "#22C55E" : "#06B6D4";
      const botBg   = isBilgiBot ? "rgba(34,197,94,0.10)"  : "rgba(6,182,212,0.10)";
      const botBdr  = isBilgiBot ? "rgba(34,197,94,0.25)"  : "rgba(6,182,212,0.20)";
      const botName = (chatMsg as any).displayName ?? (chatMsg as any).username ?? (isBilgiBot ? "BİLGİ BOTU" : "GuvenlikBot");
      const lines   = chatMsg.content.split("\n").filter(l => l.trim() !== "");
      const isInfo  = isBilgiBot && lines[0]?.startsWith("🔎");
      return (
        <motion.div key={chatMsg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-2 group px-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-5" style={{ background: botBg, border: `1px solid ${botBdr}` }}>
            <Bot className="w-4 h-4" style={{ color: botColor }} />
          </div>
          <div className="flex flex-col items-start max-w-[82%]">
            <div className="flex items-center gap-1 mb-1 ml-1">
              <span className="text-[10px] font-bold" style={{ color: botColor }}>{botName}</span>
              <span className="text-[8px]" style={{ color: `${botColor}60` }}>· Bot</span>
            </div>
            <div className="px-4 py-2.5 rounded-2xl rounded-bl-sm text-sm" style={{ background: botBg, border: `1px solid ${botBdr}` }}>
              {isInfo ? (
                <>
                  <p className="text-[11px] font-bold mb-1.5" style={{ color: botColor }}>{lines[0]}</p>
                  <p className="break-words text-foreground/90">{renderMessageContent(lines.slice(1).join(" "))}</p>
                </>
              ) : (
                <p className="break-words text-foreground/90">{renderMessageContent(chatMsg.content)}</p>
              )}
              <p className="text-[10px] text-muted-foreground mt-1">{new Date(chatMsg.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</p>
            </div>
          </div>
        </motion.div>
      );
    }

    const msgReactions: Reaction[] = chatMsg.reactions ?? [];
    const reactionGroups = msgReactions.reduce((acc, r) => {
      acc[r.emoji] = acc[r.emoji] ?? [];
      acc[r.emoji]!.push(r);
      return acc;
    }, {} as Record<string, Reaction[]>);
    const isActive = activeMsg === chatMsg.id;
    const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

    return (
      <SwipeableMessage key={chatMsg.id} onReply={() => setReplyTo(chatMsg)}>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className={`flex flex-col px-2 ${isMe ? "items-end" : "items-start"} group`}
          onClick={() => setActiveMsg(isActive ? null : chatMsg.id)}>
          <div className={`flex max-w-[85%] ${isMe ? "flex-row-reverse" : "flex-row"} items-end gap-2`}>
            {/* Avatar */}
            <UserAvatar src={chatMsg.userAvatarUrl} name={name} role={chatMsg.userRole ?? "user"} isVip={chatMsg.isVip} />

            <div className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
              {/* Name + badge */}
              <div className="flex flex-col mb-1 px-1">
                {isMe ? (
                  <span className="text-[9px] text-white/30">Sen</span>
                ) : (
                  <>
                    <RoleBadge role={chatMsg.userRole ?? "user"} isVip={chatMsg.isVip} />
                    <span className={`text-[13px] font-extrabold leading-tight tracking-wide ${
                        chatMsg.isVip ? "name-vip"
                        : chatMsg.userNameAnimated ? "animate-rainbow"
                        : chatMsg.userNameColor ? ""
                        : chatMsg.userRole === "admin" ? "name-admin"
                        : chatMsg.userRole === "moderator" ? "name-mod"
                        : "name-user"
                      }`}
                      style={chatMsg.userNameColor && !chatMsg.userNameAnimated && !chatMsg.isVip ? { color: chatMsg.userNameColor } : {}}>
                      {chatMsg.isVip && <Crown className="inline w-3 h-3 mr-0.5 text-amber-300 fill-amber-300" />}
                      {name}
                    </span>
                  </>
                )}
              </div>

              {/* Bubble */}
              <div
                className={`relative rounded-2xl px-4 py-2.5 text-sm shadow-sm backdrop-blur-md ${isMe ? "text-white rounded-br-sm" : "rounded-bl-sm"}`}
                style={
                  isMe
                    ? { background: "linear-gradient(135deg,#4F46E5,#7C3AED)" }
                    : chatMsg.userRole === "admin"
                      ? { background: "linear-gradient(135deg,rgba(110,8,8,0.6),rgba(35,4,4,0.75))", border: "1px solid rgba(239,68,68,0.45)", boxShadow: "0 0 18px rgba(239,68,68,0.22), inset 0 1px 0 rgba(239,68,68,0.1)" }
                      : chatMsg.userRole === "moderator"
                        ? { background: "linear-gradient(135deg,rgba(10,38,115,0.6),rgba(4,14,55,0.75))", border: "1px solid rgba(59,130,246,0.45)", boxShadow: "0 0 18px rgba(59,130,246,0.22), inset 0 1px 0 rgba(59,130,246,0.1)" }
                        : chatMsg.isVip
                          ? { background: "linear-gradient(135deg,rgba(146,64,14,0.78),rgba(8,47,73,0.72))", border: "1px solid rgba(250,204,21,0.55)", boxShadow: "0 0 22px rgba(250,204,21,0.28), 0 0 18px rgba(34,211,238,0.14), inset 0 1px 0 rgba(255,255,255,0.14)" }
                        : { background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.06)" }
                }>
                {chatMsg.replyToId && (() => {
                  const repliedToMe = chatMsg.replyToUsername === user?.username;
                  return (
                    <div className={`mb-2 pl-2 border-l-2 border-blue-400 text-xs rounded-r-lg py-0.5 pr-2 ${
                      repliedToMe ? "bg-blue-400/10" : isMe ? "bg-white/5" : "bg-white/5"
                    }`}>
                      <div className="flex items-center gap-1.5 font-semibold mb-0.5">
                        <span className="text-blue-400">{chatMsg.replyToUsername}</span>
                        {repliedToMe && (
                          <span className="text-[9px] bg-blue-400/20 text-blue-300 px-1.5 py-0.5 rounded-full font-bold tracking-wide">SEN</span>
                        )}
                      </div>
                      <div className="line-clamp-1 opacity-70">{chatMsg.replyToContent}</div>
                    </div>
                  );
                })()}
                <p className="break-words leading-relaxed">{renderMessageContent(chatMsg.content)}</p>
                <span className={`text-[10px] mt-1 block ${isMe ? "text-white/40" : "text-white/30"}`}>
                  {new Date(chatMsg.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>

              {/* Her zaman görünen Yanıtla butonu */}
              {user && (
                <button
                  onClick={e => { e.stopPropagation(); setReplyTo(chatMsg); setActiveMsg(null); }}
                  className={`flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-lg text-[11px] font-semibold text-blue-400 hover:bg-blue-400/10 active:scale-95 transition-all ${isMe ? "self-end" : "self-start"}`}>
                  <CornerUpLeft className="w-3 h-3" /> Yanıtla
                </button>
              )}

              {/* Emoji reactions display */}
              {Object.entries(reactionGroups).length > 0 && (
                <div className={`flex flex-wrap gap-1 mt-1 px-1 ${isMe ? "justify-end" : "justify-start"}`}>
                  {Object.entries(reactionGroups).map(([emoji, users]) => (
                    <button key={emoji}
                      onClick={e => { e.stopPropagation(); handleReact(chatMsg.id, emoji); }}
                      className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-all active:scale-95 ${
                        users.some(r => r.userId === user?.id)
                          ? "bg-primary/20 border-primary/50 text-primary"
                          : "bg-white/5 border-white/10 text-foreground/70 hover:bg-white/10"
                      }`}>
                      <span>{emoji}</span><span className="font-medium">{users.length}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Action bar (tap to open) — sadece emoji reaksiyonlar */}
              <AnimatePresence>
                {isActive && (
                  <motion.div initial={{ opacity: 0, scale: 0.9, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: -4 }} transition={{ duration: 0.15 }}
                    className={`flex items-center gap-1 mt-1 px-1 ${isMe ? "justify-end" : "justify-start"}`}
                    onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-0.5 bg-[#1E293B] border border-white/10 rounded-2xl px-2 py-1.5 shadow-xl">
                      {QUICK_EMOJIS.map(emoji => (
                        <button key={emoji}
                          onClick={() => handleReact(chatMsg.id, emoji)}
                          className={`text-lg leading-none p-1 rounded-xl transition-all active:scale-90 hover:scale-110 hover:bg-white/10 ${
                            msgReactions.some(r => r.userId === user?.id && r.emoji === emoji) ? "bg-primary/20" : ""
                          }`}>
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </SwipeableMessage>
    );
  };

  return (
    <Layout>
      <style>{`
        @keyframes shimmer-blue {
          0%   { background-position: -250% 0; }
          100% { background-position: 250% 0; }
        }
        @keyframes shimmer-green {
          0%   { background-position: -250% 0; }
          100% { background-position: 250% 0; }
        }
        @keyframes smoke-mod {
          0%   { background-position: 0% 50%;   filter: drop-shadow(0 0 3px rgba(167,139,250,0.25)); }
          25%  { background-position: 80% 50%;  filter: drop-shadow(0 0 12px rgba(196,181,253,0.85)); }
          55%  { background-position: 200% 50%; filter: drop-shadow(0 0 18px rgba(221,214,254,0.95)); }
          80%  { background-position: 300% 50%; filter: drop-shadow(0 0 9px rgba(167,139,250,0.6));  }
          100% { background-position: 0% 50%;   filter: drop-shadow(0 0 3px rgba(167,139,250,0.25)); }
        }
        .badge-admin {
          background: linear-gradient(90deg,
            #1e3a8a 0%, #3b82f6 25%, #bfdbfe 50%, #93c5fd 65%, #3b82f6 80%, #1e3a8a 100%);
          background-size: 250% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer-blue 2.8s linear infinite;
          filter: drop-shadow(0 0 5px rgba(96,165,250,0.7));
        }
        .badge-mod {
          background: linear-gradient(90deg,
            #4c1d95 0%, #7c3aed 25%, #ddd6fe 50%, #a78bfa 65%, #7c3aed 80%, #4c1d95 100%);
          background-size: 250% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: smoke-mod 3.5s ease-in-out infinite;
          filter: drop-shadow(0 0 5px rgba(167,139,250,0.7));
        }
        .name-admin {
          background: linear-gradient(90deg,
            #60a5fa 0%, #bfdbfe 30%, #e0f2fe 55%, #bfdbfe 75%, #60a5fa 100%);
          background-size: 220% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer-blue 7s linear infinite;
          filter: drop-shadow(0 0 8px rgba(96,165,250,0.55));
        }
        .name-mod {
          background: linear-gradient(90deg,
            #3b0764 0%, #6d28d9 15%, #a78bfa 35%, #ddd6fe 52%, #f5f3ff 60%, #c4b5fd 73%, #7c3aed 88%, #3b0764 100%);
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
      {/* fixed: header(56px) ile bottom-nav(70px) arasını kapla — Layout scroll'undan bağımsız.
          Inline style: calc içinde + etrafı boşluklu olmalı, yoksa CSS geçersiz sayar. */}
      <div
        className="fixed left-0 right-0 flex flex-col bg-background z-20"
        style={{ top: "56px", bottom: "calc(70px + env(safe-area-inset-bottom))" }}
      >
        {/* Admin/Moderatör sohbet temizleme butonu */}
        {user && (user.role === "admin" || user.role === "moderator") && (
          <div className="flex items-center justify-end px-4 py-2 border-b border-white/5 bg-background/60 backdrop-blur shrink-0">
            <button
              onClick={handleClearChat}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-red-400/70 hover:text-red-400 hover:bg-red-500/10 px-3 py-1.5 rounded-lg transition-all active:scale-95">
              <Trash2 className="w-3.5 h-3.5" />
              Sohbeti Temizle
            </button>
          </div>
        )}
        {/* min-h-0: flex-1 + overflow-y-auto'nun çalışması için zorunlu */}
        <div ref={msgContainerRef} className="flex-1 min-h-0 overflow-y-auto py-4 space-y-3">
          {isLoading ? (
            <div className="flex justify-center items-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">Henüz mesaj yok. İlk mesajı sen gönder!</div>
          ) : (
            messages.map(msg => renderMsg(msg))
          )}
          <div ref={scrollRef} />
        </div>

        <div className="shrink-0 bg-background/90 backdrop-blur-xl border-t border-white/10 p-4">
          {!user ? (
            <div className="text-center py-2 text-sm text-muted-foreground">
              Mesaj yazmak için <a href="/giris" className="text-primary font-medium">giriş yapmanız</a> gerekiyor.
            </div>
          ) : (
            <form onSubmit={handleSend} className="max-w-lg mx-auto relative">
              {/* @ suggestions */}
              <AnimatePresence>
                {mentionQuery !== null && suggestions.length > 0 && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                    className="absolute bottom-full left-0 right-0 mb-2 glass-card rounded-2xl overflow-hidden border border-white/10 shadow-xl">
                    {suggestions.map(s => (
                      <button key={s.id} type="button" onClick={() => insertMention(s.username)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors text-left">
                        <div className="w-7 h-7 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[10px] font-bold text-white"
                          style={{ background: s.avatarUrl ? "transparent" : "linear-gradient(135deg,#4F46E5,#7C3AED)" }}>
                          {s.avatarUrl ? <img src={s.avatarUrl} alt={s.username} className="w-full h-full object-cover" /> : s.username.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <span className="text-sm font-medium">{s.displayName || s.username}</span>
                          {s.displayName && <span className="text-[10px] text-muted-foreground ml-1">@{s.username}</span>}
                        </div>
                        <RoleBadge role={s.role} />
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Reply preview */}
              <AnimatePresence>
                {replyTo && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                    className="absolute bottom-full left-0 right-0 mb-2 p-3 glass-card rounded-xl text-xs flex justify-between items-start border border-white/10">
                    <div className="pl-2 border-l-2 border-primary">
                      <div className="font-semibold text-primary mb-0.5">{chatName(replyTo)} ↩</div>
                      <div className="line-clamp-1 text-foreground/70">{replyTo.content}</div>
                    </div>
                    <button type="button" onClick={() => setReplyTo(null)} className="p-1 text-muted-foreground hover:text-foreground ml-2 shrink-0">
                      <X className="w-4 h-4" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Spam geri sayımı */}
              {cooldownLeft > 0 && (
                <div className="flex items-center gap-2 mb-2 px-1">
                  <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-amber-400"
                      initial={{ width: "100%" }}
                      animate={{ width: "0%" }}
                      transition={{ duration: cooldownLeft, ease: "linear" }}
                    />
                  </div>
                  <span className="text-[11px] text-amber-400 font-bold shrink-0">{cooldownLeft}s</span>
                </div>
              )}
              <div className="flex space-x-2">
                <Input
                  ref={inputRef}
                  value={content}
                  onChange={e => handleInputChange(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && mentionQuery === null) { e.preventDefault(); handleSend(e as any); } }}
                  placeholder={cooldownLeft > 0 ? `${cooldownLeft}s sonra mesaj gönderebilirsin...` : replyTo ? `${chatName(replyTo)}'e yanıtla...` : "Mesajınızı yazın... (@ ile etiketle)"}
                  className="glass-card border-white/10 rounded-full h-12 px-5 text-sm"
                  maxLength={500}
                  autoComplete="off"
                  disabled={cooldownLeft > 0}
                />
                <Button type="submit" disabled={!content.trim() || sending || cooldownLeft > 0}
                  className="rounded-full w-12 h-12 shrink-0 bg-gradient-to-r from-primary to-secondary text-white shadow-lg">
                  {sending ? <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" /> : cooldownLeft > 0 ? <span className="text-xs font-bold">{cooldownLeft}</span> : <Send className="w-5 h-5" />}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </Layout>
  );
}

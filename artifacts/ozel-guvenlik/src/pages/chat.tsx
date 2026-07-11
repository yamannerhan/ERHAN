import React, { useEffect, useLayoutEffect, useState, useRef, useCallback } from "react";
import { useGetChatMessages } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { useAuth } from "@/contexts/AuthContext";
import { io, Socket } from "socket.io-client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, X, Bot, Zap, CornerUpLeft, Trash2, Settings, BarChart2 } from "lucide-react";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import type { ChatMessage } from "@workspace/api-client-react";
import { playChatMessageSound } from "@/lib/notif-prefs";
import { NotifPrefsPanel } from "@/components/notif-prefs-panel";
import { ChatMessageItem } from "@/components/chat-message-item";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";

function getToken() { return localStorage.getItem("auth_token") ?? ""; }

function isDbMessageId(id: number): boolean {
  return Number.isFinite(id) && id > 0 && id < 1_000_000_000;
}

interface SystemMsg { id: number; type: "join" | "welcome" | "cleared"; text: string; createdAt: string; }
type Reaction = { emoji: string; userId: number; username: string; displayName: string | null };
type PollData = {
  id: number; question: string; options: string[]; counts: number[];
  totalVotes: number; myVote: number | null; isClosed: boolean;
};
type ExtMsg = ChatMessage & {
  displayName?: string | null; isFake?: boolean; isBot?: boolean;
  reactions?: Reaction[]; poll?: PollData | null;
  level?: number; xp?: number;
  badges?: Array<{ id: number; name: string; slug: string; emoji: string; color: string; description?: string | null }>;
  avatarFrame?: string | null;
  chatBubble?: string | null;
};
type AnyMsg = ExtMsg | SystemMsg;
function isSystem(m: AnyMsg): m is SystemMsg { return "type" in m; }

function isRealHuman(msg: ExtMsg): boolean {
  if (msg.isBot || msg.isFake) return false;
  if (msg.userId <= 0) return false;
  if (msg.userRole === "bot") return false;
  return true;
}

/** Sadece sistem botları (sahte üye kartları üye stili kalsın) */
function isSystemBot(msg: ExtMsg): boolean {
  if (msg.userRole === "bot" || msg.isBot) return true;
  if (msg.userId === 0 || msg.userId === -999) return true;
  return false;
}

function isJoinAnnounce(msg: ExtMsg): boolean {
  return /aramıza katıldı|hoşgeldin/i.test(msg.content ?? "");
}

/** Son 100 üye + son 120 diğer mesajı koru (giriş/çıkışta üye mesajları silinmesin) */
function mergePreserveMessages(prev: AnyMsg[], incoming: ExtMsg[]): AnyMsg[] {
  const map = new Map<number, ExtMsg>();
  for (const m of prev) {
    if (!isSystem(m)) map.set((m as ExtMsg).id, m as ExtMsg);
  }
  for (const m of incoming) {
    if (!isDbMessageId(m.id)) continue;
    map.set(m.id, m);
  }
  const all = [...map.values()].sort((a, b) => a.id - b.id);
  const humans = all.filter(isRealHuman).slice(-100);
  const others = all.filter((m) => !isRealHuman(m)).slice(-120);
  const keep = new Set<number>([...humans, ...others].map((m) => m.id));
  return all.filter((m) => keep.has(m.id));
}

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
  const keyboardInset = useKeyboardInset();
  const [content, setContent] = useState("");
  const [replyTo, setReplyTo] = useState<ExtMsg | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const msgContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<AnyMsg[]>([]);
  const [feedMode, setFeedMode] = useState<"all" | "members">("all");
  const [sending, setSending] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
  const [activeMsg, setActiveMsg] = useState<number | null>(null);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [showNotifSettings, setShowNotifSettings] = useState(false);
  const [showPollForm, setShowPollForm] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState("Evet\nHayır");
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncInFlightRef = useRef(false);
  const messageIdsRef = useRef<Set<number>>(new Set());
  const systemKeysRef = useRef<Set<string>>(new Set());
  const lastSeenMessageIdRef = useRef(0);

  const { data: initialData, isLoading } = useGetChatMessages({ limit: 100 });

  // Çift mesaj önleme: aynı id'li mesaj zaten varsa ekleme
  const rememberMessageIds = (items: AnyMsg[]) => {
    const ids = items.filter(m => !isSystem(m)).map(m => (m as ExtMsg).id);
    messageIdsRef.current = new Set(ids);
    const dbIds = ids.filter(isDbMessageId);
    if (dbIds.length > 0) {
      lastSeenMessageIdRef.current = Math.max(lastSeenMessageIdRef.current, ...dbIds);
    }
  };

  useEffect(() => {
    if (!initialData) return;
    const list = (initialData as ExtMsg[]).filter((m) => isDbMessageId(m.id));
    setMessages((prev) => {
      const next = mergePreserveMessages(prev, list);
      rememberMessageIds(next);
      return next;
    });
  }, [initialData]);

  const scrollToBottom = useCallback(() => {
    const jump = () => {
      scrollRef.current?.scrollIntoView({ block: "end", behavior: "instant" });
    };
    jump();
    requestAnimationFrame(jump);
    setTimeout(jump, 60);
    setTimeout(jump, 200);
  }, []);

  const addMsg = useCallback((msg: AnyMsg): boolean => {
    if (!isSystem(msg) && messageIdsRef.current.has((msg as ExtMsg).id)) {
      return false;
    }
    if (isSystem(msg)) {
      const key = `${msg.type}:${msg.text}`;
      if (systemKeysRef.current.has(key)) return false;
      systemKeysRef.current.add(key);
    } else {
      const id = (msg as ExtMsg).id;
      messageIdsRef.current.add(id);
      if (isDbMessageId(id)) {
        lastSeenMessageIdRef.current = Math.max(lastSeenMessageIdRef.current, id);
      }
    }

    setMessages(prev => {
      if (!isSystem(msg) && prev.some(m => !isSystem(m) && (m as ExtMsg).id === (msg as ExtMsg).id)) {
        return prev;
      }
      if (isSystem(msg)) {
        const next = [...prev, msg].slice(-220);
        rememberMessageIds(next);
        return next;
      }
      const next = mergePreserveMessages(prev, [msg as ExtMsg]);
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
      const headers = getToken() ? { Authorization: `Bearer ${getToken()}` } : {};
      const fetchJson = async (url: string) => {
        const res = await fetch(url, { headers, cache: "no-store" });
        const data = await res.json().catch(() => null);
        return Array.isArray(data) ? (data as ExtMsg[]) : [];
      };

      let incoming: ExtMsg[] = [];
      if (after > 0 && isDbMessageId(after)) {
        incoming = await fetchJson(`/api/chat/messages?limit=100&after=${after}`);
      } else {
        // İlk yükleme: karışık akış + ayrı son 100 üye (yenilemede üye mesajları kalsın)
        const [mixed, humans] = await Promise.all([
          fetchJson("/api/chat/messages?limit=100"),
          fetchJson("/api/chat/messages?limit=100&humansOnly=1"),
        ]);
        const byId = new Map<number, ExtMsg>();
        for (const m of [...mixed, ...humans]) {
          if (isDbMessageId(m.id)) byId.set(m.id, m);
        }
        incoming = [...byId.values()].sort((a, b) => a.id - b.id);
      }

      if (incoming.length === 0) return;
      setMessages(prev => {
        const next = mergePreserveMessages(prev, incoming);
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
      if (user?.id && s.connected) s.emit("authenticate", { userId: user.id });
    };
    s.on("connect", authenticate);
    s.on("chat:message", (msg: ExtMsg) => {
      const added = addMsg(msg);
      if (
        added
        && !isSystem(msg)
        && isRealHuman(msg)
        && msg.userId !== user?.id
      ) {
        playChatMessageSound();
      }
    });
    s.on("chat:delete", ({ id }: { id: number }) => {
      setMessages(prev => prev.filter(m => isSystem(m) || (m as ExtMsg).id !== id));
    });
    s.on("chat:pin", ({ id, isPinned }: { id: number; isPinned: boolean }) => {
      setMessages(prev => prev.map(m =>
        !isSystem(m) && (m as ExtMsg).id === id ? { ...(m as ExtMsg), isPinned } : m
      ));
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
    s.on("chat:poll:update", (poll: PollData) => {
      setMessages(prev => prev.map(m => {
        if (isSystem(m)) return m;
        const cm = m as ExtMsg;
        if (cm.poll?.id === poll.id) return { ...cm, poll };
        return m;
      }));
    });
    s.on("chat:cleared", () => {
      setMessages([]);
    });
    if (s.connected) authenticate();
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
        setContent("");
        setReplyTo(null);
        setMentionQuery(null);
        // Socket ekler; HTTP ile çift ekleme yok — 800ms sonra yoksa ekle
        if (sent?.id) {
          window.setTimeout(() => { addMsg(sent); }, 800);
        }
        if (user.role !== "admin" && user.role !== "moderator") {
          startCooldown(5);
        }
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
    const isBot = isSystemBot(chatMsg);
    const isMe = !isBot && user?.id === chatMsg.userId;
    const canMod = !!(user && (user.role === "admin" || user.role === "moderator"));
    const msgReactions: Reaction[] = chatMsg.reactions ?? [];
    const reactionGroups = msgReactions.reduce((acc, r) => {
      acc[r.emoji] = acc[r.emoji] ?? [];
      acc[r.emoji]!.push(r);
      return acc;
    }, {} as Record<string, Reaction[]>);
    const isActive = activeMsg === chatMsg.id;
    const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

    const row = (
      <ChatMessageItem
        msg={chatMsg}
        isOwn={!!isMe}
        currentUsername={user?.username}
        token={getToken()}
        canModerate={canMod && isDbMessageId(chatMsg.id)}
        canPin={user?.role === "admin" && isDbMessageId(chatMsg.id)}
        renderContent={renderMessageContent}
        active={isActive}
        memberStyle={!isSystemBot(chatMsg)}
        onActivate={() => setActiveMsg(isActive ? null : chatMsg.id)}
        onReply={user ? (m) => { setReplyTo(m as ExtMsg); setActiveMsg(null); } : undefined}
        onDeleted={(id) => setMessages((prev) => prev.filter((m) => isSystem(m) || (m as ExtMsg).id !== id))}
        onPinned={(id, pinned) => setMessages((prev) => prev.map((m) =>
          !isSystem(m) && (m as ExtMsg).id === id ? { ...(m as ExtMsg), isPinned: pinned } : m
        ))}
        onPollUpdate={(id, p) => setMessages((prev) => prev.map((m) =>
          !isSystem(m) && (m as ExtMsg).id === id ? { ...(m as ExtMsg), poll: p } : m
        ))}
      />
    );

    return (
      <SwipeableMessage key={chatMsg.id} onReply={() => setReplyTo(chatMsg)}>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="px-2">
          {row}
          {Object.entries(reactionGroups).length > 0 && (
            <div className={`flex flex-wrap gap-1 mt-1 ${isMe ? "justify-end" : "justify-start"}`}>
              {Object.entries(reactionGroups).map(([emoji, users]) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleReact(chatMsg.id, emoji); }}
                  className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-all active:scale-95 ${
                    users.some((r) => r.userId === user?.id)
                      ? "bg-primary/20 border-primary/50 text-primary"
                      : "bg-white/5 border-white/10 text-foreground/70 hover:bg-white/10"
                  }`}
                >
                  <span>{emoji}</span><span className="font-medium">{users.length}</span>
                </button>
              ))}
            </div>
          )}
          <AnimatePresence>
            {isActive && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -4 }}
                transition={{ duration: 0.15 }}
                className={`flex items-center gap-1 mt-1 ${isMe ? "justify-end" : "justify-start"}`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-0.5 bg-[#1E293B] border border-white/10 rounded-2xl px-2 py-1.5 shadow-xl">
                  {QUICK_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => handleReact(chatMsg.id, emoji)}
                      className={`text-lg leading-none p-1 rounded-xl transition-all active:scale-90 hover:scale-110 hover:bg-white/10 ${
                        msgReactions.some((r) => r.userId === user?.id && r.emoji === emoji) ? "bg-primary/20" : ""
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </SwipeableMessage>
    );
  };

  return (
    <Layout>
      {/* fixed: header(56px) ile bottom-nav(70px) arasını kapla — Layout scroll'undan bağımsız.
          Inline style: calc içinde + etrafı boşluklu olmalı, yoksa CSS geçersiz sayar. */}
      <div
        className="fixed left-0 right-0 flex flex-col bg-background z-20"
        style={{
          top: "calc(56px + env(safe-area-inset-top, 0px))",
          bottom: keyboardInset > 0
            ? `${keyboardInset}px`
            : "calc(70px + env(safe-area-inset-bottom))",
        }}
      >
        {/* Admin/Moderatör sohbet araçları + bildirim ayarı */}
        <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-white/5 bg-background/60 backdrop-blur shrink-0">
          <button
            type="button"
            onClick={() => setShowNotifSettings(v => !v)}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-400/80 hover:text-amber-400 hover:bg-amber-500/10 px-3 py-1.5 rounded-lg transition-all"
          >
            <Settings className="w-3.5 h-3.5" />
            Bildirimler
          </button>
          <div className="flex items-center gap-1">
            {user && (user.role === "admin" || user.role === "moderator") && (
              <>
                <button
                  type="button"
                  onClick={() => setShowPollForm(v => !v)}
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-400/80 hover:text-sky-400 hover:bg-sky-500/10 px-3 py-1.5 rounded-lg transition-all"
                >
                  <BarChart2 className="w-3.5 h-3.5" />
                  Anket
                </button>
                <button
                  onClick={handleClearChat}
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-red-400/70 hover:text-red-400 hover:bg-red-500/10 px-3 py-1.5 rounded-lg transition-all active:scale-95">
                  <Trash2 className="w-3.5 h-3.5" />
                  Temizle
                </button>
              </>
            )}
          </div>
        </div>
        {showNotifSettings && user && (
          <div className="px-4 py-3 border-b border-white/5 bg-black/40 shrink-0 max-h-64 overflow-y-auto">
            <NotifPrefsPanel compact onSaved={() => setShowNotifSettings(false)} />
          </div>
        )}
        {showPollForm && user && (user.role === "admin" || user.role === "moderator") && (
          <div className="px-4 py-3 border-b border-white/5 bg-black/40 shrink-0 space-y-2">
            <Input
              value={pollQuestion}
              onChange={(e) => setPollQuestion(e.target.value)}
              placeholder="Anket sorusu"
              className="h-9 text-sm"
            />
            <textarea
              value={pollOptions}
              onChange={(e) => setPollOptions(e.target.value)}
              placeholder={"Her satıra bir seçenek\nEvet\nHayır"}
              className="w-full min-h-[72px] rounded-md bg-white/5 border border-white/10 px-3 py-2 text-sm"
            />
            <Button
              type="button"
              className="w-full h-9 bg-sky-500 hover:bg-sky-400 text-black font-bold"
              onClick={async () => {
                const options = pollOptions.split("\n").map(s => s.trim()).filter(Boolean);
                if (!pollQuestion.trim() || options.length < 2) return;
                const res = await fetch("/api/chat/polls", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
                  body: JSON.stringify({ question: pollQuestion.trim(), options }),
                });
                if (res.ok) {
                  const sent = await res.json() as ExtMsg;
                  addMsg(sent);
                  setShowPollForm(false);
                  setPollQuestion("");
                  setPollOptions("Evet\nHayır");
                }
              }}
            >
              Anketi Paylaş
            </Button>
          </div>
        )}
        <div className="flex gap-1.5 px-4 py-2 border-b border-white/5 shrink-0">
          {([
            { id: "all" as const, label: "Tümü" },
            { id: "members" as const, label: "Üyeler" },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setFeedMode(t.id)}
              className={`px-3 py-1 rounded-full text-[11px] font-bold transition-colors ${
                feedMode === t.id ? "bg-amber-400 text-black" : "bg-white/5 text-white/50 hover:bg-white/10"
              }`}
            >
              {t.label}
            </button>
          ))}
          <span className="ml-auto text-[10px] text-white/30 self-center">Üyeler = gerçek kullanıcılar</span>
        </div>
        {(() => {
          const pinnedMsgs = messages.filter(m => !isSystem(m) && (m as ExtMsg).isPinned) as ExtMsg[];
          if (pinnedMsgs.length === 0) return null;
          return (
            <div className="shrink-0 border-b border-amber-400/20 bg-amber-400/8 px-3 py-2 space-y-1.5 max-h-28 overflow-y-auto">
              {pinnedMsgs.map((pm) => (
                <div key={`pin-${pm.id}`} className="flex items-start gap-2 text-[11px]">
                  <span className="text-amber-300 shrink-0 mt-0.5">📌</span>
                  <div className="min-w-0 flex-1">
                    <span className="font-bold text-amber-200/90">{pm.displayName || pm.username}</span>
                    <p className="text-white/70 line-clamp-2 leading-snug">{pm.content}</p>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
        {/* min-h-0: flex-1 + overflow-y-auto'nun çalışması için zorunlu */}
        <div ref={msgContainerRef} className="flex-1 min-h-0 overflow-y-auto py-4 space-y-3">
          {isLoading ? (
            <div className="flex justify-center items-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">Henüz mesaj yok. İlk mesajı sen gönder!</div>
          ) : (
            messages
              .filter(m => feedMode === "all" || isSystem(m) || isRealHuman(m as ExtMsg) || isJoinAnnounce(m as ExtMsg))
              .slice(feedMode === "members" ? -100 : undefined)
              .map(msg => renderMsg(msg))
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
                    className="absolute bottom-full left-0 right-0 mb-2 glass-card rounded-2xl overflow-hidden border border-amber-400/30 shadow-xl z-30 max-h-56 overflow-y-auto">
                    <div className="px-3 py-1.5 text-[10px] text-amber-400/80 font-bold border-b border-white/5">Kullanıcı etiketle</div>
                    {suggestions.map(s => (
                      <button key={s.id} type="button" onClick={() => insertMention(s.username)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors text-left">
                        <div className="w-7 h-7 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[10px] font-bold text-white"
                          style={{ background: s.avatarUrl ? "transparent" : "linear-gradient(135deg,#4F46E5,#7C3AED)" }}>
                          {s.avatarUrl ? <img src={s.avatarUrl} alt={s.username} className="w-full h-full object-cover" /> : s.username.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium">{s.displayName || s.username}</span>
                          <span className="text-[10px] text-muted-foreground ml-1">@{s.username}</span>
                        </div>
                        <RoleBadge role={s.role} />
                      </button>
                    ))}
                  </motion.div>
                )}
                {mentionQuery !== null && suggestions.length === 0 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="absolute bottom-full left-0 right-0 mb-2 px-3 py-2 glass-card rounded-xl border border-white/10 text-[11px] text-muted-foreground z-30">
                    Kullanıcı aranıyor…
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
                  onFocus={() => {
                    setTimeout(() => {
                      inputRef.current?.scrollIntoView({ block: "nearest" });
                      scrollToBottom();
                    }, 50);
                  }}
                  onKeyDown={e => {
                    if (e.key === "Escape" && mentionQuery !== null) {
                      setMentionQuery(null);
                      setSuggestions([]);
                      return;
                    }
                    if (e.key === "Enter" && !e.shiftKey) {
                      if (mentionQuery !== null && suggestions.length > 0) {
                        e.preventDefault();
                        insertMention(suggestions[0]!.username);
                        return;
                      }
                      e.preventDefault();
                      handleSend(e as any);
                    }
                  }}
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

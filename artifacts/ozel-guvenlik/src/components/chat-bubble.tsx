import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Maximize2, Bot, Trash2, Megaphone, Minus, Settings, BarChart2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useLocation } from "wouter";
import { io, Socket } from "socket.io-client";
import type { ChatMessage } from "@workspace/api-client-react";
import { playChatMessageSound } from "@/lib/notif-prefs";
import { NotifPrefsPanel } from "@/components/notif-prefs-panel";
import { ChatMessageItem } from "@/components/chat-message-item";
import { FramedAvatar } from "@/components/framed-avatar";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";

function getToken() { return localStorage.getItem("auth_token") ?? ""; }

interface SystemMsg { id: number; type: "join" | "welcome"; text: string; createdAt: string; }
type PollData = {
  id: number; question: string; options: string[]; counts: number[];
  totalVotes: number; myVote: number | null; isClosed: boolean;
};
type ExtMsg = ChatMessage & {
  isBot?: boolean;
  isFake?: boolean;
  displayName?: string | null;
  poll?: PollData | null;
  level?: number;
  xp?: number;
  badges?: Array<{ id: number; name: string; slug: string; emoji: string; color: string; description?: string | null }>;
  avatarFrame?: string | null;
  chatBubble?: string | null;
};
type AnyMsg = ExtMsg | SystemMsg;
function isSystem(m: AnyMsg): m is SystemMsg { return "type" in m; }

/** Gerçek üye mesajı — bot / sahte kullanıcı değil */
function isRealHuman(msg: ExtMsg): boolean {
  if (msg.isBot || msg.isFake) return false;
  if (msg.userId <= 0) return false;
  if (msg.userRole === "bot") return false;
  return true;
}

function isBotOrFake(msg: ExtMsg): boolean {
  return !isRealHuman(msg);
}

/** Sadece sistem botları (sahte üye kartları üye stili kalsın) */
function isSystemBot(msg: ExtMsg): boolean {
  if (msg.userRole === "bot" || msg.isBot) return true;
  if (msg.userId === 0 || msg.userId === -999) return true;
  return false;
}

/** Yeni üye katılım duyurusu — Üyeler sekmesinde kalsın */
function isJoinAnnounce(msg: ExtMsg): boolean {
  return /aramıza katıldı|hoşgeldin/i.test(msg.content ?? "");
}

/** DB serial id (socket Date.now() id'lerini sayma) */
function isDbMessageId(id: number): boolean {
  return Number.isFinite(id) && id > 0 && id < 1_000_000_000;
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

const STICKY_SKIP_KEY = "chat_skipped_sticky_id";

function renderMessageContent(content: string) {
  const parts = content.split(/(\*\*[^*]+\*\*|@\w+|\/ilan\/\d+)/g);
  return parts.map((part, i) => {
    if (/^\*\*([^*]+)\*\*$/.test(part)) {
      return <span key={i} className="font-bold text-amber-300 underline underline-offset-2">{part.slice(2, -2)}</span>;
    }
    if (/^\/ilan\/\d+$/.test(part)) {
      return <a key={i} href={part} className="ml-1 inline-flex rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold text-amber-300 hover:bg-amber-400/30">İlana git</a>;
    }
    if (part.startsWith("@")) return <span key={i} className="text-amber-300 font-semibold">{part}</span>;
    return part;
  });
}

/** Referans görseldeki cam/neon sohbet balonu FAB */
function ChatFabIcon({ unread, pulse }: { unread: number; pulse: boolean }) {
  return (
    <div className="relative w-[58px] h-[58px] flex items-center justify-center">
      {/* Dış altın halka + cam gövde */}
      <div
        className="absolute inset-0 rounded-[22px]"
        style={{
          background: "linear-gradient(145deg, rgba(255,200,60,0.95) 0%, rgba(180,120,20,0.85) 40%, rgba(40,180,255,0.55) 100%)",
          padding: "2.5px",
          boxShadow: pulse
            ? "0 0 28px rgba(255,193,7,0.75), 0 0 48px rgba(56,189,248,0.35)"
            : "0 8px 28px rgba(0,0,0,0.55), 0 0 18px rgba(255,193,7,0.45), 0 0 10px rgba(56,189,248,0.25)",
        }}
      >
        <div
          className="w-full h-full rounded-[19px] relative overflow-hidden"
          style={{
            background: "radial-gradient(circle at 30% 25%, #3a455c 0%, #151a24 55%, #0a0d14 100%)",
          }}
        >
          {/* Parlama */}
          <div className="absolute inset-x-2 top-1 h-3 rounded-full opacity-40" style={{ background: "linear-gradient(180deg,rgba(255,255,255,0.55),transparent)" }} />
          {/* İç ikon: balon + 3 nokta */}
          <svg viewBox="0 0 48 48" className="absolute inset-0 m-auto w-7 h-7" fill="none">
            <path
              d="M10 14c0-3.3 2.7-6 6-6h16c3.3 0 6 2.7 6 6v10c0 3.3-2.7 6-6 6H22l-7 6v-6h-1c-3.3 0-6-2.7-6-6V14z"
              stroke="#F5C518"
              strokeWidth="2.4"
              strokeLinejoin="round"
              style={{ filter: "drop-shadow(0 0 4px rgba(245,197,24,0.85))" }}
            />
            <circle cx="20" cy="19" r="1.7" fill="#F5C518" />
            <circle cx="24" cy="19" r="1.7" fill="#F5C518" />
            <circle cx="28" cy="19" r="1.7" fill="#F5C518" />
          </svg>
        </div>
      </div>

      {/* Yeşil online */}
      <span
        className="absolute bottom-1 right-1 w-3 h-3 rounded-full bg-emerald-400 border-[2.5px] border-[#0a0d14] z-10"
        style={{ boxShadow: "0 0 8px rgba(52,211,153,1)" }}
      />

      {/* Kırmızı 9+ — sadece gerçek insan */}
      {unread > 0 && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1 rounded-[7px] bg-gradient-to-b from-red-400 to-red-600 text-white text-[10px] font-black flex items-center justify-center z-10 border border-red-300/40"
          style={{ boxShadow: "0 0 10px rgba(239,68,68,0.85)" }}
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
  const keyboardInset = useKeyboardInset();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AnyMsg[]>([]);
  const [content, setContent] = useState("");
  const [replyTo, setReplyTo] = useState<ExtMsg | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [unread, setUnread] = useState(0);
  const [sending, setSending] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [sendError, setSendError] = useState("");
  const [onlineCount, setOnlineCount] = useState(0);
  const [feedMode, setFeedMode] = useState<"all" | "members">("all");
  const [chatTicker, setChatTicker] = useState("Küfür, hakaret, reklam ve yanıltıcı ilan yasaktır.");
  const [chatPinned, setChatPinned] = useState<string | null>(null);
  const [showNotifSettings, setShowNotifSettings] = useState(false);
  const [showPollForm, setShowPollForm] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState("Evet\nHayır");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Array<{
    id: number; username: string; displayName?: string | null; avatarUrl: string | null; role: string;
  }>>([]);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sendErrorRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const msgContainerRef = useRef<HTMLDivElement>(null);
  const msgInnerRef = useRef<HTMLDivElement>(null);
  const syncInFlightRef = useRef(false);
  const messageIdsRef = useRef<Set<number>>(new Set());
  const systemKeysRef = useRef<Set<string>>(new Set());
  const lastSeenMessageIdRef = useRef(0);
  const pinnedRef = useRef(true);
  const openRef = useRef(open);
  const userRef = useRef(user);
  const isOnChatPage = location === "/sohbet";

  useEffect(() => { openRef.current = open; }, [open]);
  useEffect(() => { userRef.current = user; }, [user]);

  const scrollToBottom = useCallback(() => {
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

  const rememberMessageIds = (items: AnyMsg[]) => {
    const ids = items.filter(m => !isSystem(m)).map(m => (m as ExtMsg).id);
    messageIdsRef.current = new Set(ids);
    const dbIds = ids.filter(isDbMessageId);
    if (dbIds.length > 0) {
      lastSeenMessageIdRef.current = Math.max(lastSeenMessageIdRef.current, ...dbIds);
    }
  };

  const bumpUnreadIfHuman = (msg: ExtMsg) => {
    if (openRef.current) return;
    const u = userRef.current;
    const replyToMe = !!u?.username && msg.replyToUsername === u.username;
    if (isRealHuman(msg) || replyToMe) {
      setUnread(n => n + 1);
      setPulse(true);
      setTimeout(() => setPulse(false), 600);
    }
  };

  const addMsg = useCallback((msg: AnyMsg): boolean => {
    if (!isSystem(msg) && messageIdsRef.current.has((msg as ExtMsg).id)) return false;
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

    if (!isSystem(msg)) bumpUnreadIfHuman(msg as ExtMsg);
    else {
      setPulse(true);
      setTimeout(() => setPulse(false), 600);
    }
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
        const existingIds = new Set(prev.filter(m => !isSystem(m)).map(m => (m as ExtMsg).id));
        const fresh = incoming.filter(m => !existingIds.has(m.id) && isDbMessageId(m.id));
        const humanIncoming = (after > 0 ? fresh : incoming).filter(isRealHuman);
        if (!openRef.current && fresh.length > 0 && humanIncoming.length > 0 && after > 0) {
          setUnread(n => n + humanIncoming.length);
          setPulse(true);
          setTimeout(() => setPulse(false), 600);
        }
        const next = mergePreserveMessages(prev, incoming);
        rememberMessageIds(next);
        return next;
      });
    } catch {
      // ignore
    } finally {
      syncInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    void syncLatestMessages();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void syncLatestMessages();
    }, 1000);
    return () => window.clearInterval(id);
  }, [syncLatestMessages]);

  useEffect(() => {
    fetch("/api/chat/announcements", { cache: "no-store" })
      .then(r => r.json())
      .then((d: { ticker?: string; pinned?: string | null }) => {
        if (d?.ticker) setChatTicker(d.ticker);
        setChatPinned(d?.pinned?.trim() || null);
      })
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    // Tam ekran /sohbet sayfasındayken bubble socket bağlanmasın (çift mesaj)
    if (isOnChatPage) return;

    const s = io(window.location.origin, {
      path: "/ws",
      transports: ["polling", "websocket"],
      upgrade: true,
      secure: window.location.protocol === "https:",
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
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
      if (added && isRealHuman(msg) && msg.userId !== userRef.current?.id) {
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
    s.on("chat:cleared", () => setMessages([]));
    s.on("chat:join", ({ username }: { username: string }) => {
      addMsg({ id: Date.now(), type: "join", text: `${username} sohbete katıldı`, createdAt: new Date().toISOString() });
    });
    s.on("chat:welcome", ({ message }: { message: string }) => {
      addMsg({ id: Date.now() + 1, type: "welcome", text: message, createdAt: new Date().toISOString() });
    });
    s.on("chat:poll:update", (poll: PollData) => {
      setMessages(prev => prev.map(m => {
        if (isSystem(m)) return m;
        const cm = m as ExtMsg;
        if (cm.poll?.id === poll.id) return { ...cm, poll };
        return m;
      }));
    });
    s.on("online_count", ({ count }: { count: number }) => {
      if (typeof count === "number") setOnlineCount(count);
    });
    if (s.connected) authenticate();
    return () => {
      s.off("connect", authenticate);
      s.disconnect();
      setSocket(null);
    };
  }, [user?.id, addMsg, isOnChatPage]);

  useEffect(() => {
    if (open) {
      setUnread(0);
      scrollToBottom();
    }
  }, [open, scrollToBottom]);

  // Son gerçek insan mesajı — altına bot yağsa bile sticky kalır
  const [skippedStickyId, setSkippedStickyId] = useState<number | null>(() => {
    try {
      const raw = localStorage.getItem(STICKY_SKIP_KEY);
      if (!raw) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  });

  const skipSticky = useCallback((id: number) => {
    setSkippedStickyId(id);
    try { localStorage.setItem(STICKY_SKIP_KEY, String(id)); } catch { /* ignore */ }
  }, []);

  const clearStickySkip = useCallback(() => {
    setSkippedStickyId(null);
    try { localStorage.removeItem(STICKY_SKIP_KEY); } catch { /* ignore */ }
  }, []);

  const stickyHuman = useMemo(() => {
    const chatMsgs = messages.filter((m): m is ExtMsg => !isSystem(m));
    let lastHuman: ExtMsg | null = null;
    for (let i = chatMsgs.length - 1; i >= 0; i--) {
      if (isRealHuman(chatMsgs[i]!)) {
        lastHuman = chatMsgs[i]!;
        break;
      }
    }
    if (!lastHuman) return null;
    if (skippedStickyId != null && lastHuman.id === skippedStickyId) return null;
    const after = chatMsgs.filter(m => m.id > lastHuman!.id);
    const hasHumanAfter = after.some(isRealHuman);
    if (hasHumanAfter) return null;
    // Altında yalnızca bot/sahte varsa sticky göster
    if (after.length === 0) return null; // zaten en altta
    if (after.every(isBotOrFake)) return lastHuman;
    return null;
  }, [messages, skippedStickyId]);

  // Yeni üye mesajı gelince “geç” sıfırlanır (eski id artık geçerli değil)
  useEffect(() => {
    const chatMsgs = messages.filter((m): m is ExtMsg => !isSystem(m));
    for (let i = chatMsgs.length - 1; i >= 0; i--) {
      if (isRealHuman(chatMsgs[i]!)) {
        if (skippedStickyId != null && chatMsgs[i]!.id !== skippedStickyId) {
          clearStickySkip();
        }
        break;
      }
    }
  }, [messages, skippedStickyId, clearStickySkip]);

  const visibleMessages = useMemo(() => {
    if (feedMode === "members") {
      // Üyeler: gerçek insanlar + katılım duyuruları (yenilemede de kalsın)
      return messages.filter(m => {
        if (isSystem(m)) return true;
        const msg = m as ExtMsg;
        return isRealHuman(msg) || isJoinAnnounce(msg);
      }).slice(-100);
    }
    return messages;
  }, [messages, feedMode]);

  const lastMsg = visibleMessages[visibleMessages.length - 1] as { id?: number | string; createdAt?: string } | undefined;
  const lastMsgKey = lastMsg ? `${lastMsg.id ?? ""}|${lastMsg.createdAt ?? ""}` : "";
  useLayoutEffect(() => {
    // Tümü / Üyeler: canlı sohbet — her zaman son mesaja kaydır
    if (pinnedRef.current) scrollToBottom();
  }, [lastMsgKey, scrollToBottom, feedMode]);

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
        const sent = await r.json().catch(() => null) as ExtMsg | null;
        setContent("");
        setReplyTo(null);
        setMentionQuery(null);
        setSuggestions([]);
        // Socket zaten ekler — HTTP ile çift ekleme yapma; 800ms sonra yoksa ekle
        if (sent?.id) {
          window.setTimeout(() => { addMsg(sent); }, 800);
        }
        scrollToBottom();
        return;
      }
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
    } catch { /* ignore */ }
  };

  const startReply = (msg: ExtMsg) => {
    setReplyTo(msg);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const replyName = (msg: ExtMsg) => msg.displayName || msg.username;

  // @ etiket araması
  useEffect(() => {
    if (mentionQuery === null) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(mentionQuery)}`);
        if (res.ok) setSuggestions(await res.json());
      } catch { /* ignore */ }
    }, 100);
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
    const base = lastAt >= 0 ? content.slice(0, lastAt) : content;
    setContent(`${base}@${username} `);
    setMentionQuery(null);
    setSuggestions([]);
    inputRef.current?.focus();
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
      void sendMsg();
    }
  };

  if (isOnChatPage) return null;

  const [activeMsgId, setActiveMsgId] = useState<number | null>(null);

  const renderChatRow = (msg: AnyMsg) => {
    if (isSystem(msg)) {
      return (
        <motion.div key={msg.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="flex justify-center">
          {msg.type === "join" ? (
            <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-medium px-3 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {msg.text}
            </div>
          ) : (
            <div className="w-full rounded-2xl p-3 text-xs text-white/80 whitespace-pre-wrap leading-relaxed bg-amber-400/10 border border-amber-400/20">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Bot className="w-3 h-3 text-amber-400" />
                <span className="text-[10px] font-bold text-amber-400">ÖzelGüvenlik Bot</span>
              </div>
              {msg.text}
            </div>
          )}
        </motion.div>
      );
    }

    const chatMsg = msg;
    const isMe = user?.id === chatMsg.userId;
    const canMod = !!(user && (user.role === "admin" || user.role === "moderator"));

    return (
      <motion.div key={chatMsg.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
        <ChatMessageItem
          msg={chatMsg}
          isOwn={!!isMe && !isBotOrFake(chatMsg)}
          currentUsername={user?.username}
          token={getToken()}
          canModerate={canMod && isDbMessageId(chatMsg.id)}
          canPin={user?.role === "admin" && isDbMessageId(chatMsg.id)}
          renderContent={renderMessageContent}
          active={activeMsgId === chatMsg.id}
          memberStyle={!isSystemBot(chatMsg)}
          onActivate={() => setActiveMsgId((id) => (id === chatMsg.id ? null : chatMsg.id))}
          onReply={user ? (m) => startReply(m as ExtMsg) : undefined}
          onDeleted={(id) => setMessages((prev) => prev.filter((m) => isSystem(m) || (m as ExtMsg).id !== id))}
          onPinned={(id, pinned) => setMessages((prev) => prev.map((m) =>
            !isSystem(m) && (m as ExtMsg).id === id ? { ...(m as ExtMsg), isPinned: pinned } : m
          ))}
          onPollUpdate={(id, p) => setMessages((prev) => prev.map((m) =>
            !isSystem(m) && (m as ExtMsg).id === id ? { ...(m as ExtMsg), poll: p } : m
          ))}
        />
      </motion.div>
    );
  };

  return (
    <>
      {/* FAB */}
      <motion.button
        onClick={() => setOpen(o => !o)}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        animate={pulse && !open ? { scale: [1, 1.12, 1] } : {}}
        transition={{ duration: 0.28 }}
        className="fixed bottom-24 right-4 z-50 flex items-center justify-center bg-transparent border-0 p-0"
        aria-label="Topluluk sohbeti"
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.div
              key="x"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg,#1E293B,#334155)", boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}
            >
              <X className="w-5 h-5 text-white" />
            </motion.div>
          ) : (
            <motion.div key="chat" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }}>
              <ChatFabIcon unread={unread} pulse={pulse} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.92 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="fixed right-4 z-50 w-[22rem] flex flex-col rounded-[18px] overflow-hidden"
            style={{
              bottom: keyboardInset > 0
                ? `calc(${keyboardInset}px + 0.75rem)`
                : "calc(6rem + 56px)",
              background: "#12161f",
              border: "1px solid rgba(245,197,24,0.28)",
              boxShadow: "0 28px 64px rgba(0,0,0,0.65), 0 0 0 1px rgba(245,197,24,0.08)",
              height: keyboardInset > 0
                ? `min(420px, calc(100dvh - ${keyboardInset}px - 5rem))`
                : "min(520px, calc(100dvh - 11rem))",
            }}
          >
            {/* Header */}
            <div className="flex items-center gap-2.5 px-3.5 py-3 shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg,#F5C518,#B8860B)", boxShadow: "0 0 12px rgba(245,197,24,0.35)" }}>
                <svg viewBox="0 0 24 24" className="w-5 h-5 text-black" fill="currentColor">
                  <path d="M12 2l7 3v6c0 5-3.5 9.4-7 11-3.5-1.6-7-6-7-11V5l7-3zm0 2.2L7 6.1v4.8c0 3.7 2.4 7.1 5 8.6 2.6-1.5 5-4.9 5-8.6V6.1l-5-1.9z" />
                  <path d="M12 8.5l1.2 2.4 2.6.4-1.9 1.8.5 2.6L12 14.5l-2.4 1.2.5-2.6-1.9-1.8 2.6-.4L12 8.5z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-[15px] leading-tight">Topluluk Sohbeti</p>
                <p className="text-[11px] text-emerald-400 font-medium mt-0.5">
                  ● {onlineCount > 0 ? onlineCount : "—"} kişi çevrimiçi
                </p>
              </div>
              {(user?.role === "admin" || user?.role === "moderator") && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowPollForm(v => !v)}
                    className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center"
                    title="Anket paylaş"
                  >
                    <BarChart2 className="w-3.5 h-3.5 text-sky-300" />
                  </button>
                  <button onClick={handleClearChat} className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center" title="Sohbeti Temizle">
                    <Trash2 className="w-3.5 h-3.5 text-red-300" />
                  </button>
                </>
              )}
              {user && (
                <button onClick={() => setShowNotifSettings(v => !v)} className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center" title="Bildirim ayarları">
                  <Settings className="w-3.5 h-3.5 text-amber-300" />
                </button>
              )}
              <Link href="/sohbet" onClick={() => setOpen(false)} className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center" title="Tam ekran">
                <Maximize2 className="w-3.5 h-3.5 text-white/50" />
              </Link>
              <button onClick={() => setOpen(false)} className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center" title="Küçült">
                <Minus className="w-3.5 h-3.5 text-white/50" />
              </button>
              <button onClick={() => setOpen(false)} className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center">
                <X className="w-3.5 h-3.5 text-white/50" />
              </button>
            </div>

            {/* Duyuru — kayan yazı */}
            <div className="shrink-0 overflow-hidden relative h-8 flex items-center" style={{ background: "linear-gradient(90deg,#E8B923,#F5C518)" }}>
              <Megaphone className="w-3.5 h-3.5 shrink-0 ml-2 text-black z-10" />
              <div className="flex-1 overflow-hidden mx-2">
                <div className="animate-ticker whitespace-nowrap text-[11px] font-medium text-black italic inline-block">
                  {chatTicker}&nbsp;&nbsp;&nbsp;•&nbsp;&nbsp;&nbsp;{chatTicker}
                </div>
              </div>
            </div>
            {chatPinned && (
              <div className="shrink-0 px-3 py-1.5 text-[11px] text-amber-200 bg-amber-400/10 border-b border-amber-400/20">
                📌 {chatPinned}
              </div>
            )}
            {(() => {
              const pinnedMsgs = messages.filter(m => !isSystem(m) && (m as ExtMsg).isPinned) as ExtMsg[];
              if (pinnedMsgs.length === 0) return null;
              return (
                <div className="shrink-0 border-b border-sky-400/20 bg-sky-500/10 px-3 py-1.5 space-y-1 max-h-24 overflow-y-auto">
                  {pinnedMsgs.map((pm) => (
                    <div key={`bpin-${pm.id}`} className="flex items-start gap-1.5 text-[10px]">
                      <span className="text-sky-300 shrink-0">📌</span>
                      <div className="min-w-0">
                        <span className="font-bold text-sky-200">{pm.displayName || pm.username}: </span>
                        <span className="text-white/70 line-clamp-2">{pm.content}</span>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {showNotifSettings && user && (
              <div className="shrink-0 px-3 py-2 max-h-48 overflow-y-auto border-b border-white/10 bg-black/40">
                <NotifPrefsPanel compact onSaved={() => setShowNotifSettings(false)} />
              </div>
            )}

            {showPollForm && user && (user.role === "admin" || user.role === "moderator") && (
              <div className="shrink-0 px-3 py-2 space-y-1.5 border-b border-white/10 bg-black/40">
                <input
                  value={pollQuestion}
                  onChange={(e) => setPollQuestion(e.target.value)}
                  placeholder="Anket sorusu"
                  className="w-full h-8 rounded-md bg-white/5 border border-white/10 px-2 text-[11px] text-white"
                />
                <textarea
                  value={pollOptions}
                  onChange={(e) => setPollOptions(e.target.value)}
                  placeholder="Her satıra bir seçenek"
                  className="w-full min-h-[56px] rounded-md bg-white/5 border border-white/10 px-2 py-1 text-[11px] text-white"
                />
                <button
                  type="button"
                  className="w-full h-8 rounded-md bg-sky-500 text-black text-[11px] font-bold"
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
                </button>
              </div>
            )}

            {/* Üye / Tümü */}
            <div className="flex gap-1 px-3 py-2 shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              {([
                { id: "all" as const, label: "Tümü" },
                { id: "members" as const, label: "Üyeler" },
              ]).map(t => (
                <button
                  key={t.id}
                  onClick={() => setFeedMode(t.id)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors ${
                    feedMode === t.id ? "bg-amber-400 text-black" : "bg-white/5 text-white/50 hover:bg-white/10"
                  }`}
                >
                  {t.label}
                </button>
              ))}
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
                <div className="flex justify-center py-1">
                  <span className="text-[10px] text-white/35 bg-white/5 px-3 py-0.5 rounded-full">Bugün</span>
                </div>
                {visibleMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-24 gap-2">
                    <p className="text-xs text-white/40">Henüz mesaj yok.</p>
                  </div>
                ) : (
                  visibleMessages.map(renderChatRow)
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Sticky gerçek üye mesajı — yalnızca admin */}
            {stickyHuman && feedMode === "all" && user?.role === "admin" && (
              <div className="shrink-0 px-3 py-2" style={{ borderTop: "1px solid rgba(245,197,24,0.25)", background: "rgba(245,197,24,0.07)" }}>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[9px] font-bold text-amber-400 uppercase tracking-wide">Son üye mesajı · yanıt bekleniyor</div>
                  <button
                    type="button"
                    onClick={() => skipSticky(stickyHuman.id)}
                    className="text-[10px] font-bold text-white/50 hover:text-white/90 px-2 py-0.5 rounded-md hover:bg-white/10"
                    title="Bu mesajı geç"
                  >
                    Geç
                  </button>
                </div>
                <div className="flex items-start gap-2">
                  <FramedAvatar
                    src={stickyHuman.userAvatarUrl}
                    name={stickyHuman.displayName || stickyHuman.username}
                    role={stickyHuman.userRole ?? "user"}
                    isVip={stickyHuman.isVip}
                    frame={stickyHuman.avatarFrame}
                    size={32}
                    online
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-bold text-amber-300">{stickyHuman.displayName || stickyHuman.username}</div>
                    <div className="text-[11px] text-white/80 line-clamp-2">{stickyHuman.content}</div>
                  </div>
                  <button onClick={() => startReply(stickyHuman)} className="text-[10px] font-bold text-amber-400 shrink-0">
                    Yanıtla
                  </button>
                </div>
              </div>
            )}

            {/* Input */}
            <div className="p-3 shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              {!user ? (
                <Link
                  href="/giris"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-bold text-black"
                  style={{ background: "linear-gradient(135deg,#F5C518,#E8B923)" }}
                >
                  Giriş yap ve mesaj gönder
                </Link>
              ) : (
                <div className="space-y-1.5 relative">
                  <AnimatePresence>
                    {mentionQuery !== null && suggestions.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        className="absolute bottom-full left-0 right-0 mb-1.5 rounded-xl overflow-hidden z-20 max-h-40 overflow-y-auto"
                        style={{ background: "#1a2030", border: "1px solid rgba(245,197,24,0.35)", boxShadow: "0 12px 28px rgba(0,0,0,0.55)" }}
                      >
                        {suggestions.map(s => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => insertMention(s.username)}
                            className="w-full flex items-center gap-2 px-2.5 py-2 hover:bg-white/5 text-left"
                          >
                            <div className="w-6 h-6 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-[9px] font-bold bg-amber-500/30 text-amber-200">
                              {s.avatarUrl
                                ? <img src={s.avatarUrl} alt="" className="w-full h-full object-cover" />
                                : (s.displayName || s.username).slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="text-[11px] font-semibold text-white truncate">{s.displayName || s.username}</div>
                              <div className="text-[9px] text-white/40">@{s.username}</div>
                            </div>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <AnimatePresence>
                    {replyTo && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        className="flex items-start justify-between gap-2 px-2.5 py-1.5 rounded-lg"
                        style={{ background: "rgba(245,197,24,0.08)", borderLeft: "2px solid #F5C518" }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-[10px] font-semibold text-amber-300">{replyName(replyTo)}'e yanıt</div>
                          <div className="text-[10px] text-white/50 line-clamp-1">{replyTo.content}</div>
                        </div>
                        <button onClick={() => setReplyTo(null)} className="shrink-0 p-0.5 text-white/40 hover:text-white/80">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {sendError && (
                    <div className="px-2.5 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30">
                      <span className="text-[11px] text-red-300">{sendError}</span>
                    </div>
                  )}
                  {cooldownLeft > 0 && (
                    <div className="flex items-center gap-1.5 px-1">
                      <div className="h-0.5 flex-1 bg-white/10 rounded-full overflow-hidden">
                        <motion.div className="h-full bg-amber-400" initial={{ width: "100%" }} animate={{ width: "0%" }} transition={{ duration: cooldownLeft, ease: "linear" }} />
                      </div>
                      <span className="text-[10px] text-amber-400 font-bold shrink-0">{cooldownLeft}s</span>
                    </div>
                  )}
                  <div className="flex gap-2 items-center">
                    <input
                      ref={inputRef}
                      value={content}
                      onChange={e => handleInputChange(e.target.value)}
                      onFocus={() => {
                        setTimeout(() => {
                          inputRef.current?.scrollIntoView({ block: "nearest" });
                          scrollToBottom();
                        }, 50);
                      }}
                      onKeyDown={handleKey}
                      placeholder={cooldownLeft > 0 ? `${cooldownLeft}s bekle...` : replyTo ? `${replyName(replyTo)}'e yanıtla...` : "Mesaj... (@ ile etiketle)"}
                      disabled={cooldownLeft > 0}
                      maxLength={500}
                      className="flex-1 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-white/30 focus:outline-none disabled:opacity-50"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                    />
                    <motion.button
                      onClick={sendMsg}
                      disabled={!content.trim() || sending || cooldownLeft > 0}
                      whileTap={{ scale: 0.9 }}
                      className="w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-30 shrink-0"
                      style={{ background: "linear-gradient(135deg,#F5C518,#E8B923)", boxShadow: "0 0 14px rgba(245,197,24,0.4)" }}
                    >
                      <Send className="w-4 h-4 text-black" />
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

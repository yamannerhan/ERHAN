import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Maximize2, Minimize2, Trash2, Settings, BarChart2, Users, User, Headphones, Smile, Shield, Bot } from "lucide-react";
import { ChatBannerSlider } from "@/components/chat-banner-slider";
import { ChatSupportPanel } from "@/components/chat-support-panel";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useLocation } from "wouter";
import { io, Socket } from "socket.io-client";
import type { ChatMessage } from "@workspace/api-client-react";
import { playChatMessageSound } from "@/lib/notif-prefs";
import { NotifPrefsPanel } from "@/components/notif-prefs-panel";
import { ChatMessageItem } from "@/components/chat-message-item";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
import { useGpuSafeMode } from "@/hooks/use-gpu-safe-mode";
import { useStaffChatPerms } from "@/hooks/use-staff-chat-perms";
import { ChatFabIcon } from "@/components/chat-fab-icon";
import {
  fetchChatSyncPayload,
  loadCachedHumans,
  saveCachedHumans,
  greetNewMemberText,
  welcomeChatJoinText,
  extractJoinUsername,
  isJoinAnnounce as isJoinAnnounceShared,
  isChatJoinNotice,
  canGreetUser,
  markGreetedUser,
} from "@/lib/chat-sync";

function getToken() { return localStorage.getItem("auth_token") ?? ""; }

interface SystemMsg { id: number; type: "join" | "welcome"; text: string; createdAt: string; }
type PollData = {
  id: number; question: string; options: string[]; counts: number[];
  totalVotes: number; myVote: number | null; isClosed: boolean;
};
type ExtMsg = ChatMessage & {
  [key: string]: unknown;
  isBot?: boolean;
  isFake?: boolean;
  displayName?: string | null;
  poll?: PollData | null;
  level?: number;
  xp?: number;
  badges?: Array<{ id: number; name: string; slug: string; emoji: string; color: string; description?: string | null }>;
  avatarFrame?: string | null;
  chatBubble?: string | null;
  reactions?: Array<{ emoji: string; userId: number; username: string; displayName?: string | null }>;
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
  return isJoinAnnounceShared(msg);
}

/** DB serial id (socket Date.now() id'lerini sayma) */
function isDbMessageId(id: number): boolean {
  return Number.isFinite(id) && id > 0 && id < 1_000_000_000;
}

/** Son 200 mesajı koru (üye + ilan + katılım + sistem) */
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
  const kept = all.slice(-200);
  saveCachedHumans(kept.filter(isRealHuman));
  return kept;
}

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

export function ChatBubble({ initialOpen = false }: { initialOpen?: boolean }) {
  const gpuSafeMode = useGpuSafeMode();
  const { user } = useAuth();
  const { canClearChat } = useStaffChatPerms();
  const [location, navigate] = useLocation();
  const keyboardInset = useKeyboardInset();
  const [open, setOpen] = useState(initialOpen);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("og-chat-open", open);
    const prevOverflow = document.body.style.overflow;
    if (open) document.body.style.overflow = "hidden";
    return () => {
      root.classList.remove("og-chat-open");
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);
  const [messages, setMessages] = useState<AnyMsg[]>(() => loadCachedHumans() as ExtMsg[]);
  const [content, setContent] = useState("");
  const [replyTo, setReplyTo] = useState<ExtMsg | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [unread, setUnread] = useState(0);
  const [sending, setSending] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [sendError, setSendError] = useState("");
  const [onlineCount, setOnlineCount] = useState(0);
  const [feedMode, setFeedMode] = useState<"all" | "members" | "support">("all");
  const [expanded, setExpanded] = useState(false);
  const [pendingWelcome, setPendingWelcome] = useState<{ username: string; kind: "register" | "join"; replyToId?: number | null } | null>(null);
  const [activeMsgId, setActiveMsgId] = useState<number | null>(null);
  const [chatTicker, setChatTicker] = useState("Küfür, hakaret, reklam ve yanıltıcı ilan yasaktır.");
  const [chatPinned, setChatPinned] = useState<string | null>(null);
  const [showNotifSettings, setShowNotifSettings] = useState(false);
  const [showPollForm, setShowPollForm] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState("Evet\nHayır");
  const [typingUsers, setTypingUsers] = useState<Array<{ userId: number; name: string }>>([]);
  const typingClearRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const typingEmitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  useEffect(() => {
    const win = window as Window & { __ogOpenSupport?: () => void };
    win.__ogOpenSupport = () => {
      setOpen(false);
      navigate("/destek");
    };
    return () => { delete win.__ogOpenSupport; };
  }, [navigate]);

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
      const headers: HeadersInit = getToken() ? { Authorization: `Bearer ${getToken()}` } : {};
      const incoming = await fetchChatSyncPayload({ after, headers }) as ExtMsg[];
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
    if (!open) return;
    // Açılışı kilitlemesin — ilk boya sonrası senkron
    const t = window.setTimeout(() => { void syncLatestMessages(); }, 0);
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible" && openRef.current) void syncLatestMessages();
    }, 20000);
    return () => {
      window.clearTimeout(t);
      window.clearInterval(id);
    };
  }, [syncLatestMessages, open]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      fetch("/api/chat/announcements", { cache: "no-store" })
        .then(r => r.json())
        .then((d: { ticker?: string; pinned?: string | null }) => {
          if (d?.ticker) setChatTicker(d.ticker);
          setChatPinned(d?.pinned?.trim() || null);
        })
        .catch(() => {});
    }, 50);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    // Tam ekran /sohbet sayfasındayken bubble socket bağlanmasın (çift mesaj)
    if (isOnChatPage) return;

    const s = io(window.location.origin, {
      path: "/ws",
      auth: { token: getToken() },
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
      if (added && isJoinAnnounce(msg)) {
        const u = extractJoinUsername(msg.content) || "";
        if (u && canGreetUser(u, userRef.current?.username)) {
          setPendingWelcome({ username: u, kind: "register", replyToId: msg.id });
        }
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
    s.on("chat:react", ({ messageId, reactions }: { messageId: number; reactions: ExtMsg["reactions"] }) => {
      setMessages(prev => prev.map(m =>
        !isSystem(m) && (m as ExtMsg).id === messageId ? { ...(m as ExtMsg), reactions } : m
      ));
    });
    s.on("chat:cleared", () => setMessages([]));
    s.on("chat:join", ({ username, messageId }: { username: string; messageId?: number | null }) => {
      if (!messageId) {
        addMsg({ id: Date.now(), type: "join", text: `${username} sohbete katıldı`, createdAt: new Date().toISOString() });
      }
      if (username && canGreetUser(username, userRef.current?.username)) {
        setPendingWelcome({ username, kind: "join" });
      }
    });
    s.on("chat:welcome", ({ message }: { message: string }) => {
      addMsg({ id: Date.now() + 1, type: "welcome", text: message, createdAt: new Date().toISOString() });
      const u = extractJoinUsername(message) || "";
      if (u && canGreetUser(u, userRef.current?.username)) {
        setPendingWelcome({ username: u, kind: "register" });
      }
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
    s.on("chat:typing", (data: {
      userId: number; username?: string; displayName?: string | null; typing?: boolean;
    }) => {
      if (!data?.userId || data.userId === userRef.current?.id) return;
      const name = (data.displayName || data.username || "Birisi").trim();
      const clearMap = typingClearRef.current;
      const prev = clearMap.get(data.userId);
      if (prev) clearTimeout(prev);
      if (!data.typing) {
        setTypingUsers((list) => list.filter((u) => u.userId !== data.userId));
        clearMap.delete(data.userId);
        return;
      }
      setTypingUsers((list) => {
        const rest = list.filter((u) => u.userId !== data.userId);
        return [...rest, { userId: data.userId, name }].slice(-3);
      });
      clearMap.set(data.userId, setTimeout(() => {
        setTypingUsers((list) => list.filter((u) => u.userId !== data.userId));
        clearMap.delete(data.userId);
      }, 3200));
    });
    if (s.connected) authenticate();
    return () => {
      s.off("connect", authenticate);
      s.disconnect();
      setSocket(null);
      typingClearRef.current.forEach((t) => clearTimeout(t));
      typingClearRef.current.clear();
    };
  }, [user?.id, addMsg, isOnChatPage]);

  useEffect(() => {
    if (open) {
      setUnread(0);
      scrollToBottom();
    }
  }, [open, scrollToBottom]);

  const visibleMessages = useMemo(() => {
    const isSelfReply = (msg: ExtMsg) => {
      if (!msg.replyToId || !msg.replyToUsername) return false;
      return msg.username.toLowerCase() === msg.replyToUsername.toLowerCase();
    };
    const base = messages.filter((m) => {
      if (isSystem(m)) return true;
      return !isSelfReply(m as ExtMsg);
    });
    if (feedMode === "members") {
      return base.filter(m => {
        if (isSystem(m)) return true;
        const msg = m as ExtMsg;
        const text = msg.content ?? "";
        return isRealHuman(msg) || isJoinAnnounce(msg) || isChatJoinNotice(text) || /ilan\s+paylaştı|yeni\s+ilan/i.test(text);
      }).slice(-200);
    }
    // Çıkışta da geçmiş kalsın — son 200 mesaj (ilan + sohbet)
    return base.slice(-200);
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
        emitTyping(false);
        setContent("");
        setReplyTo(null);
        setMentionQuery(null);
        setSuggestions([]);
        if (sent?.id) addMsg(sent);
        scrollToBottom();
        return;
      }
      const data = await r.json().catch(() => ({})) as { error?: string };
      showSendError(data.error ?? "Mesaj gönderilemedi. Lütfen tekrar deneyin.");
    } catch {
      showSendError("Bağlantı hatası. Lütfen tekrar deneyin.");
    } finally { setSending(false); }
  };

  const sendGreet = async (username: string, kind: "register" | "join" = "join", replyToId?: number | null) => {
    if (!user || !username) return;
    if (!canGreetUser(username, user.username)) return;
    const content = kind === "register" ? greetNewMemberText(username) : welcomeChatJoinText(username);
    const body = { content, replyToId: replyToId ?? null };
    try {
      const r = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        markGreetedUser(username, user.username);
        setPendingWelcome((p) => (p?.username.toLowerCase() === username.toLowerCase() ? null : p));
        const sent = await r.json().catch(() => null) as ExtMsg | null;
        if (sent?.id) window.setTimeout(() => { addMsg(sent); }, 400);
      }
    } catch {}
  };

  const handleReact = async (msgId: number, emoji: string) => {
    if (!user || !isDbMessageId(msgId)) return;
    try {
      const r = await fetch(`/api/chat/messages/${msgId}/react`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ emoji }),
      });
      if (r.ok) {
        const data = await r.json() as { reactions?: ExtMsg["reactions"] };
        if (data.reactions) {
          setMessages((prev) => prev.map((m) =>
            !isSystem(m) && (m as ExtMsg).id === msgId ? { ...(m as ExtMsg), reactions: data.reactions } : m
          ));
        }
      }
    } catch { /* ignore */ }
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
    if (user?.id && msg.userId === user.id) return;
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

  const emitTyping = (typing: boolean) => {
    if (!socket?.connected || !user) return;
    socket.emit("chat:typing", {
      typing,
      username: user.username,
      displayName: (user as { displayName?: string | null }).displayName ?? null,
    });
  };

  const handleInputChange = (val: string) => {
    const next = val.slice(0, 500);
    setContent(next);
    const lastAt = next.lastIndexOf("@");
    if (lastAt !== -1) {
      const after = next.slice(lastAt + 1);
      if (!after.includes(" ")) { setMentionQuery(after); return; }
    }
    setMentionQuery(null);
    if (next.trim()) {
      emitTyping(true);
      if (typingEmitRef.current) clearTimeout(typingEmitRef.current);
      typingEmitRef.current = setTimeout(() => emitTyping(false), 2200);
    } else {
      emitTyping(false);
    }
  };

  const resizeComposer = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(Math.max(el.scrollHeight, 22), 120);
    el.style.height = `${next}px`;
  }, []);

  useLayoutEffect(() => {
    resizeComposer();
  }, [content, resizeComposer]);

  const insertMention = (username: string) => {
    const lastAt = content.lastIndexOf("@");
    const base = lastAt >= 0 ? content.slice(0, lastAt) : content;
    setContent(`${base}@${username} `);
    setMentionQuery(null);
    setSuggestions([]);
    inputRef.current?.focus();
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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

  const renderChatRow = (msg: AnyMsg) => {
    if (isSystem(msg)) {
      return (
        <div key={msg.id} className="flex justify-center">
          {msg.type === "join" ? (
            <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-medium px-3 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              {msg.text}
            </div>
          ) : (
            <div className="w-full rounded-2xl p-3 text-xs text-white/80 whitespace-pre-wrap leading-relaxed bg-sky-500/10 border border-sky-400/25">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Bot className="w-3 h-3 text-sky-400" />
                <span className="text-[10px] font-bold text-sky-300">ÖzelGüvenlik Bot</span>
              </div>
              {msg.text}
            </div>
          )}
        </div>
      );
    }

    const chatMsg = msg;
    // DB’deki “X sohbete katıldı” → join satırı
    if (isChatJoinNotice(chatMsg.content ?? "")) {
      return (
        <div key={chatMsg.id} className="flex justify-center">
          <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-medium px-3 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            {chatMsg.content}
          </div>
        </div>
      );
    }
    const isMe = user?.id === chatMsg.userId;
    const canMod = !!(user && (user.role === "admin" || user.role === "moderator"));

    const row = (
      <ChatMessageItem
        msg={chatMsg}
        isOwn={!!isMe && !isBotOrFake(chatMsg)}
        currentUsername={user?.username}
        currentUserId={user?.id}
        token={getToken()}
        canModerate={canMod && isDbMessageId(chatMsg.id)}
        canPin={user?.role === "admin" && isDbMessageId(chatMsg.id)}
        renderContent={renderMessageContent}
        active={activeMsgId === chatMsg.id}
        memberStyle={!isSystemBot(chatMsg)}
        onActivate={() => setActiveMsgId((id) => (id === chatMsg.id ? null : chatMsg.id))}
        onReply={user && !isMe ? (m) => startReply(m as ExtMsg) : undefined}
        onReact={user ? handleReact : undefined}
        reactions={chatMsg.reactions ?? []}
        onDeleted={(id) => setMessages((prev) => prev.filter((m) => isSystem(m) || (m as ExtMsg).id !== id))}
        onPinned={(id, pinned) => setMessages((prev) => prev.map((m) =>
          !isSystem(m) && (m as ExtMsg).id === id ? { ...(m as ExtMsg), isPinned: pinned } : m
        ))}
        onPollUpdate={(id, p) => setMessages((prev) => prev.map((m) =>
          !isSystem(m) && (m as ExtMsg).id === id ? { ...(m as ExtMsg), poll: p } : m
        ))}
      />
    );

    return <div key={chatMsg.id}>{row}</div>;
  };

  return (
    <>
      {/* FAB */}
      <motion.button
        onClick={() => setOpen(o => !o)}
        whileHover={gpuSafeMode ? undefined : { scale: 1.06 }}
        whileTap={gpuSafeMode ? undefined : { scale: 0.94 }}
        animate={!gpuSafeMode && pulse && !open ? { scale: [1, 1.12, 1] } : {}}
        transition={{ duration: 0.28 }}
        className="og-chat-fab fixed right-4 z-50 flex items-center justify-center bg-transparent border-0 p-0"
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
              style={{ background: "linear-gradient(135deg,#ffffff,#edf6ff)", boxShadow: "0 8px 24px rgba(25,94,165,0.22)", border: "1px solid rgba(8,120,232,0.35)" }}
            >
              <X className="w-5 h-5 text-blue-600" />
            </motion.div>
          ) : (
            <motion.div key="chat" initial={gpuSafeMode ? false : { rotate: 90, opacity: 0 }} animate={gpuSafeMode ? undefined : { rotate: 0, opacity: 1 }} exit={gpuSafeMode ? undefined : { rotate: -90, opacity: 0 }}>
              <ChatFabIcon unread={unread} pulse={gpuSafeMode ? false : pulse} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
          <button
            type="button"
            key="og-chat-backdrop"
            className="og-chat-backdrop"
            aria-label="Sohbeti kapat"
            onClick={() => { setExpanded(false); setOpen(false); }}
          />
          <div
            key="og-chat-win"
            className={`og-chat-win fixed z-[10050] flex flex-col ${expanded ? "og-chat-win-expanded" : ""}${keyboardInset > 0 ? " og-chat-win--kb" : ""}`}
            style={{
              right: keyboardInset > 0 || expanded
                ? "max(0.5rem, env(safe-area-inset-right))"
                : "1rem",
              left: keyboardInset > 0 || expanded
                ? "max(0.5rem, env(safe-area-inset-left))"
                : "auto",
              /* Alta genişler; klavye açılınca yazma kutusu klavyenin üstüne oturur */
              bottom: keyboardInset > 0
                ? `${keyboardInset}px`
                : expanded
                  ? "max(0.5rem, env(safe-area-inset-bottom))"
                  : "max(0.75rem, env(safe-area-inset-bottom))",
              width: keyboardInset > 0 || expanded
                ? "auto"
                : "min(460px, calc(100vw - 1.25rem))",
              maxWidth: keyboardInset > 0 ? "100%" : expanded ? "760px" : "460px",
              height: keyboardInset > 0
                ? `min(52dvh, calc(100dvh - ${keyboardInset}px - env(safe-area-inset-top, 0px) - 0.5rem))`
                : expanded
                  ? "min(92dvh, calc(100dvh - 1rem))"
                  : "min(72dvh, calc(100dvh - env(safe-area-inset-top, 0px) - 1.25rem))",
              marginLeft: keyboardInset > 0 || expanded ? "auto" : undefined,
              marginRight: keyboardInset > 0 || expanded ? "auto" : undefined,
            }}
            role="dialog"
            aria-label="Topluluk Sohbeti"
          >
            {/* Header */}
            <div className="og-chat-hdr">
              <div className="og-chat-hdr-brand">
                <div className="og-chat-logo" aria-hidden>
                  <Shield className="w-[18px] h-[18px]" />
                </div>
                <div className="min-w-0">
                  <p className="og-chat-title">Topluluk Sohbeti</p>
                  <p className="og-chat-online">
                    <span className="og-chat-online-dot" />
                    {onlineCount > 0 ? onlineCount : "—"} kişi çevrimiçi
                  </p>
                </div>
              </div>
              <div className="og-chat-hdr-actions">
                {(user?.role === "admin" || user?.role === "moderator") && (
                  <button type="button" onClick={() => setShowPollForm(v => !v)} className="og-chat-icon-btn" title="İstatistik / Anket" aria-label="İstatistik">
                    <BarChart2 className="w-4 h-4 text-white/70" />
                  </button>
                )}
                {canClearChat && (
                  <button type="button" onClick={handleClearChat} className="og-chat-icon-btn" title="Sohbeti Temizle" aria-label="Sil">
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                )}
                {user && (
                  <button type="button" onClick={() => setShowNotifSettings(v => !v)} className="og-chat-icon-btn" title="Ayarlar" aria-label="Ayarlar">
                    <Settings className="w-4 h-4 text-amber-300" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setExpanded(v => !v)}
                  className="og-chat-icon-btn"
                  title={expanded ? "Küçült" : "Büyüt"}
                  aria-label={expanded ? "Küçült" : "Büyüt"}
                >
                  {expanded ? <Minimize2 className="w-4 h-4 text-white/60" /> : <Maximize2 className="w-4 h-4 text-white/60" />}
                </button>
                <button type="button" onClick={() => { setExpanded(false); setOpen(false); }} className="og-chat-icon-btn" title="Kapat" aria-label="Kapat">
                  <X className="w-4 h-4 text-white/60" />
                </button>
              </div>
            </div>

            {/* Sohbet Kuralları kartı kaldırıldı — alan açıldı */}

            <ChatBannerSlider />

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
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold text-white/70">Anket oluştur</p>
                  <button
                    type="button"
                    className="h-7 px-2 rounded-md bg-white/10 text-white/80 text-[10px] font-bold hover:bg-white/15"
                    onClick={() => {
                      setShowPollForm(false);
                      setPollQuestion("");
                      setPollOptions("Evet\nHayır");
                    }}
                  >
                    Vazgeç
                  </button>
                </div>
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
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    className="flex-1 h-8 rounded-md bg-white/10 text-white/80 text-[11px] font-bold"
                    onClick={() => {
                      setShowPollForm(false);
                      setPollQuestion("");
                      setPollOptions("Evet\nHayır");
                    }}
                  >
                    Kapat
                  </button>
                  <button
                    type="button"
                    className="flex-[1.4] h-8 rounded-md bg-sky-500 text-black text-[11px] font-bold"
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
              </div>
            )}

            {/* Kanallar */}
            <div className="og-chat-tabs" role="tablist" aria-label="Sohbet kanalları">
              {([
                { id: "all" as const, label: "Genel Bilgi", Icon: Users },
                { id: "members" as const, label: "Canlı Sohbet", Icon: User },
                { id: "support" as const, label: "Canlı Destek", Icon: Headphones },
              ]).map(t => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={feedMode === t.id}
                  onClick={() => {
                    if (t.id === "support") {
                      const staff = user?.role === "admin" || user?.role === "moderator";
                      if (!staff) {
                        setOpen(false);
                        navigate("/destek");
                        return;
                      }
                    }
                    setFeedMode(t.id);
                  }}
                  className={`og-chat-tab ${feedMode === t.id ? "is-active" : ""}`}
                >
                  <t.Icon className="w-3.5 h-3.5" />
                  <span>{t.label}</span>
                </button>
              ))}
            </div>

            {feedMode === "support" ? (
              <div className="flex-1 min-h-0 overflow-hidden">
                <ChatSupportPanel onCloseChat={() => setOpen(false)} />
              </div>
            ) : (
              <>
                {/* Messages */}
                <div
                  ref={msgContainerRef}
                  onScroll={() => {
                    const el = msgContainerRef.current;
                    if (el) pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
                  }}
                  className="og-chat-msgs flex-1 overflow-y-auto min-h-0"
                >
                  <div ref={msgInnerRef} className="flex flex-col justify-end min-h-full px-2.5 py-2 gap-2.5">
                    <div className="flex justify-center py-1">
                      <span className="og-chat-day">Bugün</span>
                    </div>
                    {visibleMessages.length === 0 ? (
                      <div className="og-chat-empty">
                        <div className="og-chat-empty-art" aria-hidden>
                          <svg viewBox="0 0 64 64" className="w-14 h-14">
                            <path d="M12 18c0-4.4 3.6-8 8-8h24c4.4 0 8 3.6 8 8v14c0 4.4-3.6 8-8 8H30l-10 8v-8h0c-4.4 0-8-3.6-8-8V18z" fill="none" stroke="#F5C518" strokeWidth="2.2" strokeLinejoin="round" />
                            <circle cx="26" cy="26" r="2.2" fill="#F5C518" />
                            <circle cx="32" cy="26" r="2.2" fill="#F5C518" />
                            <circle cx="38" cy="26" r="2.2" fill="#F5C518" />
                          </svg>
                        </div>
                        <p className="og-chat-empty-title">Henüz mesaj yok.</p>
                        <p className="og-chat-empty-sub">Sohbete ilk mesajı siz gönderin.</p>
                      </div>
                    ) : (
                      visibleMessages.map(renderChatRow)
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </div>

                {user && pendingWelcome && canGreetUser(pendingWelcome.username, user.username) && (
                  <div className="og-chat-welcome-bar">
                    <div className="og-chat-welcome-meta">
                      <span className="og-chat-welcome-dot" />
                      <span>
                        {pendingWelcome.kind === "register" ? "Yeni üye" : "Sohbete katıldı"}: @{pendingWelcome.username}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="og-chat-welcome-btn"
                      onClick={() => void sendGreet(pendingWelcome.username, pendingWelcome.kind, pendingWelcome.replyToId)}
                    >
                      👋 {pendingWelcome.kind === "register" ? "Aramıza Hoşgeldiniz" : "Hoşgeldin"}
                    </button>
                    <button
                      type="button"
                      className="og-chat-welcome-dismiss"
                      onClick={() => setPendingWelcome(null)}
                      aria-label="Kapat"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {typingUsers.length > 0 && (
                  <div className="og-chat-typing" aria-live="polite">
                    <strong>
                      {typingUsers.map((u) => u.name).join(", ")}
                    </strong>
                    <span>yazıyor</span>
                    <span className="og-chat-typing-dots" aria-hidden>
                      <span /><span /><span />
                    </span>
                  </div>
                )}

                {/* Input */}
                <div className="og-chat-input-wrap">
                  {!user ? (
                    <Link
                      href="/giris"
                      onClick={() => setOpen(false)}
                      className="og-chat-login-cta"
                    >
                      Giriş yap ve mesaj gönder
                    </Link>
                  ) : (
                    <div className="space-y-1.5 relative">
                      {mentionQuery !== null && suggestions.length > 0 && (
                          <div
                            className="absolute bottom-full left-0 right-0 mb-1.5 rounded-xl overflow-hidden z-20 max-h-40 overflow-y-auto"
                            style={{ background: "#1a2030", border: "1px solid rgba(8,120,232,0.4)", boxShadow: "0 12px 28px rgba(0,0,0,0.55)" }}
                          >
                            {suggestions.map(s => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => insertMention(s.username)}
                                className="w-full flex items-center gap-2 px-2.5 py-2 hover:bg-white/5 text-left"
                              >
                                <div className="w-6 h-6 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-[9px] font-bold bg-sky-500/30 text-sky-200">
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
                          </div>
                      )}
                      {replyTo && (
                          <div
                            className="flex items-start justify-between gap-2 px-2.5 py-1.5 rounded-lg"
                            style={{ background: "rgba(8,120,232,0.1)", borderLeft: "2px solid #0878e8" }}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-[10px] font-semibold text-sky-300">{replyName(replyTo)}'e yanıt</div>
                              <div className="text-[10px] text-white/50 line-clamp-1">{replyTo.content}</div>
                            </div>
                            <button onClick={() => setReplyTo(null)} className="shrink-0 p-0.5 text-white/40 hover:text-white/80">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                      )}
                      {sendError && (
                        <div className="px-2.5 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30">
                          <span className="text-[11px] text-red-300">{sendError}</span>
                        </div>
                      )}
                      {cooldownLeft > 0 && (
                        <div className="flex items-center gap-1.5 px-1">
                          <div className="h-0.5 flex-1 bg-white/10 rounded-full overflow-hidden">
                            <div className="h-full bg-sky-400" style={{ width: `${Math.min(100, (cooldownLeft / 3) * 100)}%` }} />
                          </div>
                          <span className="text-[10px] text-sky-400 font-bold shrink-0">{cooldownLeft}s</span>
                        </div>
                      )}
                      <div className="og-chat-composer">
                        <div className="og-chat-input-shell og-chat-input-shell--multi">
                          <button
                            type="button"
                            className="og-chat-emoji-btn"
                            title="Emoji"
                            aria-label="Emoji"
                            onClick={() => {
                              setContent((c) => `${c}😊`);
                              inputRef.current?.focus();
                            }}
                          >
                            <Smile className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            className="og-chat-emoji-btn"
                            title="@ etiketle"
                            aria-label="@ etiketle"
                            onClick={() => {
                              setContent((c) => `${c}@`);
                              setMentionQuery("");
                              inputRef.current?.focus();
                            }}
                          >
                            <span className="text-[13px] font-black text-amber-300">@</span>
                          </button>
                          <textarea
                            ref={inputRef}
                            value={content}
                            rows={1}
                            onChange={e => handleInputChange(e.target.value)}
                            onFocus={() => {
                              if (expanded) setExpanded(false);
                              setTimeout(() => {
                                inputRef.current?.scrollIntoView({ block: "nearest" });
                                scrollToBottom();
                              }, 50);
                            }}
                            onKeyDown={handleKey}
                            placeholder={cooldownLeft > 0 ? `${cooldownLeft}s bekle...` : replyTo ? `${replyName(replyTo)}'e yanıtla...` : "Mesaj yaz..."}
                            disabled={cooldownLeft > 0}
                            maxLength={500}
                            className="og-chat-input og-chat-textarea"
                          />
                        </div>
                        <motion.button
                          onClick={sendMsg}
                          disabled={!content.trim() || sending || cooldownLeft > 0}
                          whileTap={{ scale: 0.9 }}
                          className="og-chat-send"
                          aria-label="Gönder"
                        >
                          {sending ? (
                            <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                          ) : (
                            <Send className="w-4 h-4" />
                          )}
                        </motion.button>
                      </div>
                      {content.length > 0 && (
                        <div className="text-[10px] text-white/35 text-right px-1">{content.length}/500</div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

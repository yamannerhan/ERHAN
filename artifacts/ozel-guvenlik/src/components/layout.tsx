import React, { useState, useEffect, useRef, useCallback, Suspense, lazy, useMemo } from "react";
import { PwaInstall } from "./pwa-install";
import { HamburgerDrawer } from "./hamburger-drawer";
import { BrandLogo } from "./brand-logo";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useLocation } from "wouter";
import {
  Bell, X, Heart, MessageCircle, Info, Briefcase, CheckCheck, ChevronRight, ChevronLeft,
  Menu, Sun, Moon, Home as HomeIcon, Tag, Plus, Clock3, Search,
  MapPin, User as UserIcon, Bookmark,
} from "lucide-react";
import "./mobile-bottom-nav.css";
import "@/styles/desktop-home.css";
import { AnimatePresence, motion } from "framer-motion";
import {
  useGetOnlineCount, getGetOnlineCountQueryKey,
  useGetUnreadNotificationCount, getGetUnreadNotificationCountQueryKey,
  useGetNotifications, getGetNotificationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { PushPermissionBanner } from "./push-permission-banner";
import { isBackgroundOnlyEnabled, isNotifSoundEnabled } from "@/lib/notif-prefs";
import { asArray, normalizeAppPath } from "@/lib/safe";
import { useDisplayMode } from "@/contexts/DisplayModeContext";
import { LiteChatFab } from "./lite-chat-fab";
import { countLiteUnread, findFirstLiteUnread } from "@/lib/lite-notifications";

const ChatBubble = lazy(() => import("./chat-bubble").then((m) => ({ default: m.ChatBubble })));

/* ── Theme hook ───────────────────────────────────────────── */
function useTheme() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    try {
      const stored = localStorage.getItem("theme");
      return stored === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    try {
      localStorage.setItem("theme", theme);
    } catch { /* ignore */ }
  }, [theme]);

  const toggle = useCallback(() => setTheme(t => (t === "dark" ? "light" : "dark")), []);

  return { theme, toggle };
}

function getNotifIcon(type: string) {
  switch (type) {
    case "like":    return <Heart className="w-4 h-4 text-red-400 fill-red-400" />;
    case "reply":   return <MessageCircle className="w-4 h-4 text-cyan-400" />;
    case "listing":
    case "admin_listing": return <Briefcase className="w-4 h-4 text-emerald-400" />;
    case "support": return <MessageCircle className="w-4 h-4 text-red-400" />;
    default:        return <Info className="w-4 h-4 text-primary" />;
  }
}

function notifClassName(type: string, isRead: boolean) {
  if (isRead) return "flex items-start gap-3 px-4 py-3";
  if (type === "admin_listing") return "flex items-start gap-3 px-4 py-3 bg-emerald-500/15 ring-1 ring-emerald-400/25";
  if (type === "support") return "flex items-start gap-3 px-4 py-3 bg-red-500/15 ring-1 ring-red-400/25";
  return "flex items-start gap-3 px-4 py-3 bg-primary/5";
}

/* ── Mobile bottom navigation ─────────────────────────────── */
function MobileBottomNav() {
  const [location] = useLocation();
  const items = [
    { icon: HomeIcon, label: "Anasayfa", path: "/" },
    { icon: Tag, label: "İlanlar", path: "/ilanlar" },
    { icon: Plus, label: "İlan Oluştur", path: "/ilan-ekle", center: true },
    { icon: Clock3, label: "İş Arayanlar", path: "/part-time" },
    { icon: MapPin, label: "Yakınımda", path: "/yakindaki-ilanlar" },
  ];

  const hasDividerAfter = (index: number) => index === 0 || index === 1 || index === 3;

  return (
    <nav className="og-bottom-nav" aria-label="Alt menü">
      <div className="og-bottom-nav-wrap">
        <div className="og-bn-arch" aria-hidden>
          <svg className="og-bn-arch-line" viewBox="0 -34 84 34" preserveAspectRatio="none">
            <path
              d="M 0.77 0 A 42 42 0 0 1 83.23 0 Z"
              fill="#111d2e"
              stroke="#D99A00"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
        <Link href="/ilan-ekle" className="og-bn-fab" aria-label="İlan Oluştur">
          <Plus className="og-bn-fab-icon" strokeWidth={2.3} />
        </Link>
        <div className="og-bottom-nav-shell">
        {items.map((item, index) => {
          const active = location === item.path
            || (item.path !== "/" && location.startsWith(item.path));
          const Icon = item.icon;

          if (item.center) {
            return (
              <div key={item.path} className="og-bn-cell og-bn-cell-center">
                <div className="og-bn-item og-bn-item-center">
                  <span className="og-bn-label">{item.label}</span>
                </div>
              </div>
            );
          }

          return (
            <div
              key={item.path}
              className={`og-bn-cell${hasDividerAfter(index) ? " og-bn-cell--divider" : ""}`}
            >
              <Link
                href={item.path}
                className={`og-bn-item${active ? " og-bn-item-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="og-bn-icon" strokeWidth={2.2} />
                <span className="og-bn-label">{item.label}</span>
                {active && <span className="og-bn-active-indicator" aria-hidden />}
              </Link>
            </div>
          );
        })}
        </div>
      </div>
    </nav>
  );
}

/* ── Layout ───────────────────────────────────────────────── */
export function Layout({
  children,
  headerVariant = "default",
}: {
  children: React.ReactNode;
  headerVariant?: "default" | "listings" | "parttime" | "create-listing";
}) {
  const { user, isAdmin, isModerator } = useAuth();
  const { isLite, isDesktop } = useDisplayMode();
  const [location, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { theme, toggle: toggleTheme } = useTheme();

  const [liveCount, setLiveCount] = useState<number | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  /* Sayfa değişince en üste; detaydan anasayfa dönüş scroll'unu bozma */
  useEffect(() => {
    if (location === "/" && sessionStorage.getItem("home_scroll_y")) return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [location]);

  const { data: onlineData } = useGetOnlineCount({
    query: {
      queryKey: getGetOnlineCountQueryKey(),
      enabled: !isLite,
      refetchInterval: isLite ? false : 60000,
    }
  });

  const { data: unreadData, refetch: refetchUnread } = useGetUnreadNotificationCount({
    query: {
      queryKey: getGetUnreadNotificationCountQueryKey(),
      enabled: !!user && !isLite,
      refetchInterval: isLite ? false : 30000,
    }
  });

  const { data: notifData, refetch: refetchNotifs } = useGetNotifications({
    query: {
      queryKey: getGetNotificationsQueryKey(),
      enabled: !!user && (showPanel || isLite),
      refetchInterval: isLite && user ? 60000 : undefined,
    }
  });
  const notifications = asArray(notifData);
  const liteUnreadCount = useMemo(() => countLiteUnread(notifications), [notifications]);
  const unreadCount = user ? (isLite ? liteUnreadCount : (unreadData?.count ?? 0)) : 0;

  useEffect(() => {
    if (isLite) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    void import("@/lib/web-push").then((m) => {
      if (cancelled) return;
      cleanup = m.listenForPushSounds();
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [isLite]);

  useEffect(() => {
    if (!isLite) return;
    document.documentElement.classList.add("dark");
  }, [isLite]);

  /* Socket.io — online count + push notifications (lite modda kapalı) */
  useEffect(() => {
    if (isLite) return;
    let cancelled = false;
    let socket: import("socket.io-client").Socket | null = null;
    let onVis: (() => void) | null = null;
    let authenticate: (() => void) | null = null;

    void import("socket.io-client").then(({ io }) => {
      if (cancelled) return;
      socket = io(window.location.origin, {
        path: "/ws",
        transports: ["websocket", "polling"],
        secure: window.location.protocol === "https:",
        withCredentials: true,
      });
      const emitPresence = () => {
        if (!user?.id || !socket?.connected) return;
        socket.emit("presence:update", {
          userId: user.id,
          visible: document.visibilityState === "visible",
        });
      };
      authenticate = () => {
        if (user?.id && socket?.connected) {
          socket.emit("authenticate", { userId: user.id });
          emitPresence();
        }
      };
      socket.on("connect", authenticate);
      socket.on("online_count", (data: { count: number }) => setLiveCount(data.count));
      socket.on("notification:new", (payload?: { userId?: number }) => {
        if (!user) return;
        if (payload?.userId != null && payload.userId !== user.id) return;
        void refetchNotifs();
        void refetchUnread();
        const bgOnly = isBackgroundOnlyEnabled();
        const foreground = document.visibilityState === "visible";
        if (isNotifSoundEnabled() && !(bgOnly && foreground)) {
          void import("@/lib/web-push").then((m) => {
            try { m.playNotificationBeep(); } catch { /* ignore */ }
          });
        }
      });
      onVis = () => emitPresence();
      document.addEventListener("visibilitychange", onVis);
      if (socket.connected && authenticate) authenticate();
    });

    return () => {
      cancelled = true;
      if (onVis) document.removeEventListener("visibilitychange", onVis);
      if (socket && authenticate) socket.off("connect", authenticate);
      socket?.disconnect();
    };
  }, [refetchNotifs, refetchUnread, user, isLite]);

  /* Click outside notification panel */
  useEffect(() => {
    if (!showPanel) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowPanel(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPanel]);

  const handleBellClick = async () => {
    if (!user) { navigate("/giris"); return; }
    if (isLite) {
      const result = await refetchNotifs();
      const list = asArray(result.data);
      const target = findFirstLiteUnread(list);
      if (target?.linkUrl) {
        if (target.id != null) await markNotificationRead(target.id);
        navigate(normalizeAppPath(target.linkUrl, "/ilanlar"));
      } else if (countLiteUnread(list) > 0) {
        navigate("/ilanlar");
      }
      return;
    }
    const next = !showPanel;
    setShowPanel(next);
    if (next) refetchNotifs();
  };

  const handleMarkAllRead = async () => {
    try {
      const token = localStorage.getItem("auth_token") ?? "";
      const res = await fetch("/api/notifications/read-all", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Bildirimler okundu işaretlenemedi");
      queryClient.invalidateQueries({ queryKey: getGetNotificationsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetUnreadNotificationCountQueryKey() });
      refetchUnread();
    } catch { /* ignore */ }
  };

  const markNotificationRead = async (id: number) => {
    const token = localStorage.getItem("auth_token") ?? "";
    await fetch(`/api/notifications/${id}/read`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).catch(() => undefined);
    queryClient.invalidateQueries({ queryKey: getGetNotificationsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetUnreadNotificationCountQueryKey() });
    refetchUnread();
  };

  const onlineNum = liveCount ?? onlineData?.count ?? 0;

  /* Mobilde sayfaya özel header; PC'de her zaman tam üst menü (Ana Sayfa, İlanlar, …) */
  const customHeader = !isDesktop && headerVariant === "listings"
    ? { title: "ilanlar", subtitle: "Güncel güvenlik iş ilanları", searchId: "og-listings-search", titleLower: true }
    : !isDesktop && headerVariant === "parttime"
      ? { title: "İş Arayanlar", subtitle: "Saatlik, günlük ve kısa süreli işler", searchId: "og-parttime-search", titleLower: false }
      : !isDesktop && headerVariant === "create-listing"
        ? { title: "İlan Oluştur", subtitle: "Metni yapıştır, ilanı hızlıca oluştur", searchId: "og-create-listing-search", titleLower: false }
        : null;

  return (
    <div className="og-app min-h-screen bg-background text-foreground">
      <header className={`og-header sticky top-0 z-40 border-b${customHeader ? " og-header--listings" : ""}`}>
        <div className="og-header-inner og-shell flex items-center gap-2 px-3 h-14" style={{ minHeight: "var(--mobile-header-height)" }}>
          {customHeader ? (
            <>
              <button
                type="button"
                onClick={() => { if (window.history.length > 1) window.history.back(); else navigate("/"); }}
                className="og-icon-btn p-2 -ml-1 shrink-0"
                aria-label="Geri"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="w-[42px] h-[42px] shrink-0 rounded-lg og-logo-shield og-logo-shield--brand flex items-center justify-center overflow-hidden">
                  <BrandLogo size={42} />
                </div>
                <div className="flex flex-col leading-none min-w-0">
                  <span className={`font-extrabold text-[15px] tracking-tight text-white${customHeader.titleLower ? " lowercase" : ""}`}>
                    {customHeader.title}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] mt-0.5 text-slate-400 font-semibold">
                    <span className="relative inline-flex h-1.5 w-1.5">
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-400" />
                    </span>
                    {customHeader.subtitle}
                  </span>
                </div>
              </div>
            </>
          ) : (
          <>
          {/* Hamburger — mobil/tablet only */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="og-icon-btn og-ham-btn p-2 -ml-1 shrink-0"
            aria-label="Menüyü Aç"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group min-w-0 shrink">
            <div className="relative w-[42px] h-[42px] shrink-0 rounded-lg og-logo-shield og-logo-shield--brand flex items-center justify-center overflow-hidden">
              <BrandLogo size={42} />
            </div>
            <div className="flex flex-col leading-none min-w-0">
              <span className={`font-extrabold text-sm tracking-tight whitespace-nowrap inline-flex items-baseline truncate${!isLite ? " og-header-brand" : ""}`}>
                <span className="og-text">Özel</span>
                <span className="og-gold-gradient">Güvenlik</span>
                <span className="og-logo-tld">.online</span>
              </span>
              <span className="og-header-slogan">Türkiye'nin Özel Güvenlik İş İlanları Platformu</span>
              {!isLite && (
              <span className="flex items-center gap-1 text-[10px] mt-0.5 lg:hidden">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-400" />
                </span>
                <span className="font-semibold text-green-400/90 tabular-nums">{onlineNum} Aktif</span>
              </span>
              )}
            </div>
          </Link>
            </>
          )}

          {/* Desktop nav — ≥1024 via CSS (.og-desktop-nav) */}
          {!customHeader && (
          <nav className="og-desktop-nav hidden lg:flex items-center gap-1 ml-6 mr-auto" aria-label="Üst menü">
            {[
              { label: "Anasayfa", path: "/" },
              { label: "İlanlar", path: "/ilanlar" },
              { label: "İlan Oluştur", path: "/ilan-ekle" },
              { label: "İş Arayanlar", path: "/part-time" },
              { label: "CV Oluştur", path: "/cv-olustur" },
              { label: "Destek", path: "/destek" },
            ].map((item) => {
              const active = location === item.path || (item.path !== "/" && location.startsWith(item.path));
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`og-desktop-nav__link px-3 py-1.5 text-sm font-semibold transition-colors ${
                    active ? "is-active" : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => {
                    if (item.path === "/") sessionStorage.removeItem("home_scroll_y");
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          )}

          <div className="og-header-actions">
            {customHeader && (
              <button
                type="button"
                className="og-icon-btn p-2"
                aria-label="Ara"
                onClick={() => document.getElementById(customHeader.searchId)?.focus()}
              >
                <Search className="w-[18px] h-[18px]" />
              </button>
            )}
            {!customHeader && isAdmin && (
              <Link href="/admin" className="hidden sm:inline-flex text-[10px] font-bold text-destructive bg-destructive/10 px-2 py-0.5 rounded-full border border-destructive/20">Admin</Link>
            )}
            {!customHeader && !isAdmin && isModerator && (
              <Link href="/moderator/dashboard" className="hidden sm:inline-flex text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">Moderatör</Link>
            )}

            {!customHeader && <PwaInstall />}

            {/* Theme toggle — Lite modda kapalı */}
            {!customHeader && !isLite && (
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Aydınlık moda geç" : "Karanlık moda geç"}
              className="og-icon-btn p-2"
              title={theme === "dark" ? "Aydınlık mod" : "Karanlık mod"}
            >
              {theme === "dark" ? (
                <Sun className="w-[18px] h-[18px]" />
              ) : (
                <Moon className="w-[18px] h-[18px]" />
              )}
            </button>
            )}

            {/* Bell */}
            <div ref={panelRef} className="relative">
              <button
                onClick={handleBellClick}
                className={`og-icon-btn p-2 relative ${showPanel ? "text-amber-400" : ""}`}
                aria-label="Bildirimler"
              >
                <Bell className="w-[18px] h-[18px]" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 leading-none ring-2 ring-background">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {showPanel && !isLite && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scaleY: 0.95 }}
                    animate={{ opacity: 1, y: 0, scaleY: 1 }}
                    exit={{ opacity: 0, y: -8, scaleY: 0.95 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    style={{ transformOrigin: "top right" }}
                    className="og-notif-panel fixed sm:absolute right-3 sm:right-0 top-[calc(var(--mobile-header-height)+var(--safe-top)+6px)] sm:top-[calc(100%+10px)] w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl shadow-2xl z-[80] overflow-hidden"
                  >
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                      <div className="flex items-center gap-2">
                        <Bell className="w-4 h-4 text-amber-400" />
                        <span className="font-semibold text-sm">Bildirimler</span>
                        {unreadCount > 0 && (
                          <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{unreadCount} yeni</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {unreadCount > 0 && (
                          <button
                            onClick={handleMarkAllRead}
                            className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-0.5 font-semibold"
                          >
                            <CheckCheck className="w-3.5 h-3.5" /> Tümünü okundu
                          </button>
                        )}
                        <button onClick={() => setShowPanel(false)} className="text-muted-foreground hover:text-foreground p-0.5 ml-1">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="max-h-72 overflow-y-auto divide-y divide-white/5">
                      {notifications.length === 0 ? (
                        <div className="py-8 text-center text-muted-foreground text-sm">
                          <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                          Henüz bildiriminiz yok
                        </div>
                      ) : (
                        notifications.slice(0, 8).map(n => {
                          const content = (
                            <>
                              <div className="mt-0.5 shrink-0 bg-white/5 p-1.5 rounded-full">
                                {getNotifIcon(n.type)}
                              </div>
                              <div className="flex-1 min-w-0">
                                {n.title && <p className="text-[11px] font-bold text-foreground mb-0.5 line-clamp-1">{n.title}</p>}
                                <p className="text-xs text-foreground/90 leading-relaxed line-clamp-2">{n.message}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                  {new Date(n.createdAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                                </p>
                              </div>
                              {!n.isRead && <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 mt-1.5" />}
                            </>
                          );
                          const className = notifClassName(n.type, n.isRead);
                          return n.linkUrl ? (
                            <Link
                              key={n.id}
                              href={normalizeAppPath(n.linkUrl, "/bildirimler")}
                              onClick={() => { void markNotificationRead(n.id); setShowPanel(false); }}
                              className={`${className} hover:bg-white/5 transition-colors`}
                            >
                              {content}
                            </Link>
                          ) : (
                            <div
                              key={n.id}
                              onClick={() => { if (!n.isRead) void markNotificationRead(n.id); }}
                              className={className}
                            >
                              {content}
                            </div>
                          );
                        })
                      )}
                    </div>

                    <Link
                      href="/bildirimler"
                      onClick={() => setShowPanel(false)}
                      className="flex items-center justify-center gap-1.5 py-3 border-t border-white/10 text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors"
                    >
                      Tümünü Gör <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Avatar + greeting */}
            <Link href={user ? `/profil/${user.username}` : "/giris"} className="og-header-user shrink-0 ml-1 flex items-center gap-2">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.username} className="w-8 h-8 rounded-full object-cover ring-2 ring-amber-400/40 hover:ring-amber-400 transition-all" />
              ) : user ? (
                <div className="w-8 h-8 rounded-full og-avatar-fallback flex items-center justify-center text-slate-900 text-xs font-bold ring-2 ring-amber-400/40 hover:ring-amber-400 transition-all">
                  {user.username?.slice(0, 1).toUpperCase() || "?"}
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center hover:bg-white/15 transition-all">
                  <UserIcon className="w-4 h-4 text-muted-foreground" />
                </div>
              )}
              {user && (
                <span className="og-header-greet hidden lg:inline text-sm font-semibold text-[var(--text-secondary,#AEB7C5)]">
                  Merhaba, <span className="text-[var(--text-primary,#F7F8FA)]">{user.username}</span>
                </span>
              )}
            </Link>
          </div>
        </div>
      </header>

      {/* Hamburger drawer */}
      <HamburgerDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <main className="og-main og-shell relative">
        {children}
      </main>

      <MobileBottomNav />
      {!isLite && (
        <Suspense fallback={null}>
          <ChatBubble />
        </Suspense>
      )}
      {isLite && <LiteChatFab />}
      {!isLite && <PushPermissionBanner />}
    </div>
  );
}

import React, { useState, useEffect, useRef, useCallback } from "react";
import { ChatBubble } from "./chat-bubble";
import { PwaInstall } from "./pwa-install";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useLocation } from "wouter";
import {
  Bell, X, Heart, MessageCircle, Info, Briefcase, CheckCheck, ChevronRight,
  Menu, Sun, Moon, ShieldCheck, Home as HomeIcon, Tag, Plus, Clock as ClockIcon,
  FileText, Headphones, User as UserIcon, Bookmark, LogOut, Settings,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useGetOnlineCount, getGetOnlineCountQueryKey,
  useGetUnreadNotificationCount, getGetUnreadNotificationCountQueryKey,
  useGetNotifications, getGetNotificationsQueryKey,
  useLogout,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { io as socketIo } from "socket.io-client";
import { useToast } from "@/hooks/use-toast";

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

/* ── Drawer / Hamburger menu ──────────────────────────────── */
interface DrawerProps {
  open: boolean;
  onClose: () => void;
}
function Drawer({ open, onClose }: DrawerProps) {
  const { user, isAdmin, isModerator } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const logoutMutation = useLogout();

  const handleLogout = async () => {
    try { await logoutMutation.mutateAsync(); } catch { /* stateless JWT */ }
    try { localStorage.removeItem("auth_token"); } catch { /* ignore */ }
    queryClient.clear();
    toast({ title: "Çıkış yapıldı" });
    onClose();
    window.location.href = "/";
  };

  const items: Array<{ icon: React.ReactNode; label: string; href: string; only?: "auth" | "guest" | "admin" }> = [
    { icon: <HomeIcon className="w-4 h-4" />, label: "Ana Sayfa", href: "/" },
    { icon: <Tag className="w-4 h-4" />, label: "İlanlar", href: "/ilanlar" },
    { icon: <Plus className="w-4 h-4" />, label: "İlan Oluştur", href: "/ilan-ekle" },
    { icon: <FileText className="w-4 h-4" />, label: "CV Oluştur", href: "/cv-olustur" },
    { icon: <ClockIcon className="w-4 h-4" />, label: "Part Time", href: "/part-time" },
    { icon: <MessageCircle className="w-4 h-4" />, label: "Sohbet", href: "/sohbet", only: "auth" },
    { icon: <Bell className="w-4 h-4" />, label: "Bildirimler", href: "/bildirimler", only: "auth" },
    { icon: <Bookmark className="w-4 h-4" />, label: "Favoriler", href: "/favoriler", only: "auth" },
    { icon: <Headphones className="w-4 h-4" />, label: "Destek", href: "/destek" },
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm"
          />
          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="og-drawer fixed top-0 left-0 bottom-0 z-[90] w-[82%] max-w-[320px] flex flex-col"
          >
            {/* User card */}
            <div className="og-drawer-header">
              <div className="flex items-center gap-3">
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.username} className="w-12 h-12 rounded-full object-cover ring-2 ring-amber-400/60" />
                ) : (
                  <div className="w-12 h-12 rounded-full og-avatar-fallback flex items-center justify-center text-base font-bold text-slate-900">
                    {user?.username?.slice(0, 1).toUpperCase() || "?"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  {user ? (
                    <>
                      <div className="text-sm font-bold truncate og-text">{user.username}</div>
                      <Link href={`/profil/${user.username}`} onClick={onClose} className="text-[11px] text-amber-400 hover:underline">
                        Profili Gör →
                      </Link>
                    </>
                  ) : (
                    <>
                      <div className="text-sm font-bold og-text">Misafir</div>
                      <Link href="/giris" onClick={onClose} className="text-[11px] text-amber-400 hover:underline">
                        Giriş Yap →
                      </Link>
                    </>
                  )}
                </div>
                <button onClick={onClose} className="og-icon-btn p-1.5">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Menu items */}
            <nav className="flex-1 overflow-y-auto py-2">
              {user && (
                <Link
                  href={`/profil/${user.username}`}
                  onClick={onClose}
                  className="og-drawer-item"
                >
                  <UserIcon className="w-4 h-4" />
                  <span>Profilim</span>
                </Link>
              )}
              {items.map((item) => {
                if (item.only === "auth" && !user) return null;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className="og-drawer-item"
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </Link>
                );
              })}
              {isAdmin && (
                <Link href="/admin" onClick={onClose} className="og-drawer-item og-drawer-item-admin">
                  <Settings className="w-4 h-4" />
                  <span>Admin Paneli</span>
                </Link>
              )}
              {!isAdmin && isModerator && (
                <Link href="/moderator" onClick={onClose} className="og-drawer-item og-drawer-item-admin">
                  <Settings className="w-4 h-4" />
                  <span>Moderatör Paneli</span>
                </Link>
              )}

              <div className="og-drawer-divider" />

              {user ? (
                <button
                  onClick={() => { void handleLogout(); }}
                  className="og-drawer-item og-drawer-item-danger w-full text-left"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Çıkış Yap</span>
                </button>
              ) : (
                <>
                  <Link href="/giris" onClick={onClose} className="og-drawer-item">
                    <UserIcon className="w-4 h-4" />
                    <span>Giriş Yap</span>
                  </Link>
                  <Link href="/kayit" onClick={onClose} className="og-drawer-item">
                    <Plus className="w-4 h-4" />
                    <span>Kayıt Ol</span>
                  </Link>
                </>
              )}
            </nav>

            <div className="px-4 py-3 border-t border-white/5 text-[10px] text-muted-foreground/70 text-center">
              ÖzelGüvenlik.online · v2026
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

/* ── Mobile bottom navigation ─────────────────────────────── */
function MobileBottomNav() {
  const [location] = useLocation();
  const items = [
    { icon: HomeIcon,    label: "Anasayfa",     path: "/" },
    { icon: Tag,         label: "İlanlar",      path: "/ilanlar" },
    { icon: Plus,        label: "İlan Oluştur", path: "/ilan-ekle", center: true },
    { icon: ClockIcon,   label: "PartTime",     path: "/part-time" },
    { icon: FileText,    label: "CV",           path: "/cv-olustur" },
    { icon: Headphones,  label: "Destek",       path: "/destek" },
  ];
  return (
    <nav className="og-bottom-nav lg:hidden">
      <div className="og-bottom-nav-inner">
        {items.map((item) => {
          const active = location === item.path || (item.path !== "/" && location.startsWith(item.path));
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`og-bn-item ${active ? "og-bn-item-active" : ""} ${item.center ? "og-bn-item-center" : ""}`}
            >
              <Icon className={`w-5 h-5 ${active ? "" : "opacity-80"}`} />
              <span className="og-bn-label">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/* ── Layout ───────────────────────────────────────────────── */
export function Layout({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, isModerator } = useAuth();
  const [location, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { theme, toggle: toggleTheme } = useTheme();

  const [liveCount, setLiveCount] = useState<number | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const { data: onlineData } = useGetOnlineCount({
    query: { queryKey: getGetOnlineCountQueryKey(), refetchInterval: 60000 }
  });

  const { data: unreadData, refetch: refetchUnread } = useGetUnreadNotificationCount({
    query: {
      queryKey: getGetUnreadNotificationCountQueryKey(),
      enabled: !!user,
      refetchInterval: 30000,
    }
  });
  const unreadCount = user ? (unreadData?.count ?? 0) : 0;

  const { data: notifData, refetch: refetchNotifs } = useGetNotifications({
    query: {
      queryKey: getGetNotificationsQueryKey(),
      enabled: showPanel && !!user,
    }
  });
  const notifications = notifData ?? [];

  /* Socket.io — online count + push notifications */
  useEffect(() => {
    const socket = socketIo(window.location.origin, {
      path: "/ws",
      transports: ["websocket", "polling"],
      secure: window.location.protocol === "https:",
      withCredentials: true,
    });
    socket.on("online_count", (data: { count: number }) => setLiveCount(data.count));
    socket.on("notification:new", () => {
      if (user) refetchNotifs();
    });
    return () => { socket.disconnect(); };
  }, [refetchNotifs, user]);

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

  const handleBellClick = () => {
    if (!user) { navigate("/giris"); return; }
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

  return (
    <div className="og-app min-h-screen bg-background text-foreground pb-24 lg:pb-10">
      <header className="og-header sticky top-0 z-40 backdrop-blur-xl border-b">
        <div className="flex items-center gap-2 px-3 h-14 max-w-md md:max-w-6xl mx-auto">
          {/* Hamburger */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="og-icon-btn p-2 -ml-1"
            aria-label="Menüyü Aç"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group min-w-0">
            <div className="relative w-8 h-8 shrink-0 rounded-lg og-logo-shield flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-slate-900" />
            </div>
            <div className="flex flex-col leading-none min-w-0">
              <span className="font-extrabold text-sm tracking-tight whitespace-nowrap inline-flex items-baseline">
                <span className="og-text">Özel</span>
                <span className="og-gold-gradient">Güvenlik</span>
                <span className="og-logo-tld">.online</span>
              </span>
              <span className="flex items-center gap-1 text-[10px] mt-0.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-400" />
                </span>
                <span className="font-semibold text-green-400/90 tabular-nums">{onlineNum} Aktif</span>
              </span>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1 ml-6 mr-auto">
            {[
              { label: "Ana Sayfa", path: "/" },
              { label: "İlanlar", path: "/ilanlar" },
              { label: "İlan Oluştur", path: "/ilan-ekle" },
              { label: "Part Time", path: "/part-time" },
              { label: "CV Oluştur", path: "/cv-olustur" },
              { label: "Destek", path: "/destek" },
            ].map((item) => {
              const active = location === item.path || (item.path !== "/" && location.startsWith(item.path));
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    active ? "og-gold-gradient bg-amber-400/10" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            {isAdmin && (
              <Link href="/admin" className="hidden sm:inline-flex text-[10px] font-bold text-destructive bg-destructive/10 px-2 py-0.5 rounded-full border border-destructive/20">Admin</Link>
            )}
            {!isAdmin && isModerator && (
              <Link href="/moderator" className="hidden sm:inline-flex text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">Moderatör</Link>
            )}

            <PwaInstall />

            {/* Theme toggle */}
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
                {showPanel && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scaleY: 0.95 }}
                    animate={{ opacity: 1, y: 0, scaleY: 1 }}
                    exit={{ opacity: 0, y: -8, scaleY: 0.95 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    style={{ transformOrigin: "top right" }}
                    className="og-notif-panel absolute right-0 top-[calc(100%+10px)] w-80 max-w-[calc(100vw-2rem)] rounded-2xl shadow-2xl z-50 overflow-hidden"
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
                              href={n.linkUrl}
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

            {/* Avatar */}
            <Link href={user ? `/profil/${user.username}` : "/giris"} className="shrink-0 ml-1">
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
            </Link>
          </div>
        </div>
      </header>

      {/* Hamburger drawer */}
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <main className="max-w-md md:max-w-6xl mx-auto relative min-h-[calc(100vh-7rem)]">
        {children}
      </main>

      <MobileBottomNav />
      <ChatBubble />
    </div>
  );
}

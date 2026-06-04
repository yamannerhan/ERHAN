import React, { useState, useEffect, useRef } from "react";
import { BottomNav } from "./bottom-nav";
import { ChatBubble } from "./chat-bubble";
import { PwaInstall } from "./pwa-install";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useLocation } from "wouter";
import { Bell, X, Heart, MessageCircle, Info, Briefcase, CheckCheck, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useGetOnlineCount, getGetOnlineCountQueryKey,
  useGetUnreadNotificationCount, getGetUnreadNotificationCountQueryKey,
  useGetNotifications, getGetNotificationsQueryKey,
  useMarkAllNotificationsRead,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { io as socketIo } from "socket.io-client";

function getNotifIcon(type: string) {
  switch (type) {
    case "like":    return <Heart className="w-4 h-4 text-red-400 fill-red-400" />;
    case "reply":   return <MessageCircle className="w-4 h-4 text-cyan-400" />;
    case "listing": return <Briefcase className="w-4 h-4 text-primary" />;
    default:        return <Info className="w-4 h-4 text-primary" />;
  }
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, isModerator } = useAuth();
  const [location, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const markRead = useMarkAllNotificationsRead();

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

  // Socket.io — online count
  useEffect(() => {
    const socket = socketIo({ path: "/ws", transports: ["websocket"] });
    socket.on("online_count", (data: { count: number }) => setLiveCount(data.count));
    return () => { socket.disconnect(); };
  }, []);

  // Panel dışına tıklayınca kapat
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
      await markRead.mutateAsync();
      queryClient.invalidateQueries({ queryKey: getGetNotificationsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetUnreadNotificationCountQueryKey() });
      refetchUnread();
    } catch { /* ignore */ }
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-20 md:pb-10">
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-white/10 shadow-[0_2px_24px_rgba(79,70,229,0.15)]">
        <div className="flex items-center justify-between px-4 h-14 max-w-md md:max-w-6xl mx-auto">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="relative w-9 h-9 shrink-0">
              <img src="/logo.png" alt="ÖZEL GÜVENLİK" className="w-full h-full object-contain rounded-lg logo-glow-anim" />
            </div>
            <span className="flex flex-col leading-none">
              <span className="font-extrabold text-base tracking-tight logo-gradient animate-logo-glow">ÖzelGüvenlik</span>
              <span className="text-accent text-[10px] font-semibold tracking-widest">.Online</span>
            </span>
          </Link>

          {/* ── Masaüstü üst navigasyon ─────────────────────── */}
          <nav className="hidden md:flex items-center gap-1 ml-8 mr-auto">
            {[
              { label: "Ana Sayfa", path: "/" },
              { label: "İlanlar", path: "/ilanlar" },
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
                    active ? "text-accent bg-accent/10" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1 px-2 py-0.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-400" />
              </span>
              <span className="text-[11px] font-medium text-green-400/90 tabular-nums">{liveCount ?? onlineData?.count ?? 0} <span className="text-green-400/60 font-normal">Aktif</span></span>
            </div>

            {isAdmin && (
              <Link href="/admin" className="text-xs font-bold text-destructive hover:text-destructive/80 bg-destructive/10 px-2.5 py-1 rounded-full border border-destructive/20 transition-colors">Admin</Link>
            )}
            {!isAdmin && isModerator && (
              <Link href="/moderator" className="text-xs font-bold text-amber-400 hover:text-amber-300 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20 transition-colors">Moderatör</Link>
            )}

            {/* ── Bildirim zili ─────────────────────────────────── */}
            <div ref={panelRef} className="relative">
              <button
                onClick={handleBellClick}
                className={`relative p-1 rounded-lg transition-colors ${showPanel ? "text-primary" : "text-foreground hover:text-primary"}`}
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>

              {/* ── Dropdown Panel ─────────────────────────────────── */}
              <AnimatePresence>
                {showPanel && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scaleY: 0.95 }}
                    animate={{ opacity: 1, y: 0, scaleY: 1 }}
                    exit={{ opacity: 0, y: -8, scaleY: 0.95 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    style={{ transformOrigin: "top right" }}
                    className="absolute right-0 top-[calc(100%+10px)] w-80 max-w-[calc(100vw-2rem)] bg-[#1E293B] border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden"
                  >
                    {/* Başlık */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                      <div className="flex items-center gap-2">
                        <Bell className="w-4 h-4 text-primary" />
                        <span className="font-semibold text-sm">Bildirimler</span>
                        {unreadCount > 0 && (
                          <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{unreadCount} yeni</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {unreadCount > 0 && (
                          <button
                            onClick={handleMarkAllRead}
                            className="text-[10px] text-primary hover:text-primary/80 flex items-center gap-0.5 font-semibold"
                          >
                            <CheckCheck className="w-3.5 h-3.5" /> Tümünü okundu
                          </button>
                        )}
                        <button onClick={() => setShowPanel(false)} className="text-muted-foreground hover:text-foreground p-0.5 ml-1">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Bildirim listesi */}
                    <div className="max-h-72 overflow-y-auto divide-y divide-white/5">
                      {notifications.length === 0 ? (
                        <div className="py-8 text-center text-muted-foreground text-sm">
                          <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                          Henüz bildiriminiz yok
                        </div>
                      ) : (
                        notifications.slice(0, 8).map(n => (
                          <div
                            key={n.id}
                            className={`flex items-start gap-3 px-4 py-3 ${!n.isRead ? "bg-primary/5" : ""}`}
                          >
                            <div className="mt-0.5 shrink-0 bg-white/5 p-1.5 rounded-full">
                              {getNotifIcon(n.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-foreground/90 leading-relaxed line-clamp-2">{n.message}</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {new Date(n.createdAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                              </p>
                            </div>
                            {!n.isRead && <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" />}
                          </div>
                        ))
                      )}
                    </div>

                    {/* Tümünü gör */}
                    <Link
                      href="/bildirimler"
                      onClick={() => setShowPanel(false)}
                      className="flex items-center justify-center gap-1.5 py-3 border-t border-white/10 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
                    >
                      Tümünü Gör <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ── Profil avatarı ─────────────────────────────────── */}
            <Link href={user ? `/profil/${user.username}` : "/giris"} className="shrink-0">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.username} className="w-8 h-8 rounded-full object-cover ring-2 ring-primary/40 hover:ring-primary transition-all" />
              ) : user ? (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white text-xs font-bold ring-2 ring-primary/30 hover:ring-primary/60 transition-all">
                  {user.username.slice(0, 1).toUpperCase()}
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center hover:bg-white/15 transition-all">
                  <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              )}
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-md md:max-w-6xl mx-auto relative min-h-[calc(100vh-7rem)]">
        {children}
      </main>

      <BottomNav />
      <ChatBubble />
      <PwaInstall />
    </div>
  );
}

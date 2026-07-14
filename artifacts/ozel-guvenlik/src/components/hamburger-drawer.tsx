import React, { useEffect, useState, useCallback } from "react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useDisplayMode } from "@/contexts/DisplayModeContext";
import { useQueryClient } from "@tanstack/react-query";
import { useLogout, useGetUnreadNotificationCount, getGetUnreadNotificationCountQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Home, Briefcase, PlusCircle, FileText, Clock, MessageSquare, Bell,
  Bookmark, Headphones, User, LogOut, Shield, ChevronRight, Crown, Users,
} from "lucide-react";

type TeamMember = {
  id: number;
  displayName: string;
  roleName: string;
  avatarPath: string | null;
  nameColor: string;
  badgeColor: string;
  profileUrl: string | null;
  isOnlineVisible: boolean;
};

interface DrawerProps {
  open: boolean;
  onClose: () => void;
}

function roleLabel(user: { role?: string } | null | undefined): string {
  if (!user) return "Misafir";
  if (user.role === "admin") return "Sistem Yöneticisi";
  if (user.role === "senior_moderator") return "Kıdemli Moderatör";
  if (user.role === "moderator") return "Moderatör";
  if (user.role === "vip") return "VIP Üye";
  return "Üye";
}

export function HamburgerDrawer({ open, onClose }: DrawerProps) {
  const { user, isAdmin, canAccessModeratorPanel } = useAuth();
  const { isLite } = useDisplayMode();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const logout = useLogout();
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [teamTotal, setTeamTotal] = useState(0);

  const { data: unreadData } = useGetUnreadNotificationCount({
    query: {
      queryKey: getGetUnreadNotificationCountQueryKey(),
      enabled: !!user && open,
      refetchInterval: open ? 30000 : false,
    },
  });
  const unreadCount = user ? (unreadData?.count ?? 0) : 0;

  const loadTeam = useCallback(() => {
    fetch("/api/management-team", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { items?: TeamMember[]; total?: number }) => {
        setTeam(d.items ?? []);
        setTeamTotal(d.total ?? 0);
      })
      .catch(() => {
        setTeam([]);
        setTeamTotal(0);
      });
  }, []);

  useEffect(() => {
    if (open) loadTeam();
  }, [open, loadTeam]);

  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY;
    const prevOverflow = document.body.style.overflow;
    const prevPosition = document.body.style.position;
    const prevTop = document.body.style.top;
    const prevWidth = document.body.style.width;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => {
      document.querySelector<HTMLButtonElement>(".og-hd-close")?.focus();
    }, 50);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      document.body.style.position = prevPosition;
      document.body.style.top = prevTop;
      document.body.style.width = prevWidth;
      window.removeEventListener("keydown", onKey);
      window.scrollTo(0, scrollY);
    };
  }, [open, onClose]);

  const handleLogout = async () => {
    try {
      await logout.mutateAsync();
    } catch {
      /* stateless JWT */
    }
    try {
      localStorage.removeItem("auth_token");
    } catch {
      /* ignore */
    }
    queryClient.clear();
    toast({ title: "Çıkış yapıldı" });
    onClose();
    window.location.href = "/";
  };

  const navItems: Array<{
    icon: React.ReactNode;
    label: string;
    href: string;
    only?: "auth";
    badge?: number;
  }> = [
    ...(user ? [{ icon: <User className="og-hd-ico" />, label: "Profilim", href: `/profil/${user.username}` }] : []),
    { icon: <Home className="og-hd-ico" />, label: "Ana Sayfa", href: "/" },
    { icon: <Briefcase className="og-hd-ico" />, label: "İlanlar", href: "/ilanlar" },
    { icon: <PlusCircle className="og-hd-ico" />, label: "İlan Oluştur", href: "/ilan-ekle" },
    { icon: <FileText className="og-hd-ico" />, label: "CV Oluştur", href: "/cv-olustur" },
    { icon: <Clock className="og-hd-ico" />, label: "İş Arayanlar", href: "/part-time" },
    { icon: <MessageSquare className="og-hd-ico" />, label: "Sohbet", href: "/sohbet", only: "auth" as const },
    ...(!isLite ? [{ icon: <Bell className="og-hd-ico" />, label: "Bildirimler", href: "/bildirimler", only: "auth" as const, badge: unreadCount }] : []),
    { icon: <Bookmark className="og-hd-ico" />, label: "Favoriler", href: "/favoriler", only: "auth" as const },
    { icon: <Headphones className="og-hd-ico" />, label: "Destek", href: "/destek" },
  ];

  const drawerInner = (
    <>
      <button type="button" className="og-hd-close" onClick={onClose} aria-label="Menüyü kapat">
        <X className="w-[18px] h-[18px]" strokeWidth={2.2} />
      </button>

      <div className="og-hd-scroll">
        <div className="og-hd-profile">
          <div className="og-hd-profile-mark" aria-hidden />
          <div className="og-hd-avatar-wrap">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="og-hd-avatar" />
            ) : (
              <div className="og-hd-avatar og-hd-avatar-fallback">
                {(user?.username ?? "?").slice(0, 1).toUpperCase()}
              </div>
            )}
            <span className="og-hd-avatar-badge" aria-hidden>
              <Shield className="w-2.5 h-2.5" />
            </span>
          </div>
          <div className="og-hd-profile-meta">
            <div className="og-hd-name">{user?.username ?? "Misafir"}</div>
            <div className="og-hd-role">{roleLabel(user)}</div>
            {user ? (
              <Link href={`/profil/${user.username}`} onClick={onClose} className="og-hd-profile-link">
                Profili Gör <ChevronRight className="w-3 h-3" />
              </Link>
            ) : (
              <Link href="/giris" onClick={onClose} className="og-hd-profile-link">
                Giriş Yap <ChevronRight className="w-3 h-3" />
              </Link>
            )}
          </div>
        </div>

        <nav className="og-hd-nav" aria-label="Menü bağlantıları">
          {navItems.map((item) => {
            if (item.only === "auth" && !user) return null;
            return (
              <Link key={item.href} href={item.href} onClick={onClose} className="og-hd-item">
                <span className="og-hd-item-left">
                  {item.icon}
                  <span>{item.label}</span>
                </span>
                {item.badge && item.badge > 0 ? (
                  <span className="og-hd-badge">{item.badge > 99 ? "99+" : item.badge}</span>
                ) : null}
              </Link>
            );
          })}

          {isAdmin && (
            <Link href="/admin" onClick={onClose} className="og-hd-item og-hd-item-admin">
              <span className="og-hd-item-left">
                <span className="og-hd-admin-ico" aria-hidden>
                  <Shield className="og-hd-ico" />
                  <Crown className="og-hd-admin-crown" />
                </span>
                <span>Admin Paneli</span>
              </span>
              <ChevronRight className="og-hd-chevron" />
            </Link>
          )}
          {canAccessModeratorPanel && (
            <Link href="/moderator/dashboard" onClick={onClose} className="og-hd-item og-hd-item-admin">
              <span className="og-hd-item-left">
                <Shield className="og-hd-ico" />
                <span>Moderatör Paneli</span>
              </span>
              <ChevronRight className="og-hd-chevron" />
            </Link>
          )}

          {user ? (
            <button type="button" onClick={() => void handleLogout()} className="og-hd-item og-hd-item-danger">
              <span className="og-hd-item-left">
                <LogOut className="og-hd-ico" />
                <span>Çıkış Yap</span>
              </span>
            </button>
          ) : (
            <>
              <Link href="/giris" onClick={onClose} className="og-hd-item">
                <span className="og-hd-item-left">
                  <User className="og-hd-ico" />
                  <span>Giriş Yap</span>
                </span>
              </Link>
              <Link href="/kayit" onClick={onClose} className="og-hd-item">
                <span className="og-hd-item-left">
                  <PlusCircle className="og-hd-ico" />
                  <span>Kayıt Ol</span>
                </span>
              </Link>
            </>
          )}
        </nav>

        {team.length > 0 && (
          <section className="og-hd-team" aria-label="Yönetim Ekibi">
            <div className="og-hd-team-title">
              <Users className="w-3 h-3" />
              <span>YÖNETİM EKİBİ</span>
              <span className="og-hd-team-line" />
            </div>
            <ul className="og-hd-team-list">
              {team.map((m) => {
                const href = m.profileUrl || "#";
                const inner = (
                  <>
                    {m.avatarPath ? (
                      <img src={m.avatarPath} alt="" className="og-hd-team-avatar" />
                    ) : (
                      <div className="og-hd-team-avatar og-hd-team-avatar-fallback" style={{ color: m.nameColor }}>
                        {m.displayName.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="og-hd-team-meta">
                      <span className="og-hd-team-name" style={{ color: m.nameColor }}>{m.displayName}</span>
                      <span className="og-hd-team-badge" style={{ color: m.badgeColor, borderColor: `${m.badgeColor}55` }}>
                        {m.roleName}
                      </span>
                    </div>
                    {m.isOnlineVisible && <span className="og-hd-team-online" title="Çevrimiçi" />}
                  </>
                );
                return (
                  <li key={m.id}>
                    {m.profileUrl ? (
                      <Link href={href} onClick={onClose} className="og-hd-team-row">{inner}</Link>
                    ) : (
                      <div className="og-hd-team-row">{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
            {teamTotal > 3 && (
              <Link href="/destek" onClick={onClose} className="og-hd-team-more">
                Tüm Ekibi Gör
              </Link>
            )}
          </section>
        )}

        <footer className="og-hd-footer">
          <div className="og-hd-footer-text">ÖZEL GÜVENLİK TOPLULUĞU</div>
          <div className="og-hd-footer-osm text-[10px] opacity-60 mt-1">
            Harita verisi ©{" "}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">
              OpenStreetMap contributors
            </a>
          </div>
        </footer>
      </div>
    </>
  );

  /* Lite: animasyonsuz sabit menü — og-lite CSS framer-motion'ı bozuyor */
  if (isLite) {
    if (!open) return null;
    return (
      <>
        <div className="og-hd-overlay og-hd-overlay--lite" onClick={onClose} aria-hidden />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Ana menü"
          className="og-hd-drawer og-hd-drawer--lite"
        >
          {drawerInner}
        </aside>
      </>
    );
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="og-hd-overlay"
            onClick={onClose}
            aria-hidden
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Ana menü"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
            className="og-hd-drawer"
          >
            {drawerInner}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

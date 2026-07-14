import React, { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Briefcase, Building2, Users, Mail,
  Bell, Flag, Globe, ShieldBan, Filter, ScrollText, Megaphone,
  BarChart3, Settings, ChevronLeft, ChevronRight, Shield, X, Home,
} from "lucide-react";
import { useModerator } from "./context";
import type { ModBadges } from "./context";

const STORAGE_KEY = "mod-sidebar-collapsed";

type BadgeKey = keyof ModBadges;

interface NavItem {
  path: string;
  label: string;
  icon: React.ElementType;
  permission: string;
  badgeKey?: BadgeKey;
}

const NAV_ITEMS: NavItem[] = [
  { path: "/moderator/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
  { path: "/moderator/listings", label: "İlanlar", icon: Briefcase, permission: "listings.view", badgeKey: "listings" },
  { path: "/moderator/companies", label: "Şirketler", icon: Building2, permission: "companies.view", badgeKey: "companies" },
  { path: "/moderator/users", label: "Kullanıcılar", icon: Users, permission: "users.view", badgeKey: "users" },
  { path: "/moderator/messages", label: "Mesajlar", icon: Mail, permission: "messages.view_reported", badgeKey: "messages" },
  { path: "/moderator/notifications", label: "Bildirimler", icon: Bell, permission: "notifications.view", badgeKey: "notifications" },
  { path: "/moderator/reports", label: "Raporlar", icon: Flag, permission: "reports.view", badgeKey: "reports" },
  { path: "/moderator/ip-devices", label: "IP & Cihazlar", icon: Globe, permission: "ip_devices.view" },
  { path: "/moderator/blacklist", label: "Kara Liste", icon: ShieldBan, permission: "blacklist.view" },
  { path: "/moderator/word-filter", label: "Kelime Filtresi", icon: Filter, permission: "word_filter.view" },
  { path: "/moderator/logs", label: "Loglar", icon: ScrollText, permission: "logs.view" },
  { path: "/moderator/announcements", label: "Duyurular", icon: Megaphone, permission: "announcements.view" },
  { path: "/moderator/statistics", label: "İstatistikler", icon: BarChart3, permission: "statistics.view" },
  { path: "/moderator/settings", label: "Ayarlar", icon: Settings, permission: "settings.profile" },
];

interface SidebarProps {
  mobile?: boolean;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

function SidebarContent({ collapsed, onToggle, mobile, onMobileClose }: {
  collapsed: boolean;
  onToggle?: () => void;
  mobile?: boolean;
  onMobileClose?: () => void;
}) {
  const [location] = useLocation();
  const { hasPermission, badges, me } = useModerator();

  const visibleItems = NAV_ITEMS.filter((item) => hasPermission(item.permission));

  return (
    <>
      <div style={{ padding: collapsed && !mobile ? "20px 12px" : "20px 16px", borderBottom: "1px solid var(--mod-border-subtle)", display: "flex", alignItems: "center", gap: 10, minHeight: 72 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--mod-gold-dim)", border: "1px solid var(--mod-border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Shield size={18} style={{ color: "var(--mod-gold)" }} />
        </div>
        {(!collapsed || mobile) && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--mod-font-display)", fontWeight: 700, fontSize: 14, color: "var(--mod-gold)" }}>
              Moderatör
            </div>
            <div style={{ fontSize: 11, color: "var(--mod-text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {me?.displayName ?? me?.username ?? "Panel"}
            </div>
          </div>
        )}
        {mobile && onMobileClose && (
          <button type="button" onClick={onMobileClose} className="mod-btn mod-btn-ghost mod-btn-sm" style={{ padding: 4, marginLeft: "auto" }}>
            <X size={18} />
          </button>
        )}
      </div>

      <nav style={{ flex: 1, overflowY: "auto", padding: "12px 8px" }}>
        <Link
          href="/"
          onClick={mobile ? onMobileClose : undefined}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: collapsed && !mobile ? "10px 0" : "10px 12px",
            justifyContent: collapsed && !mobile ? "center" : "flex-start",
            borderRadius: 8,
            marginBottom: 8,
            textDecoration: "none",
            color: "var(--mod-gold)",
            background: "var(--mod-gold-dim)",
            border: "1px solid var(--mod-border)",
            fontSize: 13,
            fontWeight: 600,
          }}
          title="Ana Sayfa"
        >
          <Home size={18} style={{ flexShrink: 0 }} />
          {(!collapsed || mobile) && <span style={{ flex: 1 }}>Ana Sayfa</span>}
        </Link>
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const active = location === item.path || location.startsWith(item.path + "/");
          const badge = item.badgeKey ? badges[item.badgeKey] : 0;

          return (
            <Link
              key={item.path}
              href={item.path}
              onClick={mobile ? onMobileClose : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: collapsed && !mobile ? "10px 0" : "10px 12px",
                justifyContent: collapsed && !mobile ? "center" : "flex-start",
                borderRadius: 8,
                marginBottom: 2,
                textDecoration: "none",
                color: active ? "var(--mod-gold)" : "var(--mod-text-muted)",
                background: active ? "var(--mod-gold-dim)" : "transparent",
                border: active ? "1px solid var(--mod-border)" : "1px solid transparent",
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                transition: "all 0.15s",
                position: "relative",
              }}
            >
              <Icon size={18} style={{ flexShrink: 0 }} />
              {(!collapsed || mobile) && <span style={{ flex: 1 }}>{item.label}</span>}
              {badge > 0 && (
                <span
                  style={{
                    background: "var(--mod-gold)",
                    color: "#080D12",
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "1px 6px",
                    borderRadius: 999,
                    minWidth: 18,
                    textAlign: "center",
                    ...(collapsed && !mobile ? { position: "absolute", top: 4, right: 4 } : {}),
                  }}
                >
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {!mobile && onToggle && (
        <div style={{ padding: "12px 8px", borderTop: "1px solid var(--mod-border-subtle)" }}>
          <button
            type="button"
            onClick={onToggle}
            className="mod-btn mod-btn-ghost"
            style={{ width: "100%", justifyContent: collapsed ? "center" : "flex-start" }}
          >
            {collapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={16} /> Daralt</>}
          </button>
        </div>
      )}
    </>
  );
}

export function ModeratorSidebar({ mobile, mobileOpen, onMobileClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === "true"; } catch { return false; }
  });

  useEffect(() => {
    const root = document.querySelector(".mod-root");
    if (root) {
      if (collapsed) root.classList.add("mod-sidebar-collapsed");
      else root.classList.remove("mod-sidebar-collapsed");
    }
  }, [collapsed]);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  };

  if (mobile) {
    if (!mobileOpen) return null;
    return (
      <>
        <div className="mod-drawer-overlay mod-sidebar-mobile" onClick={onMobileClose} />
        <aside
          className="mod-sidebar-mobile"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            bottom: 0,
            width: 280,
            background: "var(--mod-bg-elevated)",
            borderRight: "1px solid var(--mod-border-subtle)",
            zIndex: 100,
            display: "flex",
            flexDirection: "column",
            animation: "modSlideLeft 0.25s ease",
          }}
        >
          <SidebarContent collapsed={false} mobile onMobileClose={onMobileClose} />
        </aside>
        <style>{`@keyframes modSlideLeft { from { transform: translateX(-100%); } to { transform: translateX(0); } }`}</style>
      </>
    );
  }

  return (
    <aside
      className="mod-sidebar-desktop"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        bottom: 0,
        width: collapsed ? "var(--mod-sidebar-collapsed)" : "var(--mod-sidebar-w)",
        background: "var(--mod-bg-elevated)",
        borderRight: "1px solid var(--mod-border-subtle)",
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        transition: "width 0.25s ease",
        overflow: "hidden",
      }}
    >
      <SidebarContent collapsed={collapsed} onToggle={toggle} />
    </aside>
  );
}

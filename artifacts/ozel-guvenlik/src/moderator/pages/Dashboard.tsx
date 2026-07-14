import React, { useCallback, useEffect, useState } from "react";
import {
  Briefcase, Users, Flag, Clock, Eye, MessageSquare, Send,
  Server, Database, Bell, HardDrive, ChevronRight, Activity,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { modFetch, modPost } from "../api";
import { PermissionGuard } from "../PermissionGuard";
import { StatCard } from "../components/StatCard";
import { ReportDrawer, type ReportItem } from "../components/ReportDrawer";
import { fmtDate, fmtShortDate } from "../components/PageShell";
import { useModerator } from "../context";
import { Link } from "wouter";

interface DashboardData {
  stats: {
    totalListings: number;
    listingsDelta: number;
    activeUsers: number;
    usersDelta: number;
    reportedContent: number;
    pendingApprovals: number;
    views: number;
    applications: number;
    messages: number;
  };
  reports: ReportItem[];
  activities: { id: number; action: string; targetType: string; targetId: number; reason: string | null; createdAt: string; success: boolean }[];
  chart: { date: string; value: number }[];
  health: { server: string; database: string; notifications: string; backup: string };
}

type ChartRange = 7 | 30 | 90;

export default function Dashboard() {
  const { hasPermission, refreshBadges } = useModerator();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartRange, setChartRange] = useState<ChartRange>(7);
  const [chartData, setChartData] = useState<{ date: string; value: number }[]>([]);
  const [selectedReport, setSelectedReport] = useState<ReportItem | null>(null);
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketDesc, setTicketDesc] = useState("");
  const [ticketSending, setTicketSending] = useState(false);
  const [ticketSent, setTicketSent] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await modFetch<DashboardData>("/dashboard");
      setData(d);
      setChartData(d.chart);
      await refreshBadges();
    } catch { /* handled by guard */ }
    finally { setLoading(false); }
  }, [refreshBadges]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (chartRange === 7 && data) {
      setChartData(data.chart);
      return;
    }
    modFetch<{ series: { date: string; listings: number }[] }>(`/statistics?days=${chartRange}`)
      .then((s) => setChartData(s.series.map((x) => ({ date: x.date, value: x.listings }))))
      .catch(() => {});
  }, [chartRange, data]);

  const sendTicket = async () => {
    if (!ticketSubject.trim() || !ticketDesc.trim()) return;
    setTicketSending(true);
    try {
      await modPost("/support-tickets", { subject: ticketSubject, description: ticketDesc, category: "other", priority: "normal" });
      setTicketSent(true);
      setTicketSubject("");
      setTicketDesc("");
    } finally { setTicketSending(false); }
  };

  const healthItems = [
    { key: "server", label: "Sunucu", icon: Server },
    { key: "database", label: "Veritabanı", icon: Database },
    { key: "notifications", label: "Bildirimler", icon: Bell },
    { key: "backup", label: "Yedekleme", icon: HardDrive },
  ] as const;

  if (loading && !data) {
    return <div className="mod-loading-center"><div className="mod-spinner" /></div>;
  }

  const stats = data?.stats;

  return (
    <PermissionGuard permission="dashboard.view">
      <div>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily: "var(--mod-font-display)", fontSize: 24, fontWeight: 700 }}>Dashboard</h1>
          <p style={{ fontSize: 13, color: "var(--mod-text-muted)" }}>Moderasyon özeti ve hızlı işlemler</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 24 }}>
          <StatCard label="Toplam İlan" value={stats?.totalListings ?? 0} delta={stats?.listingsDelta} deltaLabel="bu hafta" icon={<Briefcase size={20} />} />
          <StatCard label="Aktif Kullanıcı" value={stats?.activeUsers ?? 0} delta={stats?.usersDelta} deltaLabel="bu hafta" icon={<Users size={20} />} accent="success" />
          <StatCard label="Raporlanan" value={stats?.reportedContent ?? 0} icon={<Flag size={20} />} accent="danger" />
          <StatCard label="Onay Bekleyen" value={stats?.pendingApprovals ?? 0} icon={<Clock size={20} />} accent="warning" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, marginBottom: 24 }}>
          <div className="mod-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h2 style={{ fontFamily: "var(--mod-font-display)", fontWeight: 700, fontSize: 16 }}>Bekleyen Raporlar</h2>
              <Link href="/moderator/reports" style={{ fontSize: 12, color: "var(--mod-gold)", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                Tümü <ChevronRight size={14} />
              </Link>
            </div>
            {!data?.reports.length ? (
              <p style={{ fontSize: 13, color: "var(--mod-text-muted)", padding: "24px 0", textAlign: "center" }}>Bekleyen rapor yok</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {data.reports.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedReport(r)}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: "var(--mod-bg-elevated)", border: "1px solid var(--mod-border-subtle)", borderRadius: 8, cursor: "pointer", textAlign: "left", color: "var(--mod-text)", width: "100%" }}
                  >
                    <Flag size={16} style={{ color: "var(--mod-gold)", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</p>
                      <p style={{ fontSize: 11, color: "var(--mod-text-dim)" }}>{r.targetType} · {fmtShortDate(r.createdAt)}</p>
                    </div>
                    <ChevronRight size={14} style={{ color: "var(--mod-text-dim)" }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="mod-card">
              <h2 style={{ fontFamily: "var(--mod-font-display)", fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Sistem Durumu</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {healthItems.map(({ key, label, icon: Icon }) => {
                  const status = data?.health[key] ?? "unknown";
                  const ok = status === "active";
                  return (
                    <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                      <Icon size={14} style={{ color: "var(--mod-text-dim)" }} />
                      <span style={{ flex: 1 }}>{label}</span>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: ok ? "var(--mod-success)" : "var(--mod-danger)" }} />
                      <span style={{ fontSize: 11, color: ok ? "var(--mod-success)" : "var(--mod-danger)" }}>{ok ? "Aktif" : "Kapalı"}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mod-card">
              <h2 style={{ fontFamily: "var(--mod-font-display)", fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Hızlı İşlemler</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {hasPermission("listings.view") && (
                  <Link href="/moderator/listings" className="mod-btn mod-btn-ghost mod-btn-sm" style={{ justifyContent: "flex-start", textDecoration: "none" }}>
                    <Briefcase size={14} /> İlanları İncele
                  </Link>
                )}
                {hasPermission("reports.view") && (
                  <Link href="/moderator/reports" className="mod-btn mod-btn-ghost mod-btn-sm" style={{ justifyContent: "flex-start", textDecoration: "none" }}>
                    <Flag size={14} /> Raporları Gör
                  </Link>
                )}
                {hasPermission("users.view") && (
                  <Link href="/moderator/users" className="mod-btn mod-btn-ghost mod-btn-sm" style={{ justifyContent: "flex-start", textDecoration: "none" }}>
                    <Users size={14} /> Kullanıcılar
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20, marginBottom: 24 }}>
          <div className="mod-card">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <Activity size={16} style={{ color: "var(--mod-gold)" }} />
              <h2 style={{ fontFamily: "var(--mod-font-display)", fontWeight: 700, fontSize: 16 }}>Son Aktiviteler</h2>
            </div>
            {!data?.activities.length ? (
              <p style={{ fontSize: 13, color: "var(--mod-text-muted)", textAlign: "center", padding: 16 }}>Aktivite yok</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" }}>
                {data.activities.map((a) => (
                  <div key={a.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--mod-border-subtle)", fontSize: 12 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: a.success ? "var(--mod-success)" : "var(--mod-danger)", marginTop: 5, flexShrink: 0 }} />
                    <div>
                      <p style={{ fontWeight: 500 }}>{a.action}</p>
                      <p style={{ color: "var(--mod-text-dim)" }}>{a.targetType} #{a.targetId} · {fmtDate(a.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mod-card">
            <h2 style={{ fontFamily: "var(--mod-font-display)", fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Yardım Talebi</h2>
            {ticketSent ? (
              <p style={{ fontSize: 13, color: "var(--mod-success)" }}>Talebiniz iletildi. Teşekkürler!</p>
            ) : (
              <>
                <input className="mod-input" placeholder="Konu" value={ticketSubject} onChange={(e) => setTicketSubject(e.target.value)} style={{ marginBottom: 8 }} />
                <textarea className="mod-input" rows={3} placeholder="Açıklama..." value={ticketDesc} onChange={(e) => setTicketDesc(e.target.value)} style={{ marginBottom: 10, resize: "vertical" }} />
                <button type="button" className="mod-btn mod-btn-gold mod-btn-sm" onClick={sendTicket} disabled={ticketSending || !ticketSubject.trim() || !ticketDesc.trim()} style={{ width: "100%" }}>
                  <Send size={14} /> Gönder
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mod-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
            <h2 style={{ fontFamily: "var(--mod-font-display)", fontWeight: 700, fontSize: 16 }}>İlan Trendi</h2>
            <div style={{ display: "flex", gap: 6 }}>
              {([7, 30, 90] as ChartRange[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`mod-btn mod-btn-sm ${chartRange === d ? "mod-btn-gold" : "mod-btn-ghost"}`}
                  onClick={() => setChartRange(d)}
                >
                  {d}G
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="modGoldGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#E4AE2B" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#E4AE2B" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="date" tick={{ fill: "#7A8BA0", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#7A8BA0", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#111B28", border: "1px solid rgba(228,174,43,0.2)", borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="value" stroke="#E4AE2B" fill="url(#modGoldGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", gap: 24, marginTop: 12, fontSize: 12, color: "var(--mod-text-muted)" }}>
            <span><Eye size={12} style={{ display: "inline", marginRight: 4 }} />{stats?.views?.toLocaleString("tr-TR") ?? 0} görüntülenme</span>
            <span><MessageSquare size={12} style={{ display: "inline", marginRight: 4 }} />{stats?.messages ?? 0} mesaj</span>
          </div>
        </div>
      </div>

      <ReportDrawer report={selectedReport} onClose={() => setSelectedReport(null)} onAction={load} />
    </PermissionGuard>
  );
}

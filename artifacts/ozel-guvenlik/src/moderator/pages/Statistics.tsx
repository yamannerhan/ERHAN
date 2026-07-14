import React, { useCallback, useEffect, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { modFetch } from "../api";
import { PermissionGuard } from "../PermissionGuard";
import { PageShell } from "../components/PageShell";

type Range = 7 | 30 | 90;

export default function Statistics() {
  const [days, setDays] = useState<Range>(30);
  const [series, setSeries] = useState<{ date: string; listings: number; users: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await modFetch<{ series: { date: string; listings: number; users: number }[] }>(`/statistics?days=${days}`);
      setSeries(data.series);
    } finally { setLoading(false); }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  return (
    <PermissionGuard permission="statistics.view">
      <PageShell
        title="İstatistikler"
        onRefresh={load}
        loading={loading}
        actions={
          <div style={{ display: "flex", gap: 6 }}>
            {([7, 30, 90] as Range[]).map((d) => (
              <button key={d} type="button" className={`mod-btn mod-btn-sm ${days === d ? "mod-btn-gold" : "mod-btn-ghost"}`} onClick={() => setDays(d)}>
                {d} Gün
              </button>
            ))}
          </div>
        }
      >
        <div className="mod-card">
          {loading ? (
            <div className="mod-loading-center"><div className="mod-spinner" /></div>
          ) : (
            <ResponsiveContainer width="100%" height={360}>
              <AreaChart data={series}>
                <defs>
                  <linearGradient id="listingsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#E4AE2B" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#E4AE2B" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="usersGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3498DB" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3498DB" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" tick={{ fill: "#7A8BA0", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#7A8BA0", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#111B28", border: "1px solid rgba(228,174,43,0.2)", borderRadius: 8, fontSize: 12 }} />
                <Legend />
                <Area type="monotone" dataKey="listings" name="İlanlar" stroke="#E4AE2B" fill="url(#listingsGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="users" name="Kullanıcılar" stroke="#3498DB" fill="url(#usersGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </PageShell>
    </PermissionGuard>
  );
}

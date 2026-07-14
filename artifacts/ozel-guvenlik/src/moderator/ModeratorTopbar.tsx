import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Search, Bell, Menu, User, Briefcase, Building2, Flag } from "lucide-react";
import { modFetch } from "./api";
import { useModerator } from "./context";

interface SearchResults {
  users: { id: number; username: string; displayName: string }[];
  listings: { id: number; title: string; city: string }[];
  companies: { id: number; companyName: string }[];
  reports: { id: number; titleSnapshot: string | null; reason: string }[];
}

interface TopbarProps {
  onMenuClick: () => void;
}

export function ModeratorTopbar({ onMenuClick }: TopbarProps) {
  const { me, badges } = useModerator();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults(null); return; }
    setSearching(true);
    try {
      const data = await modFetch<SearchResults>(`/search?q=${encodeURIComponent(q)}`);
      setResults(data);
      setSearchOpen(true);
    } catch {
      setResults(null);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, doSearch]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const hasResults = results && (
    results.users.length + results.listings.length + results.companies.length + results.reports.length > 0
  );

  return (
    <header
      style={{
        height: "var(--mod-topbar-h)",
        borderBottom: "1px solid var(--mod-border-subtle)",
        background: "var(--mod-bg-elevated)",
        display: "flex",
        alignItems: "center",
        padding: "0 24px",
        gap: 16,
        position: "sticky",
        top: 0,
        zIndex: 40,
      }}
    >
      <button
        type="button"
        className="mod-btn mod-btn-ghost mod-btn-sm mod-sidebar-mobile"
        onClick={onMenuClick}
        style={{ padding: 8 }}
        aria-label="Menü"
      >
        <Menu size={20} />
      </button>

      <div ref={searchRef} style={{ flex: 1, maxWidth: 480, position: "relative" }}>
        <div style={{ position: "relative" }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--mod-text-dim)" }} />
          <input
            className="mod-input"
            style={{ paddingLeft: 36 }}
            placeholder="Kullanıcı, ilan, şirket veya rapor ara..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => query.length >= 2 && setSearchOpen(true)}
          />
        </div>

        {searchOpen && query.length >= 2 && (
          <div
            className="mod-card"
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              left: 0,
              right: 0,
              zIndex: 60,
              padding: 8,
              maxHeight: 360,
              overflowY: "auto",
              boxShadow: "var(--mod-shadow)",
            }}
          >
            {searching && <p style={{ padding: 12, fontSize: 13, color: "var(--mod-text-muted)" }}>Aranıyor...</p>}
            {!searching && !hasResults && (
              <p style={{ padding: 12, fontSize: 13, color: "var(--mod-text-muted)" }}>Sonuç bulunamadı</p>
            )}
            {results?.users.map((u) => (
              <Link
                key={`u-${u.id}`}
                href="/moderator/users"
                onClick={() => { setSearchOpen(false); setQuery(""); }}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6, textDecoration: "none", color: "var(--mod-text)", fontSize: 13 }}
              >
                <User size={14} style={{ color: "var(--mod-gold)" }} />
                <span>{u.displayName || u.username}</span>
                <span style={{ color: "var(--mod-text-dim)", fontSize: 11 }}>@{u.username}</span>
              </Link>
            ))}
            {results?.listings.map((l) => (
              <Link
                key={`l-${l.id}`}
                href="/moderator/listings"
                onClick={() => { setSearchOpen(false); setQuery(""); }}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6, textDecoration: "none", color: "var(--mod-text)", fontSize: 13 }}
              >
                <Briefcase size={14} style={{ color: "var(--mod-gold)" }} />
                <span>{l.title}</span>
                <span style={{ color: "var(--mod-text-dim)", fontSize: 11 }}>{l.city}</span>
              </Link>
            ))}
            {results?.companies.map((c) => (
              <Link
                key={`c-${c.id}`}
                href="/moderator/companies"
                onClick={() => { setSearchOpen(false); setQuery(""); }}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6, textDecoration: "none", color: "var(--mod-text)", fontSize: 13 }}
              >
                <Building2 size={14} style={{ color: "var(--mod-gold)" }} />
                <span>{c.companyName}</span>
              </Link>
            ))}
            {results?.reports.map((r) => (
              <Link
                key={`r-${r.id}`}
                href="/moderator/reports"
                onClick={() => { setSearchOpen(false); setQuery(""); }}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6, textDecoration: "none", color: "var(--mod-text)", fontSize: 13 }}
              >
                <Flag size={14} style={{ color: "var(--mod-gold)" }} />
                <span>{r.titleSnapshot || `Rapor #${r.id}`}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Link
        href="/moderator/notifications"
        style={{ position: "relative", color: "var(--mod-text-muted)", textDecoration: "none", padding: 8 }}
      >
        <Bell size={20} />
        {badges.notifications > 0 && (
          <span style={{ position: "absolute", top: 4, right: 4, width: 8, height: 8, borderRadius: "50%", background: "var(--mod-gold)" }} />
        )}
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {me?.avatarUrl ? (
          <img src={me.avatarUrl} alt="" style={{ width: 36, height: 36, borderRadius: 10, objectFit: "cover", border: "1px solid var(--mod-border)" }} />
        ) : (
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--mod-gold-dim)", border: "1px solid var(--mod-border)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, color: "var(--mod-gold)" }}>
            {(me?.username ?? "?").slice(0, 1).toUpperCase()}
          </div>
        )}
        <div style={{ display: "none" }} className="mod-topbar-user">
          <div style={{ fontSize: 13, fontWeight: 600 }}>{me?.displayName ?? me?.username}</div>
        </div>
      </div>
    </header>
  );
}

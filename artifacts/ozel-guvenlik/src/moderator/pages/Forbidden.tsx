import React from "react";
import { ShieldX } from "lucide-react";
import { Link } from "wouter";
import "../moderator-theme.css";

export default function Forbidden() {
  return (
    <div
      className="mod-root"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        textAlign: "center",
        padding: 24,
        background: "var(--mod-bg)",
        color: "var(--mod-text)",
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 16,
          background: "rgba(231,76,60,0.12)",
          border: "1px solid rgba(231,76,60,0.25)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 20,
        }}
      >
        <ShieldX size={36} style={{ color: "var(--mod-danger)" }} />
      </div>
      <h1 style={{ fontFamily: "var(--mod-font-display)", fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        403 — Erişim Engellendi
      </h1>
      <p
        style={{
          color: "var(--mod-text-muted)",
          fontSize: 14,
          maxWidth: 400,
          marginBottom: 24,
          lineHeight: 1.6,
        }}
      >
        Moderatör paneline erişim yetkiniz bulunmuyor. Bu sayfayı görüntülemek için moderatör
        veya admin rolüne sahip olmanız gerekir.
      </p>
      <Link href="/" className="mod-btn mod-btn-gold" style={{ textDecoration: "none" }}>
        Ana Sayfaya Dön
      </Link>
    </div>
  );
}

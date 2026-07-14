import React from "react";
import { ShieldOff } from "lucide-react";
import { useModerator } from "./context";

interface PermissionGuardProps {
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function PermissionGuard({ permission, children, fallback }: PermissionGuardProps) {
  const { hasPermission, loading } = useModerator();

  if (loading) {
    return (
      <div className="mod-loading-center">
        <div className="mod-spinner" />
      </div>
    );
  }

  if (!hasPermission(permission)) {
    if (fallback) return <>{fallback}</>;
    return (
      <div className="mod-empty">
        <ShieldOff size={32} style={{ color: "var(--mod-text-dim)", margin: "0 auto 12px" }} />
        <p style={{ fontWeight: 600, marginBottom: 4 }}>Yetkiniz yok</p>
        <p style={{ fontSize: 13, color: "var(--mod-text-muted)" }}>
          Bu bölümü görüntülemek için gerekli izniniz bulunmuyor.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

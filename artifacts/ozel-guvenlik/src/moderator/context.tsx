import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { modFetch } from "./api";

export interface ModMe {
  id: number;
  username: string;
  displayName: string;
  role: string;
  avatarUrl: string | null;
  permissions: string[];
}

export interface ModBadges {
  listings: number;
  companies: number;
  users: number;
  comments: number;
  messages: number;
  notifications: number;
  reports: number;
}

interface ModeratorContextValue {
  me: ModMe | null;
  permissions: string[];
  badges: ModBadges;
  loading: boolean;
  error: string | null;
  hasPermission: (key: string) => boolean;
  refreshBadges: () => Promise<void>;
  refreshMe: () => Promise<ModMe | void>;
}

const defaultBadges: ModBadges = {
  listings: 0,
  companies: 0,
  users: 0,
  comments: 0,
  messages: 0,
  notifications: 0,
  reports: 0,
};

const ModeratorContext = createContext<ModeratorContextValue>({
  me: null,
  permissions: [],
  badges: defaultBadges,
  loading: true,
  error: null,
  hasPermission: () => false,
  refreshBadges: async () => {},
  refreshMe: async () => {},
});

export function ModeratorProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<ModMe | null>(null);
  const [badges, setBadges] = useState<ModBadges>(defaultBadges);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshMe = useCallback(async () => {
    const data = await modFetch<ModMe>("/me");
    setMe(data);
    return data;
  }, []);

  const refreshBadges = useCallback(async () => {
    try {
      const data = await modFetch<ModBadges>("/badges");
      setBadges(data);
    } catch {
      /* badges optional if no dashboard.view */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await refreshMe();
        if (cancelled) return;
        if (data.permissions.includes("dashboard.view")) {
          await refreshBadges();
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Yüklenemedi");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshMe, refreshBadges]);

  const permissions = me?.permissions ?? [];

  const hasPermission = useCallback(
    (key: string) => permissions.includes(key),
    [permissions],
  );

  const value = useMemo(
    () => ({
      me,
      permissions,
      badges,
      loading,
      error,
      hasPermission,
      refreshBadges,
      refreshMe,
    }),
    [me, permissions, badges, loading, error, hasPermission, refreshBadges, refreshMe],
  );

  return (
    <ModeratorContext.Provider value={value}>
      {children}
    </ModeratorContext.Provider>
  );
}

export function useModerator() {
  return useContext(ModeratorContext);
}

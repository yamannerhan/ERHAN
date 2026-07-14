import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Admin her yetkiye sahip.
 * Moderatör: /moderator/me üzerinden (varsayılan sohbet temizleme yok; admin atar).
 */
export function useStaffChatPerms() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isMod =
    user?.role === "moderator" || user?.role === "senior_moderator";
  const [canClearChat, setCanClearChat] = useState(isAdmin);
  const [permsLoaded, setPermsLoaded] = useState(isAdmin || !isMod);

  useEffect(() => {
    if (!user) {
      setCanClearChat(false);
      setPermsLoaded(true);
      return;
    }
    if (user.role === "admin") {
      setCanClearChat(true);
      setPermsLoaded(true);
      return;
    }
    if (user.role !== "moderator" && user.role !== "senior_moderator") {
      setCanClearChat(false);
      setPermsLoaded(true);
      return;
    }
    let cancelled = false;
    setPermsLoaded(false);
    const token = localStorage.getItem("auth_token") ?? "";
    void fetch("/api/moderator/me", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then(async (r) => {
        if (!r.ok) return null;
        return r.json() as Promise<{ permissions?: string[] }>;
      })
      .then((d) => {
        if (cancelled) return;
        setCanClearChat(!!d?.permissions?.includes("chat.clear"));
        setPermsLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setCanClearChat(false);
          setPermsLoaded(true);
        }
      });
    return () => { cancelled = true; };
  }, [user?.id, user?.role]);

  return {
    isAdmin,
    isMod,
    canClearChat,
    permsLoaded,
  };
}

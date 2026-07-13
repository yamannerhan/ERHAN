import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";

/** Sitede açık kaldıkça ~2 dk’da bir presence XP gönderir. */
export function usePresenceXp(enabled = true) {
  const { user } = useAuth();
  const busy = useRef(false);

  useEffect(() => {
    if (!enabled || !user) return;

    const tick = async () => {
      if (busy.current) return;
      if (document.visibilityState === "hidden") return;
      busy.current = true;
      try {
        await fetch("/api/users/presence", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("auth_token") ?? ""}`,
            "Content-Type": "application/json",
          },
          body: "{}",
        });
      } catch { /* ignore */ }
      finally { busy.current = false; }
    };

    const id = window.setInterval(() => { void tick(); }, 120_000);
    // İlk heartbeat biraz gecikmeli
    const first = window.setTimeout(() => { void tick(); }, 45_000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(first);
    };
  }, [enabled, user?.id]);
}

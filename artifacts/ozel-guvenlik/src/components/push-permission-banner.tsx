import React, { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { shouldShowPushPrompt, subscribeToPush, ensurePushSubscriptionQuiet } from "@/lib/web-push";

/** Siteye/PWA'ya girenlerden bir kez bildirim izni ister */
export function PushPermissionBanner() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void ensurePushSubscriptionQuiet();
    const t = window.setTimeout(() => {
      if (shouldShowPushPrompt()) setVisible(true);
    }, 2500);
    return () => window.clearTimeout(t);
  }, []);

  if (!visible) return null;

  const allow = async () => {
    setBusy(true);
    try {
      const ok = await subscribeToPush();
      setVisible(false);
      if (!ok && Notification.permission === "denied") {
        localStorage.setItem("og_push_asked_v1", "1");
      }
    } finally {
      setBusy(false);
    }
  };

  const dismiss = () => {
    localStorage.setItem("og_push_asked_v1", "1");
    setVisible(false);
  };

  return (
    <div className="fixed left-3 right-3 z-[90] bottom-[calc(76px+env(safe-area-inset-bottom))] sm:left-auto sm:right-4 sm:bottom-6 sm:max-w-sm">
      <div
        className="rounded-2xl border border-amber-400/30 p-3.5 shadow-2xl backdrop-blur-xl"
        style={{ background: "linear-gradient(145deg,rgba(20,24,38,0.96),rgba(30,22,12,0.94))" }}
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-amber-400/15 border border-amber-400/30">
            <Bell className="w-5 h-5 text-amber-300" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-white">Canlı bildirimler</div>
            <p className="text-[11px] text-white/65 leading-relaxed mt-0.5">
              Yeni ilan ve mesajlar geldiğinde Android gibi anlık bildirim almak için izin verin. Bir kez yeter.
            </p>
            <div className="flex gap-2 mt-2.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => void allow()}
                className="flex-1 rounded-xl bg-amber-400 text-black text-xs font-bold py-2 hover:bg-amber-300 disabled:opacity-60"
              >
                {busy ? "Açılıyor…" : "İzin Ver"}
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="rounded-xl px-3 text-xs font-semibold text-white/50 hover:bg-white/10"
              >
                Sonra
              </button>
            </div>
          </div>
          <button type="button" onClick={dismiss} className="text-white/35 hover:text-white/70 p-0.5" aria-label="Kapat">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

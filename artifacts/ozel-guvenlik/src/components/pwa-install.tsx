import React, { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __ogDeferredInstall?: BeforeInstallPromptEvent | null;
  }
}

function isStandalonePwa(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function readDeferred(): BeforeInstallPromptEvent | null {
  return (window.__ogDeferredInstall as BeforeInstallPromptEvent | null | undefined) ?? null;
}

/**
 * Yükle = yalnızca tarayıcı gerçek kurulum API’si verdiğinde (Android Chrome/Edge…).
 * Tıklanınca doğrudan kurulum penceresi açılır.
 * iOS Safari programatik kurulum desteklemez; eski talimat kartı kaldırıldı
 * (alt menüyle çakışıyor / yükleme yapmıyordu).
 */
export function PwaInstall() {
  const [promptEvt, setPromptEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (isStandalonePwa()) {
      setInstalled(true);
      return;
    }

    const early = readDeferred();
    if (early) setPromptEvt(early);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      const ev = e as BeforeInstallPromptEvent;
      window.__ogDeferredInstall = ev;
      setPromptEvt(ev);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvt(null);
      window.__ogDeferredInstall = null;
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    const ev = promptEvt || readDeferred();
    if (!ev || typeof ev.prompt !== "function") return;
    setBusy(true);
    setFeedback(null);
    try {
      await ev.prompt();
      const { outcome } = await ev.userChoice;
      if (outcome === "accepted") {
        setInstalled(true);
      } else {
        setFeedback("Kurulum iptal edildi");
        window.setTimeout(() => setFeedback(null), 2500);
      }
    } catch {
      setFeedback("Kurulum başlatılamadı");
      window.setTimeout(() => setFeedback(null), 2500);
    } finally {
      setBusy(false);
      setPromptEvt(null);
      window.__ogDeferredInstall = null;
    }
  };

  if (installed) return null;

  const canInstall = !!(promptEvt || readDeferred());
  if (!canInstall && !feedback) return null;

  return (
    <>
      {canInstall && (
        <button
          type="button"
          onClick={() => void install()}
          disabled={busy}
          className="shrink-0 h-8 px-2 rounded-full bg-primary/15 border border-primary/25 text-primary hover:bg-primary/25 transition-colors flex items-center gap-1 text-[10px] font-extrabold whitespace-nowrap max-w-[76px] disabled:opacity-60"
          aria-label="Uygulamayı yükle"
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{busy ? "…" : "Yükle"}</span>
        </button>
      )}

      {feedback && (
        <div
          className="og-pwa-toast fixed left-1/2 z-[110] -translate-x-1/2 px-3 py-2 rounded-xl bg-[#12161f] border border-white/15 text-[11px] font-semibold text-white shadow-xl flex items-center"
          role="status"
        >
          {feedback}
          <button type="button" className="ml-2 inline-flex p-0.5 opacity-60" onClick={() => setFeedback(null)} aria-label="Kapat">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
    </>
  );
}

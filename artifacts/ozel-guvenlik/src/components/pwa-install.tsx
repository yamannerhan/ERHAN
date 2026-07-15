import React, { useEffect, useState } from "react";
import { Download, Share, Plus, X } from "lucide-react";

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

function isAppleDevice(): boolean {
  const ua = navigator.userAgent || "";
  const iOS = /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const macSafari = /Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua);
  return iOS || macSafari;
}

function readDeferred(): BeforeInstallPromptEvent | null {
  return (window.__ogDeferredInstall as BeforeInstallPromptEvent | null | undefined) ?? null;
}

/**
 * Yükle butonu:
 * - Android/Chrome: native beforeinstallprompt
 * - Apple: ortada talimat kartı (Paylaş → Ana Ekrana Ekle)
 */
export function PwaInstall() {
  const [promptEvt, setPromptEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showAppleGuide, setShowAppleGuide] = useState(false);
  const [isApple, setIsApple] = useState(false);

  useEffect(() => {
    if (isStandalonePwa()) {
      setInstalled(true);
      return;
    }
    setIsApple(isAppleDevice());

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
      setShowAppleGuide(false);
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
    if (ev && typeof ev.prompt === "function") {
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
      return;
    }
    // Native API yoksa (özellikle Apple) orta kartı aç
    setShowAppleGuide(true);
  };

  if (installed) return null;

  const canNative = !!(promptEvt || readDeferred());
  const showButton = canNative || isApple || feedback;

  if (!showButton && !showAppleGuide) return null;

  return (
    <>
      {(canNative || isApple) && (
        <button
          type="button"
          onClick={() => void install()}
          disabled={busy}
          className="og-pwa-install-btn shrink-0 min-h-11 px-3 rounded-full bg-primary/15 border border-primary/25 text-primary hover:bg-primary/25 transition-colors flex items-center justify-center gap-1 text-[10px] font-extrabold whitespace-nowrap max-w-[76px] disabled:opacity-60"
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

      {showAppleGuide && (
        <div
          className="og-pwa-guide-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Uygulamayı yükle"
          onClick={() => setShowAppleGuide(false)}
        >
          <div
            className="og-pwa-guide-card"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="og-pwa-guide-close"
              onClick={() => setShowAppleGuide(false)}
              aria-label="Kapat"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="og-pwa-guide-icon">
              <Download className="w-6 h-6" />
            </div>
            <h3 className="og-pwa-guide-title">Ana Ekrana Ekle</h3>
            <p className="og-pwa-guide-text">
              iPhone / iPad’de uygulamayı yüklemek için Safari’de şu adımları izleyin:
            </p>
            <ol className="og-pwa-guide-steps">
              <li>
                <span className="og-pwa-guide-step-num">1</span>
                <span>
                  Alttaki <Share className="inline w-3.5 h-3.5 mx-0.5 text-sky-300" /> <strong>Paylaş</strong> butonuna basın
                </span>
              </li>
              <li>
                <span className="og-pwa-guide-step-num">2</span>
                <span>
                  <Plus className="inline w-3.5 h-3.5 mx-0.5 text-amber-300" /> <strong>Ana Ekrana Ekle</strong> seçeneğine dokunun
                </span>
              </li>
              <li>
                <span className="og-pwa-guide-step-num">3</span>
                <span><strong>Ekle</strong> ile onaylayın</span>
              </li>
            </ol>
            <button
              type="button"
              className="og-pwa-guide-ok"
              onClick={() => setShowAppleGuide(false)}
            >
              Anladım
            </button>
          </div>
        </div>
      )}
    </>
  );
}

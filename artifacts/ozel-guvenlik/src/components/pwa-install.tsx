import React, { useEffect, useState } from "react";
import { Download, Share, Plus, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isIosDevice(): boolean {
  const ua = navigator.userAgent || "";
  const iPadOs = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/i.test(ua) || iPadOs;
}

function isStandalonePwa(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Android: beforeinstallprompt. iPhone: Ana Ekrana Ekle talimatı. */
export function PwaInstall() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const [showIosSheet, setShowIosSheet] = useState(false);

  useEffect(() => {
    if (isStandalonePwa()) {
      setInstalled(true);
      return;
    }

    if (isIosDevice()) {
      setIosHint(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    const installedHandler = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installedHandler);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const install = async () => {
    if (prompt) {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === "accepted") setInstalled(true);
      setPrompt(null);
      return;
    }
    if (iosHint) setShowIosSheet(true);
  };

  if (installed) return null;
  if (!prompt && !iosHint) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => void install()}
        className="shrink-0 h-8 px-2 rounded-full bg-primary/15 border border-primary/25 text-primary hover:bg-primary/25 transition-colors flex items-center gap-1 text-[10px] font-extrabold whitespace-nowrap max-w-[76px]"
        aria-label="Uygulamayı yükle"
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">Yükle</span>
      </button>

      {showIosSheet && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/55 p-4"
          onClick={() => setShowIosSheet(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Ana ekrana ekle"
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-[#12161f] border border-white/10 p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-white">Uygulamayı yükle</p>
              <button type="button" onClick={() => setShowIosSheet(false)} className="p-1 rounded-lg hover:bg-white/10" aria-label="Kapat">
                <X className="w-4 h-4 text-white/60" />
              </button>
            </div>
            <p className="text-xs text-white/70 mb-3 leading-relaxed">
              iPhone’da Safari ile Ana Ekrana ekleyin:
            </p>
            <ol className="space-y-2.5 text-xs text-white/85">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-400/20 text-amber-300">
                  <Share className="w-3 h-3" />
                </span>
                <span>Alttaki <strong>Paylaş</strong> düğmesine dokunun</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-400/20 text-amber-300">
                  <Plus className="w-3 h-3" />
                </span>
                <span><strong>Ana Ekrana Ekle</strong> seçeneğini bulun</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-400/20 text-[10px] font-bold text-amber-300">3</span>
                <span><strong>Ekle</strong> ile yükleyin — uygulama simgesi ana ekranda görünür</span>
              </li>
            </ol>
            <button
              type="button"
              onClick={() => setShowIosSheet(false)}
              className="mt-4 w-full h-10 rounded-xl bg-amber-400 text-black text-sm font-bold"
            >
              Anladım
            </button>
          </div>
        </div>
      )}
    </>
  );
}

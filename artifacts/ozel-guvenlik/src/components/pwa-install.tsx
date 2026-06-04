import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstall() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Don't show if already running as standalone PWA
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setPrompt(null);
  };

  if (installed || dismissed || !prompt) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed bottom-20 left-4 right-4 z-50 max-w-md mx-auto"
      >
        <div className="rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
          style={{ background: "linear-gradient(135deg,#1E293B,#0F172A)" }}>
          <div className="flex items-center gap-3 p-4">
            <img src="/icon-192.png" alt="Logo" className="w-12 h-12 rounded-xl shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm text-foreground">ÖZEL GÜVENLİK</p>
              <p className="text-xs text-muted-foreground">Uygulamayı telefonuna ekle</p>
            </div>
            <button onClick={() => setDismissed(true)} className="text-muted-foreground hover:text-foreground shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="px-4 pb-4">
            <button onClick={install}
              className="w-full py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg,#4F46E5,#7C3AED)" }}>
              <Download className="w-4 h-4" />
              Uygulamayı İndir
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

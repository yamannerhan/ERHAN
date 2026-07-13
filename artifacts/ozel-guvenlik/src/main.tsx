import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import "./styles/lite-marquee.css";
import "./styles/og-lite.css";
import { initDisplayModeEarly, isLiteMode, markSlowBoot } from "./lib/display-mode";
import { initBottomNavViewportFix } from "./lib/fix-bottom-nav";
import { DisplayModeProvider } from "./contexts/DisplayModeContext";
import { setAuthTokenGetter, setDeviceIdGetter } from "@workspace/api-client-react";

const __OG_BOOT_START = typeof performance !== "undefined" ? performance.now() : 0;
initDisplayModeEarly();
initBottomNavViewportFix();

if (!isLiteMode()) {
  void import("./cmc-layout.css");
}

declare global {
  interface Window {
    __OG_BOOT_OK?: boolean;
    _ogClearBootSplash?: () => void;
  }
}

function clearBootSplash() {
  try {
    window.__OG_BOOT_OK = true;
    const splash = document.getElementById("_boot-splash");
    if (!splash) return;
    splash.classList.add("og-pwa-splash--out");
    window.setTimeout(() => {
      try { splash.remove(); } catch { /* ignore */ }
    }, 280);
  } catch { /* ignore */ }
}

window._ogClearBootSplash = clearBootSplash;
clearBootSplash();

function BootSplashMarker() {
  useEffect(() => {
    clearBootSplash();
    const elapsed = (typeof performance !== "undefined" ? performance.now() : 0) - __OG_BOOT_START;
    if (elapsed > 5000) markSlowBoot();
  }, []);
  return null;
}

function safeGetToken(): string | null {
  try {
    return localStorage.getItem("auth_token");
  } catch {
    return null;
  }
}

function safeGetDeviceId(): string | null {
  try {
    const KEY = "og_device_id";
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

setAuthTokenGetter(safeGetToken);
setDeviceIdGetter(safeGetDeviceId);

try {
  (window as Window & { __ogDeferredInstall?: Event | null }).__ogDeferredInstall = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    (window as Window & { __ogDeferredInstall?: Event | null }).__ogDeferredInstall = e;
  });
} catch { /* ignore */ }

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: isLiteMode() ? 0 : 1,
      refetchOnWindowFocus: false,
      staleTime: 15_000,
    },
  },
});

function schedulePushRegistration() {
  const run = () => {
    void import("./lib/web-push")
      .then((m) => m.registerPushServiceWorker())
      .then((reg) => (reg ? import("./lib/web-push").then((m) => m.ensurePushSubscriptionQuiet()) : undefined))
      .catch(() => {});
  };
  setTimeout(run, 15_000);
}

if ("serviceWorker" in navigator && !isLiteMode()) {
  schedulePushRegistration();
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    try {
      console.error("[OG ErrorBoundary]", error, info?.componentStack);
    } catch { /* ignore */ }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0F172A", color: "#e2e8f0", fontFamily: "system-ui, sans-serif", padding: "2rem", textAlign: "center", gap: "0.75rem" }}>
          <div style={{ fontSize: "1.05rem", fontWeight: 600 }}>Bir sorun oluştu</div>
          <p style={{ fontSize: "0.8rem", color: "#94a3b8", maxWidth: 340, lineHeight: 1.45 }}>
            Sayfa yüklenirken hata oluştu. Yenileyip tekrar deneyin.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ padding: "0.55rem 1.1rem", borderRadius: 10, border: "none", background: "#f5c518", color: "#0a0e1a", fontWeight: 700, cursor: "pointer" }}
          >
            Yenile
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function showBootError(message: string) {
  clearBootSplash();
  const rootEl = document.getElementById("root");
  if (!rootEl) return;
  rootEl.innerHTML = `
    <div style="min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0F172A;color:#e2e8f0;font-family:system-ui,sans-serif;padding:2rem;text-align:center;gap:0.75rem">
      <div style="font-size:1.05rem;font-weight:600">Açılış hatası</div>
      <p style="font-size:0.8rem;color:#94a3b8;max-width:340px;line-height:1.45">${message}</p>
      <button type="button" onclick="window._forceRecover&&window._forceRecover()" style="padding:0.55rem 1.1rem;border-radius:10px;border:0;background:#f5c518;color:#0a0e1a;font-weight:700;cursor:pointer">Önbelleği temizle ve yenile</button>
    </div>`;
}

async function boot() {
  try {
    const { default: App } = await import("./App");
    const rootEl = document.getElementById("root");
    if (!rootEl) return;
    createRoot(rootEl).render(
      <QueryClientProvider client={queryClient}>
        <DisplayModeProvider>
          <ErrorBoundary>
            <BootSplashMarker />
            <App />
          </ErrorBoundary>
        </DisplayModeProvider>
      </QueryClientProvider>,
    );
  } catch (err) {
    console.error("[OG boot]", err);
    markSlowBoot();
    showBootError("Uygulama yüklenemedi. Önbelleği temizleyip tekrar deneyin.");
  }
}

void boot();

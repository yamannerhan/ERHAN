import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./index.css";
import "./styles/lite-marquee.css";
import "./styles/og-lite.css";
import "./cmc-layout.css";
import { initDisplayModeEarly, isLiteMode, markSlowBoot } from "./lib/display-mode";
import { DisplayModeProvider } from "./contexts/DisplayModeContext";
import { setAuthTokenGetter, setDeviceIdGetter } from "@workspace/api-client-react";

const __OG_BOOT_START = typeof performance !== "undefined" ? performance.now() : 0;
initDisplayModeEarly();

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
    if (splash) splash.remove();
  } catch { /* ignore */ }
}

window._ogClearBootSplash = clearBootSplash;

function BootSplashMarker() {
  useEffect(() => {
    clearBootSplash();
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
      id = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
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
      retry: 1,
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

const rootEl = document.getElementById("root");
if (rootEl) {
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
}

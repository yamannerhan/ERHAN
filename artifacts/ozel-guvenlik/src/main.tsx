import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./index.css";
import "./styles/lite-marquee.css";
import "./cmc-layout.css";
import { setAuthTokenGetter, setDeviceIdGetter } from "@workspace/api-client-react";

declare global {
  interface Window {
    __OG_BOOT_OK?: boolean;
    __OG_BOOT_FAILED?: boolean;
  }
}

function markBootOk() {
  try {
    window.__OG_BOOT_OK = true;
    const loader = document.getElementById("_loader");
    const recovery = document.getElementById("_recovery");
    const slow = document.getElementById("_slow-hint");
    if (loader) loader.style.display = "none";
    if (recovery) recovery.style.display = "none";
    if (slow) slow.style.display = "none";
  } catch { /* ignore */ }
}

function markBootFailed() {
  try {
    window.__OG_BOOT_FAILED = true;
    const loader = document.getElementById("_loader");
    const recovery = document.getElementById("_recovery");
    const slow = document.getElementById("_slow-hint");
    if (loader) loader.style.display = "none";
    if (slow) slow.style.display = "none";
    if (recovery) recovery.style.display = "block";
  } catch { /* ignore */ }
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

/** Web Push — uygulama açıldıktan sonra, düşük RAM cihazlarda boot'u bloklamasın */
function schedulePushRegistration() {
  const run = () => {
    void import("./lib/web-push")
      .then((m) => m.registerPushServiceWorker())
      .then((reg) => {
        if (reg) {
          return import("./lib/web-push").then((m) => m.ensurePushSubscriptionQuiet());
        }
      })
      .catch(() => {});
  };
  if ("requestIdleCallback" in window) {
    requestIdleCallback(run, { timeout: 20_000 });
  } else {
    setTimeout(run, 12_000);
  }
}

if ("serviceWorker" in navigator) {
  schedulePushRegistration();
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: unknown) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    try {
      console.error("[OG ErrorBoundary]", error, info?.componentStack);
    } catch { /* ignore */ }
  }

  private recoverHome = () => {
    this.setState({ hasError: false, message: "" });
    try {
      window.location.assign("/");
    } catch {
      window.location.reload();
    }
  };

  private recoverReload = () => {
    this.setState({ hasError: false, message: "" });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0F172A", color: "#e2e8f0", fontFamily: "system-ui, sans-serif", padding: "2rem", textAlign: "center", gap: "0.75rem" }}>
          <div style={{ fontSize: "2rem" }}>⚠</div>
          <div style={{ fontSize: "1.05rem", fontWeight: 600 }}>Bir sorun oluştu</div>
          <div style={{ fontSize: "0.8rem", color: "#94a3b8", maxWidth: 340, lineHeight: 1.45 }}>
            Sayfa beklenmedik şekilde durdu. Ana sayfaya dönüp devam edebilirsiniz.
          </div>
          <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.5rem", flexWrap: "wrap", justifyContent: "center" }}>
            <button
              type="button"
              onClick={this.recoverHome}
              style={{ padding: "0.55rem 1.1rem", borderRadius: 10, border: "none", background: "#f5c518", color: "#0a0e1a", fontWeight: 700, cursor: "pointer" }}
            >
              Ana Sayfa
            </button>
            <button
              type="button"
              onClick={this.recoverReload}
              style={{ padding: "0.55rem 1.1rem", borderRadius: 10, border: "1px solid rgba(255,255,255,0.2)", background: "transparent", color: "#e2e8f0", fontWeight: 600, cursor: "pointer" }}
            >
              Yenile
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootEl = document.getElementById("root");
if (!rootEl) {
  markBootFailed();
} else {
  try {
    markBootOk();
    createRoot(rootEl).render(
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </QueryClientProvider>,
    );
  } catch (e) {
    try { console.error("[OG boot]", e); } catch { /* ignore */ }
    markBootFailed();
  }
}

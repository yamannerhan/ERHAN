import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./index.css";
import { setAuthTokenGetter, setDeviceIdGetter } from "@workspace/api-client-react";

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

// beforeinstallprompt React mount'tan önce gelebilir — kaçırma
try {
  (window as Window & { __ogDeferredInstall?: Event | null }).__ogDeferredInstall = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    (window as Window & { __ogDeferredInstall?: Event | null }).__ogDeferredInstall = e;
  });
} catch { /* ignore */ }

const queryClient = new QueryClient();

// PWA Service Worker — Web Push için kaydet (eski cache'leri temizle, SW kalsın)
if ("serviceWorker" in navigator) {
  void (async () => {
    try {
      const cacheKeys = await caches.keys();
      await Promise.all(
        cacheKeys
          .filter((k) => !k.startsWith("ozelguvenlik-push"))
          .map((k) => caches.delete(k)),
      );
    } catch { /* ignore */ }
    try {
      const { registerPushServiceWorker, ensurePushSubscriptionQuiet } = await import("./lib/web-push");
      await registerPushServiceWorker();
      await ensurePushSubscriptionQuiet();
    } catch { /* ignore */ }
  })();
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

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0F172A", color: "#e2e8f0", fontFamily: "system-ui, sans-serif", padding: "2rem", textAlign: "center", gap: "1rem" }}>
          <div style={{ fontSize: "2.5rem" }}>⚠</div>
          <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>Sayfa yüklenemedi</div>
          <div style={{ fontSize: "0.8rem", color: "#94a3b8", maxWidth: 320 }}>{this.state.message || "Beklenmeyen bir hata oluştu."}</div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ marginTop: "0.75rem", padding: "0.6rem 1.2rem", borderRadius: 10, border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, cursor: "pointer" }}
          >
            Sayfayı Yenile
          </button>
          <div style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "#94a3b8" }}>Lütfen birkaç saniye sonra tekrar deneyin.</div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </QueryClientProvider>
);
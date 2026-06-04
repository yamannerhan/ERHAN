import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setAuthTokenGetter, setDeviceIdGetter } from "@workspace/api-client-react";

// Safe localStorage access — iOS Safari private mode throws on access
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

// Error Boundary — herhangi bir render hatası beyaz ekran yerine mesaj gösterir
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
        <div
          style={{
            minHeight: "100dvh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#0F172A",
            color: "#e2e8f0",
            fontFamily: "system-ui, sans-serif",
            padding: "2rem",
            textAlign: "center",
            gap: "1rem",
          }}
        >
          <div style={{ fontSize: "2.5rem" }}>⚠</div>
          <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>
            Sayfa yüklenemedi
          </div>
          <div style={{ fontSize: "0.8rem", color: "#94a3b8", maxWidth: 320 }}>
            {this.state.message || "Beklenmeyen bir hata oluştu."}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: "0.5rem",
              padding: "0.6rem 1.5rem",
              background: "#4F46E5",
              color: "#fff",
              border: "none",
              borderRadius: "0.5rem",
              cursor: "pointer",
              fontSize: "0.9rem",
            }}
          >
            Yenile
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

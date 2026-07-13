import React from "react";
import { useLocation } from "wouter";

type Props = { children: React.ReactNode; fallbackPath?: string };

type State = { hasError: boolean; message: string; path: string };

/** Sayfa bazlı hata — tüm uygulamayı düşürmez, rota değişince sıfırlanır */
export class RouteErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "", path: "" };
  }

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    try {
      console.error("[OG RouteError]", error, info?.componentStack);
    } catch { /* ignore */ }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 px-6 text-center text-foreground">
          <p className="text-base font-semibold">Bu sayfa açılamadı</p>
          <p className="text-xs text-muted-foreground max-w-sm">
            Geçici bir sorun oluştu. Ana sayfaya dönüp tekrar deneyin.
          </p>
          <div className="flex gap-2 mt-1">
            <a
              href={this.props.fallbackPath || "/"}
              className="px-4 py-2 rounded-xl bg-amber-400 text-black text-sm font-bold"
              onClick={() => this.setState({ hasError: false, message: "" })}
            >
              Ana Sayfa
            </a>
            <button
              type="button"
              className="px-4 py-2 rounded-xl border border-white/15 text-sm font-semibold"
              onClick={() => {
                this.setState({ hasError: false, message: "" });
                window.location.reload();
              }}
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

/** wouter location değişince hatayı sıfırlayan sarmalayıcı */
export function RoutedErrorBoundary({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  return <RoutedErrorBoundaryInner key={location}>{children}</RoutedErrorBoundaryInner>;
}

function RoutedErrorBoundaryInner({ children }: { children: React.ReactNode }) {
  return <RouteErrorBoundary>{children}</RouteErrorBoundary>;
}

import { useEffect, useState } from "react";

/**
 * Geçici Xiaomi 13T / cihaz baseline ölçümü.
 * Açmak: ?debugViewport=1
 */
export function ViewportDebug() {
  const [enabled, setEnabled] = useState(false);
  const [metrics, setMetrics] = useState({
    innerWidth: 0,
    innerHeight: 0,
    dpr: 0,
    vvWidth: 0,
    vvHeight: 0,
  });

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.get("debugViewport") !== "1") return;
      setEnabled(true);
    } catch {
      return;
    }

    const update = () => {
      const vv = window.visualViewport;
      setMetrics({
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        dpr: window.devicePixelRatio,
        vvWidth: vv?.width ?? 0,
        vvHeight: vv?.height ?? 0,
      });
    };

    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);

  if (!enabled) return null;

  return (
    <div
      id="og-vp-debug"
      className="fixed top-0 left-0 right-0 z-[9999] pointer-events-none px-2 py-1 text-[10px] font-mono text-amber-200 bg-black/80 border-b border-amber-500/40"
      style={{ paddingTop: "max(4px, var(--safe-top))" }}
    >
      w={metrics.innerWidth} h={metrics.innerHeight} dpr={metrics.dpr.toFixed(2)}{" "}
      vv={Math.round(metrics.vvWidth)}x{Math.round(metrics.vvHeight)}
    </div>
  );
}

import * as React from "react";
import { subscribeMediaQuery } from "@/lib/match-media-subscribe";

const MOBILE_MAX = 768;

/** Mobil + prefers-reduced-motion: compositor tear riskini azaltmak için ağır efektleri kapat. */
export function readGpuSafeMode(): boolean {
  try {
    if (typeof window === "undefined") return false;
    const narrow = window.innerWidth < MOBILE_MAX;
    const reducedMotion =
      typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return narrow || reducedMotion;
  } catch {
    return true;
  }
}

export function useGpuSafeMode(): boolean {
  const [safe, setSafe] = React.useState(readGpuSafeMode);

  React.useEffect(() => {
    const onChange = () => setSafe(readGpuSafeMode());
    const unsubWidth = subscribeMediaQuery(`(max-width: ${MOBILE_MAX - 1}px)`, onChange);
    const unsubMotion = subscribeMediaQuery("(prefers-reduced-motion: reduce)", onChange);
    window.addEventListener("resize", onChange);
    return () => {
      unsubWidth();
      unsubMotion();
      window.removeEventListener("resize", onChange);
    };
  }, []);

  return safe;
}

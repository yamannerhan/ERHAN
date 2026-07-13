import { useLayoutEffect, type RefObject } from "react";

type LiteMarqueeOptions = {
  speedPxPerSec?: number;
  minDurationSec?: number;
};

/**
 * --lite-marquee-duration değişkenini içerik genişliğine göre ayarlar.
 * Animasyon sınıfı (lite-marquee-track) JSX'te sabit verilmelidir.
 */
export function useLiteMarquee(
  trackRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  deps: unknown[] = [],
  options: LiteMarqueeOptions = {},
) {
  const { speedPxPerSec = 24, minDurationSec = 28 } = options;

  useLayoutEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let intervalId = 0;

    const apply = () => {
      const el = trackRef.current;
      if (!el || cancelled) return false;
      const loopW = el.scrollWidth / 2;
      const sec = loopW > 8
        ? Math.max(minDurationSec, loopW / speedPxPerSec)
        : minDurationSec;
      el.style.setProperty("--lite-marquee-duration", `${sec.toFixed(1)}s`);
      return loopW > 8;
    };

    if (!apply()) {
      let tries = 0;
      intervalId = window.setInterval(() => {
        tries += 1;
        if (apply() || tries >= 24) window.clearInterval(intervalId);
      }, 250);
    }

    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      const el = trackRef.current;
      if (el) {
        ro = new ResizeObserver(() => apply());
        ro.observe(el);
      }
    }

    const fontsReady = document.fonts?.ready;
    if (fontsReady) void fontsReady.then(() => apply());
    window.addEventListener("load", apply);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      ro?.disconnect();
      window.removeEventListener("load", apply);
    };
  }, [enabled, speedPxPerSec, minDurationSec, trackRef, ...deps]);
}

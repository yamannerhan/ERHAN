import { useMemo, useRef, type CSSProperties } from "react";
import { useLiteMarquee } from "@/hooks/use-lite-marquee";
import "@/styles/lite-marquee.css";
import "./home-news-ticker.css";

type HomeNewsTickerProps = {
  lines: string[];
};

export function HomeNewsTicker({ lines }: HomeNewsTickerProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const items = useMemo(() => {
    const list = lines.length > 0 ? lines : ["Özel güvenlik iş ilanları — ozelguvenlik.online"];
    return [...list, ...list];
  }, [lines]);

  useLiteMarquee(trackRef, items.length > 0, [items.join("|")], {
    speedPxPerSec: 18,
    minDurationSec: 45,
  });

  return (
    <div className="og-home-ticker lite-marquee-viewport" role="marquee" aria-live="off">
      <div className="og-home-ticker__fade og-home-ticker__fade--left" aria-hidden />
      <div
        ref={trackRef}
        className="og-home-ticker__track lite-marquee-track"
        style={{ "--lite-marquee-duration": "48s" } as CSSProperties}
      >
        {items.map((text, i) => (
          <span key={`${i}-${text.slice(0, 24)}`} className="og-home-ticker__item">
            <span className="og-home-ticker__dot" aria-hidden>●</span>
            {text}
          </span>
        ))}
      </div>
      <div className="og-home-ticker__fade og-home-ticker__fade--right" aria-hidden />
    </div>
  );
}

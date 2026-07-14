import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "wouter";
import { Megaphone } from "lucide-react";
import { useLiteMarquee } from "@/hooks/use-lite-marquee";
import "@/styles/lite-marquee.css";
import "./home-news-ticker.css";

type HomeNewsTickerProps = {
  lines: string[];
  /** Pro: kayan şerit | Lite: sabit, ekrana sığan, döngülü */
  variant?: "marquee" | "static";
};

const FALLBACK = "Özel güvenlik iş ilanları — ozelguvenlik.online";

export function HomeNewsTicker({ lines, variant = "marquee" }: HomeNewsTickerProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [staticIdx, setStaticIdx] = useState(0);

  const sourceLines = useMemo(() => {
    const list = lines.length > 0 ? lines : [FALLBACK];
    return list;
  }, [lines]);

  const marqueeItems = useMemo(() => [...sourceLines, ...sourceLines], [sourceLines]);

  useLiteMarquee(trackRef, variant === "marquee" && marqueeItems.length > 0, [marqueeItems.join("|")], {
    speedPxPerSec: 18,
    minDurationSec: 45,
  });

  useEffect(() => {
    setStaticIdx(0);
  }, [sourceLines.join("|")]);

  useEffect(() => {
    if (variant !== "static" || sourceLines.length < 2) return;
    const id = window.setInterval(() => {
      setStaticIdx((i) => (i + 1) % sourceLines.length);
    }, 6000);
    return () => window.clearInterval(id);
  }, [variant, sourceLines.length]);

  if (variant === "static") {
    return (
      <div className="og-home-ticker og-home-ticker--static" role="status" aria-live="polite">
        <p key={staticIdx} className="og-home-ticker__static-text">
          <span className="og-home-ticker__dot" aria-hidden>●</span>
          {sourceLines[staticIdx]}
        </p>
      </div>
    );
  }

  return (
    <div className="og-home-ticker lite-marquee-viewport" role="marquee" aria-live="off">
      <div className="og-home-ticker__megaphone desktop-home desktop-home--flex" aria-hidden>
        <Megaphone size={16} />
      </div>
      <div className="og-home-ticker__inner">
        <div className="og-home-ticker__fade og-home-ticker__fade--left" aria-hidden />
        <div
          ref={trackRef}
          className="og-home-ticker__track lite-marquee-track"
          style={{ "--lite-marquee-duration": "48s" } as CSSProperties}
        >
          {marqueeItems.map((text, i) => (
            <span key={`${i}-${text.slice(0, 24)}`} className="og-home-ticker__item">
              <span className="og-home-ticker__dot" aria-hidden>●</span>
              {text}
            </span>
          ))}
        </div>
        <div className="og-home-ticker__fade og-home-ticker__fade--right" aria-hidden />
      </div>
      <Link href="/bildirimler" className="og-home-ticker__all-btn desktop-home desktop-home--inline-flex">
        Tüm Duyurular
      </Link>
    </div>
  );
}

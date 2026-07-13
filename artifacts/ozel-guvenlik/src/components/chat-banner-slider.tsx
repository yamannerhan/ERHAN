import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Megaphone, Shield, Briefcase, Bell, Info } from "lucide-react";
import { Link } from "wouter";

export type ChatBannerItem = {
  id: number;
  title: string;
  description: string;
  icon: string;
  iconColor: string;
  titleColor: string;
  linkType: string | null;
  linkUrl: string | null;
  durationSeconds: number;
};

const ICONS: Record<string, React.ElementType> = {
  megaphone: Megaphone,
  shield: Shield,
  briefcase: Briefcase,
  bell: Bell,
  info: Info,
};

function BannerIcon({ name, color }: { name: string; color: string }) {
  const Icon = ICONS[name] ?? Megaphone;
  return (
    <div
      className="og-cb-icon"
      style={{ background: `${color}22`, borderColor: `${color}55`, color }}
      aria-hidden
    >
      <Icon className="w-4 h-4" />
    </div>
  );
}

export function ChatBannerSlider() {
  const [items, setItems] = useState<ChatBannerItem[]>([]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const reduceMotion = typeof window !== "undefined"
    && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  useEffect(() => {
    fetch("/api/chat/banners", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { items?: ChatBannerItem[] }) => setItems(d.items ?? []))
      .catch(() => setItems([]));
  }, []);

  const count = items.length;
  const current = items[index] ?? null;
  const durationMs = Math.max(2000, (current?.durationSeconds ?? 5) * 1000);

  const go = useCallback((dir: 1 | -1) => {
    if (count <= 1) return;
    setIndex((i) => (i + dir + count) % count);
  }, [count]);

  useEffect(() => {
    if (count <= 1 || paused || reduceMotion) return;
    const t = window.setInterval(() => go(1), durationMs);
    return () => window.clearInterval(t);
  }, [count, paused, reduceMotion, durationMs, go, index]);

  useEffect(() => {
    if (index >= count && count > 0) setIndex(0);
  }, [count, index]);

  if (!current) return null;

  const body = (
    <div className="og-cb-body">
      <BannerIcon name={current.icon} color={current.iconColor} />
      <div className="og-cb-text">
        <div className="og-cb-title" style={{ color: current.titleColor }}>{current.title}</div>
        <div className="og-cb-desc">{current.description}</div>
      </div>
    </div>
  );

  return (
    <section
      className="og-cb-slider"
      aria-roledescription="carousel"
      aria-label="Sohbet duyuruları"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }}
      onTouchEnd={(e) => {
        const start = touchX.current;
        touchX.current = null;
        if (start == null) return;
        const dx = (e.changedTouches[0]?.clientX ?? start) - start;
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
        if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
      }}
      tabIndex={0}
    >
      <button type="button" className="og-cb-nav" onClick={() => go(-1)} aria-label="Önceki duyuru" disabled={count <= 1}>
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>

      <div className={`og-cb-card ${reduceMotion ? "" : "og-cb-card-anim"}`} key={current.id}>
        {current.linkUrl ? (
          current.linkUrl.startsWith("/") ? (
            <Link href={current.linkUrl} className="og-cb-link">{body}</Link>
          ) : (
            <a href={current.linkUrl} className="og-cb-link" target="_blank" rel="noopener noreferrer">{body}</a>
          )
        ) : body}
      </div>

      <button type="button" className="og-cb-nav" onClick={() => go(1)} aria-label="Sonraki duyuru" disabled={count <= 1}>
        <ChevronRight className="w-3.5 h-3.5" />
      </button>

      {count > 1 && (
        <div className="og-cb-dots" role="tablist" aria-label="Duyuru sayfaları">
          {items.map((b, i) => (
            <button
              key={b.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              className={`og-cb-dot ${i === index ? "is-active" : ""}`}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

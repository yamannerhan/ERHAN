import React, { useEffect, useRef, useState, type CSSProperties } from "react";
import { JobListingCard, type JobCardListing } from "@/components/job-listing-card";
import { useLiteMarquee } from "@/hooks/use-lite-marquee";
import "@/styles/lite-marquee.css";
import "./featured-job-card.css";

export type FeaturedListing = JobCardListing;

type CarouselProps = {
  listings: FeaturedListing[];
  onNavigate?: () => void;
  savedIds?: Set<number>;
  onToggleSave?: (e: React.MouseEvent, id: number) => void;
  /** Lite: elle kaydırma, 3 kart yan yana, otomatik kayma yok */
  isLite?: boolean;
};

/** Pro: otomatik kayan şerit | Lite: elle kaydırma, 3'lü sıra */
export function FeaturedJobCarousel({
  listings,
  onNavigate,
  savedIds,
  onToggleSave,
  isLite = false,
}: CarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const animated = !isLite && listings.length > 1;
  const loopItems = animated ? [...listings, ...listings] : listings;
  const durationSec = Math.max(32, listings.length * 10);

  useLiteMarquee(trackRef, animated, [listings.map((l) => l.id).join(",")], {
    speedPxPerSec: 30,
    minDurationSec: 36,
  });

  useEffect(() => {
    if (!animated) return;
    const stepMs = (durationSec * 1000) / listings.length;
    const id = window.setInterval(() => {
      setActive((a) => (a + 1) % listings.length);
    }, stepMs);
    return () => window.clearInterval(id);
  }, [animated, listings.length, durationSec]);

  return (
    <div className={`featured-rail-wrap${isLite ? " featured-rail-wrap--lite" : ""}`}>
      <div className={`featured-rail lite-marquee-viewport${animated ? " featured-rail--auto" : ""}${isLite ? " featured-rail--lite" : ""}`}>
        <div
          ref={trackRef}
          className={`featured-rail__track${animated ? " lite-marquee-track" : ""}`}
          style={animated ? ({ "--lite-marquee-duration": "40s" } as CSSProperties) : undefined}
        >
          {loopItems.map((item, idx) => (
            <JobListingCard
              key={`${item.id}-${idx}`}
              listing={item}
              onNavigate={onNavigate}
              compact
              saved={savedIds?.has(item.id) || !!item.isFavoritedByMe}
              onToggleSave={onToggleSave}
            />
          ))}
        </div>
      </div>
      {animated && (
        <div className="featured-rail__dots" aria-hidden>
          {listings.map((_, i) => (
            <span
              key={i}
              className={`featured-rail__dot${i === active % listings.length ? " is-active" : ""}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Her ziyarette farklı başlangıç sırası */
export function rotateFeaturedListings<T extends { id: number }>(list: T[], offset: number): T[] {
  if (list.length <= 1) return list;
  const o = ((offset % list.length) + list.length) % list.length;
  return [...list.slice(o), ...list.slice(0, o)];
}

export function nextFeaturedRotation(): number {
  try {
    const key = "og_featured_rot";
    const n = (parseInt(sessionStorage.getItem(key) || "0", 10) + 1) % 1_000_000;
    sessionStorage.setItem(key, String(n));
    return n;
  } catch {
    return 0;
  }
}

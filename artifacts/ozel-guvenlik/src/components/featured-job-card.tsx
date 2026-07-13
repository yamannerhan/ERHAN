import React, { useEffect, useRef, useState } from "react";
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
};

/** Normal ilan kartı — yan yana 2'li, soldan sağa sürekli kayar */
export function FeaturedJobCarousel({
  listings,
  onNavigate,
  savedIds,
  onToggleSave,
}: CarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const animated = listings.length > 1;
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
    <div className="featured-rail-wrap">
      <div className={`featured-rail lite-marquee-viewport${animated ? " featured-rail--auto" : ""}`}>
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

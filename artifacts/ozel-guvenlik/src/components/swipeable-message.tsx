import React, { useEffect, useRef } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { CornerUpLeft } from "lucide-react";

/**
 * Yatay kaydır → yanıtla (PWA’da passive touch fix).
 * Tam sayfa sohbet + küçük balonda ortak kullanılır.
 */
export function SwipeableMessage({
  children,
  onReply,
  enabled = true,
}: {
  children: React.ReactNode;
  onReply: () => void;
  enabled?: boolean;
}) {
  const x = useMotionValue(0);
  const opacity = useTransform(x, [0, 50], [0, 1]);
  const scale = useTransform(x, [0, 50, 80], [0.5, 1, 1.2]);
  const iconBg = useTransform(x, [40, 65], ["rgba(79,70,229,0.6)", "rgba(79,70,229,1)"]);
  const containerRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const isHoriz = useRef<boolean | null>(null);
  const swiped = useRef(false);
  const vibrated = useRef(false);
  const onReplyRef = useRef(onReply);
  useEffect(() => { onReplyRef.current = onReply; }, [onReply]);

  useEffect(() => {
    if (!enabled) return;
    const el = containerRef.current;
    if (!el) return;

    const onStart = (e: TouchEvent) => {
      startX.current = e.touches[0]!.clientX;
      startY.current = e.touches[0]!.clientY;
      isHoriz.current = null;
      swiped.current = false;
      vibrated.current = false;
    };

    const onMove = (e: TouchEvent) => {
      const dx = e.touches[0]!.clientX - startX.current;
      const dy = e.touches[0]!.clientY - startY.current;
      if (isHoriz.current === null && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
        isHoriz.current = Math.abs(dx) >= Math.abs(dy);
      }
      if (!isHoriz.current || dx <= 0) return;
      e.preventDefault();
      x.set(Math.min(dx, 90));
      if (dx >= 60 && !vibrated.current) {
        vibrated.current = true;
        if (navigator.vibrate) navigator.vibrate(45);
      }
    };

    const onEnd = () => {
      if (isHoriz.current && x.get() >= 60 && !swiped.current) {
        swiped.current = true;
        onReplyRef.current();
      }
      animate(x, 0, { type: "spring", stiffness: 380, damping: 28 });
      isHoriz.current = null;
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, [enabled, x]);

  if (!enabled) return <>{children}</>;

  return (
    <div ref={containerRef} className="relative" style={{ touchAction: "pan-y" }}>
      <motion.div
        className="absolute left-2 top-1/2 -translate-y-1/2 z-0 w-8 h-8 rounded-full flex items-center justify-center pointer-events-none"
        style={{ opacity, scale, backgroundColor: iconBg }}
      >
        <CornerUpLeft className="w-4 h-4 text-white" />
      </motion.div>
      <motion.div style={{ x }} className="relative z-[1]">
        {children}
      </motion.div>
    </div>
  );
}

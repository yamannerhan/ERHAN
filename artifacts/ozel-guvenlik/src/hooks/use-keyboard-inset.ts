import { useEffect, useState } from "react";

/**
 * iOS/Android klavye yüksekliği — visualViewport ile.
 * interactive-widget kullanmadan input'u klavyenin üstünde tutmak için.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      // Klavye = layout viewport ile visual viewport farkı
      const layoutH = window.innerHeight;
      const visibleBottom = vv.height + vv.offsetTop;
      const next = Math.max(0, Math.round(layoutH - visibleBottom));
      // Küçük titreşimleri yok say (adres çubuğu vs.)
      setInset(next > 40 ? next : 0);
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return inset;
}

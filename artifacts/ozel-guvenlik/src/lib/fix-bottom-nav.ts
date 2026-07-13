/** Android / PWA: layout viewport > görünür alan → fixed alt menü yukarı kayar */
export function initBottomNavViewportFix(): void {
  if (typeof window === "undefined") return;
  if ((window as Window & { __ogBottomNavFix?: boolean }).__ogBottomNavFix) return;
  (window as Window & { __ogBottomNavFix?: boolean }).__ogBottomNavFix = true;

  let bound = false;

  const apply = () => {
    const nav = document.querySelector<HTMLElement>(".og-bottom-nav");
    if (!nav) return;
    const vv = window.visualViewport;
    if (!vv) {
      nav.style.removeProperty("bottom");
      return;
    }
    const gap = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    nav.style.bottom = `${gap}px`;
  };

  const bind = () => {
    if (bound) return;
    bound = true;
    apply();
    window.visualViewport?.addEventListener("resize", apply);
    window.visualViewport?.addEventListener("scroll", apply);
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    document.addEventListener("visibilitychange", apply);
  };

  const tryBind = () => {
    if (!document.querySelector(".og-bottom-nav")) return false;
    bind();
    return true;
  };

  if (!tryBind()) {
    const obs = new MutationObserver(() => {
      if (tryBind()) obs.disconnect();
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }
}

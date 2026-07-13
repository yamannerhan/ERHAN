/** Android / PWA: küçük chrome kaymaları için alt menüyü hizala; klavyede ASLA yukarı çekme. */
export function initBottomNavViewportFix(): void {
  if (typeof window === "undefined") return;
  if ((window as Window & { __ogBottomNavFix?: boolean }).__ogBottomNavFix) return;
  (window as Window & { __ogBottomNavFix?: boolean }).__ogBottomNavFix = true;

  let bound = false;

  const isEditableFocused = () => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    return el.isContentEditable === true;
  };

  const apply = () => {
    const nav = document.querySelector<HTMLElement>(".og-bottom-nav");
    if (!nav) return;

    const chatOpen = document.documentElement.classList.contains("og-chat-open");
    const vv = window.visualViewport;
    const gap = vv
      ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
      : 0;

    // Klavye veya sohbet açıkken: menü viewport dibinde kalsın (klavye arkasında)
    const keyboardUp = gap > 120 || isEditableFocused();
    if (chatOpen || keyboardUp) {
      nav.style.bottom = "0px";
      nav.classList.add("og-bottom-nav--behind-kb");
      document.documentElement.classList.toggle("og-keyboard-open", keyboardUp);
      return;
    }

    nav.classList.remove("og-bottom-nav--behind-kb");
    document.documentElement.classList.remove("og-keyboard-open");

    // Sadece küçük chrome / adres çubuğu farkı (klavye değil)
    if (gap > 0 && gap <= 120) {
      nav.style.bottom = `${gap}px`;
    } else {
      nav.style.removeProperty("bottom");
    }
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
    document.addEventListener("focusin", apply);
    document.addEventListener("focusout", apply);
    // Sohbet sınıfı değişince de yeniden uygula
    const obs = new MutationObserver(apply);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
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

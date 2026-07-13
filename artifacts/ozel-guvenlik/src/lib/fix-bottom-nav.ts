/** Alt menüyü klavyede yukarı çekme — hafif, döngüsüz. */
export function initBottomNavViewportFix(): void {
  if (typeof window === "undefined") return;
  const w = window as Window & { __ogBottomNavFix?: boolean };
  if (w.__ogBottomNavFix) return;
  w.__ogBottomNavFix = true;

  let ticking = false;
  let lastBottom = "";

  const isEditableFocused = () => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable === true;
  };

  const apply = () => {
    const nav = document.querySelector<HTMLElement>(".og-bottom-nav");
    if (!nav) return;

    const vv = window.visualViewport;
    const gap = vv
      ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
      : 0;

    // Klavye (büyük inset veya input focus): menü dibe sabit + gizle (klavye arkası)
    const keyboardUp = isEditableFocused() || gap > 180;
    const chatOpen = document.documentElement.classList.contains("og-chat-open");

    if (keyboardUp || chatOpen) {
      if (lastBottom !== "0") {
        nav.style.bottom = "0px";
        lastBottom = "0";
      }
      nav.classList.add("og-bottom-nav--behind-kb");
      return;
    }

    nav.classList.remove("og-bottom-nav--behind-kb");

    // Küçük chrome farkı (adres çubuğu); klavye değil
    const next = gap > 0 && gap <= 100 ? `${gap}px` : "";
    if (next !== lastBottom) {
      if (next) nav.style.bottom = next;
      else nav.style.removeProperty("bottom");
      lastBottom = next;
    }
  };

  const schedule = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      apply();
    });
  };

  const start = () => {
    apply();
    window.visualViewport?.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("orientationchange", schedule, { passive: true });
    document.addEventListener("focusin", schedule, { passive: true });
    document.addEventListener("focusout", schedule, { passive: true });
  };

  if (document.querySelector(".og-bottom-nav")) {
    start();
    return;
  }

  // Nav mount olana kadar kısa bekle — subtree MutationObserver kullanma (freeze riski)
  let tries = 0;
  const id = window.setInterval(() => {
    tries += 1;
    if (document.querySelector(".og-bottom-nav") || tries > 40) {
      window.clearInterval(id);
      if (document.querySelector(".og-bottom-nav")) start();
    }
  }, 250);
}

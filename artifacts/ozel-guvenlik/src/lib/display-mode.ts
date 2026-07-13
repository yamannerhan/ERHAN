/** Görüntü modu: otomatik lite (düşük cihaz) veya kullanıcı Pro/Lite tercihi */

export type DisplayModePreference = "auto" | "lite" | "full";

const LS_MODE = "og_display_mode";
const LS_BOOT_SLOW = "og_boot_slow";

export function getDisplayModePreference(): DisplayModePreference {
  try {
    const v = localStorage.getItem(LS_MODE);
    if (v === "lite" || v === "full") return v;
  } catch { /* ignore */ }
  return "auto";
}

export function setDisplayModePreference(mode: DisplayModePreference): void {
  try {
    if (mode === "auto") localStorage.removeItem(LS_MODE);
    else localStorage.setItem(LS_MODE, mode);
  } catch { /* ignore */ }
}

/** Pro ↔ Lite geçişinde yazı + fade, ardından yenile */
export function switchDisplayModeWithTransition(mode: "lite" | "full"): void {
  const label = mode === "full" ? "PRO MODA GEÇİLİYOR" : "LITE MODA GEÇİLİYOR";
  setDisplayModePreference(mode);
  try {
    document.querySelectorAll("video, audio").forEach((el) => {
      const m = el as HTMLMediaElement;
      m.pause?.();
    });
    document.body.style.pointerEvents = "none";
    const el = document.createElement("div");
    el.className = "og-mode-switch-overlay";
    el.innerHTML = `<div class="og-mode-switch-overlay__inner"><p class="og-mode-switch-overlay__text">${label}</p><p class="og-mode-switch-overlay__sub">Lütfen bekleyin…</p></div>`;
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("is-active"));
  } catch { /* ignore */ }
  window.setTimeout(() => window.location.reload(), 1000);
}

export function markSlowBoot(): void {
  try {
    localStorage.setItem(LS_BOOT_SLOW, "1");
  } catch { /* ignore */ }
}

function connectionLooksSlow(): boolean {
  try {
    const conn = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
      mozConnection?: { saveData?: boolean; effectiveType?: string };
      webkitConnection?: { saveData?: boolean; effectiveType?: string };
    }).connection
      || (navigator as Navigator & { mozConnection?: { saveData?: boolean; effectiveType?: string } }).mozConnection
      || (navigator as Navigator & { webkitConnection?: { saveData?: boolean; effectiveType?: string } }).webkitConnection;
    if (!conn) return false;
    if (conn.saveData) return true;
    const t = conn.effectiveType;
    return t === "slow-2g" || t === "2g" || t === "3g";
  } catch {
    return false;
  }
}

function heapLooksLimited(): boolean {
  try {
    const perf = performance as Performance & { memory?: { jsHeapSizeLimit?: number } };
    const limit = perf.memory?.jsHeapSizeLimit;
    return typeof limit === "number" && limit > 0 && limit < 1_100_000_000;
  } catch {
    return false;
  }
}

/** Otomatik lite tespiti (kullanıcı Pro seçmediyse) */
export function detectAutoLite(): boolean {
  try {
    if (typeof window !== "undefined" && document.documentElement.classList.contains("og-lite")) {
      return true;
    }
    const pref = getDisplayModePreference();
    if (pref === "full") return false;
    if (pref === "lite") return true;

    if (localStorage.getItem(LS_BOOT_SLOW) === "1") return true;

    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    if (typeof mem === "number" && mem > 0 && mem <= 2) return true;

    const cores = navigator.hardwareConcurrency;
    if (typeof cores === "number" && cores > 0 && cores <= 2) return true;

    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return true;
    }

    if (connectionLooksSlow()) return true;
    if (heapLooksLimited()) return true;

    return false;
  } catch {
    return true;
  }
}

export function isLiteMode(): boolean {
  const pref = getDisplayModePreference();
  if (pref === "full") return false;
  if (pref === "lite") return true;
  return detectAutoLite();
}

export function applyLiteClassToDocument(lite: boolean): void {
  try {
    document.documentElement.classList.toggle("og-lite", lite);
  } catch { /* ignore */ }
}

/** index.html head script ile aynı mantık — erken sınıf için */
export function initDisplayModeEarly(): void {
  const pref = getDisplayModePreference();
  if (pref === "full") {
    applyLiteClassToDocument(false);
    return;
  }
  if (pref === "lite") {
    applyLiteClassToDocument(true);
    try { document.documentElement.classList.add("dark"); } catch { /* ignore */ }
    return;
  }
  const autoLite = detectAutoLite();
  applyLiteClassToDocument(autoLite);
  if (autoLite) {
    try { document.documentElement.classList.add("dark"); } catch { /* ignore */ }
  }
}

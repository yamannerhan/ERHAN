/** Görüntü modu: varsayılan Lite — yalnızca kullanıcı Pro seçerse full */

export type DisplayModePreference = "lite" | "full";

const LS_MODE = "og_display_mode";

export function getDisplayModePreference(): DisplayModePreference {
  try {
    if (localStorage.getItem(LS_MODE) === "full") return "full";
  } catch { /* ignore */ }
  return "lite";
}

export function setDisplayModePreference(mode: DisplayModePreference): void {
  try {
    localStorage.setItem(LS_MODE, mode);
  } catch { /* ignore */ }
}

/** Pro ↔ Lite geçişinde yazı + fade, ardından yenile */
export function switchDisplayModeWithTransition(mode: DisplayModePreference): void {
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
    if (getDisplayModePreference() !== "full") {
      localStorage.setItem(LS_MODE, "lite");
    }
  } catch { /* ignore */ }
}

/** @deprecated Herkes lite; geriye uyumluluk */
export function detectAutoLite(): boolean {
  return getDisplayModePreference() !== "full";
}

/** @deprecated */
export function persistLiteIfLowEnd(): boolean {
  return getDisplayModePreference() !== "full";
}

export function isLiteMode(): boolean {
  return getDisplayModePreference() !== "full";
}

export function applyLiteClassToDocument(lite: boolean): void {
  try {
    document.documentElement.classList.toggle("og-lite", lite);
  } catch { /* ignore */ }
}

export function initDisplayModeEarly(): void {
  const lite = isLiteMode();
  applyLiteClassToDocument(lite);
  if (lite) {
    try { document.documentElement.classList.add("dark"); } catch { /* ignore */ }
    try {
      if (localStorage.getItem(LS_MODE) !== "full") {
        localStorage.setItem(LS_MODE, "lite");
      }
    } catch { /* ignore */ }
  }
}

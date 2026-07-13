/** Mobil uzun basma: Chrome/Google Kaydet-Paylaş menüsünü engelle */
export function initBlockNativeCallout(): void {
  if (typeof window === "undefined") return;
  const w = window as Window & { __ogBlockCallout?: boolean };
  if (w.__ogBlockCallout) return;
  w.__ogBlockCallout = true;

  const isEditable = (t: EventTarget | null) => {
    const el = t as HTMLElement | null;
    if (!el || typeof el.closest !== "function") return false;
    return !!el.closest("input, textarea, select, [contenteditable='true'], [contenteditable=''], .og-allow-select");
  };

  document.addEventListener(
    "contextmenu",
    (e) => {
      if (isEditable(e.target)) return;
      e.preventDefault();
    },
    { capture: true },
  );

  // Bazı Android Chrome sürümlerinde selectstart ile menü tetiklenir
  document.addEventListener(
    "selectstart",
    (e) => {
      if (isEditable(e.target)) return;
      e.preventDefault();
    },
    { capture: true },
  );
}

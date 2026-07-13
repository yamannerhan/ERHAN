import { useDisplayMode } from "@/contexts/DisplayModeContext";
import "./display-mode-toggle.css";

/** Anasayfa — küçük Pro / Lite geçiş */
export function DisplayModeToggle() {
  const { isLite, preference, setMode } = useDisplayMode();
  const proActive = preference === "full" || (preference === "auto" && !isLite);
  const liteActive = preference === "lite" || (preference === "auto" && isLite);

  return (
    <div className="og-mode-toggle" role="group" aria-label="Görüntü modu">
      <button
        type="button"
        className={`og-mode-toggle__btn${proActive ? " og-mode-toggle__btn--active" : ""}`}
        onClick={() => { if (!proActive) setMode("full"); }}
        aria-pressed={proActive}
      >
        Pro
      </button>
      <button
        type="button"
        className={`og-mode-toggle__btn${liteActive ? " og-mode-toggle__btn--active" : ""}`}
        onClick={() => { if (!liteActive) setMode("lite"); }}
        aria-pressed={liteActive}
      >
        Lite
      </button>
    </div>
  );
}

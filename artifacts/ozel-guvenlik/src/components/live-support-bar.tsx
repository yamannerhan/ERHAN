import { useCallback } from "react";
import { useLocation } from "wouter";
import { Headphones, ChevronRight } from "lucide-react";
import { openSupportChat } from "@/lib/open-support-chat";
import "./live-support-bar.css";

export function LiveSupportBar({
  title = "Canlı Destek",
  description = "Soruların mı var? Hemen yazın, ekibimiz size yardımcı olsun.",
  className = "",
}: {
  title?: string;
  description?: string;
  className?: string;
}) {
  const [, navigate] = useLocation();

  const handleOpen = useCallback(() => {
    openSupportChat(navigate);
  }, [navigate]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleOpen();
      }
    },
    [handleOpen],
  );

  return (
    <button
      type="button"
      className={`og-support-box ${className}`.trim()}
      onClick={handleOpen}
      onKeyDown={handleKeyDown}
      aria-label={`${title} — ${description}`}
    >
      <span className="og-support-icon" aria-hidden>
        <Headphones strokeWidth={2} />
      </span>
      <span className="og-support-copy">
        <span className="og-support-title">{title}</span>
        <span className="og-support-description">{description}</span>
      </span>
      <span className="og-support-cta" aria-hidden>
        <span className="og-support-cta__long">Sohbet Et</span>
        <span className="og-support-cta__short">Sohbet</span>
        <ChevronRight strokeWidth={2.25} />
      </span>
    </button>
  );
}

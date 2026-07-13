import { Link, useLocation } from "wouter";
import { MessageCircle } from "lucide-react";
import "./lite-chat-fab.css";

/** Lite mod: socket/animasyonsuz, doğrudan /sohbet sayfasına gider */
export function LiteChatFab() {
  const [location] = useLocation();
  if (location === "/sohbet") return null;

  return (
    <Link href="/sohbet" className="og-lite-chat-fab" aria-label="Sohbet et">
      <MessageCircle className="og-lite-chat-fab__icon" strokeWidth={2.4} />
      <span>Sohbet Et</span>
    </Link>
  );
}

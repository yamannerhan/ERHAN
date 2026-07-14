import React, { useState } from "react";
import { ModeratorSidebar } from "./ModeratorSidebar";
import { ModeratorTopbar } from "./ModeratorTopbar";
import "./moderator-theme.css";

interface ModeratorLayoutProps {
  children: React.ReactNode;
}

export function ModeratorLayout({ children }: ModeratorLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="mod-root">
      <div className="mod-shell">
        <ModeratorSidebar />
        <ModeratorSidebar mobile mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
        <div className="mod-main">
          <ModeratorTopbar onMenuClick={() => setMobileOpen(true)} />
          <main className="mod-content">{children}</main>
        </div>
      </div>
    </div>
  );
}

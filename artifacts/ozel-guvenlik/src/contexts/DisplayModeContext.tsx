import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  applyLiteClassToDocument,
  getDisplayModePreference,
  initDisplayModeEarly,
  isDesktopViewport,
  switchDisplayModeWithTransition,
  type DisplayModePreference,
} from "@/lib/display-mode";

type DisplayModeContextValue = {
  isLite: boolean;
  preference: DisplayModePreference;
  setMode: (mode: "lite" | "full") => void;
  isDesktop: boolean;
};

const DisplayModeContext = createContext<DisplayModeContextValue>({
  isLite: true,
  preference: "lite",
  setMode: () => {},
  isDesktop: false,
});

export function DisplayModeProvider({ children }: { children: React.ReactNode }) {
  const [isDesktop, setIsDesktop] = useState(() => {
    initDisplayModeEarly();
    return isDesktopViewport();
  });
  const [savedLite, setSavedLite] = useState(() => getDisplayModePreference() !== "full");

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => {
      const desktop = mq.matches;
      setIsDesktop(desktop);
      const nextLite = desktop ? false : getDisplayModePreference() !== "full";
      setSavedLite(getDisplayModePreference() !== "full");
      applyLiteClassToDocument(nextLite);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const preference = getDisplayModePreference();
  const isLite = isDesktop ? false : savedLite;

  const setMode = useCallback((mode: "lite" | "full") => {
    switchDisplayModeWithTransition(mode);
  }, []);

  const value = useMemo(
    () => ({ isLite, preference, setMode, isDesktop }),
    [isLite, preference, setMode, isDesktop],
  );

  return (
    <DisplayModeContext.Provider value={value}>
      {children}
    </DisplayModeContext.Provider>
  );
}

export function useDisplayMode(): DisplayModeContextValue {
  return useContext(DisplayModeContext);
}

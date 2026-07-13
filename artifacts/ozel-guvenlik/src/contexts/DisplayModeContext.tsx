import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  getDisplayModePreference,
  initDisplayModeEarly,
  isLiteMode,
  switchDisplayModeWithTransition,
  type DisplayModePreference,
} from "@/lib/display-mode";

type DisplayModeContextValue = {
  isLite: boolean;
  preference: DisplayModePreference;
  setMode: (mode: "lite" | "full") => void;
};

const DisplayModeContext = createContext<DisplayModeContextValue>({
  isLite: true,
  preference: "lite",
  setMode: () => {},
});

export function DisplayModeProvider({ children }: { children: React.ReactNode }) {
  const [isLite, setIsLite] = useState(() => {
    initDisplayModeEarly();
    return isLiteMode();
  });

  const preference = getDisplayModePreference();

  const setMode = useCallback((mode: "lite" | "full") => {
    switchDisplayModeWithTransition(mode);
  }, []);

  const value = useMemo(
    () => ({ isLite, preference, setMode }),
    [isLite, preference, setMode],
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

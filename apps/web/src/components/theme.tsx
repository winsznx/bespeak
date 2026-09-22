"use client";

import {createContext, useCallback, useContext, useEffect, useState} from "react";

export type ThemeChoice = "light" | "dark" | "system";

const KEY = "bespeak-theme";

const Ctx = createContext<{
  choice: ThemeChoice;
  setChoice: (c: ThemeChoice) => void;
}>({choice: "light", setChoice: () => {}});

/// Theme is a three-way choice, persisted, with `system` tracking the OS live.
/// The resolved value is written to `data-theme` on <html>, which is the only thing the
/// token sheet reads — so a theme change never touches layout, only colour.
export function ThemeProvider({children}: {children: React.ReactNode}) {
  const [choice, setChoiceState] = useState<ThemeChoice>("light");

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {
      /* private mode: fall through to the default */
    }
    if (saved === "light" || saved === "dark" || saved === "system") {
      setChoiceState(saved);
    }
  }, []);

  const setChoice = useCallback((c: ThemeChoice) => {
    setChoiceState(c);
    try {
      localStorage.setItem(KEY, c);
    } catch {
      /* not fatal: the choice simply will not persist */
    }
    document.documentElement.setAttribute("data-theme", c);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", choice);
  }, [choice]);

  return <Ctx.Provider value={{choice, setChoice}}>{children}</Ctx.Provider>;
}

export function useTheme() {
  return useContext(Ctx);
}

/// Runs before first paint so the page never flashes the wrong theme.
/// `?theme=` wins, then the stored choice, then light. Kept tiny and defensive because
/// storage access throws in some privacy modes.
export const THEME_BOOTSTRAP = `
(function(){try{
  var u=new URL(window.location.href), q=u.searchParams.get("theme"), v=null;
  if(q==="light"||q==="dark"||q==="system"){v=q;try{localStorage.setItem("${KEY}",q)}catch(e){}}
  if(!v){try{v=localStorage.getItem("${KEY}")}catch(e){}}
  if(v!=="light"&&v!=="dark"&&v!=="system")v="light";
  document.documentElement.setAttribute("data-theme",v);
}catch(e){document.documentElement.setAttribute("data-theme","light")}})();
`;

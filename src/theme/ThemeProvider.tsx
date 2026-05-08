import React, { createContext, useContext, useEffect } from "react";

export type AppTheme = {
  colors: {
    bg: string;
    bgSidebar: string;
    bgPanel: string;
    border: string;
    borderMid: string;
    ink1: string;
    ink2: string;
    ink3: string;
    ink4: string;
    accent: string;
  };
  font: {
    body: string;
    mono: string;
    scale: number;
  };
};

const defaultTheme: AppTheme = {
  colors: {
    bg: "#f3ece4",
    bgSidebar: "#fbf7f2",
    bgPanel: "#d3c1ac",
    border: "rgba(34,51,59,0.14)",
    borderMid: "rgba(34,51,59,0.28)",
    ink1: "#0a0908",
    ink2: "#22333b",
    ink3: "#5e503f",
    ink4: "#8d7b66",
    accent: "#c6ac8f",
  },
  font: {
    body: '"Smooch Sans", "Inter", "Segoe UI", system-ui, sans-serif',
    mono: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
    scale: 1.25,
  },
};

const ThemeContext = createContext<AppTheme>(defaultTheme);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--app-font-sans", defaultTheme.font.body);
    root.style.setProperty("--app-font-mono", defaultTheme.font.mono);
    root.style.setProperty("--app-font-scale", String(defaultTheme.font.scale));
  }, []);

  return (
    <ThemeContext.Provider value={defaultTheme}>
      <div>{children}</div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}


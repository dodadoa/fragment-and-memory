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
  glass: {
    bg: string;
    bgStrong: string;
    stroke: string;
    strokeStrong: string;
    shadow: string;
  };
  body: {
    background: string;
    textShadow: string;
  };
  font: {
    body: string;
    mono: string;
    scale: number;
  };
};

const defaultTheme: AppTheme = {
  colors: {
    bg:        "#ffffff",
    bgSidebar: "#ffffff",
    bgPanel:   "#ffffff",
    border:    "rgba(0,0,0,0.80)",
    borderMid: "rgba(0,0,0,0.40)",
    ink1:      "#000000",
    ink2:      "#111111",
    ink3:      "#555555",
    ink4:      "#999999",
    accent:    "#000000",
  },
  glass: {
    bg:           "#e8f0f8",
    bgStrong:     "#ddeaf5",
    stroke:       "rgba(0,0,0,0.80)",
    strokeStrong: "rgba(0,0,0,0.80)",
    shadow:       "none",
  },
  body: {
    background: "#ffffff",
    textShadow: "none",
  },
  font: {
    body:  '"Smooch Sans", "Inter", "Segoe UI", system-ui, sans-serif',
    mono:  '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
    scale: 1.25,
  },
};

const ThemeContext = createContext<AppTheme>(defaultTheme);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;

    // fonts
    root.style.setProperty("--app-font-sans",   defaultTheme.font.body);
    root.style.setProperty("--app-font-mono",   defaultTheme.font.mono);
    root.style.setProperty("--app-font-scale",  String(defaultTheme.font.scale));

    // colors
    root.style.setProperty("--bg",          defaultTheme.colors.bg);
    root.style.setProperty("--bg-sidebar",  defaultTheme.colors.bgSidebar);
    root.style.setProperty("--bg-panel",    defaultTheme.colors.bgPanel);
    root.style.setProperty("--border",      defaultTheme.colors.border);
    root.style.setProperty("--border-mid",  defaultTheme.colors.borderMid);
    root.style.setProperty("--ink-1",       defaultTheme.colors.ink1);
    root.style.setProperty("--ink-2",       defaultTheme.colors.ink2);
    root.style.setProperty("--ink-3",       defaultTheme.colors.ink3);
    root.style.setProperty("--ink-4",       defaultTheme.colors.ink4);
    root.style.setProperty("--accent",      defaultTheme.colors.accent);

    // glass tokens
    root.style.setProperty("--glass-bg",            defaultTheme.glass.bg);
    root.style.setProperty("--glass-bg-strong",     defaultTheme.glass.bgStrong);
    root.style.setProperty("--glass-stroke",        defaultTheme.glass.stroke);
    root.style.setProperty("--glass-stroke-strong", defaultTheme.glass.strokeStrong);
    root.style.setProperty("--glass-shadow",        defaultTheme.glass.shadow);

    // body
    document.body.style.background  = defaultTheme.body.background;
    document.body.style.textShadow  = defaultTheme.body.textShadow;
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

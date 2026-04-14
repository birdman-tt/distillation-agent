export const uiTokens = {
  projectName: "Hall of Fame",
  layout: {
    mobileViewportWidth: 390,
    shellMaxWidth: 1180,
    maxReadableWidth: 780,
    pagePaddingX: 16,
    pagePaddingY: 28,
  },
  colors: {
    canvas: "#f6f0e7",
    canvasRaised: "#fffdf8",
    canvasSoft: "#f2eadf",
    ink: "#1f1a14",
    inkMuted: "#6b5c4b",
    inkSoft: "#8a7763",
    border: "#d8c8b2",
    borderStrong: "#cbb494",
    accent: "#9b5c2e",
    accentDeep: "#7a4621",
    accentWash: "#efe1cf",
    success: "#296748",
    warning: "#a15d1a",
    danger: "#9c2f2f",
    focusRing: "#4f7cff",
  },
  radius: {
    pill: "999px",
    medium: "18px",
    large: "24px",
    bubble: "22px",
  },
  shadow: {
    panel: "0 18px 42px rgba(52, 39, 24, 0.08)",
    card: "0 12px 28px rgba(52, 39, 24, 0.06)",
    glow: "0 24px 60px rgba(155, 92, 46, 0.12)",
  },
  spacing: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  typography: {
    display: {
      family: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
      weight: 500,
      sizes: {
        hero: "clamp(2rem, 7vw, 3.05rem)",
        page: "clamp(1.85rem, 6vw, 2.65rem)",
        panel: "clamp(1.45rem, 4.8vw, 1.95rem)",
        card: "clamp(1.15rem, 4vw, 1.4rem)",
      },
    },
    body: {
      family: '"Inter", "Helvetica Neue", Arial, sans-serif',
      weight: 400,
    },
    mono: {
      family: '"SFMono-Regular", "Menlo", monospace',
    },
  },
  motion: {
    chatRevealMs: 180,
    sectionRevealMs: 240,
  },
} as const;

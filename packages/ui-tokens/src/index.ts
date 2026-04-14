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
    canvas: "#17131b",
    canvasRaised: "#211a26",
    canvasSoft: "#2a2231",
    ink: "#f4e7dc",
    inkMuted: "#d2c0b5",
    inkSoft: "#9d8b86",
    border: "#4f4158",
    borderStrong: "#6d5a78",
    accent: "#d1a1b4",
    accentDeep: "#a46d87",
    accentWash: "#382a36",
    success: "#5e9b82",
    warning: "#c4945b",
    danger: "#c56d83",
    focusRing: "#7da8ff",
  },
  radius: {
    pill: "999px",
    medium: "18px",
    large: "24px",
    bubble: "22px",
  },
  shadow: {
    panel: "0 28px 70px rgba(7, 4, 10, 0.42)",
    card: "0 18px 38px rgba(7, 4, 10, 0.28)",
    glow: "0 24px 60px rgba(209, 161, 180, 0.16)",
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
        page: "clamp(1.62rem, 5.4vw, 2.32rem)",
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

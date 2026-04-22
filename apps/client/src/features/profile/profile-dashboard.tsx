import { uiTokens } from "@hall-of-fame/ui-tokens";
import { useEffect, useState } from "react";

import { getApiBaseUrl } from "../../lib/api.js";

type SurfaceTheme = "light" | "dark";

type PersonaStatusResponse = {
  currentPublishedVersionId: string | null;
  personaId: string;
  status: string;
};

const themeStorageKey = "hall-of-fame-theme";
const sessionStorageKey = "hall-of-fame-session";

const readStoredTheme = (): SurfaceTheme => {
  if (typeof window === "undefined") {
    return "light";
  }

  try {
    return localStorage.getItem(themeStorageKey) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
};

const getSessionCopy = () => {
  if (typeof window === "undefined") {
    return "匿名体验";
  }

  try {
    const raw = localStorage.getItem(sessionStorageKey);
    const session = raw ? (JSON.parse(raw) as { role?: string } | null) : null;
    if (session?.role === "REVIEWER") {
      return "已登录";
    }

    if (session?.role === "USER") {
      return "已登录";
    }
  } catch {
    return "匿名体验";
  }

  return "匿名体验";
};

const dockItems = [
  { key: "home", label: "聊天", href: "/" },
  { key: "create", label: "创建", href: "/create" },
  { key: "profile", label: "我的", href: "/profile" },
] as const;

export const ProfileDashboard = () => {
  const [theme, setTheme] = useState<SurfaceTheme>(() => readStoredTheme());
  const [sessionCopy, setSessionCopy] = useState("匿名体验");
  const [personaName, setPersonaName] = useState("还没有对象");
  const [personaPositioning, setPersonaPositioning] = useState("先去创建一个对象。");
  const [personaTags, setPersonaTags] = useState<string[]>([]);
  const [personaStatus, setPersonaStatus] = useState("这里会显示最近对象状态。");
  const [draftCount, setDraftCount] = useState("0");
  const [publishedCount, setPublishedCount] = useState("0");

  const palette =
    theme === "dark"
      ? {
          accent: uiTokens.colors.voltGreen,
          accentWash: uiTokens.colors.voltGreenWash,
          canvas: uiTokens.colors.darkCanvas,
          chrome: uiTokens.colors.darkChrome,
          ink: uiTokens.colors.inkOnDark,
          inkMuted: uiTokens.colors.inkMutedOnDark,
          inkSoft: uiTokens.colors.inkSoftOnDark,
          line: uiTokens.colors.lineDark,
          shadow: uiTokens.shadow.panelDark,
          soft: uiTokens.colors.darkSoft,
          surface: uiTokens.colors.darkSurface,
          surfaceStrong: uiTokens.colors.darkSurfaceStrong,
        }
      : {
          accent: uiTokens.colors.signalBlue,
          accentWash: uiTokens.colors.signalBlueWash,
          canvas: uiTokens.colors.lightCanvas,
          chrome: uiTokens.colors.lightChrome,
          ink: uiTokens.colors.ink,
          inkMuted: uiTokens.colors.inkMuted,
          inkSoft: uiTokens.colors.inkSoft,
          line: uiTokens.colors.lineLight,
          shadow: uiTokens.shadow.panel,
          soft: uiTokens.colors.lightSoft,
          surface: uiTokens.colors.lightSurface,
          surfaceStrong: uiTokens.colors.lightSurfaceStrong,
        };

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = theme;
    }

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(themeStorageKey, theme);
      } catch {
        // ignore storage write failures
      }
    }
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setSessionCopy(getSessionCopy());

    const personaId = localStorage.getItem("hall-of-fame-current-persona");
    const storedName = localStorage.getItem("hall-of-fame-current-persona-name");
    const storedPositioning = localStorage.getItem("hall-of-fame-current-persona-positioning");

    if (storedName) {
      setPersonaName(storedName);
    }

    if (storedPositioning) {
      setPersonaPositioning(storedPositioning);
    }

    try {
      const rawTags = localStorage.getItem("hall-of-fame-current-persona-tags");
      const tags = rawTags ? (JSON.parse(rawTags) as unknown[]) : [];
      setPersonaTags(tags.filter((item): item is string => typeof item === "string").slice(0, 4));
    } catch {
      setPersonaTags([]);
    }

    if (!personaId) {
      setPersonaStatus("这里会显示最近对象状态。");
      setDraftCount("0");
      setPublishedCount("0");
      return;
    }

    let cancelled = false;

    const loadStatus = async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/v1/personae/${personaId}/status`);
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(payload?.message ?? "加载对象状态失败");
        }

        const status = (await response.json()) as PersonaStatusResponse;
        if (cancelled) {
          return;
        }

        const published = status.currentPublishedVersionId ? 1 : 0;
        setDraftCount(published ? "0" : "1");
        setPublishedCount(String(published));
        setPersonaStatus(
          published
            ? "当前对象已有可发布版本，可继续编辑。"
            : "当前对象还在草稿阶段，先继续完善。",
        );
      } catch (error) {
        if (cancelled) {
          return;
        }

        setPersonaStatus(error instanceof Error ? error.message : "加载对象状态失败");
      }
    };

    void loadStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: uiTokens.spacing.lg,
        background: `linear-gradient(180deg, ${palette.canvas}, ${palette.surfaceStrong})`,
        color: palette.ink,
      }}
    >
      <section
        style={{
          width: "min(100%, 960px)",
          margin: "0 auto",
          display: "grid",
          gap: uiTokens.spacing.md,
          paddingBottom: 96,
        }}
      >
        <header
          style={{
            display: "grid",
            gap: uiTokens.spacing.sm,
            padding: uiTokens.spacing.lg,
            borderRadius: uiTokens.radius.large,
            background: `linear-gradient(180deg, ${palette.surface}, ${palette.chrome})`,
            border: `1px solid ${palette.line}`,
            boxShadow: palette.shadow,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: uiTokens.spacing.sm, alignItems: "flex-start" }}>
            <div style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.64 }}>Profile</span>
              <h1
                style={{
                  margin: 0,
                  fontFamily: uiTokens.typography.display.family,
                  fontSize: uiTokens.typography.display.sizes.hero,
                  lineHeight: "0.95",
                }}
              >
                我的
              </h1>
            </div>
            <div style={{ display: "flex", gap: uiTokens.spacing.xs, padding: 4, borderRadius: 999, background: palette.soft }}>
              {(["light", "dark"] as const).map((item) => {
                const active = theme === item;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setTheme(item)}
                    style={{
                      minHeight: 36,
                      padding: "0 14px",
                      borderRadius: 999,
                      border: "none",
                      background: active ? palette.accent : "transparent",
                      color: active ? (theme === "dark" ? uiTokens.colors.ink : uiTokens.colors.lightSurface) : palette.ink,
                      boxShadow: "none",
                    }}
                  >
                    {item === "light" ? "浅色" : "深色"}
                  </button>
                );
              })}
            </div>
          </div>
          <p style={{ margin: 0, color: palette.inkMuted }}>你的设置和对象都在这里。</p>
        </header>

        <section
          style={{
            display: "grid",
            gap: uiTokens.spacing.md,
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          }}
        >
          <article
            style={{
              display: "grid",
              gap: uiTokens.spacing.xs,
              padding: uiTokens.spacing.lg,
              borderRadius: uiTokens.radius.large,
              background: `linear-gradient(180deg, ${palette.surface}, ${palette.chrome})`,
              border: `1px solid ${palette.line}`,
            }}
          >
            <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.64 }}>当前身份</span>
            <strong style={{ fontSize: uiTokens.typography.display.sizes.card }}>{sessionCopy}</strong>
            <span style={{ color: palette.inkSoft }}>身份、主题和对象都在这里。</span>
          </article>
          <article
            style={{
              display: "grid",
              gap: uiTokens.spacing.xs,
              padding: uiTokens.spacing.lg,
              borderRadius: uiTokens.radius.large,
              background: `linear-gradient(180deg, ${palette.surface}, ${palette.chrome})`,
              border: `1px solid ${palette.line}`,
            }}
          >
            <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.64 }}>我的对象</span>
            <strong style={{ fontSize: uiTokens.typography.display.sizes.card }}>{draftCount} 草稿 / {publishedCount} 已发布</strong>
            <span style={{ color: palette.inkSoft }}>按最近对象统计。</span>
          </article>
        </section>

        <section
          style={{
            display: "grid",
            gap: uiTokens.spacing.sm,
            padding: uiTokens.spacing.lg,
            borderRadius: uiTokens.radius.large,
            background: `linear-gradient(180deg, ${palette.surface}, ${palette.chrome})`,
            border: `1px solid ${palette.line}`,
            boxShadow: palette.shadow,
          }}
        >
          <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.64 }}>最近对象</span>
          <h2
            style={{
              margin: 0,
              fontFamily: uiTokens.typography.display.family,
              fontSize: uiTokens.typography.display.sizes.page,
              lineHeight: "0.98",
            }}
          >
            {personaName}
          </h2>
          <p style={{ margin: 0, color: palette.inkMuted }}>{personaPositioning}</p>
          {personaTags.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: uiTokens.spacing.xs }}>
              {personaTags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    padding: "8px 12px",
                    borderRadius: uiTokens.radius.pill,
                    background: palette.accentWash,
                    color: palette.ink,
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          <p style={{ margin: 0, color: palette.inkSoft }}>{personaStatus}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: uiTokens.spacing.xs }}>
            <a
              href="/create"
              style={{
                minHeight: 42,
                padding: "0 16px",
                borderRadius: uiTokens.radius.pill,
                background: palette.accent,
                color: theme === "dark" ? uiTokens.colors.ink : uiTokens.colors.lightSurface,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              继续编辑
            </a>
            <a
              href="/"
              style={{
                minHeight: 42,
                padding: "0 16px",
                borderRadius: uiTokens.radius.pill,
                background: "transparent",
                color: palette.inkMuted,
                border: `1px solid ${palette.line}`,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              回到聊天
            </a>
          </div>
        </section>

        <nav
          style={{
            position: "sticky",
            bottom: uiTokens.spacing.md,
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: uiTokens.spacing.xs,
            padding: uiTokens.spacing.xs,
            borderRadius: uiTokens.radius.pill,
            background: theme === "dark" ? "rgba(23, 27, 31, 0.88)" : "rgba(255, 255, 255, 0.78)",
            border: `1px solid ${palette.line}`,
            backdropFilter: "blur(18px)",
            boxShadow: palette.shadow,
          }}
        >
          {dockItems.map((item) => {
            const active = item.key === "profile";
            return (
              <a
                key={item.key}
                href={item.href}
                style={{
                  minHeight: 44,
                  borderRadius: uiTokens.radius.pill,
                  textDecoration: "none",
                  display: "grid",
                  placeItems: "center",
                  background: active ? palette.accent : "transparent",
                  color: active ? (theme === "dark" ? uiTokens.colors.ink : uiTokens.colors.lightSurface) : palette.inkMuted,
                }}
              >
                {item.label}
              </a>
            );
          })}
        </nav>
      </section>
    </main>
  );
};

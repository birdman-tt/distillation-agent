import { uiTokens } from "@hall-of-fame/ui-tokens";

import { useFeaturedPersonae } from "../../features/hall/use-featured-personae.js";

export const HomePage = () => {
  const { items, loading } = useFeaturedPersonae();
  const featured = items.slice(0, 6);

  if (loading) {
    return <main style={{ padding: uiTokens.spacing.lg }}>加载中...</main>;
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: uiTokens.spacing.lg,
        background: `linear-gradient(180deg, ${uiTokens.colors.lightCanvas}, ${uiTokens.colors.lightSurfaceStrong})`,
        color: uiTokens.colors.ink,
        display: "grid",
        gap: uiTokens.spacing.md,
      }}
    >
      <header style={{ display: "flex", justifyContent: "space-between", gap: uiTokens.spacing.sm }}>
        <div style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.56 }}>Hall of Fame</span>
          <h1
            style={{
              margin: 0,
              fontFamily: uiTokens.typography.display.family,
              fontSize: uiTokens.typography.display.sizes.hero,
              lineHeight: "0.95",
            }}
          >
            只差一句开场
          </h1>
        </div>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 999,
            background: uiTokens.colors.signalBlue,
          }}
        />
      </header>

      <section style={{ display: "flex", gap: uiTokens.spacing.sm, overflowX: "auto", paddingBottom: 8 }}>
        {featured.map((item, index) => (
          <a
            key={item.id}
            href={`/persona/${item.id}`}
            style={{
              flex: "0 0 84%",
              minHeight: 420,
              borderRadius: 32,
              padding: uiTokens.spacing.lg,
              color: "inherit",
              border: `1px solid ${uiTokens.colors.lineLight}`,
              background:
                index === 0
                  ? `linear-gradient(180deg, ${uiTokens.colors.lightSurface}, ${uiTokens.colors.lightSurfaceStrong})`
                  : uiTokens.colors.lightSurfaceStrong,
              boxShadow: index === 0 ? uiTokens.shadow.panel : "none",
              display: "grid",
              alignContent: "end",
              gap: uiTokens.spacing.sm,
              opacity: index === 0 ? 1 : 0.84,
            }}
          >
            <span
              style={{
                width: "fit-content",
                padding: "6px 12px",
                borderRadius: 999,
                background: uiTokens.colors.lightSoft,
                fontSize: 12,
                color: uiTokens.colors.inkSoft,
              }}
            >
              精选
            </span>
            <strong
              style={{
                fontFamily: uiTokens.typography.display.family,
                fontSize: "clamp(2rem, 7vw, 2.9rem)",
                lineHeight: "0.92",
              }}
            >
              {item.displayName}
            </strong>
            <p style={{ margin: 0, maxWidth: "16ch", lineHeight: 1.58, color: uiTokens.colors.inkMuted }}>
              {item.previewIntro ?? "先认识一下"}
            </p>
          </a>
        ))}
      </section>

      <nav
        style={{
          marginTop: "auto",
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: uiTokens.spacing.xs,
          padding: uiTokens.spacing.xs,
          borderRadius: 999,
          background: "rgba(255,255,255,0.58)",
          border: `1px solid ${uiTokens.colors.lineLight}`,
        }}
      >
        <span
          style={{
            height: 40,
            borderRadius: 999,
            background: uiTokens.colors.ink,
            color: uiTokens.colors.lightSurface,
            display: "grid",
            placeItems: "center",
          }}
        >
          聊天
        </span>
        <span style={{ height: 40, borderRadius: 999, display: "grid", placeItems: "center" }}>创建</span>
        <span style={{ height: 40, borderRadius: 999, display: "grid", placeItems: "center" }}>我的</span>
      </nav>
    </main>
  );
};

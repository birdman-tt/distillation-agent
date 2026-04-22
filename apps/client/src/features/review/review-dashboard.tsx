import { uiTokens } from "@hall-of-fame/ui-tokens";

type ReviewItem = {
  id: string;
  title: string;
  subtitle: string;
  status: string;
};

type ReviewDashboardProps = {
  sources: ReviewItem[];
  versions: ReviewItem[];
};

export const ReviewDashboard = (props: ReviewDashboardProps) => (
  <section
    style={{
      display: "grid",
      gap: uiTokens.spacing.md,
      padding: uiTokens.spacing.lg,
      borderRadius: uiTokens.radius.large,
      background: `linear-gradient(180deg, ${uiTokens.colors.lightSurface}, ${uiTokens.colors.lightChrome})`,
      border: `1px solid ${uiTokens.colors.lineLight}`,
      boxShadow: uiTokens.shadow.panel,
    }}
  >
    <header style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.56 }}>Review</span>
      <h1
        style={{
          margin: 0,
          fontFamily: uiTokens.typography.display.family,
          fontSize: uiTokens.typography.display.sizes.page,
          lineHeight: "0.98",
        }}
      >
        审核入口
      </h1>
      <p style={{ margin: 0, color: uiTokens.colors.inkMuted }}>审核属于“我的”的次级入口，不再占一级导航。</p>
    </header>

    <section
      style={{
        display: "grid",
        gap: uiTokens.spacing.sm,
        padding: uiTokens.spacing.md,
        borderRadius: uiTokens.radius.medium,
        background: uiTokens.colors.lightSoft,
      }}
    >
      <h2 style={{ margin: 0, fontSize: uiTokens.typography.display.sizes.card }}>资料审核</h2>
      <ul style={{ margin: 0, paddingInlineStart: uiTokens.spacing.lg }}>
        {props.sources.length ? (
          props.sources.map((item) => (
            <li key={item.id}>
              <strong>{item.title}</strong> {item.subtitle} [{item.status}]
            </li>
          ))
        ) : (
          <li>暂无待处理资料</li>
        )}
      </ul>
    </section>

    <section
      style={{
        display: "grid",
        gap: uiTokens.spacing.sm,
        padding: uiTokens.spacing.md,
        borderRadius: uiTokens.radius.medium,
        background: uiTokens.colors.lightSoft,
      }}
    >
      <h2 style={{ margin: 0, fontSize: uiTokens.typography.display.sizes.card }}>发布审核</h2>
      <ul style={{ margin: 0, paddingInlineStart: uiTokens.spacing.lg }}>
        {props.versions.length ? (
          props.versions.map((item) => (
            <li key={item.id}>
              <strong>{item.title}</strong> {item.subtitle} [{item.status}]
            </li>
          ))
        ) : (
          <li>暂无待处理发布</li>
        )}
      </ul>
    </section>

    <a
      href="/profile"
      style={{
        width: "fit-content",
        minHeight: 42,
        padding: "0 16px",
        borderRadius: uiTokens.radius.pill,
        background: uiTokens.colors.signalBlue,
        color: uiTokens.colors.lightSurface,
        display: "inline-flex",
        alignItems: "center",
        textDecoration: "none",
      }}
    >
      返回我的
    </a>
  </section>
);

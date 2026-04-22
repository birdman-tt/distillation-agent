import { uiTokens } from "@hall-of-fame/ui-tokens";

type ShareLandingProps = {
  displayName: string;
  previewIntro: string | null;
  recommendedQuestions: string[];
};

export const ShareLanding = (props: ShareLandingProps) => (
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
    <div style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.56 }}>Share</span>
      <h1
        style={{
          margin: 0,
          fontFamily: uiTokens.typography.display.family,
          fontSize: uiTokens.typography.display.sizes.hero,
          lineHeight: "0.95",
        }}
      >
        {props.displayName}
      </h1>
      <p style={{ margin: 0, maxWidth: "28rem", color: uiTokens.colors.inkMuted }}>{props.previewIntro ?? "暂无简介"}</p>
    </div>

    <div
      style={{
        display: "grid",
        gap: uiTokens.spacing.sm,
        padding: uiTokens.spacing.md,
        borderRadius: uiTokens.radius.medium,
        background: uiTokens.colors.signalBlueWash,
      }}
    >
      <strong>推荐问题</strong>
      <ul style={{ margin: 0, paddingInlineStart: uiTokens.spacing.lg }}>
        {props.recommendedQuestions.map((question) => (
          <li key={question}>{question}</li>
        ))}
      </ul>
    </div>

    <p style={{ margin: 0, color: uiTokens.colors.inkSoft }}>从这里继续聊。</p>
  </section>
);

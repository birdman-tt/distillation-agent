import { uiTokens } from "@hall-of-fame/ui-tokens";

type PreviewPageProps = {
  previewIntro: string | null;
  recommendedQuestions: string[];
  sampleAnswers: string[];
};

export const CreatePreviewPage = (props: PreviewPageProps) => (
  <main
    style={{
      minHeight: "100vh",
      padding: uiTokens.spacing.lg,
      background: `linear-gradient(180deg, ${uiTokens.colors.lightCanvas}, ${uiTokens.colors.lightSurfaceStrong})`,
      display: "grid",
      gap: uiTokens.spacing.md,
    }}
  >
    <header style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.56 }}>Preview</span>
      <h1
        style={{
          margin: 0,
          fontFamily: uiTokens.typography.display.family,
          fontSize: uiTokens.typography.display.sizes.hero,
          lineHeight: "0.95",
        }}
      >
        先听它怎么开口
      </h1>
    </header>

    <div style={{ display: "flex", flexWrap: "wrap", gap: uiTokens.spacing.xs }}>
      <span style={{ padding: "8px 12px", borderRadius: 999, background: uiTokens.colors.lightSoft }}>对象定义</span>
      <span style={{ padding: "8px 12px", borderRadius: 999, background: uiTokens.colors.lightSoft }}>资料管理</span>
      <span style={{ padding: "8px 12px", borderRadius: 999, background: uiTokens.colors.signalBlue, color: uiTokens.colors.lightSurface }}>预览</span>
      <span style={{ padding: "8px 12px", borderRadius: 999, background: uiTokens.colors.lightSoft }}>发布</span>
    </div>

    <section
      style={{
        display: "grid",
        gap: uiTokens.spacing.sm,
        padding: uiTokens.spacing.lg,
        borderRadius: 28,
        background: "rgba(255,255,255,0.58)",
        border: `1px solid ${uiTokens.colors.lineLight}`,
      }}
    >
      <h2 style={{ margin: 0, fontFamily: uiTokens.typography.display.family, fontSize: uiTokens.typography.display.sizes.panel }}>预览简介</h2>
      <p style={{ margin: 0, color: uiTokens.colors.inkMuted }}>{props.previewIntro ?? "暂无简介"}</p>
    </section>

    <section
      style={{
        display: "grid",
        gap: uiTokens.spacing.md,
        padding: uiTokens.spacing.lg,
        borderRadius: 28,
        background: "rgba(255,255,255,0.58)",
        border: `1px solid ${uiTokens.colors.lineLight}`,
      }}
    >
      <h2 style={{ margin: 0, fontFamily: uiTokens.typography.display.family, fontSize: uiTokens.typography.display.sizes.panel }}>推荐问题</h2>
      <ul style={{ margin: 0, paddingInlineStart: uiTokens.spacing.lg }}>
      {props.recommendedQuestions.map((question) => (
        <li key={question}>{question}</li>
      ))}
      </ul>
    </section>

    <section
      style={{
        display: "grid",
        gap: uiTokens.spacing.md,
        padding: uiTokens.spacing.lg,
        borderRadius: 28,
        background: "rgba(255,255,255,0.58)",
        border: `1px solid ${uiTokens.colors.lineLight}`,
      }}
    >
      <h2 style={{ margin: 0, fontFamily: uiTokens.typography.display.family, fontSize: uiTokens.typography.display.sizes.panel }}>示例回答</h2>
      <ul style={{ margin: 0, paddingInlineStart: uiTokens.spacing.lg }}>
      {props.sampleAnswers.map((answer) => (
        <li key={answer}>{answer}</li>
      ))}
      </ul>
    </section>
  </main>
);

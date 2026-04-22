import { ChatPanel } from "../../features/chat/chat-panel.js";
import { ShareLanding } from "../../features/share/share-landing.js";
import { uiTokens } from "@hall-of-fame/ui-tokens";

type SharePageProps = {
  shareSlug: string;
  displayName: string;
  previewIntro: string | null;
  recommendedQuestions: string[];
};

export const SharePage = (props: SharePageProps) => (
  <main
    style={{
      minHeight: "100vh",
      padding: uiTokens.spacing.lg,
      background: `linear-gradient(180deg, ${uiTokens.colors.lightCanvas}, ${uiTokens.colors.lightSurfaceStrong})`,
      display: "grid",
      gap: uiTokens.spacing.md,
    }}
  >
    <ShareLanding
      displayName={props.displayName}
      previewIntro={props.previewIntro}
      recommendedQuestions={props.recommendedQuestions}
    />
    <ChatPanel targetType="share_link" shareSlug={props.shareSlug} />
  </main>
);

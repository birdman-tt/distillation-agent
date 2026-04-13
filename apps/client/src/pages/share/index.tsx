import { ChatPanel } from "../../features/chat/chat-panel.js";
import { ShareLanding } from "../../features/share/share-landing.js";

type SharePageProps = {
  shareSlug: string;
  displayName: string;
  previewIntro: string | null;
  recommendedQuestions: string[];
};

export const SharePage = (props: SharePageProps) => (
  <main>
    <ShareLanding
      displayName={props.displayName}
      previewIntro={props.previewIntro}
      recommendedQuestions={props.recommendedQuestions}
    />
    <ChatPanel targetType="share_link" shareSlug={props.shareSlug} />
  </main>
);

import { uiTokens } from "@hall-of-fame/ui-tokens";

import { ReviewDashboard } from "../../features/review/review-dashboard.js";

export const ReviewPage = () => (
  <main
    style={{
      minHeight: "100vh",
      padding: uiTokens.spacing.lg,
      background: `linear-gradient(180deg, ${uiTokens.colors.lightCanvas}, ${uiTokens.colors.lightSurfaceStrong})`,
    }}
  >
    <ReviewDashboard
      sources={[]}
      versions={[]}
    />
  </main>
);

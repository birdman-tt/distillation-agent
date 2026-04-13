type ShareLandingProps = {
  displayName: string;
  previewIntro: string | null;
  recommendedQuestions: string[];
};

export const ShareLanding = (props: ShareLandingProps) => (
  <section>
    <h1>{props.displayName}</h1>
    <p>{props.previewIntro ?? "暂无对象摘要"}</p>
    <h2>推荐问题</h2>
    <ul>
      {props.recommendedQuestions.map((question) => (
        <li key={question}>{question}</li>
      ))}
    </ul>
  </section>
);

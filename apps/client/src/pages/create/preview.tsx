type PreviewPageProps = {
  previewIntro: string | null;
  recommendedQuestions: string[];
  sampleAnswers: string[];
};

export const CreatePreviewPage = (props: PreviewPageProps) => (
  <main>
    <h1>版本预览</h1>
    <p>{props.previewIntro ?? "暂无预览摘要"}</p>
    <h2>推荐问题</h2>
    <ul>
      {props.recommendedQuestions.map((question) => (
        <li key={question}>{question}</li>
      ))}
    </ul>
    <h2>示例回答</h2>
    <ul>
      {props.sampleAnswers.map((answer) => (
        <li key={answer}>{answer}</li>
      ))}
    </ul>
  </main>
);

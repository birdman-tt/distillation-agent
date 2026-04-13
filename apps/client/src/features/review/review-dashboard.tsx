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
  <section>
    <h1>审核台</h1>
    <h2>资料审核</h2>
    <ul>
      {props.sources.map((item) => (
        <li key={item.id}>
          <strong>{item.title}</strong> {item.subtitle} [{item.status}]
        </li>
      ))}
    </ul>
    <h2>发布审核</h2>
    <ul>
      {props.versions.map((item) => (
        <li key={item.id}>
          <strong>{item.title}</strong> {item.subtitle} [{item.status}]
        </li>
      ))}
    </ul>
  </section>
);

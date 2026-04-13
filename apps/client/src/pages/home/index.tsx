import { useFeaturedPersonae } from "../../features/hall/use-featured-personae.js";

export const HomePage = () => {
  const { items, loading } = useFeaturedPersonae();

  if (loading) {
    return <p>加载中...</p>;
  }

  return (
    <main>
      <h1>人物馆</h1>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <strong>{item.displayName}</strong>
            <p>{item.previewIntro}</p>
          </li>
        ))}
      </ul>
    </main>
  );
};

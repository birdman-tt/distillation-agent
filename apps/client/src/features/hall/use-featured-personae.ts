import { getFeaturedPersonae } from "@hall-of-fame/api-client";
import { useEffect, useState } from "react";

import { getApiBaseUrl } from "../../lib/api.js";

type FeaturedItem = {
  id: string;
  displayName: string;
  previewIntro: string | null;
  recommendedQuestions: string[];
};

export const useFeaturedPersonae = () => {
  const [items, setItems] = useState<FeaturedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const result = await getFeaturedPersonae(getApiBaseUrl());
      setItems(result.items ?? []);
      setLoading(false);
    })();
  }, []);

  return {
    items,
    loading,
  };
};

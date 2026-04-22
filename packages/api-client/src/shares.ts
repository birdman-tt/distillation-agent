export const getShareLanding = async (baseUrl: string, shareSlug: string) => {
  const response = await fetch(`${baseUrl}/v1/shares/${shareSlug}`);
  return response.json();
};

export const getFeaturedPersonae = async (baseUrl: string) => {
  const response = await fetch(`${baseUrl}/v1/personae/featured`);
  return response.json();
};

export const getPersonaDetail = async (baseUrl: string, personaId: string) => {
  const response = await fetch(`${baseUrl}/v1/personae/${personaId}`);
  return response.json();
};

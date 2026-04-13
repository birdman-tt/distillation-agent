export const requestSmsCode = async (baseUrl: string, phoneNumber: string) => {
  const response = await fetch(`${baseUrl}/v1/auth/web/sms/request`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ phoneNumber }),
  });

  return response.json();
};

export const verifySmsCode = async (baseUrl: string, phoneNumber: string, code: string) => {
  const response = await fetch(`${baseUrl}/v1/auth/web/sms/verify`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ phoneNumber, code }),
  });

  return response.json();
};

export const refreshAuthSession = async (baseUrl: string, refreshToken: string) => {
  const response = await fetch(`${baseUrl}/v1/auth/refresh`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ refreshToken }),
  });

  return response.json();
};

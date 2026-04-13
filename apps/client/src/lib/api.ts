import { createApiClient } from "@hall-of-fame/api-client";

export const getApiBaseUrl = () => process.env.APP_BASE_URL ?? "http://127.0.0.1:3000";

export const apiClient = createApiClient(getApiBaseUrl());

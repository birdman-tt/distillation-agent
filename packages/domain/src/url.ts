import { createHash } from "node:crypto";

const privateHostPatterns = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^\[?::1\]?$/i,
];

export const normalizePublicHttpUrl = (rawUrl: string): string => {
  const parsed = new URL(rawUrl);

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http/https URLs are supported");
  }

  if (privateHostPatterns.some((pattern) => pattern.test(parsed.hostname))) {
    throw new Error("Private or localhost URLs are not allowed");
  }

  parsed.hash = "";
  if ((parsed.protocol === "https:" && parsed.port === "443") || (parsed.protocol === "http:" && parsed.port === "80")) {
    parsed.port = "";
  }

  const normalizedPath = parsed.pathname.replace(/\/+$/, "") || "/";
  parsed.pathname = normalizedPath;
  parsed.searchParams.sort();

  return parsed.toString();
};

export const hashNormalizedUrl = (normalizedUrl: string): string =>
  createHash("sha256").update(normalizedUrl).digest("hex");

import { createHash } from "node:crypto";

const privateHostPatterns = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^\[::1\]$/,
];

export const normalizeUrl = (input: string) => {
  const url = new URL(input);
  url.hash = "";

  if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname) {
    throw new Error("Only http and https URLs are allowed");
  }

  const host = url.hostname.toLowerCase();
  if (privateHostPatterns.some((pattern) => pattern.test(host))) {
    throw new Error("Private, loopback, or local URLs are not allowed");
  }

  return url.toString();
};

export const hashNormalizedUrl = (normalizedUrl: string) =>
  createHash("sha256").update(normalizedUrl).digest("hex");

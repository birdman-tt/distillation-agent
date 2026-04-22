import { randomUUID } from "node:crypto";

export type ActorRole = "ANONYMOUS" | "USER" | "REVIEWER";
export type SessionKind = "ANONYMOUS" | "AUTHENTICATED";

type UserRecord = {
  id: string;
  displayName: string | null;
  createdAt: string;
};

export type SessionRecord = {
  id: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
  role: ActorRole;
  sessionKind: SessionKind;
  createdAt: string;
};

const reviewerUserId = "8261f391-f661-4d95-8bff-88d78cff8f0c";
const reviewerIdentityKey = "dev-reviewer";

const users = new Map<string, UserRecord>([
  [
    reviewerUserId,
    {
      id: reviewerUserId,
      displayName: "Local Reviewer",
      createdAt: new Date().toISOString(),
    },
  ],
]);

const sessionsById = new Map<string, SessionRecord>();
const sessionsByAccessToken = new Map<string, SessionRecord>();
const sessionsByRefreshToken = new Map<string, SessionRecord>();
const identities = new Map<string, string>([[`reviewer:${reviewerIdentityKey}`, reviewerUserId]]);

const nowIso = () => new Date().toISOString();

const createUser = (displayName: string | null) => {
  const user: UserRecord = {
    id: randomUUID(),
    displayName,
    createdAt: nowIso(),
  };
  users.set(user.id, user);
  return user;
};

const createSession = (input: { userId: string; role: ActorRole; sessionKind: SessionKind }) => {
  const session: SessionRecord = {
    id: randomUUID(),
    userId: input.userId,
    accessToken: `access_${randomUUID()}`,
    refreshToken: `refresh_${randomUUID()}`,
    role: input.role,
    sessionKind: input.sessionKind,
    createdAt: nowIso(),
  };

  sessionsById.set(session.id, session);
  sessionsByAccessToken.set(session.accessToken, session);
  sessionsByRefreshToken.set(session.refreshToken, session);
  return session;
};

const parseBearerToken = (authorizationHeader: string | undefined) => {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.trim().split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
};

const readIdentityUser = (key: string, displayName: string | null) => {
  const existingUserId = identities.get(key);
  if (existingUserId) {
    return existingUserId;
  }

  const user = createUser(displayName);
  identities.set(key, user.id);
  return user.id;
};

const deriveMergeUserId = (accessToken: string | undefined) => {
  const session = accessToken ? sessionsByAccessToken.get(accessToken) ?? null : null;
  if (!session || session.sessionKind !== "ANONYMOUS") {
    return null;
  }

  return session.userId;
};

export const issueAnonymousSession = (deviceId?: string) => {
  const identityKey = deviceId ? `anonymous:${deviceId}` : `anonymous:${randomUUID()}`;
  const userId = readIdentityUser(identityKey, "Guest Builder");
  return createSession({
    userId,
    role: "ANONYMOUS",
    sessionKind: "ANONYMOUS",
  });
};

export const issueReviewerSession = () => {
  return createSession({
    userId: reviewerUserId,
    role: "REVIEWER",
    sessionKind: "AUTHENTICATED",
  });
};

export const verifySmsIdentity = (phoneNumber: string, input?: { mergeFromAccessToken?: string | undefined }) => {
  const userId = readIdentityUser(`sms:${phoneNumber}`, phoneNumber);
  return {
    session: createSession({
      userId,
      role: "USER",
      sessionKind: "AUTHENTICATED",
    }),
    mergedFromUserId: deriveMergeUserId(input?.mergeFromAccessToken),
  };
};

export const verifyWechatIdentity = (code: string, input?: { mergeFromAccessToken?: string | undefined }) => {
  const userId = readIdentityUser(`wechat:${code}`, "WeChat User");
  return {
    session: createSession({
      userId,
      role: "USER",
      sessionKind: "AUTHENTICATED",
    }),
    mergedFromUserId: deriveMergeUserId(input?.mergeFromAccessToken),
  };
};

export const refreshSession = (refreshToken: string) => {
  const existing = sessionsByRefreshToken.get(refreshToken);
  if (!existing) {
    return null;
  }

  return createSession({
    userId: existing.userId,
    role: existing.role,
    sessionKind: existing.sessionKind,
  });
};

export const getSessionByAccessToken = (accessToken: string | undefined) =>
  accessToken ? sessionsByAccessToken.get(accessToken) ?? null : null;

export const getOptionalSessionFromAuthorizationHeader = (authorizationHeader: string | undefined) =>
  getSessionByAccessToken(parseBearerToken(authorizationHeader) ?? undefined);

export const isReviewerSession = (session: SessionRecord | null | undefined): session is SessionRecord =>
  Boolean(session && session.role === "REVIEWER");

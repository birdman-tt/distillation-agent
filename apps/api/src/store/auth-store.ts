import { randomUUID } from "node:crypto";

type UserRecord = {
  id: string;
  displayName: string | null;
  createdAt: string;
};

type SessionRecord = {
  id: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
  createdAt: string;
};

const demoUserId = "ad5bf85c-07fd-49ff-979c-49b85f8ab53e";

const users = new Map<string, UserRecord>([
  [
    demoUserId,
    {
      id: demoUserId,
      displayName: "Demo Builder",
      createdAt: new Date().toISOString(),
    },
  ],
]);

const sessions = new Map<string, SessionRecord>();
const identities = new Map<string, string>();

const createSession = (userId: string) => {
  const session: SessionRecord = {
    id: randomUUID(),
    userId,
    accessToken: `access_${randomUUID()}`,
    refreshToken: `refresh_${randomUUID()}`,
    createdAt: new Date().toISOString(),
  };

  sessions.set(session.refreshToken, session);
  return session;
};

export const getDemoUserId = () => demoUserId;

export const resolveActorUserId = (headerValue: string | undefined) => {
  if (headerValue && users.has(headerValue)) {
    return headerValue;
  }

  return demoUserId;
};

export const verifySmsIdentity = (phoneNumber: string) => {
  const key = `sms:${phoneNumber}`;
  let userId = identities.get(key);

  if (!userId) {
    userId = randomUUID();
    identities.set(key, userId);
    users.set(userId, {
      id: userId,
      displayName: phoneNumber,
      createdAt: new Date().toISOString(),
    });
  }

  return createSession(userId);
};

export const verifyWechatIdentity = (code: string) => {
  const key = `wechat:${code}`;
  let userId = identities.get(key);

  if (!userId) {
    userId = randomUUID();
    identities.set(key, userId);
    users.set(userId, {
      id: userId,
      displayName: "WeChat User",
      createdAt: new Date().toISOString(),
    });
  }

  return createSession(userId);
};

export const refreshSession = (refreshToken: string) => {
  const existing = sessions.get(refreshToken);
  if (!existing) {
    return null;
  }

  return createSession(existing.userId);
};

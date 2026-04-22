const LOCAL_DATABASE_PLACEHOLDER = "postgresql://hof:hof@localhost:5432/hall_of_fame";
const SUPABASE_SESSION_POOLER_HOST = "aws-1-ap-southeast-1.pooler.supabase.com";
const SUPABASE_SESSION_POOLER_PORT = "5432";
const SUPABASE_SESSION_POOLER_DATABASE = "postgres";
const SUPABASE_SESSION_POOLER_USER = "postgres.dibwjojlwwgyxrocaysf";

const normalizeEnvValue = (value: string | undefined) => {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
};

const shouldTreatAsPlaceholder = (url: string | null) => {
  if (!url) {
    return true;
  }

  return url === LOCAL_DATABASE_PLACEHOLDER;
};

export const buildDatabaseUrl = (env: NodeJS.ProcessEnv) => {
  const explicit = normalizeEnvValue(env.DATABASE_URL);
  if (!shouldTreatAsPlaceholder(explicit)) {
    return explicit!;
  }

  const password = normalizeEnvValue(env.POSTGRES_PASSWORD);
  if (!password) {
    return explicit ?? LOCAL_DATABASE_PLACEHOLDER;
  }

  return `postgresql://${SUPABASE_SESSION_POOLER_USER}:${encodeURIComponent(password)}@${SUPABASE_SESSION_POOLER_HOST}:${SUPABASE_SESSION_POOLER_PORT}/${SUPABASE_SESSION_POOLER_DATABASE}`;
};

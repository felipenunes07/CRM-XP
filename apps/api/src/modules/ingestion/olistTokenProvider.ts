import { Pool } from "pg";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";

export const OLIST_VAULT_SECRET_NAME = "xp_crm_olist_api_token";

const TOKEN_CACHE_TTL_MS = 10 * 60 * 1000;
let cachedVaultToken: string | null = null;
let cachedAt = 0;
let pendingVaultLookup: Promise<string | null> | null = null;

export function resolveOlistApiToken(environmentToken?: string | null, vaultToken?: string | null) {
  const fromEnvironment = String(environmentToken ?? "").trim();
  if (fromEnvironment) return fromEnvironment;
  const fromVault = String(vaultToken ?? "").trim();
  return fromVault || null;
}

function configuredSupabaseDatabaseUrl() {
  const value = String(env.SUPABASE_DATABASE_URL ?? "").trim();
  return value && !value.includes("[YOUR-PASSWORD]") ? value : null;
}

async function loadTokenFromVault() {
  const connectionString = configuredSupabaseDatabaseUrl();
  if (!connectionString) return null;

  const remotePool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
    statement_timeout: 10_000,
    max: 1,
  });

  try {
    const result = await remotePool.query<{ decrypted_secret: string | null }>(
      `
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = $1
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [OLIST_VAULT_SECRET_NAME],
    );
    const token = String(result.rows[0]?.decrypted_secret ?? "").trim();
    return token || null;
  } catch (error) {
    logger.warn("olist token lookup in Supabase Vault failed", { error: String(error) });
    return null;
  } finally {
    await remotePool.end().catch(() => undefined);
  }
}

export async function getOlistApiToken() {
  const environmentToken = resolveOlistApiToken(env.OLIST_API_TOKEN);
  if (environmentToken) return environmentToken;

  if (Date.now() - cachedAt < TOKEN_CACHE_TTL_MS) {
    return cachedVaultToken;
  }

  if (!pendingVaultLookup) {
    pendingVaultLookup = loadTokenFromVault()
      .then((token) => {
        cachedVaultToken = token;
        cachedAt = Date.now();
        return token;
      })
      .finally(() => {
        pendingVaultLookup = null;
      });
  }

  return pendingVaultLookup;
}

export function clearOlistTokenCache() {
  cachedVaultToken = null;
  cachedAt = 0;
  pendingVaultLookup = null;
}

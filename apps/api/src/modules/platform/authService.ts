import { pool } from "../../db/client.js";
import { env } from "../../lib/env.js";
import { HttpError } from "../../lib/httpError.js";
import { logger } from "../../lib/logger.js";
import {
  type AppRole,
  type LegacyRole,
  computeEffectivePermissions,
  normalizeAppRole,
  toLegacyRole,
} from "./permissionService.js";
import {
  createSupabaseAdminClient,
  createSupabaseAuthClient,
  isSupabaseAdminConfigured,
  isSupabaseAuthConfigured,
} from "./supabaseAdmin.js";

export interface JwtUser {
  id: string;
  email: string;
  role: LegacyRole;
  appRole?: AppRole;
  name: string;
  isActive?: boolean;
  permissions?: string[];
}

export interface CreateUserInput {
  email: string;
  password: string;
  role: AppRole | LegacyRole;
  name: string;
}

interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
}

function mapProfile(row: ProfileRow, permissions: string[]): JwtUser {
  const appRole = normalizeAppRole(row.role);
  return {
    id: String(row.id),
    email: String(row.email),
    role: toLegacyRole(appRole),
    appRole,
    name: String(row.full_name ?? row.email),
    isActive: Boolean(row.is_active),
    permissions,
  };
}

async function upsertLegacyUserMirror(user: JwtUser) {
  await pool.query(
    `
      INSERT INTO users (id, email, password_hash, name, role)
      VALUES ($1, $2, 'supabase-auth', $3, $4)
      ON CONFLICT (id) DO UPDATE
      SET email = EXCLUDED.email,
          name = EXCLUDED.name,
          role = EXCLUDED.role,
          updated_at = NOW()
    `,
    [user.id, user.email, user.name, user.role],
  );
}

async function loadProfile(userId: string, fallbackEmail?: string) {
  const result = await pool.query<ProfileRow>(
    `
      SELECT id, email, full_name, role, is_active
      FROM profiles
      WHERE id = $1
    `,
    [userId],
  );

  if (result.rows[0]) {
    return result.rows[0];
  }

  if (!fallbackEmail) {
    throw new HttpError(403, "Perfil de usuario nao encontrado");
  }

  const created = await pool.query<ProfileRow>(
    `
      INSERT INTO profiles (id, email, full_name, role, is_active)
      VALUES ($1, $2, $3, 'viewer', true)
      RETURNING id, email, full_name, role, is_active
    `,
    [userId, fallbackEmail.toLowerCase(), fallbackEmail.split("@")[0] ?? fallbackEmail],
  );

  const profile = created.rows[0];
  if (!profile) {
    throw new HttpError(500, "Nao foi possivel criar o perfil do usuario");
  }
  return profile;
}

async function loadOverrides(userId: string) {
  const result = await pool.query<{ permission_key: string; allowed: boolean }>(
    `
      SELECT permission_key, allowed
      FROM user_permissions
      WHERE user_id = $1
      ORDER BY permission_key ASC
    `,
    [userId],
  );

  return result.rows.map((row) => ({
    permissionKey: String(row.permission_key),
    allowed: Boolean(row.allowed),
  }));
}

export async function loadAuthenticatedUser(userId: string, fallbackEmail?: string) {
  const profile = await loadProfile(userId, fallbackEmail);
  if (!profile?.is_active) {
    throw new HttpError(403, "Usuario inativo");
  }

  const user = mapProfile(
    profile,
    computeEffectivePermissions({
      role: profile.role,
      overrides: await loadOverrides(userId),
    }),
  );
  await upsertLegacyUserMirror(user);
  return user;
}

export async function ensureDefaultAdmin() {
  if (!isSupabaseAdminConfigured()) {
    logger.warn("supabase admin not configured; default admin creation skipped");
    return;
  }

  const admin = createSupabaseAdminClient();
  const normalizedEmail = env.DEFAULT_ADMIN_EMAIL.trim().toLowerCase();

  const { data: created, error } = await admin.auth.admin.createUser({
    email: normalizedEmail,
    password: env.DEFAULT_ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: {
      full_name: "Admin",
      role: "admin",
    },
  });

  if (error && !error.message.toLowerCase().includes("already")) {
    logger.warn("default supabase admin creation failed", { error: error.message });
  }

  let userId = created.user?.id;
  if (!userId && error?.message.toLowerCase().includes("already")) {
    const { data } = await admin.auth.admin.listUsers();
    userId = data.users.find((user) => user.email?.toLowerCase() === normalizedEmail)?.id;
  }

  if (!userId) {
    return;
  }

  await pool.query(
    `
      INSERT INTO profiles (id, email, full_name, role, is_active)
      VALUES ($1, $2, 'Admin', 'admin', true)
      ON CONFLICT (id) DO UPDATE
      SET email = EXCLUDED.email,
          role = 'admin',
          is_active = true,
          updated_at = NOW()
    `,
    [userId, normalizedEmail],
  );

  await pool.query(
    `
      INSERT INTO users (id, email, password_hash, name, role)
      VALUES ($1, $2, 'supabase-auth', 'Admin', 'ADMIN')
      ON CONFLICT (id) DO UPDATE
      SET email = EXCLUDED.email,
          name = EXCLUDED.name,
          role = EXCLUDED.role,
          updated_at = NOW()
    `,
    [userId, normalizedEmail],
  );
}

export async function login(email: string, password: string) {
  if (!isSupabaseAuthConfigured()) {
    throw new HttpError(500, "Supabase Auth nao esta configurado no backend");
  }

  const supabase = createSupabaseAuthClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error || !data.session?.access_token || !data.user?.id) {
    throw new HttpError(401, "Credenciais invalidas");
  }

  const user = await loadAuthenticatedUser(data.user.id, data.user.email ?? email);
  await pool.query("UPDATE profiles SET last_sign_in_at = NOW(), updated_at = NOW() WHERE id = $1", [user.id]);

  return { token: data.session.access_token, user };
}

export async function createUserAccount(input: CreateUserInput) {
  if (!isSupabaseAdminConfigured()) {
    throw new HttpError(500, "Supabase Admin nao esta configurado no backend");
  }

  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedName = input.name.trim();
  if (!normalizedName) {
    throw new HttpError(400, "Nome do usuario obrigatorio");
  }

  const appRole = normalizeAppRole(input.role);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: normalizedEmail,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      full_name: normalizedName,
      role: appRole,
    },
  });

  if (error || !data.user?.id) {
    throw new HttpError(error?.status ?? 400, error?.message ?? "Nao foi possivel criar o usuario");
  }

  const result = await pool.query(
    `
      INSERT INTO profiles (id, email, full_name, role, is_active)
      VALUES ($1, $2, $3, $4, true)
      ON CONFLICT (id) DO UPDATE
      SET email = EXCLUDED.email,
          full_name = EXCLUDED.full_name,
          role = EXCLUDED.role,
          is_active = true,
          updated_at = NOW()
      RETURNING id, email, full_name AS name, role, is_active, created_at
    `,
    [data.user.id, normalizedEmail, normalizedName, appRole],
  );

  await pool.query(
    `
      INSERT INTO users (id, email, password_hash, name, role)
      VALUES ($1, $2, 'supabase-auth', $3, $4)
      ON CONFLICT (id) DO UPDATE
      SET email = EXCLUDED.email,
          name = EXCLUDED.name,
          role = EXCLUDED.role,
          updated_at = NOW()
    `,
    [data.user.id, normalizedEmail, normalizedName, toLegacyRole(appRole)],
  );

  return result.rows[0];
}

export async function verifyToken(token: string) {
  if (!isSupabaseAuthConfigured()) {
    throw new HttpError(500, "Supabase Auth nao esta configurado no backend");
  }

  const supabase = createSupabaseAuthClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.id) {
    throw new HttpError(401, "Sessao invalida");
  }

  return loadAuthenticatedUser(data.user.id, data.user.email ?? undefined);
}

export async function listUsers() {
  const result = await pool.query(
    `
      SELECT
        p.id,
        p.email,
        p.full_name AS name,
        p.role,
        p.is_active,
        p.created_by,
        p.created_at,
        p.updated_at,
        p.last_sign_in_at,
        COALESCE(
          jsonb_agg(
            jsonb_build_object('permissionKey', up.permission_key, 'allowed', up.allowed)
            ORDER BY up.permission_key
          ) FILTER (WHERE up.permission_key IS NOT NULL),
          '[]'::jsonb
        ) AS permission_overrides
      FROM profiles p
      LEFT JOIN user_permissions up ON up.user_id = p.id
      GROUP BY p.id
      ORDER BY p.created_at ASC
    `,
  );

  return result.rows.map((row) => ({
    ...row,
    permissions: computeEffectivePermissions({
      role: String(row.role),
      overrides: row.permission_overrides as Array<{ permissionKey: string; allowed: boolean }>,
    }),
  }));
}

import { pool } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import { listUsers, createUserAccount } from "./authService.js";
import { APP_PERMISSIONS, normalizeAppRole, toLegacyRole, type PermissionOverride } from "./permissionService.js";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "./supabaseAdmin.js";

export interface AdminUserInput {
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
  permissionOverrides: PermissionOverride[];
  password?: string;
}

function normalizeOverrides(overrides: PermissionOverride[]) {
  const knownPermissions = new Set(APP_PERMISSIONS.map((permission) => permission.key));
  const deduped = new Map<string, boolean>();

  for (const override of overrides) {
    if (knownPermissions.has(override.permissionKey)) {
      deduped.set(override.permissionKey, Boolean(override.allowed));
    }
  }

  return Array.from(deduped.entries()).map(([permissionKey, allowed]) => ({ permissionKey, allowed }));
}

async function replacePermissionOverrides(userId: string, overrides: PermissionOverride[]) {
  const normalized = normalizeOverrides(overrides);
  await pool.query("DELETE FROM user_permissions WHERE user_id = $1", [userId]);

  for (const override of normalized) {
    await pool.query(
      `
        INSERT INTO user_permissions (user_id, permission_key, allowed)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, permission_key) DO UPDATE
        SET allowed = EXCLUDED.allowed,
            updated_at = NOW()
      `,
      [userId, override.permissionKey, override.allowed],
    );
  }
}

export async function listAdminUsers() {
  return listUsers();
}

export async function createAdminUser(input: AdminUserInput, createdBy: string) {
  const password = input.password?.trim();
  if (!password || password.length < 6) {
    throw new HttpError(400, "Senha inicial deve ter pelo menos 6 caracteres");
  }

  const created = await createUserAccount({
    email: input.email,
    name: input.fullName,
    role: normalizeAppRole(input.role),
    password,
  });

  await pool.query(
    "UPDATE profiles SET is_active = $2, created_by = $3, updated_at = NOW() WHERE id = $1",
    [created.id, input.isActive, createdBy],
  );
  await replacePermissionOverrides(String(created.id), input.permissionOverrides);

  return listAdminUsers();
}

export async function updateAdminUser(userId: string, input: AdminUserInput) {
  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  if (!fullName) {
    throw new HttpError(400, "Nome do usuario obrigatorio");
  }

  const appRole = normalizeAppRole(input.role);

  if (isSupabaseAdminConfigured()) {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.auth.admin.updateUserById(userId, {
      email,
      user_metadata: {
        full_name: fullName,
        role: appRole,
      },
    });
    if (error) {
      throw new HttpError(error.status ?? 400, error.message);
    }
  }

  await pool.query(
    `
      UPDATE profiles
      SET email = $2,
          full_name = $3,
          role = $4,
          is_active = $5,
          updated_at = NOW()
      WHERE id = $1
    `,
    [userId, email, fullName, appRole, input.isActive],
  );

  await pool.query(
    `
      UPDATE users
      SET email = $2,
          name = $3,
          role = $4,
          updated_at = NOW()
      WHERE id = $1
    `,
    [userId, email, fullName, toLegacyRole(appRole)],
  );

  await replacePermissionOverrides(userId, input.permissionOverrides);
  return listAdminUsers();
}

export async function setAdminUserActive(userId: string, isActive: boolean) {
  await pool.query("UPDATE profiles SET is_active = $2, updated_at = NOW() WHERE id = $1", [userId, isActive]);
  return listAdminUsers();
}

export async function createPasswordResetLink(userId: string) {
  if (!isSupabaseAdminConfigured()) {
    throw new HttpError(500, "Supabase Admin nao esta configurado no backend");
  }

  const profile = await pool.query<{ email: string }>("SELECT email FROM profiles WHERE id = $1", [userId]);
  const email = profile.rows[0]?.email;
  if (!email) {
    throw new HttpError(404, "Usuario nao encontrado");
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
  });

  if (error) {
    throw new HttpError(error.status ?? 400, error.message);
  }

  return {
    email,
    actionLink: data.properties?.action_link ?? null,
  };
}

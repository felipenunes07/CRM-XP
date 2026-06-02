import { pool } from "../../db/client.js";

export type AppRole = "admin" | "vendas" | "financeiro" | "operacional" | "viewer";
export type LegacyRole = "ADMIN" | "MANAGER" | "SELLER";

export interface PermissionDefinition {
  key: string;
  name: string;
  description: string;
}

export interface PermissionOverride {
  permissionKey: string;
  allowed: boolean;
}

export const APP_PERMISSIONS: PermissionDefinition[] = [
  { key: "dashboard.view", name: "Dashboard geral", description: "Visualizar os indicadores principais do CRM." },
  { key: "commercial.view", name: "Ferramentas comerciais", description: "Acessar clientes, agenda, pipeline e prospeccao." },
  { key: "commercial.manage", name: "Gestao comercial", description: "Criar e alterar registros comerciais." },
  { key: "messages.view", name: "Mensagens", description: "Visualizar mensagens, disparos e conversas." },
  { key: "messages.manage", name: "Gestao de mensagens", description: "Criar modelos, campanhas e responder conversas." },
  { key: "finance.view", name: "Financeiro", description: "Visualizar credito, comprovantes e informacoes financeiras." },
  { key: "finance.manage", name: "Gestao financeira", description: "Atualizar metas e dados financeiros." },
  { key: "reports.view", name: "Relatorios", description: "Visualizar relatorios e analises." },
  { key: "settings.manage", name: "Configuracoes", description: "Alterar configuracoes internas do CRM." },
  { key: "admin.panel.view", name: "Painel administrativo", description: "Acessar area administrativa." },
  { key: "admin.users.manage", name: "Gestao de usuarios", description: "Criar, editar, desativar usuarios e redefinir acessos." },
  { key: "automations.view", name: "Automações", description: "Visualizar automacoes." },
  { key: "automations.manage", name: "Gestao de automacoes", description: "Criar, editar, executar e aprovar automacoes." },
  { key: "integrations.manage", name: "Integracoes", description: "Gerenciar integracoes e instancias externas." },
];

const ALL_PERMISSION_KEYS = APP_PERMISSIONS.map((permission) => permission.key);

export const ROLE_PERMISSIONS: Record<AppRole, string[]> = {
  admin: ALL_PERMISSION_KEYS,
  vendas: [
    "dashboard.view",
    "commercial.view",
    "commercial.manage",
    "messages.view",
    "messages.manage",
    "reports.view",
    "automations.view",
  ],
  financeiro: ["dashboard.view", "finance.view", "finance.manage", "reports.view"],
  operacional: [
    "dashboard.view",
    "commercial.view",
    "messages.view",
    "reports.view",
    "automations.view",
    "integrations.manage",
  ],
  viewer: ["dashboard.view", "reports.view"],
};

export function normalizeAppRole(value: unknown): AppRole {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (normalized === "admin") return "admin";
  if (["vendas", "seller", "sales"].includes(normalized)) return "vendas";
  if (["financeiro", "finance", "financial"].includes(normalized)) return "financeiro";
  if (["operacional", "operations", "operator", "manager"].includes(normalized)) return "operacional";
  if (["viewer", "leitor", "read_only"].includes(normalized)) return "viewer";

  return "viewer";
}

export function toLegacyRole(role: AppRole): LegacyRole {
  if (role === "admin") return "ADMIN";
  if (role === "vendas") return "SELLER";
  return "MANAGER";
}

export function computeEffectivePermissions(input: {
  role: AppRole | string;
  overrides: PermissionOverride[];
}) {
  const role = normalizeAppRole(input.role);
  const effective = new Set(ROLE_PERMISSIONS[role]);

  for (const override of input.overrides) {
    if (!ALL_PERMISSION_KEYS.includes(override.permissionKey)) {
      continue;
    }

    if (override.allowed) {
      effective.add(override.permissionKey);
    } else {
      effective.delete(override.permissionKey);
    }
  }

  return Array.from(effective).sort();
}

export function hasPermission(permissions: Iterable<string>, permissionKey: string) {
  return new Set(permissions).has(permissionKey);
}

export async function listPermissionDefinitions() {
  return APP_PERMISSIONS;
}

export async function getUserPermissionOverrides(userId: string) {
  const result = await pool.query(
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

export async function getEffectivePermissions(userId: string, role: AppRole | string) {
  return computeEffectivePermissions({
    role,
    overrides: await getUserPermissionOverrides(userId),
  });
}

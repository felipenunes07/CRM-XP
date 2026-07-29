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
  { key: "commercial.pipeline.view", name: "Pipeline", description: "Exibir o Pipeline no menu lateral." },
  { key: "commercial.customers.view", name: "Todos os Clientes", description: "Exibir a lista e os detalhes de clientes." },
  { key: "commercial.new_customers.view", name: "Clientes Novos", description: "Exibir o acompanhamento de clientes novos." },
  { key: "commercial.reactivation.view", name: "Reativacao", description: "Exibir a area de reativacao de clientes." },
  { key: "commercial.ambassadors.view", name: "Embaixadores", description: "Exibir a area de embaixadores." },
  { key: "commercial.agenda.view", name: "Agenda", description: "Exibir a agenda comercial." },
  { key: "commercial.ideas.view", name: "Ideias e Votacao", description: "Exibir o mural de ideias." },
  { key: "commercial.prospecting.view", name: "Prospeccao", description: "Exibir a area de prospeccao." },
  { key: "commercial.labels.view", name: "Rotulos", description: "Exibir a gestao de rotulos." },
  { key: "messages.view", name: "Mensagens", description: "Visualizar mensagens, disparos e conversas." },
  { key: "messages.manage", name: "Gestao de mensagens", description: "Criar modelos, campanhas e responder conversas." },
  { key: "messages.inbox.view", name: "Mensagens", description: "Exibir a caixa de mensagens." },
  { key: "messages.events.view", name: "Inteligencia e Eventos", description: "Exibir inteligencia e eventos de conversas." },
  { key: "messages.complaints.view", name: "Reclamacoes", description: "Exibir reclamacoes de produtos." },
  { key: "messages.templates.view", name: "Templates", description: "Exibir os templates de mensagens." },
  { key: "messages.offboarding.view", name: "Offboarding", description: "Exibir os fluxos de saida da base." },
  { key: "messages.lifecycle.view", name: "Automacao de Carteira", description: "Exibir a automacao de carteira." },
  { key: "messages.broadcast.view", name: "Disparador", description: "Exibir campanhas e disparos." },
  { key: "finance.view", name: "Financeiro", description: "Visualizar credito, comprovantes e informacoes financeiras." },
  { key: "finance.manage", name: "Gestao financeira", description: "Atualizar metas e dados financeiros." },
  { key: "finance.customers.view", name: "Financeiro de Clientes", description: "Exibir saldos e detalhes financeiros de clientes." },
  { key: "finance.goals.view", name: "Metas", description: "Exibir a pagina de metas." },
  { key: "reports.view", name: "Relatorios", description: "Visualizar relatorios e analises." },
  { key: "reports.attendants.view", name: "Atendentes", description: "Exibir o desempenho de atendentes." },
  { key: "reports.whatsapp.view", name: "Relatorios WhatsApp", description: "Exibir os relatorios de atividade do WhatsApp." },
  { key: "reports.movement.view", name: "Movimentacao da Base", description: "Exibir entradas e saidas da base." },
  { key: "reports.inventory.view", name: "Estoque", description: "Exibir estoque, compras e reposicoes." },
  { key: "reports.segments.view", name: "Segmentos", description: "Exibir analises de segmentos." },
  { key: "reports.strategies.view", name: "Cruzamento de Dados", description: "Exibir estrategias e cruzamentos de dados." },
  { key: "changelog.view", name: "Changelog", description: "Exibir as novidades do CRM." },
  { key: "settings.manage", name: "Configuracoes", description: "Alterar configuracoes internas do CRM." },
  { key: "admin.panel.view", name: "Painel administrativo", description: "Acessar area administrativa." },
  { key: "admin.users.manage", name: "Gestao de usuarios", description: "Criar, editar, desativar usuarios e redefinir acessos." },
  { key: "automations.view", name: "Automações", description: "Visualizar automacoes." },
  { key: "automations.manage", name: "Gestao de automacoes", description: "Criar, editar, executar e aprovar automacoes." },
  { key: "integrations.manage", name: "Integracoes", description: "Gerenciar integracoes e instancias externas." },
  { key: "integrations.whatsapp.view", name: "Usuarios WhatsApp", description: "Exibir e gerenciar usuarios e instancias do WhatsApp." },
];

const ALL_PERMISSION_KEYS = APP_PERMISSIONS.map((permission) => permission.key);

export const ROLE_PERMISSIONS: Record<AppRole, string[]> = {
  admin: ALL_PERMISSION_KEYS,
  vendas: [
    "dashboard.view",
    "commercial.view",
    "commercial.manage",
    "commercial.pipeline.view",
    "commercial.customers.view",
    "commercial.new_customers.view",
    "commercial.reactivation.view",
    "commercial.ambassadors.view",
    "commercial.agenda.view",
    "commercial.ideas.view",
    "commercial.prospecting.view",
    "commercial.labels.view",
    "messages.view",
    "messages.manage",
    "messages.inbox.view",
    "messages.events.view",
    "messages.complaints.view",
    "messages.templates.view",
    "messages.offboarding.view",
    "messages.lifecycle.view",
    "messages.broadcast.view",
    "reports.view",
    "reports.attendants.view",
    "reports.whatsapp.view",
    "reports.movement.view",
    "reports.inventory.view",
    "reports.segments.view",
    "reports.strategies.view",
    "automations.view",
    "changelog.view",
  ],
  financeiro: [
    "dashboard.view",
    "finance.view",
    "finance.manage",
    "finance.customers.view",
    "finance.goals.view",
    "reports.view",
    "reports.inventory.view",
    "reports.segments.view",
    "reports.strategies.view",
    "changelog.view",
  ],
  operacional: [
    "dashboard.view",
    "commercial.view",
    "commercial.pipeline.view",
    "commercial.customers.view",
    "commercial.new_customers.view",
    "commercial.reactivation.view",
    "commercial.ambassadors.view",
    "commercial.agenda.view",
    "commercial.ideas.view",
    "commercial.prospecting.view",
    "messages.view",
    "messages.inbox.view",
    "messages.events.view",
    "messages.complaints.view",
    "messages.templates.view",
    "messages.offboarding.view",
    "messages.lifecycle.view",
    "messages.broadcast.view",
    "reports.view",
    "reports.attendants.view",
    "reports.whatsapp.view",
    "reports.movement.view",
    "reports.inventory.view",
    "reports.segments.view",
    "reports.strategies.view",
    "automations.view",
    "integrations.manage",
    "integrations.whatsapp.view",
    "changelog.view",
  ],
  viewer: [
    "dashboard.view",
    "reports.view",
    "reports.attendants.view",
    "reports.whatsapp.view",
    "reports.movement.view",
    "reports.inventory.view",
    "reports.segments.view",
    "reports.strategies.view",
    "changelog.view",
  ],
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

export interface NavigationAccessItem {
  label: string;
  path: string;
  permissionKey: string;
}

export interface NavigationAccessFolder {
  key: string;
  label: string;
  description: string;
  items: NavigationAccessItem[];
}

export const navigationAccessFolders: NavigationAccessFolder[] = [
  {
    key: "principal",
    label: "Principal",
    description: "Telas principais que aparecem diretamente no menu.",
    items: [
      { label: "Dashboard", path: "/", permissionKey: "dashboard.view" },
      { label: "Pipeline", path: "/pipeline", permissionKey: "commercial.pipeline.view" },
      { label: "Metas", path: "/metas", permissionKey: "finance.goals.view" },
      { label: "Atendentes", path: "/atendentes", permissionKey: "reports.attendants.view" },
    ],
  },
  {
    key: "clientes",
    label: "Clientes",
    description: "Cadastros, acompanhamento e financeiro dos clientes.",
    items: [
      { label: "Todos os Clientes", path: "/clientes", permissionKey: "commercial.customers.view" },
      { label: "Financeiro", path: "/clientes/financeiro", permissionKey: "finance.customers.view" },
      { label: "Clientes Novos", path: "/clientes-novos", permissionKey: "commercial.new_customers.view" },
      { label: "Reativacao", path: "/reativacao", permissionKey: "commercial.reactivation.view" },
      { label: "Embaixadores", path: "/embaixadores", permissionKey: "commercial.ambassadors.view" },
    ],
  },
  {
    key: "comunicacao",
    label: "Comunicacao",
    description: "Mensagens, inteligencia, campanhas e automacoes.",
    items: [
      { label: "Mensagens", path: "/mensagens", permissionKey: "messages.inbox.view" },
      { label: "Inteligencia / Eventos", path: "/eventos", permissionKey: "messages.events.view" },
      { label: "Reclamacoes", path: "/reclamacoes-produto", permissionKey: "messages.complaints.view" },
      { label: "Templates", path: "/templates", permissionKey: "messages.templates.view" },
      { label: "Offboarding", path: "/saida-base", permissionKey: "messages.offboarding.view" },
      { label: "Automacao de Carteira", path: "/automacao-carteira", permissionKey: "messages.lifecycle.view" },
      { label: "Automacoes", path: "/automacoes", permissionKey: "automations.view" },
      { label: "Disparador", path: "/disparador", permissionKey: "messages.broadcast.view" },
    ],
  },
  {
    key: "relatorios",
    label: "Relatorios",
    description: "Relatorios operacionais e analises do negocio.",
    items: [
      { label: "Relatorios WhatsApp", path: "/atividade-whatsapp", permissionKey: "reports.whatsapp.view" },
      { label: "Movimentacao da Base", path: "/movimentacao", permissionKey: "reports.movement.view" },
      { label: "Estoque", path: "/estoque", permissionKey: "reports.inventory.view" },
      { label: "Segmentos", path: "/segmentos", permissionKey: "reports.segments.view" },
      { label: "Rotulos", path: "/rotulos", permissionKey: "commercial.labels.view" },
    ],
  },
  {
    key: "estrategias",
    label: "Estrategias",
    description: "Cruzamentos e oportunidades comerciais.",
    items: [
      { label: "Cruzamento de Dados", path: "/estrategias", permissionKey: "reports.strategies.view" },
    ],
  },
  {
    key: "mais",
    label: "Mais",
    description: "Ferramentas complementares do CRM.",
    items: [
      { label: "Agenda", path: "/agenda", permissionKey: "commercial.agenda.view" },
      { label: "Ideias / Votacao", path: "/ideias-votacao", permissionKey: "commercial.ideas.view" },
      { label: "Prospeccao", path: "/prospeccao", permissionKey: "commercial.prospecting.view" },
      { label: "Changelog", path: "/novidades", permissionKey: "changelog.view" },
    ],
  },
  {
    key: "admin",
    label: "Admin",
    description: "Usuarios, integracoes e configuracoes administrativas.",
    items: [
      { label: "Usuarios WhatsApp", path: "/usuarios", permissionKey: "integrations.whatsapp.view" },
      { label: "Acessos do CRM", path: "/admin/usuarios", permissionKey: "admin.users.manage" },
    ],
  },
];

const permissionByPath = new Map(
  navigationAccessFolders.flatMap((folder) => folder.items.map((item) => [item.path, item.permissionKey] as const)),
);

export function permissionForPath(path: string) {
  const exactPermission = permissionByPath.get(path);
  if (exactPermission) return exactPermission;
  if (path.startsWith("/clientes/financeiro/")) return "finance.customers.view";
  if (path.startsWith("/clientes/")) return "commercial.customers.view";
  if (path === "/config/whatsapp") return "integrations.whatsapp.view";
  return null;
}

export const navigationPermissionKeys = new Set(
  navigationAccessFolders.flatMap((folder) => folder.items.map((item) => item.permissionKey)),
);

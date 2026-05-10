import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WhatsappInstanceItem } from "@olist-crm/shared";
import {
  CheckCircle2,
  Copy,
  Grid3X3,
  List,
  MoreVertical,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { API_BASE_URL, api } from "../lib/api";

type UserTab = "monitorados" | "gestores" | "grupos";
type StatusFilter = "all" | "ACTIVE" | "DISCONNECTED" | "PAUSED";

function statusLabel(status: WhatsappInstanceItem["status"]) {
  if (status === "ACTIVE") {
    return "Conectado";
  }

  if (status === "DISCONNECTED") {
    return "Desconectado";
  }

  return "Desativado";
}

function statusClass(status: WhatsappInstanceItem["status"]) {
  if (status === "ACTIVE") {
    return "connected";
  }

  if (status === "DISCONNECTED") {
    return "disconnected";
  }

  return "paused";
}

function buildCsv(instances: WhatsappInstanceItem[]) {
  const rows = [
    ["nome", "email", "telefone", "instancia", "status", "setor", "gestor"],
    ...instances.map((instance) => [
      instance.displayLabel,
      instance.assignedUserName ? `${instance.assignedUserName.toLocaleLowerCase("pt-BR").replace(/\s+/g, ".")}@whats.ws` : "",
      instance.phoneNumber ?? "",
      instance.instanceName,
      statusLabel(instance.status),
      "Comercial",
      instance.assignedUserName ?? "Gestor comercial",
    ]),
  ];

  return rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

function downloadCsv(instances: WhatsappInstanceItem[]) {
  const blob = new Blob([buildCsv(instances)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "usuarios-monitorados-whatsapp.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function UserCard({
  instance,
  onDelete,
  onConfigure,
  deleting,
  configuring,
}: {
  instance: WhatsappInstanceItem;
  onDelete: () => void;
  onConfigure: () => void;
  deleting: boolean;
  configuring: boolean;
}) {
  const email =
    instance.assignedUserName?.trim()
      ? `${instance.assignedUserName.toLocaleLowerCase("pt-BR").replace(/\s+/g, ".")}@whats.ws`
      : `${instance.instanceName}@whats.ws`;

  return (
    <article className="wa-user-card">
      <button type="button" className="wa-user-menu" title="Mais opcoes">
        <MoreVertical size={18} />
      </button>
      <span className="wa-user-photo">
        {instance.profilePictureUrl ? (
          <img
            src={instance.profilePictureUrl}
            alt=""
            loading="lazy"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        ) : null}
        <UserRound size={28} />
      </span>
      <h3>{instance.displayLabel}</h3>
      <p>{email}</p>
      <span>{instance.phoneNumber || instance.instanceName}</span>

      <div className="wa-user-tags">
        <span className="wa-user-tag">Comercial</span>
        <span className={`wa-user-status ${statusClass(instance.status)}`}>{statusLabel(instance.status)}</span>
      </div>

      <div className="wa-user-foot">
        <button
          type="button"
          className="wa-user-configure"
          onClick={onConfigure}
          disabled={configuring}
          title="Configurar Webhook e Grupos automaticamente"
        >
          {configuring ? "..." : "Configurar Agora"}
        </button>
        <button type="button" className="wa-user-remove" onClick={onDelete} disabled={deleting} title="Remover usuario">
          <Trash2 size={15} />
        </button>
      </div>
    </article>
  );
}

export function WhatsappConfigPage() {
  const auth = useAuth() as { token: string | null; user: { role: string } | null };
  const { token, user } = auth;
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [activeTab, setActiveTab] = useState<UserTab>("monitorados");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const instancesQuery = useQuery({
    queryKey: ["whatsapp-instances"],
    queryFn: () => api.whatsappInstances(token!),
    enabled: Boolean(token),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteWhatsappInstance(token!, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
    },
  });

  const configureMutation = useMutation({
    mutationFn: (id: string) => api.configureWhatsappInstance(token!, id),
    onSuccess: () => {
      alert("Instancia configurada com sucesso na Evolution API!");
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
    },
    onError: (error) => {
      alert(`Erro ao configurar instancia: ${error.message}`);
    },
  });

  const instances = instancesQuery.data ?? [];
  const connectedCount = instances.filter((instance) => instance.status === "ACTIVE").length;
  const disconnectedCount = instances.filter((instance) => instance.status === "DISCONNECTED").length;
  const pausedCount = instances.filter((instance) => instance.status === "PAUSED").length;

  const visibleInstances = useMemo(() => {
    if (activeTab === "grupos") {
      return instances;
    }

    if (activeTab !== "monitorados") {
      return [];
    }

    if (statusFilter === "all") {
      return instances;
    }

    return instances.filter((instance) => instance.status === statusFilter);
  }, [activeTab, instances, statusFilter]);

  const webhookBaseUrl = (API_BASE_URL || window.location.origin).replace(/\/$/, "");
  const webhookUrl = `${webhookBaseUrl}/api/webhooks/evolution`;

  function copyWebhook() {
    navigator.clipboard.writeText(webhookUrl).catch(() => undefined);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 1800);
  }

  if (user?.role !== "ADMIN" && user?.role !== "MANAGER") {
    return (
      <div className="page-stack">
        <div className="panel">
          <h2>Acesso negado</h2>
          <p>Apenas administradores e gestores podem configurar usuários monitorados.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="wa-users-page">
      <header className="wa-users-header">
        <div>
          <h2>Usuários</h2>
          <p>Controle total sobre usuários monitorados, status de conexão, setores e gestores responsáveis.</p>
        </div>

        <div className="wa-users-actions">
          <button type="button" className="wa-secondary-action" title="Importar usuarios via CSV">
            <Upload size={16} />
            Importar via CSV
          </button>
          <button type="button" className="wa-secondary-action" onClick={() => downloadCsv(instances)}>
            Exportar como CSV
          </button>
        </div>
      </header>

      <section className="wa-users-toolbar">
        <div className="wa-users-tabs" role="tablist" aria-label="Abas de usuarios">
          {[
            ["monitorados", "Monitorados"],
            ["gestores", "Gestores"],
            ["grupos", "Grupos"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={activeTab === id ? "active" : ""}
              onClick={() => setActiveTab(id as UserTab)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="wa-users-filters">
          {[
            ["all", "Grupos", instances.length],
            ["ACTIVE", "Conectado", connectedCount],
            ["DISCONNECTED", "Desconectado", disconnectedCount],
            ["PAUSED", "Desativado", pausedCount],
          ].map(([id, label, count]) => (
            <button
              key={String(id)}
              type="button"
              className={statusFilter === id ? "active" : ""}
              onClick={() => setStatusFilter(id as StatusFilter)}
            >
              {label}
              <span>{count}</span>
            </button>
          ))}
        </div>

        <div className="wa-users-view-actions">
          <button type="button" className="wa-icon-button active" title="Cards">
            <Grid3X3 size={18} />
          </button>
          <button type="button" className="wa-icon-button" title="Lista">
            <List size={18} />
          </button>
          <button type="button" className="wa-add-user" onClick={() => setShowAddModal(true)}>
            <Plus size={17} />
            Adicionar
          </button>
        </div>
      </section>

      <section className="wa-webhook-strip">
        <div>
          <ShieldCheck size={20} />
          <div>
            <strong>Evolution API</strong>
            <span>{webhookUrl}</span>
          </div>
        </div>
        <button type="button" className="wa-secondary-action compact" onClick={copyWebhook}>
          {copiedWebhook ? <CheckCircle2 size={15} /> : <Copy size={15} />}
          {copiedWebhook ? "Copiado" : "Copiar webhook"}
        </button>
      </section>

      {instancesQuery.isLoading ? (
        <div className="page-loading">Carregando usuários monitorados...</div>
      ) : visibleInstances.length ? (
        <section className="wa-users-grid">
          {visibleInstances.map((instance) => (
            <UserCard
              key={instance.id}
              instance={instance}
              deleting={deleteMutation.isPending}
              configuring={configureMutation.isPending && configureMutation.variables === instance.id}
              onDelete={() => {
                if (confirm("Tem certeza que deseja remover este usuário monitorado?")) {
                  deleteMutation.mutate(instance.id);
                }
              }}
              onConfigure={() => {
                configureMutation.mutate(instance.id);
              }}
            />
          ))}
        </section>
      ) : (
        <section className="wa-users-empty">
          <strong>Nenhum usuário nesta visão</strong>
          <span>Adicione uma instância da Evolution para começar a monitoria.</span>
        </section>
      )}

      {showAddModal ? <AddInstanceModal onClose={() => setShowAddModal(false)} /> : null}
    </div>
  );
}

function AddInstanceModal({ onClose }: { onClose: () => void }) {
  const auth = useAuth() as { token: string | null };
  const queryClient = useQueryClient();

  const [instanceName, setInstanceName] = useState("");
  const [displayLabel, setDisplayLabel] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [evolutionBaseUrl, setEvolutionBaseUrl] = useState("");
  const [evolutionApiKey, setEvolutionApiKey] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  const defaultsQuery = useQuery({
    queryKey: ["whatsapp-defaults"],
    queryFn: () => api.whatsappInstanceDefaults(auth.token!),
    enabled: Boolean(auth.token),
    staleTime: Infinity,
  });

  useEffect(() => {
    if (defaultsQuery.data) {
      if (!evolutionBaseUrl) setEvolutionBaseUrl(defaultsQuery.data.baseUrl);
    }
  }, [defaultsQuery.data, evolutionBaseUrl]);

  const createMutation = useMutation({
    mutationFn: () =>
      api.createWhatsappInstance(auth.token!, {
        instanceName,
        displayLabel,
        phoneNumber,
        evolutionBaseUrl,
        evolutionApiKey,
        isDefault,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
      onClose();
    },
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container pipeline-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>Conectar Evolution API</h3>
          <button type="button" className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <label>
            Nome do usuário *
            <input value={displayLabel} onChange={(event) => setDisplayLabel(event.target.value)} placeholder="Ex: Amanda Comercial" />
          </label>

          <label>
            Nome da instância *
            <input value={instanceName} onChange={(event) => setInstanceName(event.target.value)} placeholder="Ex: comercial-amanda" />
          </label>

          <label>
            API Key *
            <input type="password" value={evolutionApiKey} onChange={(event) => setEvolutionApiKey(event.target.value)} placeholder="Cole a API Key" />
          </label>

          <label>
            URL Base da Evolution *
            <input value={evolutionBaseUrl} onChange={(event) => setEvolutionBaseUrl(event.target.value)} placeholder="https://..." />
          </label>

          <label>
            Telefone
            <input value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} placeholder="5511999999999" />
          </label>

          <label className="wa-checkbox-label">
            <input type="checkbox" checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} />
            Definir como instância padrão
          </label>

          {createMutation.isError ? <div className="page-error">{(createMutation.error as Error).message}</div> : null}
        </div>

        <div className="modal-footer">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={!instanceName || !displayLabel || !evolutionBaseUrl || !evolutionApiKey || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            <Plus size={16} />
            {createMutation.isPending ? "Salvando..." : "Salvar usuário"}
          </button>
        </div>
      </div>
    </div>
  );
}

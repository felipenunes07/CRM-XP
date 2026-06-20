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
import { healthInfo } from "../lib/whatsappHealth";

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

/**
 * Status "efetivo" usado nos contadores e no filtro das abas. Para instâncias
 * Evolution leva em conta a saúde real (bolinha) em vez do status salvo no
 * banco — que o watchdog não altera de propósito (senão pararia de monitorar).
 */
function effectiveStatus(instance: WhatsappInstanceItem): StatusFilter {
  if (instance.status === "PAUSED") {
    return "PAUSED";
  }
  if (instance.provider === "EVOLUTION") {
    return healthInfo(instance).down ? "DISCONNECTED" : "ACTIVE";
  }
  return instance.status;
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
  onReconnect,
  deleting,
  configuring,
}: {
  instance: WhatsappInstanceItem;
  onDelete: () => void;
  onConfigure: () => void;
  onReconnect: () => void;
  deleting: boolean;
  configuring: boolean;
}) {
  const email =
    instance.assignedUserName?.trim()
      ? `${instance.assignedUserName.toLocaleLowerCase("pt-BR").replace(/\s+/g, ".")}@whats.ws`
      : `${instance.instanceName}@whats.ws`;

  const isEvolution = instance.provider === "EVOLUTION";
  const health = healthInfo(instance);

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
        {isEvolution ? <span className={`wa-health-dot ${health.tone}`} title={health.title} /> : null}
      </span>
      <h3>{instance.displayLabel}</h3>
      <p>{email}</p>
      <span>{instance.phoneNumber || instance.instanceName}</span>

      <div className="wa-user-tags">
        <span className="wa-user-tag">Comercial</span>
        <span className="wa-user-tag provider" style={{ background: instance.provider === "UAZAPI" ? "#dbeafe" : "#fef3c7", color: instance.provider === "UAZAPI" ? "#1e40af" : "#92400e" }}>
          {instance.provider === "UAZAPI" ? "UazAPI" : "Evolution"}
        </span>
        {isEvolution ? (
          <span className={`wa-user-status health-${health.tone}`} title={health.title}>{health.label}</span>
        ) : (
          <span className={`wa-user-status ${statusClass(instance.status)}`}>{statusLabel(instance.status)}</span>
        )}
      </div>

      <div className="wa-user-foot">
        {isEvolution ? (
          health.down ? (
            <button
              type="button"
              className="wa-user-configure reconnect"
              onClick={onReconnect}
              title="Ler o QR code e reconectar este WhatsApp"
            >
              Reconectar
            </button>
          ) : (
            <button
              type="button"
              className="wa-user-configure"
              onClick={onConfigure}
              disabled={configuring}
              title="Configurar Webhook e Grupos automaticamente"
            >
              {configuring ? "..." : "Configurar Agora"}
            </button>
          )
        ) : (
          <button
            type="button"
            className="wa-user-configure"
            disabled
            style={{ opacity: 0.6, cursor: "not-allowed", backgroundColor: "#f1f5f9", color: "#64748b" }}
            title="UazAPI não requer configuração de webhook manual"
          >
            UazAPI Ativo
          </button>
        )}
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
  const [reconnectInstance, setReconnectInstance] = useState<WhatsappInstanceItem | null>(null);

  const instancesQuery = useQuery({
    queryKey: ["whatsapp-instances"],
    queryFn: () => api.whatsappInstances(token!),
    enabled: Boolean(token),
    // Mantém a bolinha de status fresca sem precisar recarregar a página.
    refetchInterval: 60_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteWhatsappInstance(token!, id),
    onSuccess: () => {
      alert("Usuário monitorado removido com sucesso!");
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-monitor-conversations"] });
    },
    onError: (error: any) => {
      alert(`Erro ao remover usuário monitorado: ${error.message || error}`);
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
  const connectedCount = instances.filter((instance) => effectiveStatus(instance) === "ACTIVE").length;
  const disconnectedCount = instances.filter((instance) => effectiveStatus(instance) === "DISCONNECTED").length;
  const pausedCount = instances.filter((instance) => effectiveStatus(instance) === "PAUSED").length;

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

    return instances.filter((instance) => effectiveStatus(instance) === statusFilter);
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
              onReconnect={() => setReconnectInstance(instance)}
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
      {reconnectInstance ? (
        <ReconnectModal
          instance={reconnectInstance}
          token={token!}
          onClose={() => setReconnectInstance(null)}
          onConnected={() => {
            void queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
          }}
        />
      ) : null}
    </div>
  );
}

function ReconnectModal({
  instance,
  token,
  onClose,
  onConnected,
}: {
  instance: WhatsappInstanceItem;
  token: string;
  onClose: () => void;
  onConnected: () => void;
}) {
  // Tempo de vida de cada QR da Evolution antes de expirar (em segundos).
  const QR_TTL_SECONDS = 40;

  const [qr, setQr] = useState<{ base64: string | null; pairingCode: string | null } | null>(null);
  const [phase, setPhase] = useState<"loading" | "waiting" | "connected" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(QR_TTL_SECONDS);

  // 1. Dispara a conexão NA MESMA instância (Evolution /instance/connect/<nome>),
  // só renova o QR — não recria a instância — e devolve o QR / pairing code.
  async function requestQr() {
    setPhase("loading");
    setErrorMessage(null);
    try {
      const result = await api.connectWhatsappInstance(token, instance.id);
      if (result.state === "open") {
        setPhase("connected");
        onConnected();
        return;
      }
      setQr({ base64: result.base64, pairingCode: result.pairingCode });
      setSecondsLeft(QR_TTL_SECONDS);
      setPhase("waiting");
    } catch (error) {
      setErrorMessage((error as Error).message || "Falha ao gerar o QR code.");
      setPhase("error");
    }
  }

  useEffect(() => {
    void requestQr();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance.id]);

  // 2. Enquanto espera o scan: conta o tempo de expiração (1s), verifica a
  // conexão a cada 3s e, ao zerar o cronômetro, gera um QR novo automaticamente.
  useEffect(() => {
    if (phase !== "waiting") {
      return;
    }
    let cancelled = false;
    let tick = 0;
    const timer = setInterval(async () => {
      if (cancelled) return;
      tick += 1;

      setSecondsLeft((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          clearInterval(timer);
          void requestQr();
          return 0;
        }
        return next;
      });

      if (tick % 3 === 0) {
        try {
          const conn = await api.whatsappInstanceConnection(token, instance.id);
          if (!cancelled && conn.state === "open") {
            setPhase("connected");
            onConnected();
            clearInterval(timer);
          }
        } catch {
          // Ignora erros transitórios de polling.
        }
      }
    }, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, instance.id, token]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container wa-qr-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>Reconectar {instance.displayLabel}</h3>
          <button type="button" className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body wa-qr-body">
          {phase === "loading" ? <p>Gerando QR code...</p> : null}

          {phase === "connected" ? (
            <div className="wa-qr-success">
              <CheckCircle2 size={48} />
              <strong>WhatsApp reconectado!</strong>
              <span>As mensagens voltarão a ser recebidas normalmente.</span>
            </div>
          ) : null}

          {phase === "error" ? (
            <div className="wa-qr-error">
              <p>{errorMessage}</p>
              <button type="button" className="primary-button" onClick={() => void requestQr()}>
                Tentar novamente
              </button>
            </div>
          ) : null}

          {phase === "waiting" ? (
            <>
              <p className="wa-qr-instructions">
                Abra o WhatsApp no celular → <strong>Aparelhos conectados</strong> → <strong>Conectar um aparelho</strong> e aponte para o QR abaixo.
              </p>
              {qr?.base64 ? (
                <img className="wa-qr-image" src={qr.base64} alt="QR code para reconectar o WhatsApp" />
              ) : (
                <p>QR code indisponível. Tente novamente.</p>
              )}
              {qr?.pairingCode ? (
                <p className="wa-qr-pairing">
                  Ou use o código de pareamento: <strong>{qr.pairingCode}</strong>
                </p>
              ) : null}
              <p className={`wa-qr-expiry ${secondsLeft <= 10 ? "warning" : ""}`}>
                Este QR expira em <strong>{secondsLeft}s</strong>
                {secondsLeft <= 10 ? " — gerando um novo..." : ""}
              </p>
              <p className="wa-qr-waiting">Aguardando leitura...</p>
            </>
          ) : null}
        </div>

        <div className="modal-footer">
          <button type="button" className="secondary-button" onClick={onClose}>
            {phase === "connected" ? "Fechar" : "Cancelar"}
          </button>
          {phase === "waiting" ? (
            <button type="button" className="primary-button" onClick={() => void requestQr()}>
              Gerar novo QR
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AddInstanceModal({ onClose }: { onClose: () => void }) {
  const auth = useAuth() as { token: string | null };
  const queryClient = useQueryClient();

  const [provider, setProvider] = useState<"EVOLUTION" | "UAZAPI">("EVOLUTION");
  const [instanceName, setInstanceName] = useState("");
  const [displayLabel, setDisplayLabel] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [evolutionBaseUrl, setEvolutionBaseUrl] = useState("");
  const [evolutionApiKey, setEvolutionApiKey] = useState("");
  const [uazapiBaseUrl, setUazapiBaseUrl] = useState("");
  const [uazapiToken, setUazapiToken] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  const defaultsQuery = useQuery({
    queryKey: ["whatsapp-defaults"],
    queryFn: () => api.whatsappInstanceDefaults(auth.token!),
    enabled: Boolean(auth.token && provider === "EVOLUTION"),
    staleTime: Infinity,
  });

  useEffect(() => {
    if (defaultsQuery.data && provider === "EVOLUTION") {
      if (!evolutionBaseUrl) setEvolutionBaseUrl(defaultsQuery.data.baseUrl);
    }
  }, [defaultsQuery.data, evolutionBaseUrl, provider]);

  const createMutation = useMutation({
    mutationFn: () =>
      api.createWhatsappInstance(auth.token!, {
        provider,
        instanceName,
        displayLabel,
        phoneNumber,
        evolutionBaseUrl: provider === "EVOLUTION" ? evolutionBaseUrl : undefined,
        evolutionApiKey: provider === "EVOLUTION" ? evolutionApiKey : undefined,
        uazapiBaseUrl: provider === "UAZAPI" ? uazapiBaseUrl : undefined,
        uazapiToken: provider === "UAZAPI" ? uazapiToken : undefined,
        isDefault,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
      onClose();
    },
  });

  const isSubmitDisabled =
    !instanceName ||
    !displayLabel ||
    (provider === "EVOLUTION" && (!evolutionBaseUrl || !evolutionApiKey)) ||
    (provider === "UAZAPI" && (!uazapiBaseUrl || !uazapiToken)) ||
    createMutation.isPending;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container pipeline-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>Conectar Instância WhatsApp</h3>
          <button type="button" className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <label>
            Provedor *
            <select
              value={provider}
              onChange={(event) => setProvider(event.target.value as "EVOLUTION" | "UAZAPI")}
              style={{
                width: "100%",
                padding: "0.625rem 0.75rem",
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
                fontSize: "0.9rem",
                background: "#fff",
                marginTop: "4px"
              }}
            >
              <option value="EVOLUTION">Evolution API</option>
              <option value="UAZAPI">UazAPI</option>
            </select>
          </label>

          <label>
            Nome do usuário *
            <input value={displayLabel} onChange={(event) => setDisplayLabel(event.target.value)} placeholder="Ex: Amanda Comercial" />
          </label>

          <label>
            Nome da instância *
            <input value={instanceName} onChange={(event) => setInstanceName(event.target.value)} placeholder="Ex: comercial-amanda" />
          </label>

          {provider === "EVOLUTION" ? (
            <>
              <label>
                API Key *
                <input type="password" value={evolutionApiKey} onChange={(event) => setEvolutionApiKey(event.target.value)} placeholder="Cole a API Key" />
              </label>

              <label>
                URL Base da Evolution *
                <input value={evolutionBaseUrl} onChange={(event) => setEvolutionBaseUrl(event.target.value)} placeholder="https://..." />
              </label>
            </>
          ) : (
            <>
              <label>
                Token da UazAPI *
                <input type="password" value={uazapiToken} onChange={(event) => setUazapiToken(event.target.value)} placeholder="Cole o token da UazAPI" />
              </label>

              <label>
                URL Base da UazAPI *
                <input value={uazapiBaseUrl} onChange={(event) => setUazapiBaseUrl(event.target.value)} placeholder="https://..." />
              </label>
            </>
          )}

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
            disabled={isSubmitDisabled}
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

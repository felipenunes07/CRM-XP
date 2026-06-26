import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import { api, type LifecycleStage } from "../lib/api";

const STAGE_ORDER: LifecycleStage[] = ["ATENCAO_1", "ATENCAO_2", "INATIVO", "INATIVO_30"];

const STAGE_COLOR: Record<LifecycleStage, string> = {
  ATENCAO_1: "#ca8a04",
  ATENCAO_2: "#ea580c",
  INATIVO: "#dc2626",
  INATIVO_30: "#7f1d1d",
};

const ACTION_LABEL: Record<string, string> = {
  SIMULATED: "Simulado",
  SENT: "Enviado",
  SKIPPED: "Pulado",
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function LifecyclePage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  const overviewQuery = useQuery({
    queryKey: ["lifecycle-overview"],
    queryFn: () => api.lifecycleOverview(token!),
    enabled: Boolean(token),
  });

  const configQuery = useQuery({
    queryKey: ["lifecycle-config"],
    queryFn: () => api.lifecycleConfig(token!),
    enabled: Boolean(token),
  });

  const templatesQuery = useQuery({
    queryKey: ["message-templates"],
    queryFn: () => api.messageTemplates(token!),
    enabled: Boolean(token),
  });

  const saveConfig = useMutation({
    mutationFn: ({ stage, templateId, enabled }: { stage: LifecycleStage; templateId: string | null; enabled: boolean }) =>
      api.setLifecycleConfig(token!, stage, templateId, enabled),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["lifecycle-config"] }),
  });

  const runNow = useMutation({
    mutationFn: () => api.lifecycleRun(token!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["lifecycle-overview"] });
    },
  });

  const config = configQuery.data ?? [];
  const templates = templatesQuery.data ?? [];
  const overview = overviewQuery.data;

  const stageConfig = useMemo(() => new Map(config.map((c) => [c.stage, c])), [config]);

  return (
    <div className="page-stack">
      <section className="dashboard-hero-premium" style={{ minHeight: "auto", padding: "1.75rem 2.25rem", borderRadius: "12px" }}>
        <div className="hero-premium-content">
          <div className="hero-premium-copy">
            <div className="premium-badge">Automação de Carteira</div>
            <h2 className="premium-title">Régua de Relacionamento</h2>
            <p className="premium-subtitle">
              Quando um cliente cruza um estágio (Atenção 1 → Atenção 2 → Inativo → Inativo +30), o sistema dispara o
              template configurado direto pro cliente. Está em <strong>modo simulação</strong>: registra o que mandaria,
              sem enviar, até você validar.
            </p>
          </div>
        </div>
      </section>

      {/* Painel de números */}
      {overview ? (
        <section className="panel">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "1rem" }}>
            {STAGE_ORDER.map((stage) => (
              <div key={stage} className="panel-row" style={{ borderLeft: `4px solid ${STAGE_COLOR[stage]}`, display: "block" }}>
                <p style={{ fontSize: "0.78rem", opacity: 0.65 }}>{stageConfig.get(stage)?.label ?? stage}</p>
                <p style={{ fontSize: "1.6rem", fontWeight: 700 }}>{overview.stageCounts[stage] ?? 0}</p>
              </div>
            ))}
            <div className="panel-row" style={{ borderLeft: "4px solid #64748b", display: "block" }}>
              <p style={{ fontSize: "0.78rem", opacity: 0.65 }}>Descartados</p>
              <p style={{ fontSize: "1.6rem", fontWeight: 700 }}>{overview.discardedCount}</p>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
            <p style={{ fontSize: "0.85rem", opacity: 0.7 }}>
              {overview.pendingCandidates} cliente(s) prontos para serem processados no próximo ciclo.
            </p>
            <button type="button" className="btn-secondary" disabled={runNow.isPending} onClick={() => runNow.mutate()}>
              {runNow.isPending ? "Rodando..." : "Rodar simulação agora"}
            </button>
          </div>
          {runNow.data ? (
            <p style={{ fontSize: "0.85rem", marginTop: "0.5rem", color: "#0f766e" }}>
              Processados: {runNow.data.processed} · Simulados: {runNow.data.simulated} · Enviados: {runNow.data.sent} ·
              Pulados: {runNow.data.skipped}
              {runNow.data.simulationOnly ? " (modo simulação)" : " (envio real)"}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* Config: template por estágio */}
      <section className="panel">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Template de cada estágio</h3>
            <p className="panel-subcopy">
              Escolha qual mensagem o sistema manda quando o cliente entra em cada estágio. Crie as mensagens na tela de{" "}
              <strong>Templates</strong>.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {STAGE_ORDER.map((stage) => {
            const c = stageConfig.get(stage);
            return (
              <div
                key={stage}
                className="panel-row"
                style={{ display: "grid", gridTemplateColumns: "220px 1fr auto", gap: "1rem", alignItems: "center", borderLeft: `4px solid ${STAGE_COLOR[stage]}` }}
              >
                <span style={{ fontWeight: 600 }}>{c?.label ?? stage}</span>
                <select
                  className="input-field"
                  value={c?.templateId ?? ""}
                  onChange={(e) =>
                    saveConfig.mutate({ stage, templateId: e.target.value || null, enabled: c?.enabled ?? true })
                  }
                >
                  <option value="">— Sem template —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
                <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", whiteSpace: "nowrap" }}>
                  <input
                    type="checkbox"
                    checked={c?.enabled ?? true}
                    onChange={(e) => saveConfig.mutate({ stage, templateId: c?.templateId ?? null, enabled: e.target.checked })}
                    style={{ width: 16, height: 16 }}
                  />
                  Ativo
                </label>
              </div>
            );
          })}
        </div>
      </section>

      {/* Acompanhamento: histórico */}
      <section className="panel">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Últimas movimentações</h3>
            <p className="panel-subcopy">O que o sistema registrou (ou mandaria) por cliente, do mais recente.</p>
          </div>
        </div>

        {overviewQuery.isLoading ? (
          <div className="page-loading">Carregando...</div>
        ) : !overview || overview.recentEvents.length === 0 ? (
          <div className="panel-empty">Nada registrado ainda. Rode a simulação para ver o que aconteceria.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {overview.recentEvents.map((ev, i) => (
              <div
                key={`${ev.customerId}-${ev.stage}-${i}`}
                className="panel-row"
                style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: "1rem", alignItems: "center", borderLeft: `4px solid ${STAGE_COLOR[ev.stage]}` }}
              >
                <span className="badge" style={{ background: `${STAGE_COLOR[ev.stage]}1a`, color: STAGE_COLOR[ev.stage], fontWeight: 600, whiteSpace: "nowrap" }}>
                  {stageConfig.get(ev.stage)?.label?.split(" (")[0] ?? ev.stage}
                </span>
                <div>
                  <p style={{ fontWeight: 600 }}>{ev.displayName}</p>
                  <p style={{ fontSize: "0.8rem", opacity: 0.65 }}>
                    {ev.templateTitle ? `Template: ${ev.templateTitle}` : "Sem template"} ·{" "}
                    {ev.daysSinceLastPurchase ?? "?"} dias parado
                  </p>
                </div>
                <span style={{ fontSize: "0.8rem", opacity: 0.7 }}>{ACTION_LABEL[ev.action] ?? ev.action}</span>
                <span style={{ fontSize: "0.78rem", opacity: 0.55, whiteSpace: "nowrap" }}>{formatDateTime(ev.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

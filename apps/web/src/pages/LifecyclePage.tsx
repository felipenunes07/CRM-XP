import { Fragment, useMemo, type CSSProperties, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Brain,
  CheckCircle2,
  Clock,
  Eye,
  MessageCircle,
  Play,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api, type LifecycleStage, type ScheduledLifecycleEntry } from "../lib/api";

const STAGE_ORDER: LifecycleStage[] = ["ATENCAO_1", "ATENCAO_2", "INATIVO", "INATIVO_30"];

type StageMeta = { short: string; range: string; color: string; signal: string };
const STAGE_META: Record<LifecycleStage, StageMeta> = {
  ATENCAO_1: { short: "Atenção 1", range: "31–60 dias", color: "#22d3ee", signal: "timing inicial" },
  ATENCAO_2: { short: "Atenção 2", range: "61–89 dias", color: "#60a5fa", signal: "risco crescendo" },
  INATIVO: { short: "Inativo", range: "90–119 dias", color: "#a78bfa", signal: "janela crítica" },
  INATIVO_30: { short: "Inativo +30", range: "120+ dias", color: "#f472b6", signal: "prioridade alta" },
};

const fmtNumber = (value: number | null | undefined) =>
  typeof value === "number" ? new Intl.NumberFormat("pt-BR").format(value) : "—";

const fmtDate = (iso: string) => {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}` : iso;
};

const fmtDT = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const initials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
};

const untilLabel = (days: number) => {
  if (days <= 0) return "hoje";
  if (days === 1) return "amanhã";
  return `em ${days} dias`;
};

const watchStatus = (entry: ScheduledLifecycleEntry) => {
  if (!entry.templateTitle) return { label: "Configurar template", tone: "missing" };
  if (entry.daysUntil <= 0) return { label: "Pronto para disparo", tone: "ready" };
  if (entry.daysUntil <= 3) return { label: "Janela próxima", tone: "hot" };
  return { label: "Aguardando timing", tone: "waiting" };
};

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
  const scheduledQuery = useQuery({
    queryKey: ["lifecycle-scheduled"],
    queryFn: () => api.lifecycleScheduled(token!, 14),
    enabled: Boolean(token),
  });
  const recoveryQuery = useQuery({
    queryKey: ["lifecycle-recovery"],
    queryFn: () => api.lifecycleRecovery(token!),
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
      void queryClient.invalidateQueries({ queryKey: ["lifecycle-scheduled"] });
      void queryClient.invalidateQueries({ queryKey: ["lifecycle-recovery"] });
    },
  });

  const config = configQuery.data ?? [];
  const templates = templatesQuery.data ?? [];
  const overview = overviewQuery.data;
  const scheduled = scheduledQuery.data?.entries ?? [];
  const recovery = recoveryQuery.data;
  const stageConfig = useMemo(() => new Map(config.map((item) => [item.stage, item])), [config]);

  const configuredCount = config.filter((item) => item.templateId && item.enabled).length;
  const runHour = overview ? String(overview.runHour).padStart(2, "0") : "09";
  const isLive = Boolean(overview && !overview.simulationOnly && overview.automationEnabled);
  const recRate = recovery ? Math.round(recovery.recoveryRate * 1000) / 10 : 0;
  const watchedCount = overview?.totalWatched ?? 0;
  const queuePreview = scheduled.slice(0, 5);
  const humanSignals = [
    ...(recovery?.recovered ?? []).slice(0, 2).map((item) => ({
      id: `recovered-${item.customerId}`,
      name: item.displayName,
      detail: `Reconquistado em ${item.daysToRecover}d`,
      stage: item.stage,
      status: "Avisar vendedora",
      time: fmtDate(item.recoverDate),
      hot: true,
    })),
    ...(overview?.recentEvents ?? [])
      .filter((event) => event.action === "SENT")
      .slice(0, 3)
      .map((event) => ({
        id: `sent-${event.customerId}-${event.createdAt}`,
        name: event.displayName,
        detail: event.templateTitle ?? "Template enviado",
        stage: event.stage,
        status: "Acompanhar resposta",
        time: fmtDT(event.createdAt),
        hot: false,
      })),
  ].slice(0, 4);

  return (
    <div className="bc">
      <style>{BC_STYLES}</style>

      <section className="bc-hero" aria-label="Central de automação de carteira">
        <div className="bc-ambient bc-ambient-one" />
        <div className="bc-ambient bc-ambient-two" />
        <div className="bc-grid" />

        <div className="bc-hero-copy">
          <span className="bc-live">
            <span className="bc-live-dot" />
            Sistema ativo · vigiando 24/7
          </span>
          <h1>Central de Automação de Carteira</h1>
          <p>
            Monitorando clientes, aguardando o momento certo e disparando o template ideal automaticamente.
          </p>

          <div className="bc-hero-actions">
            <div className="bc-sweep-card">
              <Clock size={18} />
              <span>Próxima varredura</span>
              <strong>{runHour}:00</strong>
              <small>{overview?.timezone ?? "Horário de Brasília"}</small>
            </div>
            <button className="bc-run" disabled={runNow.isPending} onClick={() => runNow.mutate()}>
              <Play size={15} />
              {runNow.isPending ? "Processando..." : "Rodar agora"}
            </button>
          </div>
        </div>

        <div className="bc-core-shell" aria-hidden="true">
          <div className="bc-orbit orbit-a" />
          <div className="bc-orbit orbit-b" />
          <div className="bc-orbit orbit-c" />
          <div className="bc-scan" />
          <div className="bc-brain">
            <Brain size={86} strokeWidth={1.35} />
            <span className="bc-brain-pulse" />
          </div>
          {["n1", "n2", "n3", "n4", "n5", "n6"].map((name) => (
            <span key={name} className={`bc-node-dot ${name}`} />
          ))}
        </div>

        <div className="bc-hero-intel">
          <span className="bc-intel-kicker">
            <Sparkles size={14} />
            Inteligência ativa
          </span>
          <strong>{isLive ? "Operando em envio real" : "Modo simulação seguro"}</strong>
          <p>
            {configuredCount}/4 estágios com template pronto. A automação observa a fila e só age quando o timing fecha.
          </p>
          <div className="bc-signal-line" />
        </div>
      </section>

      <section className="bc-metrics" aria-label="Resumo da automação">
        <Metric icon={<Eye size={20} />} label="Clientes monitorados" value={fmtNumber(watchedCount)} tone="cyan" />
        <Metric icon={<Clock size={20} />} label="Follow-ups agendados" value={fmtNumber(scheduled.length)} tone="blue" />
        <Metric icon={<MessageCircle size={20} />} label="Handoffs humanos" value={fmtNumber(humanSignals.length)} tone="violet" />
        <Metric icon={<CheckCircle2 size={20} />} label="Recuperados" value={fmtNumber(recovery?.recoveredCount)} tone="green" />
      </section>

      <main className="bc-main-grid">
        <section className="bc-panel bc-watch">
          <PanelHeader
            eyebrow="Próximos 14 dias"
            title="Fila de envios programados"
            subtitle="Quem vai cruzar para o próximo estágio e qual template será preparado."
          />

          {scheduledQuery.isLoading ? (
            <EmptyState>Carregando próximos disparos...</EmptyState>
          ) : queuePreview.length === 0 ? (
            <EmptyState>Ninguém prestes a cruzar de estágio nos próximos 14 dias.</EmptyState>
          ) : (
            <div className="bc-program-table">
              <div className="bc-program-head" aria-hidden="true">
                <span>Cliente</span>
                <span>Próximo estágio</span>
                <span>Vai cruzar em</span>
                <span>Data prevista</span>
                <span>Template</span>
                <span />
              </div>
              {queuePreview.map((entry) => {
                const meta = STAGE_META[entry.targetStage];
                const status = watchStatus(entry);
                return (
                  <article
                    key={`${entry.customerId}-${entry.targetStage}`}
                    className={`bc-program-row is-${status.tone}`}
                    style={{ "--stage": meta.color } as CSSProperties}
                  >
                    <div className="bc-program-client">
                      <span className="bc-program-avatar">{initials(entry.displayName)}</span>
                      <div>
                        <strong>{entry.displayName}</strong>
                        <small>{entry.customerCode || "Sem código"}</small>
                      </div>
                    </div>
                    <div className="bc-program-stage">
                      <strong>{meta.short}</strong>
                      <small>{meta.range}</small>
                    </div>
                    <div className="bc-program-days">{entry.daysUntil <= 0 ? "hoje" : `${entry.daysUntil} dias`}</div>
                    <div className="bc-program-date">
                      <strong>{fmtDate(entry.crossDate)}</strong>
                      <small>{untilLabel(entry.daysUntil)}</small>
                    </div>
                    <div className="bc-program-template">
                      <strong>{entry.templateTitle ?? meta.short}</strong>
                      <small>{entry.templateTitle ? "Template ativo" : "Sem template"}</small>
                    </div>
                    <button className="bc-row-action" type="button" aria-label={status.label} title={status.label}>
                      <Play size={13} />
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <aside className="bc-side-stack">
          <section className="bc-panel bc-thought">
            <PanelHeader eyebrow="Raciocínio do sistema" title="Observa → espera → age" />
            <div className="bc-flow">
              {[
                { icon: <Eye size={16} />, label: "Observa" },
                { icon: <Clock size={16} />, label: "Espera" },
                { icon: <Send size={16} />, label: "Dispara" },
                { icon: <Activity size={16} />, label: "Monitora" },
                { icon: <ShieldCheck size={16} />, label: "Aciona humano" },
              ].map((step, index, arr) => (
                <Fragment key={step.label}>
                  <div className="bc-flow-step">
                    {step.icon}
                    <span>{step.label}</span>
                  </div>
                  {index < arr.length - 1 ? <span className="bc-flow-rail" /> : null}
                </Fragment>
              ))}
            </div>
          </section>

          <section className="bc-panel bc-handoff">
            <PanelHeader
              eyebrow="Handoff humano"
              title="Quando chamar vendedora"
              subtitle="Só os sinais que merecem ação manual."
            />

            {overviewQuery.isLoading || recoveryQuery.isLoading ? (
              <EmptyState>Carregando sinais...</EmptyState>
            ) : humanSignals.length === 0 ? (
              <EmptyState>Nenhum handoff agora. O sistema segue monitorando.</EmptyState>
            ) : (
              <div className="bc-handoff-list">
                {humanSignals.map((item) => {
                  const meta = STAGE_META[item.stage];
                  return (
                    <div key={item.id} className={`bc-handoff-item ${item.hot ? "is-hot" : ""}`}>
                      <span className="bc-avatar" style={{ "--stage": meta.color } as CSSProperties}>
                        {initials(item.name)}
                      </span>
                      <div>
                        <strong>{item.name}</strong>
                        <small>
                          {item.detail} · {item.time}
                        </small>
                      </div>
                      <span className="bc-mini-status">{item.status}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="bc-panel bc-recovery">
            <PanelHeader eyebrow="Recuperação" title="Resultado resumido" />
            <div className="bc-recovery-ring" style={{ "--rate": `${Math.min(100, recRate)}%` } as CSSProperties}>
              <div>
                <strong>{recRate}%</strong>
                <span>taxa</span>
              </div>
            </div>
            <div className="bc-recovery-copy">
              <strong>{fmtNumber(recovery?.messagesSent)} mensagens</strong>
              <span>{fmtNumber(recovery?.recoveredCount)} clientes recuperados após follow-up automático.</span>
            </div>
          </section>
        </aside>
      </main>

      <section className="bc-panel bc-stage-strip">
        <PanelHeader
          eyebrow="Templates por estágio"
          title="Motor automático"
          subtitle="Área técnica compacta: define o template que será enviado em cada transição."
        />
        <div className="bc-stage-grid">
          {STAGE_ORDER.map((stage) => {
            const meta = STAGE_META[stage];
            const item = stageConfig.get(stage);
            const ready = Boolean(item?.templateId && item?.enabled);
            return (
              <div key={stage} className="bc-stage-card" style={{ "--stage": meta.color } as CSSProperties}>
                <div className="bc-stage-head">
                  <span>{meta.short}</span>
                  <strong>{overview?.stageCounts[stage] ?? 0}</strong>
                </div>
                <small>{meta.range} · {meta.signal}</small>
                <div className="bc-stage-config">
                  <select
                    value={item?.templateId ?? ""}
                    onChange={(event) =>
                      saveConfig.mutate({
                        stage,
                        templateId: event.target.value || null,
                        enabled: item?.enabled ?? true,
                      })
                    }
                    aria-label={`Template para ${meta.short}`}
                  >
                    <option value="">Sem template</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.title}
                      </option>
                    ))}
                  </select>
                  <label className="bc-switch">
                    <input
                      type="checkbox"
                      checked={item?.enabled ?? true}
                      onChange={(event) =>
                        saveConfig.mutate({
                          stage,
                          templateId: item?.templateId ?? null,
                          enabled: event.target.checked,
                        })
                      }
                    />
                    <span />
                    {ready ? "ativo" : "off"}
                  </label>
                </div>
              </div>
            );
          })}
        </div>
        {runNow.data ? (
          <p className="bc-run-result">
            Último teste: {runNow.data.simulated} simulados · {runNow.data.sent} enviados · {runNow.data.skipped} sem template/número.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: "cyan" | "blue" | "violet" | "green";
}) {
  return (
    <div className={`bc-metric is-${tone}`}>
      <span>{icon}</span>
      <div>
        <strong>{value}</strong>
        <small>{label}</small>
      </div>
    </div>
  );
}

function PanelHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <header className="bc-panel-head">
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      {subtitle ? <p>{subtitle}</p> : null}
    </header>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="bc-empty">{children}</div>;
}

const BC_STYLES = `
  .bc {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-height: calc(100vh - 2rem);
    padding: clamp(1rem, 1.6vw, 1.6rem);
    margin: -0.5rem;
    overflow: hidden;
    color: #e5ecff;
    border-radius: 28px;
    background:
      radial-gradient(900px 520px at 64% -14%, rgba(59, 130, 246, 0.22), transparent 64%),
      radial-gradient(760px 480px at 98% 12%, rgba(217, 70, 239, 0.16), transparent 58%),
      radial-gradient(660px 420px at 7% 92%, rgba(20, 184, 166, 0.12), transparent 60%),
      linear-gradient(145deg, #020617 0%, #071124 48%, #020617 100%);
    font-feature-settings: "tnum";
  }

  .bc * { box-sizing: border-box; }

  .bc::before {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image:
      linear-gradient(rgba(148, 163, 184, 0.045) 1px, transparent 1px),
      linear-gradient(90deg, rgba(148, 163, 184, 0.045) 1px, transparent 1px);
    background-size: 44px 44px;
    mask-image: radial-gradient(760px 560px at 50% 12%, #000, transparent 82%);
  }

  .bc-hero,
  .bc-panel,
  .bc-metric {
    position: relative;
    border: 1px solid rgba(148, 163, 184, 0.16);
    background: linear-gradient(145deg, rgba(10, 18, 38, 0.78), rgba(4, 10, 24, 0.9));
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.08) inset,
      0 28px 80px rgba(0, 0, 0, 0.22);
    backdrop-filter: blur(18px);
  }

  .bc-hero {
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(240px, 0.65fr) minmax(240px, 0.55fr);
    gap: clamp(1rem, 2vw, 2rem);
    min-height: 276px;
    overflow: hidden;
    border-radius: 30px;
    padding: clamp(1.35rem, 2.6vw, 2.5rem);
  }

  .bc-ambient,
  .bc-grid {
    position: absolute;
    pointer-events: none;
  }

  .bc-ambient-one {
    width: 420px;
    height: 420px;
    right: 18%;
    top: -190px;
    border-radius: 999px;
    background: rgba(34, 211, 238, 0.12);
    filter: blur(48px);
  }

  .bc-ambient-two {
    width: 360px;
    height: 360px;
    right: -110px;
    bottom: -180px;
    border-radius: 999px;
    background: rgba(244, 114, 182, 0.12);
    filter: blur(54px);
  }

  .bc-grid {
    inset: 0;
    opacity: 0.6;
    background:
      linear-gradient(90deg, transparent 0 48%, rgba(34, 211, 238, 0.09) 50%, transparent 52%),
      radial-gradient(circle at 67% 50%, rgba(34, 211, 238, 0.18) 0 1px, transparent 2px);
    background-size: 100% 100%, 28px 28px;
    mask-image: radial-gradient(430px 260px at 64% 48%, #000, transparent 80%);
  }

  .bc-hero-copy,
  .bc-core-shell,
  .bc-hero-intel {
    position: relative;
    z-index: 1;
  }

  .bc-live,
  .bc-intel-kicker {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    color: #9cc8ff;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .bc-live-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #22c55e;
    box-shadow: 0 0 0 6px rgba(34, 197, 94, 0.12), 0 0 22px rgba(34, 197, 94, 0.75);
    animation: bcBreath 2.4s ease-in-out infinite;
  }

  @keyframes bcBreath {
    0%, 100% { transform: scale(0.96); opacity: 0.78; }
    50% { transform: scale(1.18); opacity: 1; }
  }

  .bc-hero h1 {
    max-width: 720px;
    margin: 0.62rem 0 0.7rem;
    color: #f8fbff;
    font-size: clamp(2rem, 4vw, 4.4rem);
    line-height: 0.94;
    letter-spacing: -0.065em;
  }

  .bc-hero-copy p {
    max-width: 620px;
    margin: 0;
    color: #a9b8d6;
    font-size: clamp(0.95rem, 1.1vw, 1.08rem);
    line-height: 1.65;
  }

  .bc-hero-actions {
    display: flex;
    align-items: stretch;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-top: 1.4rem;
  }

  .bc-sweep-card {
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: 0.75rem;
    min-width: 230px;
    padding: 0.85rem 1rem;
    border: 1px solid rgba(96, 165, 250, 0.28);
    border-radius: 18px;
    background: rgba(15, 23, 42, 0.64);
  }

  .bc-sweep-card svg {
    grid-row: 1 / 4;
    align-self: center;
    color: #38bdf8;
  }

  .bc-sweep-card span,
  .bc-sweep-card small {
    color: #93a4c5;
    font-size: 0.73rem;
  }

  .bc-sweep-card strong {
    color: #f8fbff;
    font-size: 1.55rem;
    line-height: 1.05;
    letter-spacing: 0.06em;
  }

  .bc-run {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-height: 58px;
    padding: 0 1.25rem;
    border: 0;
    border-radius: 18px;
    color: #ffffff;
    font-weight: 850;
    cursor: pointer;
    background: linear-gradient(135deg, #06b6d4, #6366f1 58%, #d946ef);
    box-shadow: 0 18px 34px rgba(79, 70, 229, 0.34);
  }

  .bc-run:disabled {
    opacity: 0.58;
    cursor: wait;
  }

  .bc-core-shell {
    place-self: center;
    width: min(310px, 100%);
    aspect-ratio: 1;
    display: grid;
    place-items: center;
    filter: drop-shadow(0 28px 48px rgba(59, 130, 246, 0.2));
  }

  .bc-orbit,
  .bc-scan,
  .bc-brain,
  .bc-node-dot {
    position: absolute;
  }

  .bc-orbit {
    border-radius: 50%;
    border: 1px solid rgba(96, 165, 250, 0.27);
  }

  .orbit-a { inset: 5%; }
  .orbit-b { inset: 18%; border-color: rgba(34, 211, 238, 0.36); }
  .orbit-c { inset: 32%; border-color: rgba(244, 114, 182, 0.34); }

  .bc-scan {
    inset: 5%;
    border-radius: 50%;
    background: conic-gradient(from 22deg, rgba(34, 211, 238, 0.38), transparent 22%, transparent 100%);
    animation: bcSpin 7s linear infinite;
  }

  @keyframes bcSpin { to { transform: rotate(360deg); } }

  .bc-brain {
    display: grid;
    place-items: center;
    width: 142px;
    height: 142px;
    color: #dce9ff;
    border-radius: 50%;
    background:
      radial-gradient(circle at 58% 40%, rgba(244, 114, 182, 0.42), transparent 28%),
      radial-gradient(circle at 42% 62%, rgba(34, 211, 238, 0.44), transparent 32%),
      rgba(15, 23, 42, 0.7);
    box-shadow:
      0 0 0 1px rgba(226, 232, 240, 0.12) inset,
      0 0 46px rgba(34, 211, 238, 0.32),
      0 0 70px rgba(217, 70, 239, 0.18);
  }

  .bc-brain-pulse {
    position: absolute;
    inset: -10px;
    border-radius: inherit;
    border: 1px solid rgba(34, 211, 238, 0.18);
    animation: bcPulse 2.8s ease-out infinite;
  }

  @keyframes bcPulse {
    0% { transform: scale(0.92); opacity: 0.9; }
    100% { transform: scale(1.24); opacity: 0; }
  }

  .bc-node-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #22d3ee;
    box-shadow: 0 0 20px #22d3ee;
  }

  .n1 { top: 10%; left: 48%; }
  .n2 { top: 29%; right: 11%; background: #818cf8; box-shadow: 0 0 20px #818cf8; }
  .n3 { right: 19%; bottom: 17%; background: #f472b6; box-shadow: 0 0 20px #f472b6; }
  .n4 { bottom: 13%; left: 29%; background: #a78bfa; box-shadow: 0 0 20px #a78bfa; }
  .n5 { top: 36%; left: 10%; }
  .n6 { top: 18%; left: 25%; background: #34d399; box-shadow: 0 0 20px #34d399; }

  .bc-hero-intel {
    align-self: center;
    padding: 1.1rem;
    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 22px;
    background: rgba(2, 6, 23, 0.42);
  }

  .bc-hero-intel strong {
    display: block;
    margin-top: 0.65rem;
    color: #f8fbff;
    font-size: 1rem;
  }

  .bc-hero-intel p {
    margin: 0.45rem 0 1rem;
    color: #9aa9c6;
    font-size: 0.82rem;
    line-height: 1.55;
  }

  .bc-signal-line {
    height: 44px;
    border-radius: 14px;
    background:
      linear-gradient(90deg, transparent, rgba(34, 211, 238, 0.35), transparent),
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='48' viewBox='0 0 220 48'%3E%3Cpath d='M0 28 C18 28 18 26 36 26 C48 26 48 33 60 33 C76 33 76 14 91 14 C106 14 106 38 122 38 C136 38 136 22 150 22 C163 22 163 28 176 28 C195 28 195 20 220 20' fill='none' stroke='%2334d399' stroke-width='3' stroke-linecap='round'/%3E%3C/svg%3E") center / cover no-repeat;
    opacity: 0.85;
  }

  .bc-metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.85rem;
  }

  .bc-metric {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    min-height: 86px;
    padding: 1rem;
    overflow: hidden;
    border-radius: 22px;
  }

  .bc-metric::after {
    content: "";
    position: absolute;
    inset: auto -30px -48px auto;
    width: 120px;
    height: 120px;
    border-radius: 999px;
    background: var(--metric-glow);
    opacity: 0.16;
    filter: blur(10px);
  }

  .bc-metric > span {
    position: relative;
    z-index: 1;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 16px;
    color: var(--metric);
    background: color-mix(in srgb, var(--metric) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--metric) 25%, transparent);
  }

  .bc-metric strong {
    display: block;
    color: #f8fbff;
    font-size: 1.7rem;
    line-height: 1;
  }

  .bc-metric small {
    display: block;
    margin-top: 0.28rem;
    color: #90a0be;
    font-size: 0.78rem;
  }

  .bc-metric.is-cyan { --metric: #22d3ee; --metric-glow: #22d3ee; }
  .bc-metric.is-blue { --metric: #60a5fa; --metric-glow: #60a5fa; }
  .bc-metric.is-violet { --metric: #a78bfa; --metric-glow: #a78bfa; }
  .bc-metric.is-green { --metric: #34d399; --metric-glow: #34d399; }

  .bc-main-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.36fr) minmax(320px, 0.64fr);
    gap: 1rem;
  }

  .bc-panel {
    border-radius: 26px;
    padding: clamp(1rem, 1.6vw, 1.35rem);
  }

  .bc-panel-head {
    margin-bottom: 1rem;
  }

  .bc-panel-head > span {
    display: inline-flex;
    color: #7dd3fc;
    font-size: 0.69rem;
    font-weight: 850;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .bc-panel-head h2 {
    margin: 0.2rem 0 0;
    color: #f8fbff;
    font-size: 1.1rem;
    letter-spacing: -0.02em;
  }

  .bc-panel-head p {
    max-width: 680px;
    margin: 0.35rem 0 0;
    color: #8ea0c1;
    font-size: 0.82rem;
    line-height: 1.5;
  }

  .bc-watch-list {
    display: flex;
    flex-direction: column;
    gap: 0.72rem;
  }

  .bc-watch-card {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 1rem;
    padding: 0.95rem;
    border: 1px solid color-mix(in srgb, var(--stage) 22%, rgba(148, 163, 184, 0.14));
    border-radius: 22px;
    background:
      linear-gradient(90deg, color-mix(in srgb, var(--stage) 9%, transparent), transparent 46%),
      rgba(15, 23, 42, 0.62);
  }

  .bc-watch-card.is-ready,
  .bc-watch-card.is-hot {
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--stage) 10%, transparent), 0 18px 52px color-mix(in srgb, var(--stage) 16%, transparent);
  }

  .bc-countdown {
    display: grid;
    place-items: center;
    align-self: stretch;
    width: 82px;
    min-height: 88px;
    border-radius: 20px;
    color: var(--stage);
    background: rgba(2, 6, 23, 0.42);
    border: 1px solid color-mix(in srgb, var(--stage) 34%, transparent);
  }

  .bc-countdown span {
    font-size: 2.05rem;
    font-weight: 900;
    line-height: 0.9;
    letter-spacing: -0.06em;
  }

  .bc-countdown small {
    margin-top: -0.4rem;
    color: #9caed0;
    font-size: 0.67rem;
    font-weight: 800;
    text-transform: uppercase;
  }

  .bc-watch-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.9rem;
  }

  .bc-watch-top h3 {
    margin: 0;
    color: #f8fbff;
    font-size: 1rem;
  }

  .bc-watch-top p {
    margin: 0.18rem 0 0;
    color: #8fa0bd;
    font-size: 0.78rem;
  }

  .bc-status,
  .bc-mini-status {
    display: inline-flex;
    align-items: center;
    white-space: nowrap;
    border-radius: 999px;
    padding: 0.28rem 0.62rem;
    color: #dff8ff;
    font-size: 0.68rem;
    font-weight: 850;
    background: color-mix(in srgb, var(--stage, #38bdf8) 18%, rgba(15, 23, 42, 0.68));
    border: 1px solid color-mix(in srgb, var(--stage, #38bdf8) 26%, transparent);
  }

  .bc-watch-card.is-missing .bc-status {
    color: #fde68a;
    background: rgba(245, 158, 11, 0.14);
    border-color: rgba(245, 158, 11, 0.25);
  }

  .bc-decision-line,
  .bc-template-line {
    display: flex;
    align-items: center;
    gap: 0.48rem;
    flex-wrap: wrap;
    margin-top: 0.72rem;
    color: #9fb0cf;
    font-size: 0.78rem;
  }

  .bc-decision-line svg,
  .bc-template-line svg {
    color: var(--stage);
  }

  .bc-decision-line strong,
  .bc-template-line strong {
    color: #f8fbff;
  }

  .bc-progress {
    height: 4px;
    margin-top: 0.82rem;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(148, 163, 184, 0.14);
  }

  .bc-progress span {
    display: block;
    width: var(--progress);
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--stage), rgba(255, 255, 255, 0.84));
    box-shadow: 0 0 16px color-mix(in srgb, var(--stage) 44%, transparent);
  }

  .bc-side-stack {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .bc-flow {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    flex-wrap: wrap;
  }

  .bc-flow-step {
    display: inline-flex;
    align-items: center;
    gap: 0.42rem;
    min-height: 38px;
    padding: 0 0.7rem;
    border-radius: 999px;
    color: #cfe8ff;
    background: rgba(15, 23, 42, 0.58);
    border: 1px solid rgba(125, 211, 252, 0.18);
    font-size: 0.76rem;
    font-weight: 800;
  }

  .bc-flow-step svg {
    color: #38bdf8;
  }

  .bc-flow-rail {
    width: 20px;
    height: 1px;
    background: linear-gradient(90deg, rgba(56, 189, 248, 0.16), rgba(217, 70, 239, 0.54));
  }

  .bc-handoff-list {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }

  .bc-handoff-item {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 0.7rem;
    align-items: center;
    padding: 0.72rem;
    border-radius: 18px;
    background: rgba(15, 23, 42, 0.56);
    border: 1px solid rgba(148, 163, 184, 0.13);
  }

  .bc-handoff-item.is-hot {
    border-color: rgba(52, 211, 153, 0.25);
    background: linear-gradient(90deg, rgba(52, 211, 153, 0.1), rgba(15, 23, 42, 0.58));
  }

  .bc-avatar {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border-radius: 14px;
    color: #071124;
    font-size: 0.72rem;
    font-weight: 900;
    background: linear-gradient(135deg, #ffffff, var(--stage));
  }

  .bc-handoff-item strong {
    display: block;
    overflow: hidden;
    color: #f8fbff;
    font-size: 0.85rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bc-handoff-item small {
    display: block;
    overflow: hidden;
    margin-top: 0.16rem;
    color: #8ea0c1;
    font-size: 0.72rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bc-mini-status {
    --stage: #34d399;
    font-size: 0.64rem;
  }

  .bc-recovery {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 1rem;
    align-items: center;
  }

  .bc-recovery .bc-panel-head {
    grid-column: 1 / -1;
    margin-bottom: 0;
  }

  .bc-recovery-ring {
    display: grid;
    place-items: center;
    width: 114px;
    height: 114px;
    border-radius: 50%;
    background:
      radial-gradient(circle at center, #071124 0 58%, transparent 59%),
      conic-gradient(#34d399 var(--rate), rgba(148, 163, 184, 0.16) 0);
    box-shadow: 0 0 30px rgba(52, 211, 153, 0.12);
  }

  .bc-recovery-ring div {
    display: grid;
    place-items: center;
  }

  .bc-recovery-ring strong {
    color: #ffffff;
    font-size: 1.45rem;
    letter-spacing: -0.05em;
  }

  .bc-recovery-ring span {
    color: #8ea0c1;
    font-size: 0.7rem;
    text-transform: uppercase;
  }

  .bc-recovery-copy strong {
    display: block;
    color: #f8fbff;
    font-size: 1rem;
  }

  .bc-recovery-copy span {
    display: block;
    margin-top: 0.35rem;
    color: #8ea0c1;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .bc-stage-strip {
    padding-bottom: 1rem;
  }

  .bc-stage-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .bc-stage-card {
    position: relative;
    overflow: hidden;
    border-radius: 20px;
    padding: 0.9rem;
    background: rgba(15, 23, 42, 0.52);
    border: 1px solid color-mix(in srgb, var(--stage) 24%, rgba(148, 163, 184, 0.12));
  }

  .bc-stage-card::after {
    content: "";
    position: absolute;
    width: 110px;
    height: 110px;
    right: -46px;
    top: -58px;
    border-radius: 50%;
    background: var(--stage);
    opacity: 0.12;
    filter: blur(14px);
  }

  .bc-stage-head {
    position: relative;
    z-index: 1;
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    color: #f8fbff;
    font-weight: 850;
  }

  .bc-stage-head strong {
    color: var(--stage);
  }

  .bc-stage-card small {
    position: relative;
    z-index: 1;
    display: block;
    margin-top: 0.28rem;
    color: #8ea0c1;
    font-size: 0.72rem;
  }

  .bc-stage-config {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.55rem;
    align-items: center;
    margin-top: 0.78rem;
  }

  .bc-stage-config select {
    min-width: 0;
    height: 38px;
    border: 1px solid rgba(148, 163, 184, 0.18);
    border-radius: 12px;
    color: #dbe8ff;
    background: rgba(2, 6, 23, 0.56);
    padding: 0 0.65rem;
    font-size: 0.78rem;
  }

  .bc-stage-config option {
    color: #0f172a;
    background: #ffffff;
  }

  .bc-switch {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    color: #90a0be;
    font-size: 0.7rem;
    font-weight: 800;
    cursor: pointer;
  }

  .bc-switch input {
    display: none;
  }

  .bc-switch span {
    position: relative;
    width: 34px;
    height: 20px;
    border-radius: 999px;
    background: rgba(148, 163, 184, 0.2);
    border: 1px solid rgba(148, 163, 184, 0.16);
  }

  .bc-switch span::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #94a3b8;
    transition: transform 0.18s ease, background 0.18s ease;
  }

  .bc-switch input:checked + span {
    background: rgba(52, 211, 153, 0.2);
    border-color: rgba(52, 211, 153, 0.28);
  }

  .bc-switch input:checked + span::after {
    transform: translateX(14px);
    background: #34d399;
  }

  .bc-run-result {
    margin: 0.9rem 0 0;
    color: #8ea0c1;
    font-size: 0.78rem;
  }

  .bc-empty {
    display: grid;
    place-items: center;
    min-height: 112px;
    padding: 1rem;
    text-align: center;
    color: #8ea0c1;
    border: 1px dashed rgba(148, 163, 184, 0.18);
    border-radius: 18px;
    background: rgba(15, 23, 42, 0.36);
  }

  @media (max-width: 1280px) {
    .bc-hero {
      grid-template-columns: minmax(0, 1fr) minmax(230px, 0.42fr);
    }

    .bc-hero-intel {
      grid-column: 1 / -1;
    }

    .bc-main-grid {
      grid-template-columns: 1fr;
    }

    .bc-side-stack {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 980px) {
    .bc-metrics,
    .bc-stage-grid,
    .bc-side-stack {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .bc-core-shell {
      display: none;
    }

    .bc-hero {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 720px) {
    .bc {
      margin: 0;
      padding: 0.85rem;
      border-radius: 20px;
    }

    .bc-metrics,
    .bc-stage-grid,
    .bc-side-stack {
      grid-template-columns: 1fr;
    }

    .bc-watch-card,
    .bc-handoff-item,
    .bc-recovery {
      grid-template-columns: 1fr;
    }

    .bc-countdown {
      width: 100%;
      min-height: 76px;
    }

    .bc-watch-top {
      flex-direction: column;
    }

    .bc-stage-config {
      grid-template-columns: 1fr;
    }
  }

  /* Light premium theme */
  .bc {
    color: #102044;
    background:
      radial-gradient(900px 520px at 64% -14%, rgba(59, 130, 246, 0.14), transparent 64%),
      radial-gradient(760px 480px at 98% 12%, rgba(217, 70, 239, 0.08), transparent 58%),
      radial-gradient(660px 420px at 7% 92%, rgba(20, 184, 166, 0.1), transparent 60%),
      linear-gradient(145deg, #f8fbff 0%, #eef6ff 48%, #ffffff 100%);
  }

  .bc::before {
    background-image:
      linear-gradient(rgba(37, 99, 235, 0.055) 1px, transparent 1px),
      linear-gradient(90deg, rgba(37, 99, 235, 0.055) 1px, transparent 1px);
  }

  .bc-hero,
  .bc-panel,
  .bc-metric {
    border-color: rgba(37, 99, 235, 0.12);
    background: linear-gradient(145deg, rgba(255, 255, 255, 0.92), rgba(244, 249, 255, 0.86));
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.9) inset,
      0 24px 70px rgba(37, 99, 235, 0.1);
  }

  .bc-hero {
    background:
      radial-gradient(520px 300px at 76% 18%, rgba(34, 211, 238, 0.18), transparent 68%),
      radial-gradient(420px 260px at 92% 72%, rgba(217, 70, 239, 0.1), transparent 62%),
      linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(239, 247, 255, 0.92));
  }

  .bc-grid {
    opacity: 0.9;
    background:
      linear-gradient(90deg, transparent 0 48%, rgba(14, 165, 233, 0.12) 50%, transparent 52%),
      radial-gradient(circle at 67% 50%, rgba(14, 165, 233, 0.22) 0 1px, transparent 2px);
    background-size: 100% 100%, 28px 28px;
  }

  .bc-live,
  .bc-intel-kicker,
  .bc-panel-head > span {
    color: #0ea5e9;
  }

  .bc-hero h1,
  .bc-panel-head h2,
  .bc-watch-top h3,
  .bc-decision-line strong,
  .bc-template-line strong,
  .bc-metric strong,
  .bc-handoff-item strong,
  .bc-recovery-ring strong,
  .bc-recovery-copy strong,
  .bc-stage-head {
    color: #071a3d;
  }

  .bc-hero-copy p,
  .bc-hero-intel p,
  .bc-sweep-card span,
  .bc-sweep-card small,
  .bc-panel-head p,
  .bc-watch-top p,
  .bc-decision-line,
  .bc-template-line,
  .bc-handoff-item small,
  .bc-recovery-copy span,
  .bc-stage-card small,
  .bc-metric small,
  .bc-empty,
  .bc-switch {
    color: #5f6f8f;
  }

  .bc-sweep-card,
  .bc-hero-intel,
  .bc-watch-card,
  .bc-handoff-item,
  .bc-stage-card,
  .bc-empty {
    background: rgba(255, 255, 255, 0.74);
    border-color: rgba(37, 99, 235, 0.12);
  }

  .bc-sweep-card strong {
    color: #0f2a5c;
  }

  .bc-run {
    box-shadow: 0 18px 34px rgba(37, 99, 235, 0.22);
  }

  .bc-hero-intel {
    box-shadow: 0 18px 46px rgba(14, 165, 233, 0.08);
  }

  .bc-core-shell {
    filter: drop-shadow(0 28px 48px rgba(37, 99, 235, 0.16));
  }

  .bc-orbit {
    border-color: rgba(37, 99, 235, 0.18);
  }

  .orbit-b {
    border-color: rgba(14, 165, 233, 0.26);
  }

  .orbit-c {
    border-color: rgba(217, 70, 239, 0.22);
  }

  .bc-brain {
    color: #174276;
    background:
      radial-gradient(circle at 58% 40%, rgba(217, 70, 239, 0.26), transparent 28%),
      radial-gradient(circle at 42% 62%, rgba(34, 211, 238, 0.34), transparent 32%),
      rgba(255, 255, 255, 0.82);
    box-shadow:
      0 0 0 1px rgba(37, 99, 235, 0.1) inset,
      0 0 46px rgba(14, 165, 233, 0.26),
      0 0 70px rgba(217, 70, 239, 0.12);
  }

  .bc-metric {
    background:
      radial-gradient(180px 120px at 88% 100%, color-mix(in srgb, var(--metric) 14%, transparent), transparent 62%),
      rgba(255, 255, 255, 0.86);
  }

  .bc-watch-card {
    background:
      linear-gradient(90deg, color-mix(in srgb, var(--stage) 12%, transparent), transparent 52%),
      rgba(255, 255, 255, 0.82);
    box-shadow: 0 12px 34px rgba(37, 99, 235, 0.07);
  }

  .bc-countdown {
    background: rgba(248, 251, 255, 0.86);
    color: var(--stage);
  }

  .bc-countdown small {
    color: #64748b;
  }

  .bc-status,
  .bc-mini-status {
    color: #0f2a5c;
    background: color-mix(in srgb, var(--stage, #38bdf8) 14%, rgba(255, 255, 255, 0.86));
    border-color: color-mix(in srgb, var(--stage, #38bdf8) 28%, transparent);
  }

  .bc-progress {
    background: rgba(37, 99, 235, 0.1);
  }

  .bc-flow-step {
    color: #174276;
    background: rgba(255, 255, 255, 0.74);
    border-color: rgba(14, 165, 233, 0.18);
  }

  .bc-flow-rail {
    background: linear-gradient(90deg, rgba(14, 165, 233, 0.22), rgba(217, 70, 239, 0.38));
  }

  .bc-handoff-item.is-hot {
    border-color: rgba(16, 185, 129, 0.24);
    background: linear-gradient(90deg, rgba(16, 185, 129, 0.12), rgba(255, 255, 255, 0.8));
  }

  .bc-recovery-ring {
    background:
      radial-gradient(circle at center, #ffffff 0 58%, transparent 59%),
      conic-gradient(#10b981 var(--rate), rgba(37, 99, 235, 0.13) 0);
    box-shadow: 0 0 30px rgba(16, 185, 129, 0.12);
  }

  .bc-recovery-ring span {
    color: #64748b;
  }

  .bc-stage-config select {
    color: #14315f;
    background: rgba(255, 255, 255, 0.82);
    border-color: rgba(37, 99, 235, 0.16);
  }

  .bc-switch span {
    background: rgba(37, 99, 235, 0.12);
    border-color: rgba(37, 99, 235, 0.12);
  }

  .bc-watch-card.is-missing .bc-status {
    color: #92400e;
    background: rgba(245, 158, 11, 0.12);
    border-color: rgba(245, 158, 11, 0.25);
  }

  /* Compact light refinement */
  .bc {
    gap: 0.75rem;
    padding: 0.55rem;
    background:
      radial-gradient(720px 300px at 72% 0%, rgba(14, 165, 233, 0.055), transparent 64%),
      radial-gradient(560px 260px at 100% 18%, rgba(124, 58, 237, 0.04), transparent 62%),
      linear-gradient(180deg, #f8fafc 0%, #f3f6fb 100%);
  }

  .bc::before {
    opacity: 0.45;
    background-size: 36px 36px;
  }

  .bc-hero,
  .bc-panel,
  .bc-metric {
    border-color: rgba(15, 23, 42, 0.075);
    background: rgba(255, 255, 255, 0.92);
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.95) inset,
      0 12px 34px rgba(15, 23, 42, 0.055);
  }

  .bc-hero {
    min-height: 196px;
    grid-template-columns: minmax(0, 1fr) 168px 250px;
    gap: 1.2rem;
    padding: 1.05rem 1.25rem;
    border-radius: 18px;
    background:
      radial-gradient(360px 220px at 68% 18%, rgba(14, 165, 233, 0.11), transparent 68%),
      linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(247, 250, 255, 0.96));
  }

  .bc-hero h1 {
    max-width: 720px;
    margin: 0.42rem 0 0.42rem;
    font-size: clamp(1.75rem, 2.4vw, 2.45rem);
    line-height: 1.04;
    letter-spacing: -0.055em;
  }

  .bc-hero-copy p {
    max-width: 560px;
    font-size: 0.88rem;
    line-height: 1.52;
  }

  .bc-live,
  .bc-intel-kicker,
  .bc-panel-head > span {
    color: #006fbf;
    font-size: 0.63rem;
    letter-spacing: 0.13em;
  }

  .bc-hero-actions {
    margin-top: 1rem;
  }

  .bc-sweep-card {
    min-width: 176px;
    padding: 0.65rem 0.72rem;
    border-radius: 12px;
  }

  .bc-sweep-card strong {
    font-size: 1.25rem;
  }

  .bc-run {
    min-height: 46px;
    padding: 0 0.95rem;
    border-radius: 12px;
    background: linear-gradient(135deg, #1d6fe8, #5b5ce2);
    box-shadow: 0 10px 22px rgba(37, 99, 235, 0.16);
  }

  .bc-core-shell {
    width: 154px;
  }

  .bc-brain {
    width: 76px;
    height: 76px;
    box-shadow:
      0 0 0 1px rgba(37, 99, 235, 0.08) inset,
      0 0 24px rgba(14, 165, 233, 0.14);
  }

  .bc-brain svg {
    width: 44px;
    height: 44px;
  }

  .bc-hero-intel {
    padding: 0.72rem;
    border-radius: 14px;
    box-shadow: 0 12px 28px rgba(15, 23, 42, 0.045);
  }

  .bc-hero-intel strong {
    display: none;
  }

  .bc-hero-intel p {
    margin: 0.5rem 0 0.55rem;
    font-size: 0.7rem;
  }

  .bc-signal-line {
    height: 20px;
    opacity: 0.36;
  }

  .bc-metrics {
    gap: 0.55rem;
  }

  .bc-metric {
    min-height: 60px;
    gap: 0.65rem;
    padding: 0.72rem 0.78rem;
    border-radius: 13px;
    background: #ffffff;
  }

  .bc-metric::after {
    opacity: 0.06;
  }

  .bc-metric > span {
    width: 34px;
    height: 34px;
    border-radius: 10px;
  }

  .bc-metric strong {
    font-size: 1.25rem;
  }

  .bc-metric small {
    margin-top: 0.15rem;
    font-size: 0.66rem;
  }

  .bc-main-grid {
    grid-template-columns: minmax(0, 1.55fr) minmax(280px, 0.58fr);
    gap: 0.72rem;
  }

  .bc-panel {
    padding: 0.95rem 1rem;
    border-radius: 15px;
  }

  .bc-panel-head {
    margin-bottom: 0.78rem;
  }

  .bc-panel-head h2 {
    font-size: 0.96rem;
  }

  .bc-panel-head p {
    margin-top: 0.2rem;
    font-size: 0.7rem;
  }

  .bc-program-table {
    overflow: hidden;
    border: 1px solid rgba(15, 23, 42, 0.065);
    border-radius: 12px;
    background: #ffffff;
  }

  .bc-program-head,
  .bc-program-row {
    display: grid;
    grid-template-columns: minmax(150px, 1.35fr) minmax(118px, 0.8fr) 92px 112px minmax(128px, 0.95fr) 36px;
    align-items: center;
    column-gap: 0.85rem;
  }

  .bc-program-head {
    padding: 0.62rem 0.85rem;
    color: #60708d;
    font-size: 0.58rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    border-bottom: 1px solid rgba(15, 23, 42, 0.06);
  }

  .bc-program-row {
    min-height: 55px;
    padding: 0.56rem 0.85rem;
    border-bottom: 1px solid rgba(15, 23, 42, 0.055);
  }

  .bc-program-row:last-child {
    border-bottom: 0;
  }

  .bc-program-client {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 0.55rem;
    min-width: 0;
  }

  .bc-program-avatar {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 999px;
    color: #1d4ed8;
    background: #eaf2ff;
    font-size: 0.64rem;
    font-weight: 800;
  }

  .bc-program-client strong,
  .bc-program-stage strong,
  .bc-program-date strong,
  .bc-program-template strong {
    display: block;
    overflow: hidden;
    color: #102044;
    font-size: 0.7rem;
    font-weight: 800;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bc-program-client small,
  .bc-program-stage small,
  .bc-program-date small,
  .bc-program-template small {
    display: block;
    margin-top: 0.08rem;
    color: #60708d;
    font-size: 0.62rem;
    line-height: 1.2;
  }

  .bc-program-stage strong,
  .bc-program-template strong {
    color: var(--stage);
  }

  .bc-program-days {
    color: #059669;
    font-size: 0.86rem;
    font-weight: 900;
  }

  .bc-row-action {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border: 1px solid rgba(37, 99, 235, 0.16);
    border-radius: 10px;
    color: #1d4ed8;
    background: #ffffff;
    cursor: pointer;
  }

  .bc-flow {
    gap: 0.34rem;
  }

  .bc-flow-step {
    min-height: 29px;
    padding: 0 0.55rem;
    font-size: 0.64rem;
    border-color: rgba(15, 23, 42, 0.08);
  }

  .bc-flow-rail {
    width: 12px;
    background: rgba(15, 23, 42, 0.12);
  }

  .bc-handoff-item {
    padding: 0.58rem;
    border-radius: 12px;
  }

  .bc-empty {
    min-height: 86px;
    font-size: 0.78rem;
  }

  @media (max-width: 1280px) {
    .bc-hero {
      grid-template-columns: minmax(0, 1fr) 190px;
    }
  }

  @media (max-width: 980px) {
    .bc-program-table {
      overflow-x: auto;
    }

    .bc-program-head,
    .bc-program-row {
      min-width: 760px;
    }
  }
`;

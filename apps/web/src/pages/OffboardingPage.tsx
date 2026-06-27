import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueries } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Send,
  CheckCircle2,
  Activity,
  Zap,
  Clock,
  Trophy,
  Network,
  User,
  MoreVertical,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";

const WINDOW_OPTIONS: { label: string; value: number | "all" }[] = [
  { label: "7 dias", value: 7 },
  { label: "30 dias", value: 30 },
  { label: "90 dias", value: 90 },
  { label: "Todos", value: "all" },
];

const TIMELINE_OFFSETS = [
  { label: "Ontem", offset: -1 },
  { label: "Hoje", offset: 0 },
  { label: "Amanhã", offset: 1 },
  { label: "Em 2 dias", offset: 2 },
  { label: "Em 5 dias", offset: 5 },
  { label: "Em 7 dias", offset: 7 },
  { label: "Em 10 dias", offset: 10 },
];

type Urgency = { key: string; label: string; color: string; soft: string };

function urgency(avgPiecesPerMonth: number): Urgency {
  if (avgPiecesPerMonth > 300) return { key: "critica", label: "Crítica", color: "#ef4444", soft: "rgba(239, 68, 68, 0.08)" };
  if (avgPiecesPerMonth > 100) return { key: "alta", label: "Alta", color: "#f97316", soft: "rgba(249, 115, 22, 0.08)" };
  if (avgPiecesPerMonth > 50) return { key: "media", label: "Média", color: "#ca8a04", soft: "rgba(202, 138, 4, 0.08)" };
  return { key: "baixa", label: "Baixa", color: "#10b981", soft: "rgba(16, 185, 129, 0.08)" };
}

function formatBrDate(isoDate: string | null): string {
  if (!isoDate) return "—";
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : "—";
}

function dayMeta(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const dateStr = d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
  let title: string;
  if (offset === 0) title = "Hoje";
  else if (offset === 1) title = "Amanhã";
  else if (offset === -1) title = "Ontem";
  else if (offset > 1) title = `Em ${offset} dias`;
  else title = `${Math.abs(offset)} dias atrás`;
  return { title, dateStr };
}

function BrainSignalVisual() {
  return (
    <div className="ob-brain-visual" aria-hidden="true">
      <svg className="ob-brain-svg" viewBox="0 0 420 240">
        <defs>
          <linearGradient id="ob-brain-left-gradient" x1="93" x2="216" y1="39" y2="196" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#7dd3fc" />
            <stop offset="0.52" stopColor="#38bdf8" />
            <stop offset="1" stopColor="#2563eb" />
          </linearGradient>
          <linearGradient id="ob-brain-right-gradient" x1="204" x2="328" y1="39" y2="197" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#d8b4fe" />
            <stop offset="0.5" stopColor="#a855f7" />
            <stop offset="1" stopColor="#d946ef" />
          </linearGradient>
          <radialGradient id="ob-brain-glow-gradient" cx="50%" cy="48%" r="55%">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="0.45" stopColor="#bfdbfe" stopOpacity="0.42" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <filter id="ob-brain-shadow" x="-30%" y="-35%" width="160%" height="175%">
            <feDropShadow dx="0" dy="18" stdDeviation="18" floodColor="#60a5fa" floodOpacity="0.26" />
            <feDropShadow dx="0" dy="10" stdDeviation="18" floodColor="#c084fc" floodOpacity="0.2" />
          </filter>
        </defs>

        <ellipse className="ob-brain-glow" cx="210" cy="128" rx="150" ry="92" fill="url(#ob-brain-glow-gradient)" />
        <g className="ob-brain-orbits">
          <ellipse className="ob-orbit orbit-one" cx="210" cy="119" rx="178" ry="70" transform="rotate(-14 210 119)" />
          <ellipse className="ob-orbit orbit-two" cx="210" cy="119" rx="142" ry="51" transform="rotate(13 210 119)" />
          <ellipse className="ob-orbit orbit-three" cx="210" cy="119" rx="198" ry="82" transform="rotate(-3 210 119)" />
        </g>

        <g className="ob-network-lines">
          <path d="M43 111 C92 76, 144 65, 193 91" />
          <path d="M235 86 C283 58, 336 67, 379 105" />
          <path d="M58 158 C112 188, 164 185, 206 158" />
          <path d="M222 163 C272 195, 328 184, 365 146" />
        </g>

        <g filter="url(#ob-brain-shadow)">
          <path
            className="ob-brain-shell ob-brain-left-shell"
            d="M205 41C185 27 153 28 128 45C101 63 89 91 89 121C89 162 113 194 149 202C173 207 198 196 207 174C216 150 203 130 211 105C219 79 222 55 205 41Z"
          />
          <path
            className="ob-brain-shell ob-brain-right-shell"
            d="M215 41C235 27 267 28 292 45C319 63 331 91 331 121C331 162 307 194 271 202C247 207 222 196 213 174C204 150 217 130 209 105C201 79 198 55 215 41Z"
          />
          <path className="ob-brain-stem" d="M204 168C202 189 197 205 187 220" />
          <path className="ob-brain-stem" d="M216 168C218 189 223 205 233 220" />
          <path className="ob-brain-divider" d="M210 43C214 69 204 89 211 111C218 135 210 153 211 179" />

          <g className="ob-brain-folds ob-left-folds">
            <path d="M188 57C165 50 145 59 137 77" />
            <path d="M178 74C153 77 134 94 136 115" />
            <path d="M194 94C169 91 147 104 146 126" />
            <path d="M188 121C166 121 145 137 148 160" />
            <path d="M200 146C181 153 169 169 171 190" />
            <path d="M126 91C111 108 111 134 128 151" />
            <path d="M145 58C151 80 146 93 129 105" />
            <path d="M169 96C181 111 180 130 164 142" />
            <path d="M166 153C144 159 130 172 132 190" />
            <path d="M198 69C190 84 191 98 202 111" />
          </g>

          <g className="ob-brain-folds ob-right-folds">
            <path d="M232 57C255 50 275 59 283 77" />
            <path d="M242 74C267 77 286 94 284 115" />
            <path d="M226 94C251 91 273 104 274 126" />
            <path d="M232 121C254 121 275 137 272 160" />
            <path d="M220 146C239 153 251 169 249 190" />
            <path d="M294 91C309 108 309 134 292 151" />
            <path d="M275 58C269 80 274 93 291 105" />
            <path d="M251 96C239 111 240 130 256 142" />
            <path d="M254 153C276 159 290 172 288 190" />
            <path d="M222 69C230 84 229 98 218 111" />
          </g>

          <g className="ob-brain-nodes ob-left-nodes">
            <circle cx="145" cy="68" r="4" />
            <circle cx="166" cy="85" r="4.5" />
            <circle cx="128" cy="112" r="4" />
            <circle cx="173" cy="130" r="4.5" />
            <circle cx="149" cy="165" r="4" />
            <circle cx="190" cy="181" r="4" />
          </g>
          <g className="ob-brain-nodes ob-right-nodes">
            <circle cx="275" cy="68" r="4" />
            <circle cx="254" cy="85" r="4.5" />
            <circle cx="292" cy="112" r="4" />
            <circle cx="247" cy="130" r="4.5" />
            <circle cx="271" cy="165" r="4" />
            <circle cx="230" cy="181" r="4" />
          </g>
        </g>

        <g className="ob-signal-nodes">
          <circle cx="72" cy="86" r="5" />
          <circle cx="342" cy="73" r="5" />
          <circle cx="348" cy="166" r="4" />
          <circle cx="92" cy="176" r="4" />
        </g>
      </svg>
    </div>
  );
}

function RadarAnimation() {
  return (
    <div className="ob-radar-wrapper">
      <div className="ob-radar-ring" style={{ animationDelay: "0s" }} />
      <div className="ob-radar-ring" style={{ animationDelay: "1s" }} />
      <div className="ob-radar-ring" style={{ animationDelay: "2s" }} />
      <div className="ob-radar-core">
        <Activity size={14} />
      </div>
    </div>
  );
}

export function OffboardingPage() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<"automatico" | "manual">("automatico");
  const [offset, setOffset] = useState(1);
  const [backlogWindow, setBacklogWindow] = useState<number | "all">(30);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const dayQueries = useQueries({
    queries: TIMELINE_OFFSETS.map((item) => ({
      queryKey: ["offboarding-day", item.offset],
      queryFn: () => api.offboardingByDay(token!, item.offset),
      enabled: Boolean(token),
    })),
  });

  const backlogQuery = useQuery({
    queryKey: ["offboarding-backlog", backlogWindow],
    queryFn: () => api.offboardingBacklog(token!, backlogWindow),
    enabled: Boolean(token),
  });

  const recoveryQuery = useQuery({
    queryKey: ["lifecycle-recovery"],
    queryFn: () => api.lifecycleRecovery(token!),
    enabled: Boolean(token),
  });

  const overviewQuery = useQuery({
    queryKey: ["lifecycle-overview"],
    queryFn: () => api.lifecycleOverview(token!),
    enabled: Boolean(token),
  });

  const sendMutation = useMutation({
    mutationFn: (ids: string[]) => api.offboardingSend(token!, ids),
    onSuccess: (result) => {
      setSelected(new Set());
      setToast({
        kind: "ok",
        text: result.skippedReason === "recent_duplicate"
          ? "Envio repetido bloqueado: esse cliente já foi disparado agora há pouco."
          : result.sent
            ? `Enviado! ${result.customers.length} cliente(s) disparado(s) para o grupo.`
            : "Nenhuma mensagem enviada.",
      });
      setTimeout(() => setToast(null), 5000);
    },
    onError: (error) => {
      setToast({ kind: "err", text: `Falha ao enviar: ${String(error)}` });
      setTimeout(() => setToast(null), 6000);
    },
  });

  const selectedIdx = TIMELINE_OFFSETS.findIndex((t) => t.offset === offset);
  const selectedQueryData = dayQueries[selectedIdx]?.data;
  const dayCustomers = selectedQueryData?.customers ?? [];
  const backlog = backlogQuery.data?.customers ?? [];

  const activeList = activeTab === "automatico" ? dayCustomers : backlog;
  const allSelected = activeList.length > 0 && activeList.every((c) => selected.has(c.customerId));
  const selectedList = useMemo(() => Array.from(selected), [selected]);

  const meta = dayMeta(offset);

  const currentTimelineIndex = TIMELINE_OFFSETS.findIndex((t) => t.offset === offset);

  function goPrev() {
    if (currentTimelineIndex > 0) {
      const prevItem = TIMELINE_OFFSETS[currentTimelineIndex - 1];
      if (prevItem) {
        setOffset(prevItem.offset);
      }
    }
  }

  function goNext() {
    if (currentTimelineIndex < TIMELINE_OFFSETS.length - 1) {
      const nextItem = TIMELINE_OFFSETS[currentTimelineIndex + 1];
      if (nextItem) {
        setOffset(nextItem.offset);
      }
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(activeList.map((c) => c.customerId)));
  }

  const timelineCards = useMemo(() => {
    return TIMELINE_OFFSETS.map((item, idx) => {
      const q = dayQueries[idx];
      const customers = q?.data?.customers ?? [];
      const clientsCount = customers.length;
      const screensCount = customers.reduce((acc, c) => acc + c.avgPiecesPerMonth, 0);

      const m = dayMeta(item.offset);
      return {
        ...item,
        dateLabel: m.dateStr.split(",")[1]?.trim() || m.dateStr,
        clientsCount,
        screensCount,
      };
    });
  }, [dayQueries]);

  const recData = recoveryQuery.data;
  const rawRate = recData?.recoveryRate ?? 0;
  const recoveryRateStr = rawRate <= 1 ? (rawRate * 100).toFixed(1) + "%" : rawRate.toFixed(1) + "%";
  const recoveredCount = recData?.recoveredCount ?? 0;
  const messagesSent = recData?.messagesSent ?? 0;
  const contactedCount = recData?.contacted ?? 0;

  const ovData = overviewQuery.data;
  const totalWatched = ovData?.totalWatched ?? 0;
  const stageCounts = ovData?.stageCounts ?? {
    ATENCAO_1: 0,
    ATENCAO_2: 0,
    INATIVO: 0,
    INATIVO_30: 0,
  };

  const timelineClientsTotal = timelineCards.reduce((sum, item) => sum + item.clientsCount, 0);
  const timelineScreensTotal = timelineCards.reduce((sum, item) => sum + item.screensCount, 0);
  const todayCard = timelineCards.find((item) => item.offset === 0);
  const tomorrowCard = timelineCards.find((item) => item.offset === 1);
  const runHourLabel =
    overviewQuery.isLoading || ovData?.runHour === undefined ? "..." : `${String(ovData.runHour).padStart(2, "0")}:00`;
  const automationStateLabel = overviewQuery.isLoading
    ? "..."
    : ovData?.simulationOnly
      ? "Simulação"
      : ovData?.automationEnabled
        ? "Ativa"
        : "Desligada";
  const statusBadgeLabel = overviewQuery.isLoading
    ? "VERIFICANDO"
    : ovData?.simulationOnly
      ? "SIMULAÇÃO"
      : ovData?.automationEnabled
        ? "AUTOMAÇÃO ATIVA"
        : "AUTOMAÇÃO DESLIGADA";

  return (
    <div className="page-stack ob-page-stack">
      <style>{OB_STYLES}</style>

      {toast ? <div className={`ob-toast ${toast.kind}`}>{toast.text}</div> : null}

      <div className="ob-page-container">
        <div className="ob-top-grid">
          <section className="panel ob-hero-card">
            <div className="ob-hero-wrapper">
              <div className="ob-hero-copy">
                <div className="ob-hero-badges">
                  <span className="ob-badge-status">
                    <span className="ob-dot pulse-green" /> {statusBadgeLabel}
                  </span>
                  <span className="ob-badge-pulse">
                    <span className="ob-dot pulse-blue" /> BASE MONITORADA
                  </span>
                </div>

                <h2 className="ob-hero-title">
                  Cérebro de Recuperação <span>24/7</span>
                </h2>
                <p className="ob-hero-subtitle">
                  Acompanhe clientes próximos da inatividade, backlog e recuperação usando os dados atuais da base.
                </p>

                <div className="ob-hero-metrics">
                  <div className="ob-hero-metric-box">
                    <Clock size={15} className="text-blue" />
                    <div>
                      <span>Hora da rotina</span>
                      <strong>{runHourLabel}</strong>
                    </div>
                  </div>
                  <div className="ob-hero-metric-box">
                    <Zap size={15} className="text-purple" />
                    <div>
                      <span>Automação</span>
                      <strong>{automationStateLabel}</strong>
                    </div>
                  </div>
                </div>
              </div>

              <div className="ob-hero-brain-column">
                <BrainSignalVisual />
                <div className="ob-brain-tasks">
                  <div className="ob-task-item"><span className="task-dot cyan" /> Analisando comportamento</div>
                  <div className="ob-task-item"><span className="task-dot cyan" /> Detectando padrões</div>
                  <div className="ob-task-item"><span className="task-dot purple" /> Prevendo risco de saída</div>
                  <div className="ob-task-item"><span className="task-dot purple" /> Preparando follow-ups</div>
                  <div className="ob-task-item"><span className="task-dot magenta" /> Aguardando momento certo</div>
                  <div className="ob-task-item"><span className="task-dot magenta" /> Agindo automaticamente</div>
                </div>
              </div>
            </div>
          </section>

          <section className="panel ob-activity-card">
            <div className="ob-activity-header">
              <span className="ob-activity-label">ATIVIDADE DA BASE</span>
              <span className="ob-activity-pill"><span className="ob-dot pulse-green" /> Dados reais</span>
            </div>
            <div className="ob-activity-radar-box">
              <RadarAnimation />
              <div>
                <h3 className="ob-activity-count">
                  {overviewQuery.isLoading ? "..." : totalWatched.toLocaleString("pt-BR")}
                </h3>
                <span className="ob-activity-subtext">
                  {timelineClientsTotal.toLocaleString("pt-BR")} clientes / {timelineScreensTotal.toLocaleString("pt-BR")} telas na timeline
                </span>
              </div>
            </div>
            <div className="ob-activity-stats-grid">
              <div className="ob-activity-stat-card">
                <span className="ob-activity-stat-label">Hoje</span>
                <strong className="ob-activity-stat-val">
                  {todayCard ? todayCard.clientsCount.toLocaleString("pt-BR") : "..."}
                </strong>
              </div>
              <div className="ob-activity-stat-card">
                <span className="ob-activity-stat-label">Amanhã</span>
                <strong className="ob-activity-stat-val">
                  {tomorrowCard ? tomorrowCard.clientsCount.toLocaleString("pt-BR") : "..."}
                </strong>
              </div>
              <div className="ob-activity-stat-card">
                <span className="ob-activity-stat-label">Backlog</span>
                <strong className="ob-activity-stat-val">
                  {backlogQuery.isLoading ? "..." : backlog.length.toLocaleString("pt-BR")}
                </strong>
              </div>
            </div>
          </section>
        </div>

        <div className="ob-grid">
          <div className="ob-main-column">

            {/* Timeline of automatic alerts */}
            <section className="panel ob-timeline-section">
              <h4 className="ob-section-eyebrow">LINHA DO TEMPO • ALERTAS AUTOMÁTICOS</h4>

              <div className="ob-timeline-navigation">
                <button
                  type="button"
                  className="ob-timeline-arrow"
                  onClick={goPrev}
                  disabled={currentTimelineIndex === 0}
                  aria-label="Voltar dia"
                >
                  <ChevronLeft size={18} />
                </button>

                <div className="ob-timeline-cards-row">
                  <div className="ob-timeline-line" />
                  {timelineCards.map((card) => {
                    const isSelected = offset === card.offset;
                    return (
                      <button
                        key={card.offset}
                        type="button"
                        className={`ob-timeline-card ${isSelected ? "active" : ""}`}
                        onClick={() => {
                          setOffset(card.offset);
                          setSelected(new Set());
                        }}
                      >
                        <div className="ob-card-top">
                          <span className="ob-card-label">{card.label}</span>
                          <span className="ob-card-date">{card.dateLabel}</span>
                        </div>
                        <div className="ob-card-center-dot">
                          {isSelected ? (
                            <svg viewBox="0 0 24 24" width="10" height="10" fill="#2563eb" stroke="#2563eb" strokeWidth="2">
                              <path d="M12 22a7 7 0 0 0 7-7c0-4.3-7-11-7-11S5 10.7 5 15a7 7 0 0 0 7 7z" />
                            </svg>
                          ) : (
                            <span className="ob-timeline-dot" />
                          )}
                        </div>
                        <div className="ob-card-stats">
                          <strong>{card.clientsCount} {card.clientsCount === 1 ? "cliente" : "clientes"}</strong>
                          <span>{card.screensCount.toLocaleString("pt-BR")} telas</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  className="ob-timeline-arrow"
                  onClick={goNext}
                  disabled={currentTimelineIndex === TIMELINE_OFFSETS.length - 1}
                  aria-label="Avançar dia"
                >
                  <ChevronRight size={18} />
                </button>
              </div>

              <div className="ob-timeline-dots">
                {TIMELINE_OFFSETS.map((item) => {
                  const isActive = offset === item.offset;
                  return (
                    <span
                      key={item.offset}
                      className={`ob-timeline-nav-dot ${isActive ? "active" : ""}`}
                    />
                  );
                })}
              </div>
            </section>

            {/* Client List Section */}
            <section className="panel ob-list-panel">
              <div className="ob-list-header">
                <div>
                  <h3 className="ob-list-title">
                    {activeTab === "automatico"
                      ? `Clientes em risco de offboarding ${offset === 0 ? "hoje" : offset === 1 ? "amanhã" : meta.title.toLowerCase()} (${meta.dateStr.split(",")[1]?.trim() || meta.dateStr})`
                      : "Clientes já inativos · Envio manual"}
                  </h3>
                  <p className="ob-list-subtitle">
                    {activeTab === "automatico"
                      ? `Sistema detectou ${dayCustomers.length} cliente${dayCustomers.length !== 1 ? "s" : ""} em risco de inatividade.`
                      : `Selecione e dispare follow-ups manuais para os clientes na fila de inatividade.`}
                  </p>
                </div>

                <div className="ob-tabs">
                  <button
                    type="button"
                    className={`ob-tab-btn ${activeTab === "automatico" ? "active" : ""}`}
                    onClick={() => {
                      setActiveTab("automatico");
                      setSelected(new Set());
                    }}
                  >
                    Alertas Automáticos
                  </button>
                  <button
                    type="button"
                    className={`ob-tab-btn ${activeTab === "manual" ? "active" : ""}`}
                    onClick={() => {
                      setActiveTab("manual");
                      setSelected(new Set());
                    }}
                  >
                    Envio Manual (Backlog)
                  </button>
                </div>
              </div>

              {activeTab === "manual" && (
                <div className="ob-backlog-filters">
                  <span>Filtrar janela de inatividade:</span>
                  <div className="ob-chips">
                    {WINDOW_OPTIONS.map((opt) => (
                      <button
                        key={String(opt.value)}
                        type="button"
                        className={`page-filter-chip ${backlogWindow === opt.value ? "active" : ""}`}
                        onClick={() => {
                          setBacklogWindow(opt.value);
                          setSelected(new Set());
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {((activeTab === "automatico" && dayQueries[selectedIdx]?.isLoading) || (activeTab === "manual" && backlogQuery.isLoading)) ? (
                <div className="page-loading">Analisando carteira e buscando clientes em risco...</div>
              ) : activeList.length === 0 ? (
                <div className="ob-empty">
                  <CheckCircle2 size={32} />
                  <p>Nenhum cliente em risco detectado nesta seleção.</p>
                  <span>A tela exibirá novos clientes quando houver alertas reais para esta seleção.</span>
                </div>
              ) : (
                <>
                  <div className="ob-table-container">
                    <table className="ob-table">
                      <thead>
                        <tr>
                          <th style={{ width: "45px", textAlign: "center" }}>
                            <input type="checkbox" className="ob-check" checked={allSelected} onChange={toggleAll} />
                          </th>
                          <th style={{ width: "23%" }}>CLIENTE</th>
                          <th style={{ width: "13%" }}>ÚLTIMA COMPRA</th>
                          <th style={{ width: "12%" }}>DIAS INATIVO</th>
                          <th style={{ width: "14%" }}>VOLUME</th>
                          <th style={{ width: "18%" }}>AUTOMAÇÃO</th>
                          <th style={{ width: "10%" }}>URGÊNCIA</th>
                          <th style={{ width: "10%", textAlign: "right", paddingRight: "1.5rem" }}>AÇÃO</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeList.map((customer) => {
                          const isRowSelected = selected.has(customer.customerId);
                          const u = urgency(customer.avgPiecesPerMonth);
                          return (
                            <tr
                              key={customer.customerId}
                              className={`ob-table-row ${isRowSelected ? "is-selected" : ""}`}
                              onClick={() => toggle(customer.customerId)}
                            >
                              <td style={{ textAlign: "center" }}>
                                <input
                                  type="checkbox"
                                  className="ob-check"
                                  checked={isRowSelected}
                                  onChange={() => toggle(customer.customerId)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </td>
                              <td>
                                <div className="ob-client-info">
                                  <span className="ob-client-accent" style={{ background: u.color }} />
                                  <div>
                                    <strong className="ob-client-name" title={customer.displayName}>{customer.displayName}</strong>
                                    <span className="ob-client-code">cód. {customer.customerCode || "—"}</span>
                                  </div>
                                </div>
                              </td>
                              <td>
                                <span className="ob-cell-date">{formatBrDate(customer.lastPurchaseAt)}</span>
                              </td>
                              <td>
                                <span className="ob-cell-highlight">{customer.daysSinceLastPurchase} dias</span>
                              </td>
                              <td>
                                <div className="ob-cell-volume-stack">
                                  <strong className="ob-cell-screens">~{customer.avgPiecesPerMonth} telas</strong>
                                  <span className="ob-cell-orders">{customer.totalOrders} compras</span>
                                </div>
                              </td>
                              <td>
                                <div className="ob-prepared-badge">
                                  <span className="ob-channel-dot" />
                                  <span>WhatsApp · Reativação</span>
                                </div>
                              </td>
                              <td>
                                <span className="ob-pill" style={{ background: u.soft, color: u.color }}>
                                  <span className="pill-dot" style={{ background: u.color }} /> {u.label}
                                </span>
                              </td>
                              <td style={{ textAlign: "right", paddingRight: "1.5rem" }} onClick={(e) => e.stopPropagation()}>
                                <div style={{ display: "inline-flex", alignItems: "center", gap: "0.55rem" }}>
                                  <button
                                    type="button"
                                    className="page-btn-primary page-btn-sm"
                                    disabled={sendMutation.isPending}
                                    onClick={() => sendMutation.mutate([customer.customerId])}
                                  >
                                    Enviar
                                  </button>
                                  <button type="button" className="ob-more-btn" aria-label="Ações adicionais">
                                    <MoreVertical size={16} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="ob-sendbar">
                    <label className="ob-selectall">
                      <input type="checkbox" className="ob-check" checked={allSelected} onChange={toggleAll} />
                      Selecionar todos os clientes listados <strong>({activeList.length})</strong>
                    </label>
                    <button
                      type="button"
                      className="page-btn-primary"
                      disabled={selectedList.length === 0 || sendMutation.isPending}
                      onClick={() => sendMutation.mutate(selectedList)}
                    >
                      <Send size={15} />
                      {sendMutation.isPending ? "Enviando..." : `Enviar ${selectedList.length} ao grupo`}
                    </button>
                  </div>
                </>
              )}
            </section>
          </div>

          <div className="ob-sidebar-column">
            {/* Entenda o Risco Vertical Stepper */}
            <section className="panel ob-sidebar-card">
              <h4 className="ob-sidebar-title">ENTENDA O RISCO</h4>

              <div className="ob-flowchart">
                <div className="ob-flow-step">
                  <div className="ob-flow-icon border-blue"><User size={14} className="text-blue" /></div>
                  <div className="ob-flow-text">
                    <strong>Cliente parado</strong>
                    <span>+30 dias sem comprar</span>
                  </div>
                </div>

                <div className="ob-flow-step">
                  <div className="ob-flow-icon border-blue"><Network size={14} className="text-blue" /></div>
                  <div className="ob-flow-text">
                    <strong>Régua de inatividade</strong>
                    <span>Classifica pelo histórico de compra</span>
                  </div>
                </div>

                <div className="ob-flow-step">
                  <div className="ob-flow-icon border-purple"><AlertTriangle size={14} className="text-purple" /></div>
                  <div className="ob-flow-text">
                    <strong>Marca risco</strong>
                    <span>Faixa de prioridade</span>
                  </div>
                </div>

                <div className="ob-flow-step">
                  <div className="ob-flow-icon border-purple"><Send size={14} className="text-purple" /></div>
                  <div className="ob-flow-text">
                    <strong>Prepara ação</strong>
                    <span>Usa o template configurado</span>
                  </div>
                </div>

                <div className="ob-flow-step">
                  <div className="ob-flow-icon border-purple"><Clock size={14} className="text-purple" /></div>
                  <div className="ob-flow-text">
                    <strong>Aguarda resposta</strong>
                    <span>Acompanha retorno do contato</span>
                  </div>
                </div>

                <div className="ob-flow-step">
                  <div className="ob-flow-icon border-magenta"><Activity size={14} className="text-magenta" /></div>
                  <div className="ob-flow-text">
                    <strong>Aciona vendedora</strong>
                    <span>Alerta se não responder</span>
                  </div>
                </div>

                <div className="ob-flow-step">
                  <div className="ob-flow-icon bg-pink"><Trophy size={14} className="text-white" /></div>
                  <div className="ob-flow-text">
                    <strong>Recuperação</strong>
                    <span>Cliente engaja e reativa</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Performance da Recuperação Widget */}
            <section className="panel ob-sidebar-card">
              <div className="ob-perf-header">
                <h4 className="ob-sidebar-title">PERFORMANCE DA RECUPERAÇÃO</h4>
                <TrendingUp size={15} className="text-purple" />
              </div>

              <div className="ob-perf-metrics">
                <div className="ob-perf-overview-row">
                  <div className="ob-perf-circular-chart">
                    <svg viewBox="0 0 36 36" className="circular-chart-svg">
                      <path
                        className="circle-bg"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="rgba(99, 102, 241, 0.05)"
                        strokeWidth="3.2"
                      />
                      <path
                        className="circle"
                        strokeDasharray={`${rawRate <= 1 ? (rawRate * 100).toFixed(1) : rawRate.toFixed(1)}, 100`}
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="url(#perfCircleGrad)"
                        strokeWidth="3.2"
                        strokeLinecap="round"
                      />
                      <defs>
                        <linearGradient id="perfCircleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#3b82f6" />
                          <stop offset="50%" stopColor="#8b5cf6" />
                          <stop offset="100%" stopColor="#d946ef" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="ob-perf-circular-val">
                      <strong>{recoveryQuery.isLoading ? "..." : recoveryRateStr}</strong>
                    </div>
                  </div>
                  <div className="ob-perf-main-text">
                    <span className="ob-perf-label">Taxa de recuperação</span>
                    <h3 className="ob-perf-val text-dark">{recoveryQuery.isLoading ? "..." : recoveryRateStr}</h3>
                    <span className="text-secondary font-xs font-semibold">Calculado por clientes que voltaram a comprar</span>
                  </div>
                </div>

                <div className="ob-perf-grid">
                  <div className="ob-perf-grid-item">
                    <span className="ob-perf-label">Recuperados</span>
                    <strong className="ob-perf-subval">{recoveryQuery.isLoading ? "..." : recoveredCount.toLocaleString("pt-BR")}</strong>
                  </div>
                  <div className="ob-perf-grid-item">
                    <span className="ob-perf-label">Contatados</span>
                    <strong className="ob-perf-subval">{recoveryQuery.isLoading ? "..." : contactedCount.toLocaleString("pt-BR")}</strong>
                  </div>
                  <div className="ob-perf-grid-item">
                    <span className="ob-perf-label">Follow-ups</span>
                    <strong className="ob-perf-subval">{recoveryQuery.isLoading ? "..." : messagesSent.toLocaleString("pt-BR")}</strong>
                  </div>
                  <div className="ob-perf-grid-item">
                    <span className="ob-perf-label">Ultimos recuperados</span>
                    <strong className="ob-perf-subval">{recoveryQuery.isLoading ? "..." : (recData?.recovered.length ?? 0).toLocaleString("pt-BR")}</strong>
                  </div>
                </div>
              </div>

              <div className="ob-recovered-list">
                {recoveryQuery.isLoading ? (
                  <span>Carregando recuperacoes...</span>
                ) : recData?.recovered.length ? (
                  recData.recovered.slice(0, 3).map((item) => (
                    <div key={`${item.customerId}-${item.recoverDate}`} className="ob-recovered-row">
                      <strong>{item.displayName}</strong>
                      <span>{formatBrDate(item.recoverDate)} - {item.daysToRecover} dias</span>
                    </div>
                  ))
                ) : (
                  <span>Nenhuma recuperacao registrada ainda.</span>
                )}
              </div>
            </section>
          </div>
        </div>

        {/* Footer Live Automation Stepper */}
        <section className="panel ob-footer-stepper">
          <h4 className="ob-section-eyebrow">AUTOMAÇÃO TRABALHANDO AGORA</h4>

          <div className="ob-stepper-row">
            <div className="ob-stepper-node">
              <div className="ob-stepper-icon active-pulse"><RadarAnimation /></div>
              <div className="ob-stepper-copy">
                <strong>Monitorando</strong>
                <span>{overviewQuery.isLoading ? "..." : totalWatched.toLocaleString("pt-BR")} clientes</span>
              </div>
              <div className="ob-stepper-connector" />
            </div>

            <div className="ob-stepper-node">
              <div className="ob-stepper-icon border-blue"><Activity size={16} className="text-blue" /></div>
              <div className="ob-stepper-copy">
                <strong>Detectando risco</strong>
                <span>{overviewQuery.isLoading ? "..." : stageCounts.ATENCAO_1.toLocaleString("pt-BR")} clientes</span>
              </div>
              <div className="ob-stepper-connector" />
            </div>

            <div className="ob-stepper-node">
              <div className="ob-stepper-icon border-purple"><Send size={16} className="text-purple" /></div>
              <div className="ob-stepper-copy">
                <strong>Programando envio</strong>
                <span>{overviewQuery.isLoading ? "..." : stageCounts.ATENCAO_2.toLocaleString("pt-BR")} follow-ups</span>
              </div>
              <div className="ob-stepper-connector" />
            </div>

            <div className="ob-stepper-node">
              <div className="ob-stepper-icon border-purple"><Clock size={16} className="text-purple" /></div>
              <div className="ob-stepper-copy">
                <strong>Aguardando resposta</strong>
                <span>{overviewQuery.isLoading ? "..." : stageCounts.INATIVO.toLocaleString("pt-BR")} clientes</span>
              </div>
              <div className="ob-stepper-connector" />
            </div>

            <div className="ob-stepper-node">
              <div className="ob-stepper-icon border-orange"><User size={16} className="text-orange" /></div>
              <div className="ob-stepper-copy">
                <strong>Handoff humano</strong>
                <span>{overviewQuery.isLoading ? "..." : stageCounts.INATIVO_30.toLocaleString("pt-BR")} clientes</span>
              </div>
              <div className="ob-stepper-connector" />
            </div>

            <div className="ob-stepper-node">
              <div className="ob-stepper-icon bg-green-light"><Trophy size={16} className="text-green" /></div>
              <div className="ob-stepper-copy">
                <strong>Recuperação</strong>
                <span>Hoje: {recoveryQuery.isLoading ? "..." : recoveredCount.toLocaleString("pt-BR")}</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

const OB_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

  .ob-page-stack {
    background: linear-gradient(180deg, #F6F8FC 0%, #FAFBFD 50%, #FCFDFF 100%);
    min-height: calc(100vh - 100px);
    padding: 0.65rem;
    font-family: 'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, sans-serif;
  }

  .ob-page-container {
    max-width: 1440px;
    margin: 0 auto;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .ob-top-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
    align-items: stretch;
  }

  .ob-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
    align-items: start;
  }

  @media (min-width: 1100px) {
    .ob-top-grid {
      grid-template-columns: minmax(0, 1fr) 300px;
    }

    .ob-grid {
      grid-template-columns: minmax(0, 1fr) 300px;
    }
  }

  /* Premium Glassmorphism Panels */
  .panel {
    background: rgba(255, 255, 255, 0.86) !important;
    backdrop-filter: blur(14px) saturate(125%);
    -webkit-backdrop-filter: blur(14px) saturate(125%);
    border: 1px solid rgba(219, 226, 240, 0.9) !important;
    box-shadow: 
      0 6px 18px -10px rgba(15, 23, 42, 0.18),
      0 18px 40px -28px rgba(99, 102, 241, 0.22),
      inset 0 1px 0 rgba(255, 255, 255, 0.9) !important;
    border-radius: 8px;
    padding: 0.9rem;
    margin-bottom: 0;
    transition: box-shadow 0.2s ease;
  }

  .panel:hover {
    box-shadow: 
      0 10px 24px -18px rgba(15, 23, 42, 0.25),
      0 20px 48px -32px rgba(99, 102, 241, 0.22),
      inset 0 1px 0 rgba(255, 255, 255, 0.9) !important;
  }

  /* Hero Section Restructuring */
  .ob-hero-card {
    border: 1px solid rgba(99, 102, 241, 0.12) !important;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.92), rgba(248, 250, 255, 0.78)) !important;
    padding: 0.75rem 0.85rem !important;
    overflow: hidden;
  }
  .ob-hero-wrapper {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    min-height: 164px;
  }

  @media (min-width: 768px) {
    .ob-hero-wrapper {
      display: grid;
      grid-template-columns: minmax(245px, 0.9fr) minmax(0, 1.1fr);
      align-items: center;
      gap: 0.8rem;
    }
  }

  @media (min-width: 1200px) {
    .ob-hero-wrapper {
      grid-template-columns: minmax(250px, 0.95fr) minmax(0, 1.2fr);
      gap: 0.75rem;
    }
  }

  .ob-hero-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .ob-hero-badges {
    display: flex;
    gap: 0.45rem;
    margin-bottom: 0.65rem;
    flex-wrap: wrap;
  }
  .ob-badge-status {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.22rem 0.58rem;
    background: rgba(16, 185, 129, 0.06);
    color: #047857;
    font-size: 0.63rem;
    font-weight: 800;
    border-radius: 99px;
    letter-spacing: 0;
    border: 1px solid rgba(16, 185, 129, 0.12);
  }
  .ob-badge-pulse {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.22rem 0.58rem;
    background: rgba(37, 99, 235, 0.05);
    color: #1d4ed8;
    font-size: 0.63rem;
    font-weight: 800;
    border-radius: 99px;
    letter-spacing: 0;
    border: 1px solid rgba(37, 99, 235, 0.1);
  }
  .ob-dot {
    width: 6.5px;
    height: 6.5px;
    border-radius: 50%;
    display: inline-block;
  }
  .pulse-green {
    background: #10b981;
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.6);
    animation: pulse-g 2.2s infinite;
  }
  .pulse-blue {
    background: #2563eb;
    box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.6);
    animation: pulse-b 2.2s infinite;
  }

  .ob-hero-title {
    font-family: 'Outfit', sans-serif;
    font-size: 1.62rem;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: 0;
    margin: 0 0 0.28rem 0;
    line-height: 1.1;
  }
  .ob-hero-title span {
    background: linear-gradient(135deg, #3b82f6, #8b5cf6 50%, #d946ef);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .ob-hero-subtitle {
    color: #475569;
    font-size: 0.74rem;
    line-height: 1.38;
    margin: 0 0 0.78rem 0;
    max-width: 340px;
  }
  
  .ob-hero-metrics {
    display: flex;
    gap: 0.55rem;
    flex-wrap: wrap;
  }
  .ob-hero-metric-box {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 126px;
    padding: 0.42rem 0.55rem;
    border: 1px solid rgba(226, 232, 240, 0.9);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.72);
    box-shadow: 0 6px 16px -14px rgba(37, 99, 235, 0.28);
  }
  .ob-hero-metric-box span {
    font-size: 0.62rem;
    color: #64748b;
    display: block;
    line-height: 1.3;
    font-weight: 500;
  }
  .ob-hero-metric-box strong {
    font-size: 0.72rem;
    color: #1e293b;
    display: block;
    margin-top: 0.05rem;
    font-weight: 700;
  }

  .ob-hero-brain-column {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-width: 0;
    gap: 0.5rem;
  }

  @media (max-width: 860px) {
    .ob-hero-brain-column {
      flex-wrap: wrap;
      justify-content: flex-start;
    }
  }

  .ob-brain-visual {
    position: relative;
    width: 230px;
    height: 160px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
  }

  @media (min-width: 1400px) {
    .ob-brain-visual {
      width: 270px;
      height: 178px;
    }
  }

  .ob-brain-svg {
    width: 100%;
    height: 100%;
    overflow: visible;
    display: block;
  }

  .ob-brain-glow {
    opacity: 0.92;
  }

  .ob-orbit {
    fill: none;
    stroke: rgba(96, 165, 250, 0.2);
    stroke-width: 1;
    stroke-dasharray: 10 9;
    transform-origin: 210px 119px;
    animation: ob-orbit-drift 10s ease-in-out infinite;
  }

  .ob-orbit.orbit-two {
    stroke: rgba(217, 70, 239, 0.2);
    animation-duration: 12s;
    animation-direction: reverse;
  }

  .ob-orbit.orbit-three {
    stroke: rgba(14, 165, 233, 0.14);
    stroke-dasharray: 2 13;
    animation-duration: 14s;
  }

  .ob-network-lines path {
    fill: none;
    stroke: rgba(37, 99, 235, 0.16);
    stroke-width: 1;
    stroke-linecap: round;
    stroke-dasharray: 3 8;
  }

  .ob-brain-shell {
    stroke: rgba(255, 255, 255, 0.78);
    stroke-width: 2;
  }

  .ob-brain-left-shell {
    fill: url(#ob-brain-left-gradient);
  }

  .ob-brain-right-shell {
    fill: url(#ob-brain-right-gradient);
  }

  .ob-brain-divider {
    fill: none;
    stroke: rgba(255, 255, 255, 0.88);
    stroke-width: 3;
    stroke-linecap: round;
  }

  .ob-brain-stem {
    fill: none;
    stroke: rgba(96, 165, 250, 0.48);
    stroke-width: 3;
    stroke-linecap: round;
  }

  .ob-brain-folds path {
    fill: none;
    stroke: rgba(255, 255, 255, 0.72);
    stroke-width: 3.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .ob-left-folds path {
    stroke: rgba(219, 246, 255, 0.78);
  }

  .ob-right-folds path {
    stroke: rgba(250, 232, 255, 0.78);
  }

  .ob-brain-nodes circle {
    fill: rgba(255, 255, 255, 0.66);
    stroke: rgba(255, 255, 255, 0.62);
    stroke-width: 1;
    animation: ob-node-pulse 2.7s ease-in-out infinite;
  }

  .ob-right-nodes circle {
    animation-delay: 0.3s;
  }

  .ob-signal-nodes circle {
    fill: #2563eb;
    stroke: rgba(255, 255, 255, 0.85);
    stroke-width: 2;
    filter: drop-shadow(0 0 8px rgba(37, 99, 235, 0.32));
    animation: ob-node-pulse 3.2s ease-in-out infinite;
  }

  .ob-signal-nodes circle:nth-child(2) {
    fill: #06b6d4;
    animation-delay: 0.45s;
  }

  .ob-signal-nodes circle:nth-child(3) {
    fill: #d946ef;
    animation-delay: 0.8s;
  }

  .ob-signal-nodes circle:nth-child(4) {
    fill: #60a5fa;
    animation-delay: 1.1s;
  }

  @keyframes ob-orbit-drift {
    0%, 100% { transform: rotate(0deg) scale(1); }
    50% { transform: rotate(4deg) scale(1.015); }
  }

  @keyframes ob-node-pulse {
    0%, 100% { opacity: 0.56; transform: scale(0.92); }
    50% { opacity: 1; transform: scale(1.14); }
  }

  .ob-brain-tasks {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.32rem;
    margin-top: 0;
    width: auto;
    min-width: 138px;
  }
  .ob-task-item {
    font-size: 0.64rem;
    color: #475569;
    font-weight: 650;
    display: flex;
    align-items: center;
    gap: 0.34rem;
    white-space: nowrap;
  }
  .task-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    display: inline-block;
  }
  .task-dot.cyan { background: #06b6d4; }
  .task-dot.purple { background: #a855f7; }
  .task-dot.magenta { background: #d946ef; }

  .ob-activity-card {
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(248, 250, 255, 0.84)) !important;
    border: 1px solid rgba(226, 232, 240, 0.9) !important;
    padding: 0.85rem !important;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    height: 100%;
    min-height: 180px;
  }
  .ob-activity-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.55rem;
  }
  .ob-activity-label {
    font-size: 0.62rem;
    font-weight: 800;
    color: #4f46e5;
    letter-spacing: 0;
  }
  .ob-activity-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.18rem 0.45rem;
    background: rgba(16, 185, 129, 0.06);
    color: #059669;
    font-size: 0.58rem;
    font-weight: 800;
    border-radius: 99px;
    border: 1px solid rgba(16, 185, 129, 0.1);
    white-space: nowrap;
  }
  .ob-activity-radar-box {
    display: flex;
    align-items: center;
    gap: 0.72rem;
    margin-bottom: 0.72rem;
  }
  .ob-activity-count {
    margin: 0;
    font-family: 'Outfit', sans-serif;
    font-size: 1.38rem;
    font-weight: 800;
    color: #0f172a;
    line-height: 1.1;
  }
  .ob-activity-subtext {
    font-size: 0.62rem;
    color: #64748b;
    display: block;
    margin-top: 0.1rem;
    line-height: 1.25;
  }
  .ob-activity-stats-grid {
    border-top: 1px solid rgba(99, 102, 241, 0.06);
    padding-top: 0.55rem;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.35rem;
  }
  .ob-activity-stat-card {
    background: rgba(255, 255, 255, 0.58);
    border: 1px solid rgba(226, 232, 240, 0.76);
    border-radius: 8px;
    padding: 0.34rem 0.26rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    transition: all 0.15s ease;
  }
  .ob-activity-stat-card:hover {
    background: rgba(255, 255, 255, 0.85);
    border-color: rgba(99, 102, 241, 0.12);
  }
  .ob-activity-stat-label {
    font-size: 0.54rem;
    color: #64748b;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0;
  }
  .ob-activity-stat-val {
    font-family: 'Outfit', sans-serif;
    font-size: 0.84rem;
    font-weight: 800;
    color: #1e293b;
  }

  /* Radar Animation */
  .ob-radar-wrapper {
    position: relative;
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .ob-radar-ring {
    position: absolute;
    width: 100%;
    height: 100%;
    border: 1.5px solid rgba(37, 99, 235, 0.15);
    border-radius: 50%;
    animation: radar-pulse 3s infinite linear;
  }
  .ob-radar-core {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: linear-gradient(135deg, #2563eb, #6366f1);
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;
    box-shadow: 0 4px 10px rgba(37, 99, 235, 0.25);
  }

  /* Timeline Section connection flow */
  .ob-timeline-section {
    padding: 1.05rem 1.15rem 0.98rem 1.15rem !important;
    margin-top: 0;
  }
  .ob-timeline-navigation {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.7rem;
  }
  .ob-timeline-line {
    position: absolute;
    left: 42px;
    right: 42px;
    top: 50%;
    height: 2px;
    background: linear-gradient(90deg, #d946ef 0%, #2563eb 50%, #34d399 100%);
    z-index: 1;
    transform: translateY(-50%);
    opacity: 0.85;
  }
  .ob-timeline-cards-row {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(7, minmax(110px, 1fr));
    gap: 0.72rem;
    overflow-x: auto;
    overflow-y: visible;
    padding: 0.34rem 0.16rem 0.78rem;
    z-index: 2;
    scrollbar-width: none;
  }
  .ob-timeline-cards-row::-webkit-scrollbar {
    display: none;
  }
  .ob-timeline-card {
    position: relative;
    background: #ffffff !important;
    border: 1px solid rgba(99, 102, 241, 0.12);
    border-radius: 8px;
    padding: 0.82rem 0.62rem;
    text-align: center;
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    flex-direction: column;
    align-items: center;
    box-shadow: 0 12px 26px -23px rgba(15, 23, 42, 0.38);
    min-height: 116px;
    justify-content: space-between;
    z-index: 2;
  }
  .ob-timeline-card:hover {
    border-color: rgba(37, 99, 235, 0.25);
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(99, 102, 241, 0.04);
  }
  .ob-timeline-card.active {
    background: #ffffff !important;
    border: 1.5px solid #2563eb !important;
    transform: translateY(-4px);
    box-shadow: 
      0 0 0 1px rgba(37, 99, 235, 0.08),
      0 17px 30px -16px rgba(99, 102, 241, 0.58) !important;
    z-index: 4;
  }
  .ob-timeline-card.active::after {
    content: "";
    position: absolute;
    bottom: -9px;
    left: 12%;
    right: 12%;
    height: 12px;
    background: linear-gradient(90deg, #d946ef, #2563eb);
    filter: blur(12px);
    opacity: 0.8;
    z-index: -1;
    border-radius: 99px;
  }
  .ob-card-top {
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1.25;
  }
  .ob-card-label {
    font-size: 0.78rem;
    color: #64748b;
    font-weight: 700;
  }
  .ob-timeline-card.active .ob-card-label {
    color: #2563eb;
  }
  .ob-card-date {
    font-size: 0.68rem;
    color: #94a3b8;
    margin-top: 0.05rem;
  }
  .ob-card-center-dot {
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    z-index: 3;
  }
  .ob-timeline-dot {
    width: 6.5px;
    height: 6.5px;
    border-radius: 50%;
    background: #2563eb;
    box-shadow: 0 0 0 1.5px rgba(37, 99, 235, 0.2);
  }
  /* Active Dot droplets styles */
  .ob-card-stats {
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1.25;
  }
  .ob-card-stats strong {
    font-size: 0.78rem;
    color: #1e293b;
    font-weight: 800;
  }
  .ob-card-stats span {
    font-size: 0.64rem;
    color: #94a3b8;
    margin-top: 0.05rem;
  }
  .ob-timeline-dots {
    display: flex;
    justify-content: center;
    gap: 0.35rem;
    margin-top: 0.66rem;
  }
  .ob-timeline-nav-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #cbd5e1;
    transition: all 0.2s ease;
  }
  .ob-timeline-nav-dot.active {
    background: #2563eb;
    width: 12px;
    border-radius: 99px;
  }

  .ob-timeline-arrow {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    background: #ffffff;
    border: 1px solid rgba(0, 0, 0, 0.05);
    color: #475569;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02);
    transition: all 0.2s ease;
    z-index: 3;
  }
  .ob-timeline-arrow:hover:not(:disabled) {
    background: #f8fafc;
    color: #0f172a;
    border-color: rgba(37, 99, 235, 0.2);
    transform: scale(1.05);
  }
  .ob-timeline-arrow:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* List and Table section */
  .ob-list-panel {
    margin-top: 0.75rem;
  }
  .ob-list-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1.5rem;
    flex-wrap: wrap;
    margin-bottom: 1.15rem;
    border-bottom: 1px solid rgba(99, 102, 241, 0.06);
    padding-bottom: 0.85rem;
  }
  .ob-list-title {
    font-family: 'Outfit', sans-serif;
    font-size: 1.05rem;
    font-weight: 800;
    color: #0f172a;
    margin: 0 0 0.2rem 0;
  }
  .ob-list-subtitle {
    font-size: 0.8rem;
    color: #64748b;
    margin: 0;
  }
  .ob-tabs {
    display: inline-flex;
    background: #e2e8f0;
    padding: 0.2rem;
    border-radius: 12px;
    border: 1px solid rgba(0, 0, 0, 0.03);
  }
  .ob-tab-btn {
    padding: 0.4rem 0.85rem;
    font-size: 0.72rem;
    font-weight: 700;
    color: #475569;
    border: 0;
    background: transparent;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .ob-tab-btn:hover {
    color: #0f172a;
  }
  .ob-tab-btn.active {
    background: #ffffff;
    color: #2563eb;
    box-shadow: 0 3px 8px rgba(15, 23, 42, 0.04);
  }

  .ob-backlog-filters {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
    font-size: 0.76rem;
    color: #475569;
    font-weight: 700;
  }
  .ob-chips {
    display: flex;
    gap: 0.4rem;
  }

  /* Table styling */
  .ob-table-container {
    overflow-x: auto;
    border: 1px solid rgba(99, 102, 241, 0.06);
    border-radius: 14px;
    background: #ffffff;
    margin-bottom: 1.15rem;
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.01);
  }
  .ob-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
    font-size: 0.82rem;
    table-layout: fixed;
  }
  .ob-table th {
    background: #f8fafc;
    color: #475569;
    font-weight: 800;
    font-size: 0.70rem;
    letter-spacing: 0;
    padding: 0.65rem 0.85rem;
    border-bottom: 1px solid rgba(99, 102, 241, 0.06);
    text-transform: uppercase;
  }
  .ob-table td {
    padding: 0.7rem 0.85rem;
    border-bottom: 1px solid rgba(99, 102, 241, 0.03);
    vertical-align: middle;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ob-table-row {
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .ob-table-row:hover {
    background: rgba(99, 102, 241, 0.015) !important;
  }
  .ob-table-row.is-selected {
    background: rgba(37, 99, 235, 0.035);
  }

  /* Client cell column */
  .ob-client-info {
    position: relative;
    display: flex;
    align-items: center;
    padding-left: 0.75rem;
  }
  .ob-client-accent {
    position: absolute;
    left: 0;
    top: 0px;
    bottom: 0px;
    width: 3.5px;
    border-radius: 99px;
  }
  .ob-client-name {
    font-size: 0.84rem;
    font-weight: 750;
    color: #0f172a;
    display: block;
    line-height: 1.25;
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
  }
  .ob-client-code {
    font-size: 0.72rem;
    color: #64748b;
    margin-top: 0.08rem;
    display: block;
  }
  .ob-cell-date {
    color: #475569;
    font-weight: 500;
  }
  .ob-cell-volume-stack {
    display: flex;
    flex-direction: column;
    line-height: 1.25;
  }
  .ob-cell-volume-stack strong {
    color: #0f172a;
    font-size: 0.8rem;
    font-weight: 750;
  }
  .ob-cell-volume-stack span {
    color: #64748b;
    font-size: 0.72rem;
    font-weight: 500;
  }
  .ob-prepared-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.72rem;
    color: #4f46e5;
    background: rgba(79, 70, 229, 0.06);
    padding: 0.15rem 0.55rem;
    border-radius: 6px;
    font-weight: 700;
    border: 1px solid rgba(79, 70, 229, 0.08);
  }
  .ob-channel-dot {
    width: 4.5px;
    height: 4.5px;
    border-radius: 50%;
    background: #4f46e5;
  }

  .ob-cell-highlight {
    font-weight: 700;
    color: #1e293b;
  }

  /* Pill status badges */
  .ob-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.25rem 0.65rem;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 800;
  }
  .pill-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    display: inline-block;
    animation: status-pulse 1.8s infinite ease-in-out;
  }

  @keyframes status-pulse {
    0% { transform: scale(0.9); opacity: 0.6; }
    50% { transform: scale(1.3); opacity: 1; }
    100% { transform: scale(0.9); opacity: 0.6; }
  }

  .ob-more-btn {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    border: 0;
    background: transparent;
    color: #94a3b8;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  }
  .ob-more-btn:hover {
    background: #f1f5f9;
    color: #475569;
  }

  /* Custom Checkbox Design */
  .ob-check {
    appearance: none;
    -webkit-appearance: none;
    width: 17px;
    height: 17px;
    border: 1.5px solid #cbd5e1;
    border-radius: 5px;
    outline: none;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: #ffffff;
    transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .ob-check:checked {
    border-color: #2563eb;
    background: #2563eb;
    box-shadow: 0 2px 6px rgba(37, 99, 235, 0.25);
  }
  .ob-check:checked::before {
    content: "✓";
    color: #ffffff;
    font-size: 9px;
    font-weight: 800;
  }
  .ob-check:hover {
    border-color: #3b82f6;
  }

  /* Premium Buttons */
  .page-btn-primary {
    background: linear-gradient(135deg, #2563eb, #4f46e5) !important;
    border: 0 !important;
    box-shadow: 0 2px 6px rgba(37, 99, 235, 0.18) !important;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
    font-weight: 700 !important;
    color: #ffffff !important;
  }
  .page-btn-primary:hover:not(:disabled) {
    transform: translateY(-1.5px);
    box-shadow: 0 5px 15px rgba(37, 99, 235, 0.28) !important;
    background: linear-gradient(135deg, #3b82f6, #6366f1) !important;
  }
  .page-btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none !important;
  }

  /* Sendbar footer action */
  .ob-sendbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    background: #f8fafc;
    border: 1px solid rgba(99, 102, 241, 0.06);
    border-radius: 14px;
    padding: 0.75rem 1.15rem;
    margin-top: 1rem;
  }
  .ob-selectall {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.78rem;
    color: #475569;
    font-weight: 700;
    cursor: pointer;
  }

  /* Toast notification */
  .ob-toast {
    position: fixed;
    top: 1.5rem;
    right: 1.5rem;
    padding: 0.85rem 1.25rem;
    border-radius: 12px;
    font-weight: 600;
    font-size: 0.85rem;
    box-shadow: 0 10px 30px -10px rgba(15, 23, 42, 0.15);
    z-index: 10000;
    animation: ob-slide-in 0.25s ease;
  }
  .ob-toast.ok { background: #0f172a; color: #ffffff; }
  .ob-toast.err { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
  @keyframes ob-slide-in {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: none; }
  }

  /* Sidebar details */
  .ob-sidebar-card {
    padding: 1.25rem !important;
    margin-bottom: 1.5rem;
  }
  .ob-sidebar-card:last-child {
    margin-bottom: 0;
  }
  .ob-sidebar-title {
    font-size: 0.72rem;
    font-weight: 800;
    color: #4f46e5;
    letter-spacing: 0;
    margin: 0;
  }

  /* Entenda o risco Flowchart */
  .ob-flowchart {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 1.15rem;
    margin-top: 1.25rem;
    padding-left: 2.5rem;
  }
  .ob-flowchart::before {
    content: "";
    position: absolute;
    left: 16px;
    top: 8px;
    bottom: 8px;
    width: 2px;
    background: linear-gradient(180deg, #2563eb 0%, #a855f7 50%, #d946ef 100%);
    opacity: 0.25;
  }
  .ob-flow-step {
    position: relative;
    display: flex;
    align-items: center;
    min-height: 34px;
    transition: transform 0.2s ease;
  }
  .ob-flow-step:hover {
    transform: translateX(4px);
  }
  .ob-flow-icon {
    position: absolute;
    left: -2.5rem;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 1.5px solid rgba(0, 0, 0, 0.08);
    background: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;
    transition: all 0.2s ease;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.02);
  }
  .ob-flow-step:hover .ob-flow-icon {
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
  }
  .ob-flow-icon.border-blue { border-color: #2563eb; }
  .ob-flow-icon.border-purple { border-color: #a855f7; }
  .ob-flow-icon.border-magenta { border-color: #d946ef; }
  .ob-flow-icon.bg-pink { background: #ec4899; border-color: #ec4899; }
  
  .ob-flow-text {
    display: flex;
    flex-direction: column;
    line-height: 1.25;
  }
  .ob-flow-text strong {
    font-size: 0.8rem;
    font-weight: 800;
    color: #0f172a;
  }
  .ob-flow-text span {
    font-size: 0.72rem;
    color: #64748b;
    margin-top: 0.05rem;
  }

  /* Performance statistics widget */
  .ob-perf-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }
  .ob-perf-metrics {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .ob-perf-overview-row {
    display: flex;
    align-items: center;
    gap: 1.25rem;
    margin-bottom: 0.25rem;
    background: rgba(255, 255, 255, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.6);
    border-radius: 14px;
    padding: 0.85rem;
  }
  .ob-perf-circular-chart {
    position: relative;
    width: 68px;
    height: 68px;
    flex-shrink: 0;
  }
  .circular-chart-svg {
    width: 100%;
    height: 100%;
  }
  .ob-perf-circular-val {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-family: 'Outfit', sans-serif;
    font-size: 0.82rem;
    font-weight: 800;
    color: #0f172a;
  }
  .ob-perf-main-text {
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .ob-perf-label {
    font-size: 0.65rem;
    color: #64748b;
    display: block;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0;
  }
  .ob-perf-val {
    margin: 0.1rem 0;
    font-family: 'Outfit', sans-serif;
    font-size: 1.35rem;
    font-weight: 800;
    line-height: 1.1;
  }
  .ob-perf-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.85rem;
    border-top: 1px solid rgba(99, 102, 241, 0.06);
    padding-top: 1.15rem;
    margin-bottom: 0.5rem;
  }
  .ob-perf-grid-item {
    background: rgba(255, 255, 255, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.5);
    border-radius: 12px;
    padding: 0.65rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    transition: all 0.2s ease;
  }
  .ob-perf-grid-item:hover {
    background: rgba(255, 255, 255, 0.7);
    border-color: rgba(99, 102, 241, 0.15);
    transform: translateY(-1px);
    box-shadow: 0 4px 10px rgba(99, 102, 241, 0.02);
  }
  .ob-perf-subval {
    font-family: 'Outfit', sans-serif;
    font-size: 0.95rem;
    font-weight: 750;
    color: #1e293b;
  }

  .ob-recovered-list {
    display: grid;
    gap: 0.55rem;
    margin-top: 0.8rem;
    padding-top: 0.85rem;
    border-top: 1px solid rgba(99, 102, 241, 0.06);
    color: #64748b;
    font-size: 0.74rem;
    line-height: 1.35;
  }
  .ob-recovered-row {
    display: grid;
    gap: 0.1rem;
    padding: 0.55rem 0.65rem;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.45);
    border: 1px solid rgba(255, 255, 255, 0.6);
  }
  .ob-recovered-row strong {
    min-width: 0;
    color: #0f172a;
    font-size: 0.78rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Footer Live Stepper */
  .ob-footer-stepper {
    margin-top: 1.5rem;
    padding: 1.15rem 1.5rem !important;
  }
  .ob-stepper-row {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    margin-top: 0.85rem;
  }
  @media (min-width: 768px) {
    .ob-stepper-row {
      flex-direction: row;
      justify-content: space-between;
    }
  }
  .ob-stepper-node {
    position: relative;
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .ob-stepper-icon {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 1.5px solid rgba(0, 0, 0, 0.06);
    background: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    z-index: 2;
  }
  .ob-stepper-icon.border-blue { border-color: #2563eb; }
  .ob-stepper-icon.border-purple { border-color: #a855f7; }
  .ob-stepper-icon.border-orange { border-color: #f97316; }
  .ob-stepper-icon.bg-green-light { background: rgba(16, 185, 129, 0.08); border-color: #10b981; }
  .ob-stepper-icon.active-pulse {
    border: 0;
    background: transparent;
  }

  .ob-stepper-copy {
    display: flex;
    flex-direction: column;
    line-height: 1.25;
  }
  .ob-stepper-copy strong {
    font-size: 0.8rem;
    font-weight: 800;
    color: #1e293b;
  }
  .ob-stepper-copy span {
    font-size: 0.7rem;
    color: #64748b;
  }

  .ob-stepper-connector {
    display: none;
  }
  @media (min-width: 768px) {
    .ob-stepper-connector {
      display: block;
      position: absolute;
      left: calc(100% - 15px);
      right: 0;
      top: 16px;
      height: 2px;
      background: #e2e8f0;
      z-index: 1;
      overflow: hidden;
    }
    .ob-stepper-connector::after {
      content: "";
      position: absolute;
      top: 0;
      left: -50px;
      width: 40px;
      height: 100%;
      background: linear-gradient(90deg, rgba(99, 102, 241, 0), rgba(37, 99, 235, 0.8), rgba(99, 102, 241, 0));
      animation: laser-flow 2.5s infinite linear;
    }
  }

  @keyframes laser-flow {
    0% { left: -50px; }
    100% { left: 100%; }
  }

  /* Modern Backlog window filters */
  .page-filter-chip {
    padding: 0.35rem 0.95rem !important;
    font-size: 0.72rem !important;
    font-weight: 700 !important;
    border-radius: 99px !important;
    border: 1px solid rgba(99, 102, 241, 0.08) !important;
    background: #ffffff !important;
    color: #475569 !important;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
    cursor: pointer;
  }
  .page-filter-chip:hover {
    background: #f8fafc !important;
    color: #0f172a !important;
    transform: translateY(-0.5px);
  }
  .page-filter-chip.active {
    background: #2563eb !important;
    border-color: #2563eb !important;
    color: #ffffff !important;
    box-shadow: 0 2px 8px rgba(37, 99, 235, 0.25) !important;
  }

  /* Utility classes */
  .text-blue { color: #2563eb !important; }
  .text-purple { color: #8b5cf6 !important; }
  .text-magenta { color: #d946ef !important; }
  .text-green { color: #10b981 !important; }
  .text-orange { color: #f97316 !important; }
  .text-dark { color: #0f172a !important; }
  .text-secondary { color: #64748b !important; }
  .text-white { color: #ffffff !important; }
  
  .font-xs { font-size: 0.65rem !important; }
  .font-sm { font-size: 0.74rem !important; }
  .font-md { font-size: 0.86rem !important; }
  .font-lg { font-size: 1.05rem !important; }
  .font-semibold { font-weight: 600 !important; }
  .font-bold { font-weight: 700 !important; }
`;

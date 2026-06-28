import { Fragment, useMemo, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Eye, CalendarClock, CheckCircle2, TrendingUp, RefreshCw, Info, Send } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api, type LifecycleStage } from "../lib/api";

const STAGE_ORDER: LifecycleStage[] = ["ATENCAO_1", "ATENCAO_2", "INATIVO", "INATIVO_30"];

// Escala sóbria (família azul/índigo) — diferencia os estágios sem poluir.
const STAGE_META: Record<LifecycleStage, { short: string; range: string; color: string }> = {
  ATENCAO_1: { short: "Atenção 1", range: "31–60 dias", color: "#94a3b8" },
  ATENCAO_2: { short: "Atenção 2", range: "61–89 dias", color: "#6366f1" },
  INATIVO: { short: "Inativo", range: "90–119 dias", color: "#4f46e5" },
  INATIVO_30: { short: "Inativo +30", range: "120+ dias", color: "#3730a3" },
};

const DEFAULT_POSITIONS: Record<string, { x: number; y: number }> = {
  trigger: { x: 30, y: 62 },
  monitor: { x: 220, y: 62 },
  ATENCAO_1: { x: 410, y: 49 },
  ATENCAO_2: { x: 600, y: 49 },
  INATIVO: { x: 790, y: 49 },
  INATIVO_30: { x: 980, y: 49 },
  outcome: { x: 1170, y: 62 },
};

const fmtDate = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-"); return y && m && d ? `${d}/${m}` : iso; };
const initials = (n: string) => { const p = n.trim().split(/\s+/); return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?"; };
const untilLbl = (d: number) => (d <= 0 ? "hoje" : d === 1 ? "amanhã" : `em ${d} dias`);

// Edge component removed in favor of dynamic SVG connections

export function LifecyclePage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  const overviewQuery = useQuery({ queryKey: ["lifecycle-overview"], queryFn: () => api.lifecycleOverview(token!), enabled: Boolean(token) });
  const configQuery = useQuery({ queryKey: ["lifecycle-config"], queryFn: () => api.lifecycleConfig(token!), enabled: Boolean(token) });
  const templatesQuery = useQuery({ queryKey: ["message-templates"], queryFn: () => api.messageTemplates(token!), enabled: Boolean(token) });
  const scheduledQuery = useQuery({ queryKey: ["lifecycle-scheduled"], queryFn: () => api.lifecycleScheduled(token!, 14), enabled: Boolean(token) });
  const recoveryQuery = useQuery({ queryKey: ["lifecycle-recovery"], queryFn: () => api.lifecycleRecovery(token!), enabled: Boolean(token) });
  const journeysQuery = useQuery({ queryKey: ["lifecycle-journeys"], queryFn: () => api.lifecycleJourneys(token!, 60), enabled: Boolean(token) });

  const handoff = useMutation({
    mutationFn: (customerId: string) => api.lifecycleHandoff(token!, customerId),
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
  const journeys = journeysQuery.data?.journeys ?? [];
  const stageConfig = useMemo(() => new Map(config.map((c) => [c.stage, c])), [config]);

  const [journeyFilter, setJourneyFilter] = useState<LifecycleStage | "ALL">("ALL");
  const filteredJourneys = useMemo(
    () => (journeyFilter === "ALL" ? journeys : journeys.filter((j) => j.currentStage === journeyFilter)),
    [journeys, journeyFilter],
  );
  const stageCountIn = (stage: LifecycleStage) => journeys.filter((j) => j.currentStage === stage).length;

  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>(() => {
    try {
      const saved = localStorage.getItem("lc-node-positions");
      return saved ? JSON.parse(saved) : DEFAULT_POSITIONS;
    } catch {
      return DEFAULT_POSITIONS;
    }
  });

  const savePositions = (positions: Record<string, { x: number; y: number }>) => {
    try {
      localStorage.setItem("lc-node-positions", JSON.stringify(positions));
    } catch (e) {
      // ignore
    }
  };

  const handleResetPositions = () => {
    setNodePositions(DEFAULT_POSITIONS);
    try {
      localStorage.removeItem("lc-node-positions");
    } catch {}
  };

  const canvasSize = useMemo(() => {
    let maxX = 1360;
    let maxY = 194;
    Object.values(nodePositions).forEach((pos) => {
      if (pos.x + 198 > maxX) maxX = pos.x + 198;
      if (pos.y + 144 > maxY) maxY = pos.y + 144;
    });
    return { width: maxX, height: maxY };
  }, [nodePositions]);

  const [draggingNode, setDraggingNode] = useState<{
    id: string;
    startX: number;
    startY: number;
    nodeStartX: number;
    nodeStartY: number;
  } | null>(null);

  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("select") || target.closest("input") || target.closest("button") || target.closest("a")) {
      return;
    }
    e.preventDefault();
    const pos = nodePositions[id] || { x: 0, y: 0 };
    setDraggingNode({
      id,
      startX: e.clientX,
      startY: e.clientY,
      nodeStartX: pos.x,
      nodeStartY: pos.y,
    });
  };

  useEffect(() => {
    if (!draggingNode) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - draggingNode.startX;
      const dy = e.clientY - draggingNode.startY;
      const newX = Math.max(0, draggingNode.nodeStartX + dx);
      const newY = Math.max(0, draggingNode.nodeStartY + dy);
      setNodePositions((prev) => ({
        ...prev,
        [draggingNode.id]: { x: newX, y: newY }
      }));
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (draggingNode) {
        const dx = e.clientX - draggingNode.startX;
        const dy = e.clientY - draggingNode.startY;
        const newX = Math.max(0, draggingNode.nodeStartX + dx);
        const newY = Math.max(0, draggingNode.nodeStartY + dy);
        const next = {
          ...nodePositions,
          [draggingNode.id]: { x: newX, y: newY }
        };
        savePositions(next);
      }
      setDraggingNode(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggingNode, nodePositions]);

  const renderSVGConnections = (width: number, height: number) => {
    const nodesOrder = ["trigger", "monitor", ...STAGE_ORDER, "outcome"];
    return (
      <svg
        className="lc-svg-connections"
        width={width}
        height={height}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: `${width}px`,
          height: `${height}px`,
          pointerEvents: "none",
          zIndex: 1,
        }}
      >
        <defs>
          <linearGradient id="active-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#818cf8" />
          </linearGradient>
          <filter id="glow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#6366f1" floodOpacity="0.4" />
          </filter>
        </defs>
        {nodesOrder.slice(0, -1).map((currentId, idx) => {
          const nextId = nodesOrder[idx + 1]!;
          const startPos = nodePositions[currentId] || { x: 0, y: 0 };
          const endPos = nodePositions[nextId] || { x: 0, y: 0 };
          const x1 = startPos.x + 148;
          const y1 = startPos.y + (currentId === "trigger" || currentId === "monitor" || currentId === "outcome" ? 38 : 51);
          const x2 = endPos.x;
          const y2 = endPos.y + (nextId === "trigger" || nextId === "monitor" || nextId === "outcome" ? 38 : 51);
          const dx = Math.abs(x2 - x1) * 0.4;
          const cp1_x = x1 + dx;
          const cp1_y = y1;
          const cp2_x = x2 - dx;
          const cp2_y = y2;
          const pathD = `M ${x1} ${y1} C ${cp1_x} ${cp1_y}, ${cp2_x} ${cp2_y}, ${x2} ${y2}`;
          const isPathActive = isLive;
          return (
            <g key={`${currentId}-${nextId}`}>
              <path
                d={pathD}
                fill="none"
                stroke="#e2e8f0"
                strokeWidth={3}
                strokeLinecap="round"
              />
              {isPathActive && (
                <>
                  <path
                    d={pathD}
                    fill="none"
                    stroke="url(#active-grad)"
                    strokeWidth={3.5}
                    strokeLinecap="round"
                    filter="url(#glow)"
                  />
                  <circle r={5} fill="#ffffff" stroke="#6366f1" strokeWidth={2}>
                    <animateMotion
                      path={pathD}
                      dur="2.5s"
                      repeatCount="indefinite"
                    />
                  </circle>
                </>
              )}
            </g>
          );
        })}
      </svg>
    );
  };

  const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
    RECUPERADO: { label: "Recuperado", color: "#16a34a", bg: "#dcfce7" },
    RESPONDEU: { label: "Respondeu", color: "#4338ca", bg: "#e0e7ff" },
    AGUARDANDO: { label: "Aguardando", color: "#64748b", bg: "#f1f5f9" },
    DESCARTADO: { label: "Descartado", color: "#9ca3af", bg: "#f3f4f6" },
  };

  const runHour = overview ? String(overview.runHour).padStart(2, "0") : "09";
  const isLive = Boolean(overview && !overview.simulationOnly && overview.automationEnabled);
  const recRate = recovery ? Math.round(recovery.recoveryRate * 1000) / 10 : 0;

  const kpis = [
    { icon: <Eye size={18} />, n: overview?.totalWatched, l: "Clientes monitorados", gradient: "linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)", color: "#0284c7" },
    { icon: <CalendarClock size={18} />, n: scheduled.length, l: "Follow-ups agendados (14d)", gradient: "linear-gradient(135deg, #faf5ff 0%, #e9d5ff 100%)", color: "#7c3aed" },
    { icon: <CheckCircle2 size={18} />, n: recovery?.recoveredCount, l: "Reconquistados", gradient: "linear-gradient(135deg, #ecfdf5 0%, #a7f3d0 100%)", color: "#059669" },
    { icon: <TrendingUp size={18} />, n: recovery ? `${recRate}%` : undefined, l: "Taxa de recuperação", gradient: "linear-gradient(135deg, #f0fdf4 0%, #bbf7d0 100%)", color: "#16a34a" },
  ];

  return (
    <div className="lc">
      <style>{LC_STYLES}</style>

      {/* Cabeçalho */}
      <header className="lc-head">
        <div>
          <div className="lc-kicker">Automação de carteira</div>
          <h1>Recuperação automática</h1>
          <p>O sistema acompanha cada cliente e, quando ele cruza um estágio sem comprar, envia o template sozinho.</p>
        </div>
        <div className="lc-head-right">
          <div className="lc-status">
            <span className={`lc-dot ${isLive ? "live" : ""}`} />
            {isLive ? "Envio real ativo" : "Modo simulação"}
            <span className="lc-status-sep">·</span>
            <Clock size={13} /> varre {runHour}:00
          </div>
          <button className="lc-verify" disabled={runNow.isPending} onClick={() => runNow.mutate()} title="Processa a régua agora. Normalmente roda sozinho todo dia às 09:00 — este botão é só para testar/forçar.">
            <RefreshCw size={14} className={runNow.isPending ? "spin" : ""} />
            {runNow.isPending ? "Verificando..." : "Verificar agora"}
          </button>
        </div>
      </header>

      {runNow.data ? (
        <div className="lc-runline">
          <Info size={14} /> Última verificação: {runNow.data.simulated} simulados · {runNow.data.sent} enviados · {runNow.data.skipped} sem template/número.
        </div>
      ) : null}

      {/* KPIs */}
      <div className="lc-kpis">
        {kpis.map((k, i) => (
          <div key={i} className="lc-kpi">
            <span className="lc-kpi-ic" style={{ background: k.gradient, color: k.color }}>{k.icon}</span>
            <div className="lc-kpi-info">
              <div className="lc-kpi-n">{k.n ?? "—"}</div>
              <div className="lc-kpi-l">{k.l}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Fluxo da automação (estilo n8n) */}
      <section className="lc-card">
        <div className="lc-card-head">
          <div>
            <h2>Fluxo da automação</h2>
            <span className="lc-card-sub">como o sistema processa cada cliente de forma 100% autônoma</span>
          </div>
          <button
            type="button"
            className="lc-reset-pos"
            onClick={handleResetPositions}
            title="Restaurar alinhamento original dos blocos"
          >
            <RefreshCw size={12} /> Resetar Posições
          </button>
        </div>
        <div className="lc-canvas">
          <div className="lc-flow" style={{ width: `${canvasSize.width}px`, height: `${canvasSize.height}px` }}>
            {renderSVGConnections(canvasSize.width, canvasSize.height)}

            {/* Gatilho */}
            {(() => {
              const pos = nodePositions.trigger || { x: 30, y: 50 };
              return (
                <div
                  className="lc-fnode trigger"
                  style={{
                    left: `${pos.x}px`,
                    top: `${pos.y}px`,
                    position: "absolute",
                    zIndex: draggingNode?.id === "trigger" ? 10 : 2,
                  }}
                  onMouseDown={(e) => handleMouseDown(e, "trigger")}
                >
                  <span className="lc-node-badge-top">GATILHO</span>
                  <span className="lc-fnode-ic"><Clock size={16} /></span>
                  <div className="lc-fnode-t">Varredura diária</div>
                  <div className="lc-fnode-s">{runHour}:00 · automático</div>
                </div>
              );
            })()}

            {/* Monitor */}
            {(() => {
              const pos = nodePositions.monitor || { x: 220, y: 50 };
              return (
                <div
                  className="lc-fnode monitor"
                  style={{
                    left: `${pos.x}px`,
                    top: `${pos.y}px`,
                    position: "absolute",
                    zIndex: draggingNode?.id === "monitor" ? 10 : 2,
                  }}
                  onMouseDown={(e) => handleMouseDown(e, "monitor")}
                >
                  <span className="lc-node-badge-top">MONITORA</span>
                  <span className="lc-fnode-ic"><Eye size={16} /></span>
                  <div className="lc-fnode-t">Base Monitorada</div>
                  <div className="lc-fnode-s"><b>{overview?.totalWatched ?? "—"}</b> clientes</div>
                </div>
              );
            })()}

            {/* Régua de Envios */}
            {STAGE_ORDER.map((stage) => {
              const m = STAGE_META[stage];
              const c = stageConfig.get(stage);
              const on = (c?.enabled ?? true) && Boolean(c?.templateId);
              const pos = nodePositions[stage] || { x: 410, y: 50 };
              return (
                <div
                  key={stage}
                  className={`lc-fnode stage ${on ? "" : "muted"}`}
                  style={{
                    left: `${pos.x}px`,
                    top: `${pos.y}px`,
                    position: "absolute",
                    ["--sc" as any]: m.color,
                    zIndex: draggingNode?.id === stage ? 10 : 2,
                  }}
                  onMouseDown={(e) => handleMouseDown(e, stage)}
                >
                  <span className="lc-node-badge-top" style={{ color: m.color }}>RÉGUA DE ENVIO</span>
                  <span className="lc-fnode-ic stage"><Send size={15} /></span>
                  <div className="lc-fnode-t">{m.short}</div>
                  <div className="lc-fnode-s">{m.range}</div>
                  {on ? (
                    <span className="lc-fnode-badge on">
                      <span className="lc-badge-dot success" />
                      template ativo
                    </span>
                  ) : (
                    <span className="lc-fnode-badge off">
                      <span className="lc-badge-dot warning" />
                      sem template
                    </span>
                  )}
                </div>
              );
            })}

            {/* Resultado (Conversão) */}
            {(() => {
              const pos = nodePositions.outcome || { x: 1170, y: 50 };
              return (
                <div
                  className="lc-fnode outcome"
                  style={{
                    left: `${pos.x}px`,
                    top: `${pos.y}px`,
                    position: "absolute",
                    zIndex: draggingNode?.id === "outcome" ? 10 : 2,
                  }}
                  onMouseDown={(e) => handleMouseDown(e, "outcome")}
                >
                  <span className="lc-node-badge-top">CONVERSÃO</span>
                  <span className="lc-fnode-ic ok"><CheckCircle2 size={16} /></span>
                  <div className="lc-fnode-t">Recuperado</div>
                  <div className="lc-fnode-s"><b>{recovery?.recoveredCount ?? 0}</b> convertidos</div>
                </div>
              );
            })()}
          </div>
        </div>
      </section>

      {/* Fila — principal */}
      <section className="lc-card">
        <div className="lc-card-head">
          <div><h2>Fila de follow-ups</h2><span className="lc-card-sub">próximos 14 dias · quem vai cruzar de estágio e o que será enviado</span></div>
        </div>

        {scheduledQuery.isLoading ? (
          <div className="lc-empty">Carregando…</div>
        ) : scheduled.length === 0 ? (
          <div className="lc-empty">Ninguém prestes a cruzar de estágio nos próximos 14 dias.</div>
        ) : (
          <div className="lc-table">
            <div className="lc-tr lc-th">
              <span>Cliente</span><span>Próximo estágio</span><span>Quando</span><span>Mensagem</span>
            </div>
            {scheduled.slice(0, 25).map((e) => {
              const m = STAGE_META[e.targetStage];
              return (
                <div key={`${e.customerId}-${e.targetStage}`} className="lc-tr">
                  <span className="lc-cell-client">
                    <span className="lc-av" style={{ background: m.color }}>{initials(e.displayName)}</span>
                    <span><b>{e.displayName}</b>{e.customerCode ? <small>{e.customerCode}</small> : null}</span>
                  </span>
                  <span>
                    <span className="lc-stage"><span className="lc-stage-dot" style={{ background: m.color }} />{m.short}</span>
                    <small className="lc-muted">{e.daysSinceLastPurchase}d parado</small>
                  </span>
                  <span>
                    <b className={`lc-when ${e.daysUntil <= 1 ? "soon" : ""}`}>{untilLbl(e.daysUntil)}</b>
                    <small className="lc-muted">{fmtDate(e.crossDate)}</small>
                  </span>
                  <span>
                    {e.templateTitle
                      ? <span className="lc-tag ok">{e.templateTitle}</span>
                      : <span className="lc-tag warn">configurar template</span>}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="lc-cols">
        {/* Templates por estágio */}
        <section className="lc-card">
          <div className="lc-card-head"><div><h2>Mensagem de cada estágio</h2><span className="lc-card-sub">o que dispara em cada transição</span></div></div>
          <div className="lc-cfg-list">
            {STAGE_ORDER.map((stage) => {
              const m = STAGE_META[stage]; const c = stageConfig.get(stage);
              const on = c?.enabled ?? true;
              return (
                <div key={stage} className={`lc-cfg ${on ? "" : "off"}`}>
                  <div className="lc-cfg-stage">
                    <span className="lc-stage-dot" style={{ background: m.color }} />
                    <div><b>{m.short}</b><small className="lc-muted">{m.range}</small></div>
                  </div>
                  <select value={c?.templateId ?? ""} onChange={(ev) => saveConfig.mutate({ stage, templateId: ev.target.value || null, enabled: on })}>
                    <option value="">— Sem template —</option>
                    {templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                  <label className="lc-switch" title={on ? "Estágio ativo" : "Estágio desligado"}>
                    <input type="checkbox" checked={on} onChange={(ev) => saveConfig.mutate({ stage, templateId: c?.templateId ?? null, enabled: ev.target.checked })} />
                    <span className="tk" />
                  </label>
                </div>
              );
            })}
          </div>
        </section>

        {/* Recuperação */}
        <section className="lc-card">
          <div className="lc-card-head"><div><h2>Recuperação</h2><span className="lc-card-sub">voltaram a comprar após o follow-up</span></div></div>
          <div className="lc-rec-top">
            <div className="lc-rec-rate"><span className="lc-rec-pct">{recRate}%</span><span className="lc-muted">taxa</span></div>
            <div className="lc-rec-side">
              <div><b>{recovery?.recoveredCount ?? "—"}</b><small className="lc-muted">reconquistados</small></div>
              <div><b>{recovery?.messagesSent ?? "—"}</b><small className="lc-muted">mensagens enviadas</small></div>
            </div>
          </div>
          {recovery && recovery.recovered.length > 0 ? (
            <div className="lc-rec-list">
              {recovery.recovered.slice(0, 5).map((r) => (
                <div key={r.customerId} className="lc-rec-item">
                  <span className="lc-av sm" style={{ background: "#16a34a" }}>{initials(r.displayName)}</span>
                  <span className="lc-rec-name">{r.displayName}</span>
                  <span className="lc-muted">voltou em {r.daysToRecover}d</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="lc-empty sm">Ninguém reconquistado ainda.</div>
          )}
        </section>
      </div>

      {/* Jornada por cliente */}
      <section className="lc-card">
        <div className="lc-card-head lc-card-head-row">
          <div><h2>Jornada por cliente</h2><span className="lc-card-sub">cada etapa enviada, o que fez voltar a comprar e quem respondeu</span></div>
          <div className="lc-filters">
            <button className={`lc-fchip ${journeyFilter === "ALL" ? "on" : ""}`} onClick={() => setJourneyFilter("ALL")}>Todos ({journeys.length})</button>
            {STAGE_ORDER.map((stage) => (
              <button
                key={stage}
                className={`lc-fchip ${journeyFilter === stage ? "on" : ""}`}
                onClick={() => setJourneyFilter(stage)}
              >
                <span className="lc-fdot" style={{ background: STAGE_META[stage].color }} />
                {STAGE_META[stage].short} ({stageCountIn(stage)})
              </button>
            ))}
          </div>
        </div>
        {journeysQuery.isLoading ? (
          <div className="lc-empty">Carregando…</div>
        ) : journeys.length === 0 ? (
          <div className="lc-empty">Nenhum cliente passou pela régua ainda. Rode a verificação para começar.</div>
        ) : filteredJourneys.length === 0 ? (
          <div className="lc-empty">Nenhum cliente nesse estágio agora.</div>
        ) : (
          <div className="lc-journeys">
            {filteredJourneys.map((j) => {
              const st = STATUS_META[j.status] ?? STATUS_META.AGUARDANDO!;
              return (
                <div key={j.customerId} className="lc-journey">
                  <div className="lc-j-head">
                    <span className="lc-av sm" style={{ background: "#475569" }}>{initials(j.displayName)}</span>
                    <div className="lc-j-id">
                      <b>{j.displayName}</b>
                      {j.customerCode ? <small className="lc-muted">{j.customerCode}</small> : null}
                    </div>
                    <span className="lc-j-days">
                      {j.daysSinceLastPurchase === null ? "sem compras" : <><b>{j.daysSinceLastPurchase}</b> dias sem comprar</>}
                    </span>
                    <span className="lc-jstatus" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                  </div>

                  <div className="lc-steps">
                    {j.steps.map((s, idx) => {
                      const m = STAGE_META[s.stage];
                      const attributed = j.attributedStage === s.stage && j.status === "RECUPERADO";
                      return (
                        <Fragment key={idx}>
                          {idx > 0 ? <span className="lc-step-link" /> : null}
                          <span className={`lc-step ${attributed ? "win" : ""}`} title={s.templateTitle ?? "sem template"}>
                            <span className="lc-step-n" style={{ background: m.color }}>{idx + 1}</span>
                            <span className="lc-step-txt">
                              <b>{m.short}</b>
                              <small>{s.templateTitle ?? "sem template"}</small>
                            </span>
                          </span>
                        </Fragment>
                      );
                    })}
                    {j.status === "RECUPERADO" ? (
                      <>
                        <span className="lc-step-link win" />
                        <span className="lc-step outcome">
                          <span className="lc-step-n" style={{ background: "#16a34a" }}>✓</span>
                          <span className="lc-step-txt"><b>Comprou</b><small>{j.attributedStage ? `após ${STAGE_META[j.attributedStage].short}` : "recuperado"}</small></span>
                        </span>
                      </>
                    ) : null}
                  </div>

                  {j.status === "RESPONDEU" ? (
                    <div className="lc-j-action">
                      <span className="lc-muted">💬 Cliente respondeu — vale uma vendedora assumir.</span>
                      <button
                        className="lc-handoff"
                        disabled={handoff.isPending}
                        onClick={() => handoff.mutate(j.customerId)}
                      >
                        {handoff.isPending && handoff.variables === j.customerId ? "Avisando…" : "Avisar vendedora"}
                      </button>
                    </div>
                  ) : null}
                  {handoff.isSuccess && handoff.variables === j.customerId ? (
                    <div className="lc-j-done">{handoff.data?.sent ? "✓ Vendedora avisada no grupo." : handoff.data?.detail}</div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

const LC_STYLES = `
  .lc {
    --ink: #0f172a;
    --muted: #64748b;
    --line: #e2e8f0;
    --accent: #6366f1;
    --accent-soft: #f0f2ff;
    --accent-hover: #4f46e5;
    --bg-main: #f8fafc;
    --bg-card: #ffffff;
    --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
    --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
    --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.04), 0 4px 6px -2px rgba(0, 0, 0, 0.02);
    --shadow-premium: 0 15px 30px -5px rgba(99, 102, 241, 0.08), 0 10px 15px -5px rgba(99, 102, 241, 0.03);

    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    color: var(--ink);
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
  }
  .lc * { box-sizing: border-box; }

  .lc-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
    padding-bottom: 0.5rem;
  }
  .lc-kicker {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent);
    background: var(--accent-soft);
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    display: inline-block;
    margin-bottom: 0.4rem;
  }
  .lc-head h1 {
    font-size: 1.75rem;
    font-weight: 800;
    margin: 0 0 0.35rem 0;
    letter-spacing: -0.02em;
    color: var(--ink);
  }
  .lc-head p {
    font-size: 0.9rem;
    color: var(--muted);
    margin: 0;
    max-width: 580px;
    line-height: 1.4;
  }
  .lc-head-right {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .lc-status {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: #475569;
    background: #ffffff;
    border: 1px solid var(--line);
    padding: 0.45rem 0.9rem;
    border-radius: 999px;
    box-shadow: var(--shadow-sm);
  }
  .lc-status-sep { color: #cbd5e1; }
  .lc-dot { width: 8px; height: 8px; border-radius: 50%; background: #94a3b8; }
  .lc-dot.live {
    background: #10b981;
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
    position: relative;
  }
  .lc-dot.live::after {
    content: "";
    position: absolute;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: inherit;
    animation: lc-pulse 1.8s ease-out infinite;
  }
  @keyframes lc-pulse {
    0% { transform: scale(1); opacity: 0.8; }
    100% { transform: scale(3.5); opacity: 0; }
  }

  .lc-verify {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
    color: #ffffff;
    background: linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%);
    border: none;
    padding: 0.55rem 1.1rem;
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.25);
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .lc-verify:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(99, 102, 241, 0.35);
  }
  .lc-verify:active {
    transform: translateY(1px);
  }
  .lc-verify:disabled { opacity: 0.6; cursor: wait; transform: none; box-shadow: none; }
  .lc-verify .spin { animation: lcspin 0.95s linear infinite; }
  @keyframes lcspin { to { transform: rotate(360deg); } }

  .lc-runline {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-size: 0.82rem;
    font-weight: 500;
    color: #475569;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-radius: 12px;
    padding: 0.7rem 1rem;
  }

  .lc-kpis {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1rem;
  }
  @media(max-width: 820px) { .lc-kpis { grid-template-columns: repeat(2, 1fr); } }
  .lc-kpi {
    display: flex;
    align-items: center;
    gap: 0.95rem;
    background: var(--bg-card);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 1.1rem 1.25rem;
    box-shadow: var(--shadow-sm);
    transition: all 0.2s;
  }
  .lc-kpi:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
    border-color: #cbd5e1;
  }
  .lc-kpi-ic {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-weight: bold;
  }
  .lc-kpi-info { display: flex; flex-direction: column; }
  .lc-kpi-n {
    font-size: 1.6rem;
    font-weight: 850;
    line-height: 1.15;
    color: var(--ink);
    letter-spacing: -0.02em;
  }
  .lc-kpi-l { font-size: 0.78rem; font-weight: 500; color: var(--muted); margin-top: 0.15rem; }

  .lc-card {
    background: var(--bg-card);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 1.3rem 1.5rem;
    box-shadow: var(--shadow-sm);
  }
  .lc-card-head {
    margin-bottom: 1.2rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .lc-card-head h2 { font-size: 1.1rem; font-weight: 800; margin: 0 0 0.15rem 0; letter-spacing: -0.01em; }
  .lc-card-sub { font-size: 0.8rem; font-weight: 500; color: var(--muted); }

  /* Tabela */
  .lc-table { display: flex; flex-direction: column; }
  .lc-tr {
    display: grid;
    grid-template-columns: 2fr 1.3fr 1fr 1.4fr;
    gap: 1rem;
    align-items: center;
    padding: 0.85rem 0.5rem;
    border-bottom: 1px solid #f1f5f9;
    transition: background-color 0.15s;
  }
  .lc-tr:hover { background-color: #f8fafc; }
  .lc-tr:last-child { border-bottom: 0; }
  .lc-th { padding: 0 0.5rem 0.65rem 0.5rem; border-bottom: 1px solid var(--line); }
  .lc-th:hover { background-color: transparent; }
  .lc-th span { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #94a3b8; }
  
  .lc-cell-client { display: flex; align-items: center; gap: 0.75rem; }
  .lc-cell-client b { font-size: 0.9rem; font-weight: 700; display: block; color: var(--ink); }
  .lc-cell-client small { font-size: 0.74rem; color: var(--muted); margin-top: 0.1rem; }
  
  .lc-av {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ffffff;
    font-size: 0.78rem;
    font-weight: 700;
    flex-shrink: 0;
    box-shadow: inset 0 -2px 0 rgba(0,0,0,0.1);
  }
  .lc-av.sm { width: 28px; height: 28px; font-size: 0.68rem; }
  
  .lc-stage { display: inline-flex; align-items: center; gap: 0.45rem; font-size: 0.86rem; font-weight: 650; color: var(--ink); }
  .lc-stage-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; box-shadow: 0 0 0 2px #fff, 0 0 4px rgba(0,0,0,0.15); }
  
  .lc-tr small { display: block; font-size: 0.74rem; margin-top: 0.15rem; }
  .lc-when { font-size: 0.92rem; font-weight: 700; color: var(--ink); }
  .lc-when.soon { color: var(--accent); }
  
  .lc-tag {
    display: inline-flex;
    align-items: center;
    font-size: 0.76rem;
    font-weight: 600;
    padding: 0.25rem 0.65rem;
    border-radius: 8px;
  }
  .lc-tag.ok { background: #f0f2ff; color: #4f46e5; border: 1px solid #c7d2fe; }
  .lc-tag.warn { background: #fffbeb; color: #b45309; border: 1px dashed #fde68a; }

  .lc-cols { display: grid; grid-template-columns: 1.3fr 1fr; gap: 1.25rem; }
  @media(max-width: 900px) { .lc-cols { grid-template-columns: 1fr; } }

  /* Configs */
  .lc-cfg-list { display: flex; flex-direction: column; gap: 0.75rem; }
  .lc-cfg {
    display: grid;
    grid-template-columns: 1fr 1.4fr auto;
    gap: 0.95rem;
    align-items: center;
    padding: 0.8rem 0.4rem;
    border-bottom: 1px solid #f1f5f9;
    transition: all 0.2s;
  }
  .lc-cfg:last-child { border-bottom: 0; }
  .lc-cfg.off { opacity: 0.55; }
  .lc-cfg-stage { display: flex; align-items: center; gap: 0.6rem; }
  .lc-cfg-stage b { font-size: 0.9rem; font-weight: 700; display: block; color: var(--ink); }
  .lc-cfg-stage small { font-size: 0.74rem; color: var(--muted); margin-top: 0.1rem; }
  
  .lc-cfg select {
    width: 100%;
    padding: 0.55rem 0.85rem;
    border-radius: 10px;
    border: 1px solid #cbd5e1;
    background: #ffffff;
    color: var(--ink);
    font-size: 0.84rem;
    font-weight: 500;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .lc-cfg select:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
  }
  
  .lc-switch {
    position: relative;
    cursor: pointer;
    display: inline-block;
    width: 40px;
    height: 22px;
  }
  .lc-switch input { display: none; }
  .lc-switch .tk {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 999px;
    background: #cbd5e1;
    transition: background-color 0.2s;
  }
  .lc-switch .tk::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #ffffff;
    transition: transform 0.2s;
    box-shadow: 0 1px 3px rgba(0,0,0,0.25);
  }
  .lc-switch input:checked + .tk { background: var(--accent); }
  .lc-switch input:checked + .tk::after { transform: translateX(18px); }

  /* Recuperação */
  .lc-rec-top {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    padding: 0.25rem 0 1.1rem 0;
    border-bottom: 1px solid #f1f5f9;
    margin-bottom: 0.9rem;
  }
  .lc-rec-rate { display: flex; flex-direction: column; }
  .lc-rec-pct {
    font-size: 2.35rem;
    font-weight: 900;
    line-height: 1;
    color: #10b981;
    letter-spacing: -0.03em;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .lc-rec-rate .lc-muted { font-size: 0.76rem; font-weight: 600; margin-top: 0.15rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .lc-rec-side { display: flex; gap: 1.5rem; }
  .lc-rec-side b { font-size: 1.25rem; font-weight: 800; display: block; color: var(--ink); }
  .lc-rec-side small { font-size: 0.74rem; font-weight: 500; }
  
  .lc-rec-list { display: flex; flex-direction: column; gap: 0.65rem; }
  .lc-rec-item {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    font-size: 0.88rem;
    padding: 0.45rem 0.6rem;
    background: #f8fafc;
    border-radius: 10px;
    border: 1px solid #f1f5f9;
  }
  .lc-rec-name { font-weight: 700; color: var(--ink); }
  .lc-rec-item .lc-muted { font-size: 0.76rem; font-weight: 500; margin-left: auto; color: #64748b; }

  .lc-empty { text-align: center; padding: 2.2rem 1rem; color: var(--muted); font-size: 0.9rem; font-weight: 500; }
  .lc-empty.sm { padding: 1.2rem; }

  /* Canvas do fluxo da automação */
  .lc-canvas {
    background: #fafbfe;
    background-image: radial-gradient(#e2e8f0 1.5px, transparent 1.5px);
    background-size: 20px 20px;
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 2.2rem 1.6rem;
    overflow-x: auto;
    box-shadow: inset 0 2px 4px 0 rgba(0,0,0,0.02);
  }
  .lc-flow {
    position: relative;
    width: 1360px;
    height: 194px;
    min-width: max-content;
  }
  .lc-fnode {
    position: absolute;
    width: 148px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 0.95rem 1rem;
    box-shadow: 0 4px 12px -2px rgba(15,23,42,0.04), 0 2px 4px -1px rgba(15,23,42,0.02);
    flex-shrink: 0;
    cursor: grab;
    user-select: none;
    transition: box-shadow 0.25s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.25s;
  }
  .lc-fnode:active {
    cursor: grabbing;
  }
  .lc-fnode:hover {
    box-shadow: 0 10px 20px -5px rgba(15,23,42,0.08), 0 4px 6px -2px rgba(15,23,42,0.03);
    border-color: #cbd5e1;
  }
  
  .lc-reset-pos {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.72rem;
    font-weight: 700;
    cursor: pointer;
    color: var(--muted);
    background: #f1f5f9;
    border: 1px solid transparent;
    padding: 0.35rem 0.75rem;
    border-radius: 8px;
    transition: all 0.15s ease;
  }
  .lc-reset-pos:hover {
    color: var(--ink);
    background: #e2e8f0;
    border-color: #cbd5e1;
  }
  .lc-reset-pos:active {
    transform: translateY(1px);
  }
  
  .lc-node-badge-top {
    position: absolute;
    top: -9px;
    left: 12px;
    font-size: 0.58rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    background: #ffffff;
    padding: 0 0.35rem;
    border-radius: 4px;
    color: var(--muted);
  }

  .lc-fnode.trigger {
    border-top: 4px solid var(--accent);
  }
  .lc-fnode.trigger .lc-node-badge-top { color: var(--accent); }
  
  .lc-fnode.monitor {
    border-top: 4px solid #0284c7;
  }
  .lc-fnode.monitor .lc-node-badge-top { color: #0284c7; }
  
  .lc-fnode.outcome {
    border-top: 4px solid #10b981;
  }
  .lc-fnode.outcome .lc-node-badge-top { color: #10b981; }
  
  .lc-fnode.stage {
    border-top: 4px solid var(--sc);
  }
  .lc-fnode.muted { opacity: 0.55; }
  
  .lc-fnode-ic {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--accent-soft);
    color: var(--accent);
    margin-bottom: 0.65rem;
    font-weight: bold;
    box-shadow: 0 2px 4px rgba(0,0,0,0.02);
  }
  .lc-fnode-ic.ok { background: #dcfce7; color: #10b981; }
  .lc-fnode-ic.stage { background: #f5f6ff; color: var(--sc); }
  
  .lc-fnode-t { font-size: 0.84rem; font-weight: 750; line-height: 1.25; color: var(--ink); }
  .lc-fnode-s { font-size: 0.72rem; color: var(--muted); margin-top: 0.2rem; line-height: 1.3; }
  .lc-fnode-s b { color: var(--ink); }
  
  .lc-fnode-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    margin-top: 0.6rem;
    font-size: 0.66rem;
    font-weight: 700;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
  }
  .lc-fnode-badge.on { background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; }
  .lc-fnode-badge.off { background: #fffbeb; color: #92400e; border: 1px dashed #fde68a; }
  .lc-badge-dot { width: 5px; height: 5px; border-radius: 50%; }
  .lc-badge-dot.success { background: #10b981; }
  .lc-badge-dot.warning { background: #f59e0b; }

  /* Dynamic connections are handled by absolute SVGs, lc-edge is removed */

  /* Jornada */
  .lc-card-head-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .lc-filters { display: flex; gap: 0.45rem; flex-wrap: wrap; }
  .lc-fchip {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.76rem;
    font-weight: 700;
    cursor: pointer;
    background: #f1f5f9;
    color: #475569;
    border: 1px solid transparent;
    padding: 0.4rem 0.85rem;
    border-radius: 999px;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .lc-fchip:hover { background: #e2e8f0; color: var(--ink); }
  .lc-fchip.on { background: var(--ink); color: #ffffff; }
  .lc-fdot { width: 8px; height: 8px; border-radius: 50%; }
  
  .lc-j-days { margin-left: auto; font-size: 0.8rem; font-weight: 500; color: var(--muted); white-space: nowrap; }
  .lc-j-days b { color: var(--ink); font-weight: 700; }
  
  .lc-journeys { display: flex; flex-direction: column; gap: 0.85rem; }
  .lc-journey {
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 1.1rem 1.3rem;
    transition: all 0.2s;
    background: #ffffff;
  }
  .lc-journey:hover {
    border-color: #cbd5e1;
    box-shadow: 0 4px 12px rgba(15,23,42,0.03);
  }
  
  .lc-j-head { display: flex; align-items: center; gap: 0.75rem; }
  .lc-j-id b { font-size: 0.95rem; font-weight: 750; display: block; color: var(--ink); }
  .lc-j-id small { font-size: 0.74rem; color: var(--muted); margin-top: 0.1rem; }
  
  .lc-jstatus {
    margin-left: 0.75rem;
    font-size: 0.72rem;
    font-weight: 800;
    padding: 0.25rem 0.75rem;
    border-radius: 999px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  
  .lc-steps { display: flex; align-items: center; flex-wrap: wrap; gap: 0; margin-top: 0.95rem; }
  .lc-step {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    background: #f8fafc;
    border: 1px solid #eef1f8;
    border-radius: 12px;
    padding: 0.45rem 0.75rem;
    box-shadow: var(--shadow-sm);
  }
  .lc-step.win { border-color: #a7f3d0; background: #f0fdf4; }
  .lc-step.outcome { background: #f0fdf4; border-color: #a7f3d0; }
  
  .lc-step-n {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    color: #ffffff;
    font-size: 0.72rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    box-shadow: inset 0 -1px 0 rgba(0,0,0,0.1);
  }
  .lc-step-txt b { font-size: 0.8rem; font-weight: 700; display: block; line-height: 1.15; color: var(--ink); }
  .lc-step-txt small {
    font-size: 0.68rem;
    color: var(--muted);
    display: block;
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-top: 0.05rem;
  }
  
  .lc-step-link { width: 22px; height: 2px; background: #cbd5e1; flex-shrink: 0; }
  .lc-step-link.win { background: #86efac; }
  
  .lc-j-action {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-top: 0.95rem;
    padding-top: 0.85rem;
    border-top: 1px dashed var(--line);
    font-size: 0.86rem;
    flex-wrap: wrap;
  }
  .lc-j-action-text {
    display: flex;
    align-items: center;
    font-weight: 600;
    color: #4f46e5;
  }
  .lc-j-pulse {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #6366f1;
    box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.7);
    animation: lc-pulse-indigo 1.5s infinite;
    display: inline-block;
    margin-right: 0.5rem;
  }
  @keyframes lc-pulse-indigo {
    0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.7); }
    70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(99, 102, 241, 0); }
    100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
  }

  .lc-handoff {
    margin-left: auto;
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
    color: #ffffff;
    background: var(--accent);
    border: 0;
    border-radius: 10px;
    padding: 0.5rem 1rem;
    box-shadow: 0 3px 8px rgba(99, 102, 241, 0.2);
    transition: all 0.2s;
  }
  .lc-handoff:hover { background: var(--accent-hover); transform: translateY(-1px); }
  .lc-handoff:active { transform: translateY(1px); }
  .lc-handoff:disabled { opacity: 0.6; cursor: wait; transform: none; box-shadow: none; }
  
  .lc-j-done { margin-top: 0.65rem; font-size: 0.82rem; font-weight: 600; color: #16a34a; }
`;

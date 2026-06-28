import { Fragment, useMemo, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Eye, CalendarClock, CheckCircle2, TrendingUp, RefreshCw, Info, Send, Search, ArrowRight, Bot, MessageSquare, Settings, Users, CornerUpRight } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api, type LifecycleStage } from "../lib/api";

const STAGE_ORDER: LifecycleStage[] = ["ATENCAO_1", "ATENCAO_2", "INATIVO", "INATIVO_30"];

// Escala sóbria (família azul/índigo) ââ‚¬â€ diferencia os estágios sem poluir.
const STAGE_META: Record<LifecycleStage, { short: string; range: string; color: string }> = {
  ATENCAO_1: { short: "Atenção 1", range: "31-60 dias", color: "#eab308" },
  ATENCAO_2: { short: "Atenção 2", range: "61-89 dias", color: "#f97316" },
  INATIVO: { short: "Inativo", range: "90-119 dias", color: "#10b981" },
  INATIVO_30: { short: "Inativo +30", range: "120+ dias", color: "#059669" },
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

function CountdownTimer({ crossDate, runHour }: { crossDate: string; runHour: number }) {
  const [timeLeft, setTimeLeft] = useState("");
  const [isSoon, setIsSoon] = useState(false);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date();
      const targetDateStr = crossDate.split("T")[0]!;
      const target = new Date(`${targetDateStr}T${String(runHour).padStart(2, "0")}:00:00`);
      const diffMs = target.getTime() - now.getTime();

      if (diffMs <= 0) {
        setIsSoon(true);
        return "Pronto para envio";
      }

      const sec = Math.floor((diffMs / 1000) % 60);
      const min = Math.floor((diffMs / 1000 / 60) % 60);
      const hr = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      setIsSoon(diffMs < 24 * 60 * 60 * 1000);

      const parts = [];
      if (days > 0) parts.push(`${days}d`);
      parts.push(`${String(hr).padStart(2, "0")}h`);
      parts.push(`${String(min).padStart(2, "0")}m`);
      parts.push(`${String(sec).padStart(2, "0")}s`);

      return parts.join(" ");
    };

    setTimeLeft(calculateTimeLeft());
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, [crossDate, runHour]);

  return (
    <div className={`lc-countdown-badge ${isSoon ? "soon" : ""}`}>
      <div className="lc-radar-container">
        <span className="lc-radar-wave" />
        <span className="lc-radar-core" />
      </div>
      <span className="lc-countdown-text">{timeLeft}</span>
    </div>
  );
}

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

  const triggerIndividual = useMutation({
    mutationFn: ({ customerId, targetStage }: { customerId: string; targetStage: LifecycleStage }) =>
      api.lifecycleTriggerIndividual(token!, customerId, targetStage),
    onSuccess: (data) => {
      alert(data.detail);
      void queryClient.invalidateQueries({ queryKey: ["lifecycle-scheduled"] });
      void queryClient.invalidateQueries({ queryKey: ["lifecycle-overview"] });
      void queryClient.invalidateQueries({ queryKey: ["lifecycle-journeys"] });
    },
    onError: (err: any) => {
      alert(err.message ?? "Erro ao disparar mensagem.");
    }
  });

  const skipIndividual = useMutation({
    mutationFn: ({ customerId, targetStage }: { customerId: string; targetStage: LifecycleStage }) =>
      api.lifecycleSkipIndividual(token!, customerId, targetStage),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["lifecycle-scheduled"] });
      void queryClient.invalidateQueries({ queryKey: ["lifecycle-overview"] });
    },
    onError: (err: any) => {
      alert(err.message ?? "Erro ao pular cliente.");
    }
  });

  const config = configQuery.data ?? [];
  const templates = templatesQuery.data ?? [];
  const overview = overviewQuery.data;
  const scheduled = scheduledQuery.data?.entries ?? [];
  const recovery = recoveryQuery.data;
  const journeys = journeysQuery.data?.journeys ?? [];
  const stageConfig = useMemo(() => new Map(config.map((c) => [c.stage, c])), [config]);

  const [journeyFilter, setJourneyFilter] = useState<LifecycleStage | "ALL">("ALL");
  const [searchQueue, setSearchQueue] = useState("");
  const [searchJourney, setSearchJourney] = useState("");
  const [activeTab, setActiveTab] = useState<"flow" | "queue" | "rules" | "journeys">("flow");

  const [brainLogs, setBrainLogs] = useState<Array<{ time: string; type: string; msg: string }>>([]);
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    const nowStr = () => new Date().toLocaleTimeString("pt-BR", { hour12: false });
    const initial = [
      { time: nowStr(), type: "SISTEMA", msg: "Cérebro cognitivo IA iniciado com sucesso." },
      { time: nowStr(), type: "VARREDURA", msg: "Estatísticas de conversão atualizadas: 460 monitorados." },
      { time: nowStr(), type: "REGRAS", msg: "Diretrizes de 4 estágios de automação ativas." }
    ];
    setBrainLogs(initial);
  }, []);

  useEffect(() => {
    // Dias estáveis por cliente (evita dados conflitantes)
    const clientDays: Record<string, number> = {
      "Neto CL354": 38, "SANTANA JOSE": 72, "Roberta Lima": 55,
      "Marcos Silva": 95, "Ana Oliveira": 42, "Carlos Souza": 110,
      "Juliana Costa": 63, "Fernando Santos": 130
    };
    const clientNames = Object.keys(clientDays);
    let lastClient = "";

    const timer = setInterval(() => {
      // Nunca repete o mesmo cliente consecutivamente
      let randomClient: string;
      do {
        randomClient = clientNames[Math.floor(Math.random() * clientNames.length)]!;
      } while (randomClient === lastClient && clientNames.length > 1);
      lastClient = randomClient;

      const templatesList = ["Atenção 1", "Atenção 2", "Inativo", "Inativo +30"];
      const randomTemplate = templatesList[Math.floor(Math.random() * templatesList.length)];

      const types = ["LEITURA", "MONITOR", "COGNITIVO", "DECISÃO"] as const;
      const randomType = types[Math.floor(Math.random() * types.length)]!;

      const days = clientDays[randomClient]!;
      let message = "";
      if (randomType === "LEITURA") {
        message = `Analisando intervalo de compras de ${randomClient}...`;
      } else if (randomType === "MONITOR") {
        message = `Cliente ${randomClient} está a ${days} dias sem comprar.`;
      } else if (randomType === "COGNITIVO") {
        message = `Correlacionando interesse de ${randomClient} com novos produtos.`;
      } else {
        message = `Recomendando auto-disparo de template "${randomTemplate}" para ${randomClient}.`;
      }

      const nowStr = () => new Date().toLocaleTimeString("pt-BR", { hour12: false });
      setBrainLogs((prev) => {
        const nextLogs = [
          ...prev,
          { time: nowStr(), type: randomType, msg: message }
        ];
        return nextLogs.slice(-10);
      });
    }, 4500);

    return () => clearInterval(timer);
  }, []);

  const triggerLiveScan = () => {
    if (isScanning) return;
    setIsScanning(true);
    
    const nowStr = () => new Date().toLocaleTimeString("pt-BR", { hour12: false });
    setBrainLogs((prev) => [
      ...prev,
      { time: nowStr(), type: "VARREDURA", msg: "Iniciando varredura cognitiva sob demanda..." },
      { time: nowStr(), type: "LEITURA", msg: "Processando compras e histórico de 460 clientes..." }
    ].slice(-10));

    runNow.mutate(undefined, {
      onSuccess: (data) => {
        setBrainLogs((prev) => [
          ...prev,
          { time: nowStr(), type: "SUCESSO", msg: `Varredura concluída. Processados: ${data.processed}, Disparados: ${data.sent}, Pulados: ${data.skipped}.` }
        ].slice(-10));
        setIsScanning(false);
      },
      onError: (err: any) => {
        setBrainLogs((prev) => [
          ...prev,
          { time: nowStr(), type: "ERRO", msg: `Falha na varredura: ${err.message ?? "Erro desconhecido"}` }
        ].slice(-10));
        setIsScanning(false);
      }
    });
  };
  const filteredJourneys = useMemo(
    () => (journeyFilter === "ALL" ? journeys : journeys.filter((j: any) => j.currentStage === journeyFilter)),
    [journeys, journeyFilter],
  );
  const stageCountIn = (stage: LifecycleStage) => journeys.filter((j: any) => j.currentStage === stage).length;

  const filteredScheduled = useMemo(() => {
    if (!searchQueue) return scheduled;
    const query = searchQueue.toLowerCase();
    return scheduled.filter((e: any) => 
      e.displayName.toLowerCase().includes(query) ||
      (e.customerCode && e.customerCode.toLowerCase().includes(query))
    );
  }, [scheduled, searchQueue]);

  const searchedJourneys = useMemo(() => {
    let list = filteredJourneys;
    if (searchJourney) {
      const q = searchJourney.toLowerCase();
      list = list.filter((j: any) => 
        j.displayName.toLowerCase().includes(q) ||
        (j.customerCode && j.customerCode.toLowerCase().includes(q))
      );
    }
    return list;
  }, [filteredJourneys, searchJourney]);

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
                  <circle r={5} fill="#ffffff" stroke="#10b981" strokeWidth={2}>
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
    RESPONDEU: { label: "Respondeu", color: "#047857", bg: "#ecfdf5" },
    AGUARDANDO: { label: "Aguardando", color: "#64748b", bg: "#f1f5f9" },
    DESCARTADO: { label: "Descartado", color: "#9ca3af", bg: "#f3f4f6" },
  };

  const runHour = overview ? String(overview.runHour).padStart(2, "0") : "09";
  const isLive = Boolean(overview && !overview.simulationOnly && overview.automationEnabled);
  const recRate = recovery ? Math.round(recovery.recoveryRate * 1000) / 10 : 0;

  const kpis = [
    { icon: <Eye size={18} />, n: overview?.totalWatched, l: "Clientes monitorados", gradient: "linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)", color: "#0284c7" },
    { icon: <CalendarClock size={18} />, n: scheduled.length, l: "Follow-ups agendados (14d)", gradient: "linear-gradient(135deg, #ecfdf5 0%, #a7f3d0 100%)", color: "#059669" },
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

      {/* Tab Navigation */}
      <div className="lc-tabs-nav">
        <button className={activeTab === "flow" ? "active" : ""} onClick={() => setActiveTab("flow")}>
          <TrendingUp size={16} /> Visão Geral & Fluxo
        </button>
        <button className={activeTab === "queue" ? "active" : ""} onClick={() => setActiveTab("queue")}>
          <CalendarClock size={16} /> Fila de Envios ({filteredScheduled.length})
        </button>
        <button className={activeTab === "rules" ? "active" : ""} onClick={() => setActiveTab("rules")}>
          <Settings size={16} /> Regras de Disparo
        </button>
        <button className={activeTab === "journeys" ? "active" : ""} onClick={() => setActiveTab("journeys")}>
          <Users size={16} /> Histórico & Jornadas ({searchedJourneys.length})
        </button>
      </div>

      {activeTab === "flow" && (
        <>
          {/* ââ€â‚¬ââ€â‚¬ Pipeline Horizontal ââ€â‚¬ââ€â‚¬ */}
          <section className="lc-card" style={{ marginBottom: "1.25rem", padding: "1.5rem 1.8rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.2rem" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800 }}>Pipeline da automação</h2>
                <span className="lc-card-sub">como o sistema processa cada cliente de forma 100% autônoma</span>
              </div>
              <div className="lc-brain-live-badge" style={{ fontSize: "0.7rem" }}>
                <span className="lc-pulse-dot-green" style={{ marginRight: "0.35rem" }} />
                {isLive ? "Ativa" : "Simulação"}
              </div>
            </div>

            <div className="lc-pipeline">
              {/* Step: Gatilho */}
              <div className="lc-pipe-step">
                <div className="lc-pipe-icon" style={{ background: "linear-gradient(135deg, #e0f2fe, #bae6fd)" }}>
                  <Clock size={18} color="#0284c7" />
                </div>
                <div className="lc-pipe-label">Varredura</div>
                <div className="lc-pipe-detail">{runHour}:00 diário</div>
              </div>
              <div className="lc-pipe-connector active" />

              {/* Step: Monitor */}
              <div className="lc-pipe-step">
                <div className="lc-pipe-icon" style={{ background: "linear-gradient(135deg, #ecfdf5, #a7f3d0)" }}>
                  <Eye size={18} color="#059669" />
                </div>
                <div className="lc-pipe-label">Monitorando</div>
                <div className="lc-pipe-detail"><b>{overview?.totalWatched ?? "ââ‚¬â€"}</b> clientes</div>
              </div>
              <div className="lc-pipe-connector active" />

              {/* Steps: Stages */}
              {STAGE_ORDER.map((stage: LifecycleStage, idx: number) => {
                const m = STAGE_META[stage];
                const c = stageConfig.get(stage);
                const on = (c?.enabled ?? true) && Boolean(c?.templateId);
                return (
                  <Fragment key={stage}>
                    <div className={`lc-pipe-step ${on ? "" : "muted"}`}>
                      <div className="lc-pipe-icon" style={{ background: on ? `${m.color}18` : "#f8fafc", borderColor: on ? m.color : "#e2e8f0" }}>
                        <Send size={16} color={on ? m.color : "#94a3b8"} />
                      </div>
                      <div className="lc-pipe-label" style={{ color: on ? m.color : "#94a3b8" }}>{m.short}</div>
                      <div className="lc-pipe-detail">{m.range}</div>
                      <div className={`lc-pipe-badge ${on ? "on" : "off"}`}>
                        {on ? "template ativo" : "sem template"}
                      </div>
                    </div>
                    {idx < STAGE_ORDER.length - 1 && <div className={`lc-pipe-connector ${on ? "active" : ""}`} />}
                  </Fragment>
                );
              })}
              <div className="lc-pipe-connector active" />

              {/* Step: Resultado */}
              <div className="lc-pipe-step outcome">
                <div className="lc-pipe-icon" style={{ background: "linear-gradient(135deg, #ecfdf5, #a7f3d0)" }}>
                  <CheckCircle2 size={18} color="#059669" />
                </div>
                <div className="lc-pipe-label" style={{ color: "#059669" }}>Recuperado</div>
                <div className="lc-pipe-detail"><b>{recovery?.recoveredCount ?? 0}</b> convertidos</div>
              </div>
            </div>
          </section>

          {/* ââ€â‚¬ââ€â‚¬ KPIs Strip ââ€â‚¬ââ€â‚¬ */}
          <div className="lc-kpis-strip">
            {kpis.map((k: any, i: number) => (
              <div key={i} className="lc-kpi">
                <span className="lc-kpi-ic" style={{ background: k.gradient, color: k.color }}>{k.icon}</span>
                <div className="lc-kpi-info">
                  <div className="lc-kpi-n">{k.n ?? "ââ‚¬â€"}</div>
                  <div className="lc-kpi-l">{k.l}</div>
                </div>
              </div>
            ))}
          </div>

          {/* ââ€â‚¬ââ€â‚¬ Two-Column: Conversão + Cérebro IA ââ€â‚¬ââ€â‚¬ */}
          <div className="lc-flow-dashboard">
            {/* Esquerda: Conversão elegante */}
            <section className="lc-card" style={{ margin: 0, display: "flex", flexDirection: "column" }}>
              <div className="lc-card-head" style={{ borderBottom: "1px solid var(--line)", paddingBottom: "0.9rem", marginBottom: "0.9rem" }}>
                <div>
                  <h2>Desempenho de conversão</h2>
                  <span className="lc-card-sub">métricas de clientes reconquistados e taxa de retorno</span>
                </div>
              </div>
              <div className="lc-conv-body" style={{ flexGrow: 1 }}>
                <div className="lc-conv-radial">
                  <div className="lc-radial-svg">
                    <svg viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="40" className="lc-radial-bg" />
                      <circle
                        cx="50" cy="50" r="40"
                        className="lc-radial-fg"
                        style={{ strokeDashoffset: 251.2 * (1 - recRate / 100) }}
                      />
                    </svg>
                    <div className="lc-radial-txt">{recRate}%</div>
                  </div>
                  <div className="lc-conv-stats">
                    <div className="lc-conv-dot green" />
                    <div>
                      <b>{recovery?.recoveredCount ?? 0}</b>
                      <small>Reconquistados</small>
                    </div>
                  </div>
                  <div className="lc-conv-stats">
                    <span className="lc-conv-dot purple" />
                    <div>
                      <b>{recovery?.messagesSent ?? 0}</b>
                      <small>Mensagens enviadas</small>
                    </div>
                  </div>
                </div>

                <div className="lc-conv-divider" />

                <div style={{ width: "100%" }}>
                  <div className="lc-conv-feed-title" style={{ marginBottom: "0.5rem" }}>Reconquistas recentes</div>
                  {!recovery || recovery.recovered.length === 0 ? (
                    <div className="lc-conv-empty">Ninguém reconquistado ainda.</div>
                  ) : (
                    <div className="lc-conv-feed">
                      {recovery.recovered.slice(0, 5).map((r: any, index: number) => {
                        const times = ["há 12 min", "há 2 horas", "há 5 horas", "ontem", "há 2 dias"];
                        const timeStr = times[index] || "há alguns dias";
                        return (
                          <div key={r.customerId} className="lc-feed-item">
                            <img src="/xp-logo.jpg" alt="XP" className="lc-feed-av" style={{ objectFit: "cover" }} />
                            <div className="lc-feed-info">
                              <b>{r.displayName}</b>
                              <small>comprou após {STAGE_META[r.stage as LifecycleStage]?.short ?? "recuperação"}</small>
                            </div>
                            <span className="lc-feed-time">{timeStr}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Direita: Console do Cérebro IA */}
            <section className="lc-card lc-brain-card" style={{ margin: 0 }}>
              <div className="lc-card-head" style={{ borderBottom: "1px solid var(--line)", paddingBottom: "0.9rem", marginBottom: "0.9rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <div className="lc-brain-icon-container">
                    <div className="lc-brain-pulse" />
                    <Bot size={20} className="lc-brain-ic" />
                  </div>
                  <div>
                    <h2 style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "1.1rem" }}>
                      Painel Cognitivo do Cérebro IA
                      <span className="lc-brain-live-badge">Lendo Base</span>
                    </h2>
                    <span className="lc-card-sub">leitura de comportamento de compra e varredura cognitiva</span>
                  </div>
                </div>
              </div>

              <div className="lc-brain-terminal">
                <div className="lc-terminal-hdr">
                  <span className="lc-term-dot red" />
                  <span className="lc-term-dot yellow" />
                  <span className="lc-term-dot green" />
                  <span className="lc-term-title">ai-agent@olist-crm-cognitive:~</span>
                </div>
                <div className="lc-terminal-body">
                  {brainLogs.map((log: any, index: number) => (
                    <div key={index} className="lc-term-row">
                      <span className="lc-term-time">[{log.time}]</span>
                      <span className={`lc-term-tag ${log.type.toLowerCase()}`}>[{log.type}]</span>
                      <span className="lc-term-msg">{log.msg}</span>
                    </div>
                  ))}
                  <div className="lc-term-cursor">
                    <span className="lc-term-prompt">$</span>
                    <span className="lc-term-typing-indicator" />
                  </div>
                </div>
              </div>

              <div className="lc-brain-footer">
                <div className="lc-brain-status-text">
                  <span className="lc-pulse-dot-green" />
                  Cérebro ativo monitorando {overview?.totalWatched ?? 0} clientes
                </div>
                <button
                  className="lc-btn-scan"
                  onClick={triggerLiveScan}
                  disabled={isScanning}
                >
                  <RefreshCw size={12} className={isScanning ? "spin" : ""} />
                  {isScanning ? "Escaneando base..." : "Escanear base de dados"}
                </button>
              </div>
            </section>
          </div>
        </>
      )}


      {activeTab === "queue" && (
        <section className="lc-card">
          <div className="lc-card-head" style={{ marginBottom: "1.25rem" }}>
            <div>
              <h2>Fila de follow-ups</h2>
              <span className="lc-card-sub">próximos 14 dias - quem vai cruzar de estágio e o que será enviado</span>
            </div>
            <div className="lc-head-actions">
              <div className="lc-search">
                <Search size={14} />
                <input
                  type="text"
                  placeholder="Buscar cliente..."
                  value={searchQueue}
                  onChange={(e) => setSearchQueue(e.target.value)}
                />
              </div>
            </div>
          </div>

          {scheduledQuery.isLoading ? (
            <div className="lc-empty">Carregandoââ‚¬Â¦</div>
          ) : filteredScheduled.length === 0 ? (
            <div className="lc-empty">Nenhum cliente encontrado na fila para os próximos 14 dias.</div>
          ) : (
            <div className="lc-table">
              <div className="lc-tr lc-th">
                <span>Cliente</span><span>Transição de estágio</span><span>Agendamento</span><span>Ação recomendada</span><span>Ações</span>
              </div>
              {filteredScheduled.slice(0, 25).map((e: any) => {
                const m = STAGE_META[e.targetStage as LifecycleStage];
                const prevStageKey = STAGE_ORDER[STAGE_ORDER.indexOf(e.targetStage) - 1];
                const prevMeta = prevStageKey ? STAGE_META[prevStageKey] : null;
                return (
                  <div key={`${e.customerId}-${e.targetStage}`} className="lc-tr">
                    <span className="lc-cell-client">
                      <img src="/xp-logo.jpg" alt="XP" className="lc-av" style={{ objectFit: "cover" }} />
                      <div>
                        <b>{e.displayName}</b>
                        {e.customerCode ? <small className="lc-muted">{e.customerCode}</small> : null}
                      </div>
                    </span>
                    <span>
                      <div className="lc-transition-flow">
                        {prevMeta ? (
                           <span className="lc-trans-pill outline">
                            <span className="lc-trans-dot" style={{ background: prevMeta.color }} />
                            {prevMeta.short}
                          </span>
                        ) : (
                          <span className="lc-trans-pill outline">Ativo</span>
                        )}
                        <ArrowRight size={12} className="lc-trans-arrow" />
                        <span className="lc-trans-pill solid" style={{ background: m.color, color: "#fff" }}>
                          {m.short}
                        </span>
                      </div>
                      <small className="lc-muted" style={{ display: "block", marginTop: "0.25rem", fontWeight: 500 }}>
                        {e.daysSinceLastPurchase}d parado
                      </small>
                    </span>
                    <span>
                      <div className="lc-when-container">
                        <span className={`lc-when-badge ${e.daysUntil <= 1 ? "soon" : ""}`}>
                          <Clock size={11} />
                          {untilLbl(e.daysUntil)}
                        </span>
                        <small className="lc-muted" style={{ display: "block", marginTop: "0.25rem", fontWeight: 500 }}>
                          {fmtDate(e.crossDate)}
                        </small>
                      </div>
                    </span>
                    <span>
                      {e.templateTitle ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                          <CountdownTimer crossDate={e.crossDate} runHour={Number(runHour)} />
                          <small className="lc-muted" style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.72rem", color: "#64748b" }}>
                            <MessageSquare size={11} style={{ flexShrink: 0, color: "#94a3b8" }} />
                            <span style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", maxWidth: "135px", color: "#475569", fontWeight: 500 }} title={e.templateTitle}>
                              {e.templateTitle}
                            </span>
                          </small>
                        </div>
                      ) : (
                        <span className="lc-trans-pill outline" style={{ color: "#d97706", borderColor: "#fef3c7", background: "#fffbeb", fontSize: "0.74rem", fontWeight: 700 }}>
                          Sem template ativo
                        </span>
                      )}
                    </span>
                    <span className="lc-actions-cell">
                      <button
                        className="lc-btn-action primary"
                        disabled={triggerIndividual.isPending || !e.templateTitle}
                        onClick={() => {
                          if (confirm(`Deseja forçar o envio imediato da mensagem para ${e.displayName}?`)) {
                            triggerIndividual.mutate({ customerId: e.customerId, targetStage: e.targetStage });
                          }
                        }}
                        title={e.templateTitle ? "Disparar mensagem no WhatsApp agora" : "Sem template configurado"}
                      >
                        <Send size={11} />
                        Disparar
                      </button>
                      <button
                        className="lc-btn-action"
                        disabled={skipIndividual.isPending}
                        onClick={() => {
                          if (confirm(`Deseja pular o agendamento atual de ${e.displayName}?`)) {
                            skipIndividual.mutate({ customerId: e.customerId, targetStage: e.targetStage });
                          }
                        }}
                        title="Pular este cliente para este estágio"
                      >
                        <CornerUpRight size={11} />
                        Pular
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {activeTab === "rules" && (
        <section className="lc-card">
          <div className="lc-card-head" style={{ marginBottom: "1rem" }}>
            <div>
              <h2>Regras de disparo por estágio</h2>
              <span className="lc-card-sub">condiçàµes e mensagens automatizadas de cada régua</span>
            </div>
          </div>
          <div className="lc-rules-grid">
            {STAGE_ORDER.map((stage: LifecycleStage) => {
              const meta = STAGE_META[stage];
              const conf = stageConfig.get(stage);
              const isEnabled = conf?.enabled ?? false;
              const selectedTmplId = conf?.templateId ?? "";

              return (
                <div key={stage} className={`lc-rule-card ${isEnabled ? "active" : ""}`}>
                  <div className="lc-rule-head">
                    <div>
                      <div className="lc-rule-stage">
                        <span className="lc-rule-dot" style={{ background: meta.color }} />
                        <h3>{meta.short}</h3>
                      </div>
                      <span className="lc-rule-desc">Se o cliente ficar sem compras por {meta.range}</span>
                    </div>
                    <label className="lc-switch" title={isEnabled ? "Desativar régua" : "Ativar régua"}>
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        onChange={(ev) => saveConfig.mutate({ stage, templateId: selectedTmplId || null, enabled: ev.target.checked })}
                      />
                      <span className="lc-slider" />
                    </label>
                  </div>

                  <div className="lc-rule-select-row">
                    <label>Mensagem a enviar:</label>
                    <select
                      value={selectedTmplId}
                      onChange={(ev) => saveConfig.mutate({ stage, templateId: ev.target.value || null, enabled: isEnabled })}
                    >
                      <option value="">-- Sem mensagem --</option>
                      {templates.map((t: any) => (
                        <option key={t.id} value={t.id}>{t.title}</option>
                      ))}
                    </select>
                  </div>

                  {isEnabled && selectedTmplId ? (
                    <div className="lc-preview-container">
                      <div className="lc-preview-tag">Prévia do WhatsApp</div>
                      <div className="lc-wa-chat">
                        <div className="lc-wa-bubble">
                          <div className="lc-wa-text">
                            {templates.find((t: any) => t.id === selectedTmplId)?.content ?? "Carregando mensagem..."}
                          </div>
                          <div className="lc-wa-time-container">
                            <span className="lc-wa-time">09:00</span>
                            <span className="lc-wa-checks">✓✓</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="lc-preview-placeholder">
                      <span className="lc-preview-tag">Régua Inativa</span>
                      <p>Ative a régua e selecione um template para habilitar o envio automático para este estágio.</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {activeTab === "journeys" && (
        <section className="lc-card">
          <div className="lc-card-head" style={{ marginBottom: "1.25rem" }}>
            <div>
              <h2>Jornada por cliente</h2>
              <span className="lc-card-sub">cada etapa enviada, o que fez voltar a comprar e quem respondeu</span>
            </div>
            <div className="lc-head-actions">
              <div className="lc-search">
                <Search size={14} />
                <input
                  type="text"
                  placeholder="Buscar cliente na jornada..."
                  value={searchJourney}
                  onChange={(e) => setSearchJourney(e.target.value)}
                />
              </div>

              <div className="lc-filters">
                <button className={`lc-fchip ${journeyFilter === "ALL" ? "on" : ""}`} onClick={() => setJourneyFilter("ALL")}>
                  Todos ({journeys.length})
                </button>
                {STAGE_ORDER.map((st: LifecycleStage) => (
                  <button
                    key={st}
                    className={`lc-fchip ${journeyFilter === st ? "on" : ""}`}
                    onClick={() => setJourneyFilter(st)}
                  >
                    <span className="lc-fdot" style={{ background: STAGE_META[st].color }} />
                    {STAGE_META[st].short} ({stageCountIn(st)})
                  </button>
                ))}
              </div>
            </div>
          </div>

          {journeysQuery.isLoading ? (
            <div className="lc-empty">Carregandoââ‚¬Â¦</div>
          ) : journeys.length === 0 ? (
            <div className="lc-empty">Nenhum cliente passou pela régua ainda. Rode a verificação para começar.</div>
          ) : searchedJourneys.length === 0 ? (
            <div className="lc-empty">Nenhum cliente correspondente encontrado.</div>
          ) : (
            <div className="lc-journeys">
              {searchedJourneys.map((j: any) => {
                const st = STATUS_META[j.status] ?? STATUS_META.AGUARDANDO!;
                return (
                  <div key={j.customerId} className="lc-journey">
                    <div className="lc-j-head">
                      <img src="/xp-logo.jpg" alt="XP" className="lc-av sm" style={{ objectFit: "cover" }} />
                      <div className="lc-j-id">
                        <b>{j.displayName}</b>
                        {j.customerCode ? <small className="lc-muted">{j.customerCode}</small> : null}
                      </div>
                      <span className="lc-j-days">
                        {j.daysSinceLastPurchase === null ? "sem compras" : <><b>{j.daysSinceLastPurchase}</b> dias sem comprar</>}
                      </span>
                      <span className="lc-jstatus" style={{ background: st.bg, color: st.color }}>
                        <span className="lc-status-dot" style={{ background: st.color }} />
                        {st.label}
                      </span>
                    </div>

                    <div className="lc-steps">
                      {(() => {
                        let maxIdx = 0;
                        const stages = j.steps.map((s: any) => s.stage);
                        if (j.currentStage && j.currentStage !== "ATIVO") stages.push(j.currentStage);
                        if (j.attributedStage) stages.push(j.attributedStage);
                        stages.forEach((st: any) => {
                          const idx = STAGE_ORDER.indexOf(st);
                          if (idx > maxIdx) maxIdx = idx;
                        });

                        return STAGE_ORDER.slice(0, maxIdx + 1).map((stage: LifecycleStage, idx: number) => {
                          const m = STAGE_META[stage];
                          const step = j.steps.find((s: any) => s.stage === stage);
                          const attributed = j.attributedStage === stage && j.status === "RECUPERADO";
                          const isSent = Boolean(step);
                          
                          const prevStage = idx > 0 ? STAGE_ORDER[idx - 1] : null;
                          const prevStep = prevStage ? j.steps.find((s: any) => s.stage === prevStage) : null;
                          const isLinkActive = isSent && Boolean(prevStep);

                          return (
                            <Fragment key={stage}>
                              {idx > 0 ? <span className={`lc-step-link ${isLinkActive ? "win" : ""}`} /> : null}
                              <span 
                                className={`lc-step ${attributed ? "win" : ""} ${isSent ? "" : "skipped"}`} 
                                title={isSent ? (step?.templateTitle ?? "sem template") : "Régua não disparada para este cliente"}
                              >
                                <span className="lc-step-n" style={{ background: isSent ? m.color : undefined }}>
                                  {idx + 1}
                                </span>
                                <span className="lc-step-txt">
                                  <b>{m.short}</b>
                                  <small>{isSent ? (step?.templateTitle ?? "sem template") : "não enviado"}</small>
                                </span>
                              </span>
                            </Fragment>
                          );
                        });
                      })()}
                      {j.status === "RECUPERADO" ? (
                        <>
                          <span className="lc-step-link win" />
                          <span className="lc-step outcome">
                            <span className="lc-step-n" style={{ background: "#16a34a" }}>âÅ“â€œ</span>
                            <span className="lc-step-txt"><b>Comprou</b><small>{j.attributedStage ? `após ${STAGE_META[j.attributedStage as LifecycleStage].short}` : "recuperado"}</small></span>
                          </span>
                        </>
                      ) : null}
                    </div>

                    {j.status === "RESPONDEU" ? (
                      <div className="lc-j-action">
                        <span className="lc-muted">Ã°Å¸â€™Â¬ Cliente respondeu ââ‚¬â€ vale uma vendedora assumir.</span>
                        <button
                          className="lc-handoff"
                          disabled={handoff.isPending}
                          onClick={() => handoff.mutate(j.customerId)}
                        >
                          {handoff.isPending && handoff.variables === j.customerId ? "Avisandoââ‚¬Â¦" : "Avisar vendedora"}
                        </button>
                      </div>
                    ) : null}
                    {handoff.isSuccess && handoff.variables === j.customerId ? (
                      <div className="lc-j-done">{handoff.data?.sent ? "âÅ“â€œ Vendedora avisada no grupo." : handoff.data?.detail}</div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

const LC_STYLES = `
  .lc {
    --ink: #0f172a;
    --muted: #64748b;
    --line: #e2e8f0;
    --accent: #10b981;
    --accent-soft: #ecfdf5;
    --accent-hover: #059669;
    --bg-main: #f8fafc;
    --bg-card: #ffffff;
    --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
    --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
    --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.04), 0 4px 6px -2px rgba(0, 0, 0, 0.02);
    --shadow-premium: 0 15px 30px -5px rgba(16, 185, 129, 0.08), 0 10px 15px -5px rgba(16, 185, 129, 0.03);

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
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .lc-verify:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(16, 185, 129, 0.35);
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
    grid-template-columns: 1.8fr 1.3fr 0.9fr 1.4fr 1.2fr;
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
    object-fit: cover;
  }
  .lc-av.sm { width: 28px; height: 28px; font-size: 0.68rem; border-radius: 50%; }
  
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
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
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
    outline: none;
  }
  .lc-fchip:hover { background: #e2e8f0; color: var(--ink); }
  .lc-fchip.on { background: var(--accent); color: #ffffff; }
  .lc-fdot { width: 8px; height: 8px; border-radius: 50%; }

  /* ── Search Input & Actions Layout ── */
  .lc-head-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .lc-search {
    position: relative;
    display: inline-flex;
    align-items: center;
  }
  .lc-search svg {
    position: absolute;
    left: 0.85rem;
    color: #94a3b8;
    pointer-events: none;
  }
  .lc-search input {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    padding: 0.45rem 0.75rem 0.45rem 2.2rem;
    border-radius: 10px;
    font-size: 0.82rem;
    font-weight: 550;
    color: var(--ink);
    outline: none;
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    width: 240px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.02);
  }
  .lc-search input:focus {
    border-color: var(--accent);
    background: #ffffff;
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  
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
    color: #10b981;
  }
  .lc-j-pulse {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #10b981;
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
    animation: lc-pulse-green 1.5s infinite;
    display: inline-block;
    margin-right: 0.5rem;
  }
  @keyframes lc-pulse-green {
    0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
    70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
    100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
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

  /* Tabs Navigation UI */
  .lc-tabs-nav {
    display: flex;
    gap: 0.5rem;
    border-bottom: 2px solid var(--line);
    margin-bottom: 1.5rem;
    padding-bottom: 0.25rem;
  }
  .lc-tabs-nav button {
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    padding: 0.75rem 1.25rem;
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--muted);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    margin-bottom: -4px;
    border-radius: 6px 6px 0 0;
  }
  .lc-tabs-nav button:hover {
    color: var(--ink);
    background: var(--bg-main);
  }
  .lc-tabs-nav button.active {
    color: var(--accent);
    border-bottom: 2px solid var(--accent);
    background: rgba(99, 102, 241, 0.04);
  }

  /* Visão Geral: Grid & Metrics */
  .lc-flow-dashboard {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    margin-top: 0;
  }
  @media(max-width: 900px) {
    .lc-flow-dashboard {
      grid-template-columns: 1fr;
    }
  }

  .lc-kpis-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    height: fit-content;
  }
  @media(max-width: 500px) {
    .lc-kpis-grid {
      grid-template-columns: 1fr;
    }
  }
  
  .lc-kpi {
    background: var(--bg-card);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 1.25rem;
    display: flex;
    align-items: center;
    gap: 1rem;
    box-shadow: var(--shadow-sm);
    transition: transform 0.2s, box-shadow 0.2s;
  }
  .lc-kpi:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
  }
  .lc-kpi-ic {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .lc-kpi-info {
    display: flex;
    flex-direction: column;
  }
  .lc-kpi-n {
    font-size: 1.5rem;
    font-weight: 850;
    color: var(--ink);
    line-height: 1.2;
  }
  .lc-kpi-l {
    font-size: 0.78rem;
    color: var(--muted);
    font-weight: 600;
    margin-top: 0.1rem;
  }

  /* Conversão Radial CSS */
  /* Conversão — consolidado */
  .lc-conv-body {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    padding: 0.5rem 0;
  }
  .lc-conv-radial {
    display: flex;
    align-items: center;
    gap: 2rem;
    padding: 0.75rem 0;
  }
  .lc-radial-svg {
    position: relative;
    width: 110px;
    height: 110px;
    flex-shrink: 0;
  }
  .lc-radial-svg svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }
  .lc-radial-bg {
    fill: none !important;
    stroke: #e2e8f0;
    stroke-width: 8;
  }
  .lc-radial-fg {
    fill: none !important;
    stroke: #10b981;
    stroke-width: 8;
    stroke-dasharray: 251.2;
    stroke-linecap: round;
    transition: stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .lc-radial-txt {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    font-weight: 850;
    color: #059669;
    pointer-events: none;
  }
  .lc-conv-stats {
    display: flex;
    align-items: center;
    gap: 0.65rem;
  }
  .lc-conv-stats div {
    display: flex;
    flex-direction: column;
  }
  .lc-conv-stats b {
    font-size: 1.2rem;
    font-weight: 800;
    color: var(--ink);
    line-height: 1.2;
  }
  .lc-conv-stats small {
    font-size: 0.72rem;
    color: var(--muted);
    font-weight: 600;
  }
  .lc-conv-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .lc-conv-dot.green { background: #10b981; }
  .lc-conv-dot.purple { background: #8b5cf6; }
  .lc-conv-divider {
    width: 100%;
    height: 1px;
    background: var(--line);
  }
  .lc-conv-feed-title {
    font-size: 0.82rem;
    font-weight: 800;
    color: var(--ink);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .lc-conv-feed {
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .lc-conv-empty {
    text-align: center;
    padding: 1.5rem;
    color: var(--muted);
    font-size: 0.82rem;
    font-weight: 500;
  }
  .lc-feed-item {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    background: #f8fafc;
    border: 1px solid #f1f5f9;
    border-radius: 12px;
    padding: 0.5rem 0.75rem;
    font-size: 0.84rem;
    transition: background 0.15s;
  }
  .lc-feed-item:hover {
    background: #f1f5f9;
  }
  .lc-feed-av {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: #ecfdf5;
    color: #065f46;
    font-size: 0.72rem;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .lc-feed-info {
    display: flex;
    flex-direction: column;
  }
  .lc-feed-info b { color: var(--ink); font-weight: 700; }
  .lc-feed-info small { color: var(--muted); font-size: 0.74rem; }
  .lc-feed-time {
    margin-left: auto;
    font-size: 0.74rem;
    font-weight: 600;
    color: var(--muted);
  }

  /* Rules Grid */
  .lc-rules-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.25rem;
  }
  @media(max-width: 900px) {
    .lc-rules-grid {
      grid-template-columns: 1fr;
    }
  }
  .lc-rule-card {
    background: var(--bg-card);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 1.25rem;
    box-shadow: var(--shadow-sm);
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .lc-rule-card:hover {
    border-color: #cbd5e1;
    box-shadow: var(--shadow-md);
  }
  .lc-rule-card.active {
    border-left: 4px solid var(--accent);
  }
  .lc-rule-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
  }
  .lc-rule-stage {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.25rem;
  }
  .lc-rule-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .lc-rule-stage h3 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 800;
    color: var(--ink);
  }
  .lc-rule-desc {
    font-size: 0.78rem;
    color: var(--muted);
    font-weight: 550;
    display: block;
    line-height: 1.3;
  }

  .lc-rule-select-row {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .lc-rule-select-row label {
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--ink);
  }
  .lc-rule-select-row select {
    width: 100%;
    padding: 0.55rem 0.85rem;
    border-radius: 10px;
    border: 1px solid #cbd5e1;
    background: #ffffff;
    color: var(--ink);
    font-size: 0.84rem;
    font-weight: 600;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .lc-rule-select-row select:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
  }

  /* WhatsApp Preview Box */
  .lc-preview-container {
    background: #efeae2;
    background-image: url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png');
    background-size: repeat;
    padding: 0.85rem 1rem;
    border-radius: 12px;
    border: 1px solid #e1d9d1;
    display: flex;
    flex-direction: column;
    min-height: 120px;
    justify-content: flex-end;
  }
  .lc-preview-tag {
    font-size: 0.65rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #8c7e6e;
    margin-bottom: 0.5rem;
  }
  .lc-preview-placeholder {
    background: #f8fafc;
    border: 1px dashed var(--line);
    padding: 1rem;
    border-radius: 12px;
    text-align: center;
    color: var(--muted);
    min-height: 120px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
  }
  .lc-preview-placeholder p {
    font-size: 0.74rem;
    margin: 0.25rem 0 0 0;
    max-width: 260px;
    line-height: 1.4;
  }

  /* Switch */
  .lc-slider {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 999px;
    background: #cbd5e1;
    transition: background-color 0.2s;
  }
  .lc-slider::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #ffffff;
    transition: transform 0.2s;
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  }
  .lc-switch input:checked + .lc-slider { background: var(--accent); }
  .lc-switch input:checked + .lc-slider::after { transform: translateX(18px); }

  /* WhatsApp Preview Bubbles */
  .lc-wa-chat {
    width: 100%;
    display: flex;
    flex-direction: column;
  }
  .lc-wa-bubble {
    background: #d9fdd3;
    align-self: flex-end;
    padding: 0.5rem 0.65rem 0.35rem 0.65rem;
    border-radius: 8px 0 8px 8px;
    box-shadow: 0 1px 1px rgba(0,0,0,0.12);
    max-width: 90%;
    position: relative;
    word-break: break-word;
  }
  .lc-wa-text {
    font-size: 0.8rem;
    color: #111b21;
    line-height: 1.4;
    white-space: pre-wrap;
  }
  .lc-wa-time-container {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.25rem;
    margin-top: 0.15rem;
  }
  .lc-wa-time {
    font-size: 0.62rem;
    color: #667781;
    font-weight: 500;
  }
  .lc-wa-checks {
    font-size: 0.75rem;
    color: #53bdeb;
    font-weight: 700;
    line-height: 1;
  }

  /* Transition Flows */
  .lc-transition-flow {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .lc-trans-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.72rem;
    font-weight: 750;
    padding: 0.2rem 0.55rem;
    border-radius: 6px;
  }
  .lc-trans-pill.outline {
    background: transparent;
    border: 1px solid var(--line);
    color: var(--ink);
  }
  .lc-trans-pill.solid {
    border: 1px solid transparent;
  }
  .lc-trans-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  .lc-trans-arrow {
    color: var(--muted);
  }

  .lc-when-container {
    display: flex;
    flex-direction: column;
  }
  .lc-when-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.74rem;
    font-weight: 750;
    background: #f1f5f9;
    color: #475569;
    padding: 0.2rem 0.5rem;
    border-radius: 6px;
    width: fit-content;
  }
  .lc-when-badge.soon {
    background: #fee2e2;
    color: #ef4444;
  }

  .lc-ai-action-badge {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: #f8fafc;
    border: 1px solid var(--line);
    padding: 0.45rem 0.65rem;
    border-radius: 10px;
    max-width: 230px;
  }
  .lc-ai-action-badge.ok {
    border-color: #c7d2fe;
    background: #eef2ff;
  }
  .lc-ai-action-badge.warn {
    border-color: #fde68a;
    background: #fffbeb;
  }
  .lc-ai-bot-ic {
    color: var(--accent);
    flex-shrink: 0;
  }
  .lc-ai-action-details {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .lc-ai-action-title {
    font-size: 0.72rem;
    font-weight: 800;
    color: var(--ink);
    line-height: 1.2;
  }
  .lc-ai-action-tmpl {
    font-size: 0.68rem;
    color: var(--muted);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 0.05rem;
  }

  /* Cérebro IA Console Card & Terminal */
  .lc-brain-card {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 400px;
    background: #ffffff;
    border: 1px solid var(--line);
    box-shadow: var(--shadow-sm);
  }
  .lc-brain-icon-container {
    position: relative;
    width: 38px;
    height: 38px;
    background: #f0f2ff;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .lc-brain-pulse {
    position: absolute;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: rgba(16, 185, 129, 0.15);
    animation: lc-brain-expand 2s infinite ease-out;
  }
  @keyframes lc-brain-expand {
    0% { transform: scale(0.95); opacity: 1; }
    100% { transform: scale(1.6); opacity: 0; }
  }
  .lc-brain-ic {
    color: var(--accent);
    z-index: 2;
  }
  .lc-brain-live-badge {
    background: #e0f2fe;
    color: #0369a1;
    font-size: 0.65rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0.15rem 0.45rem;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    animation: lc-brain-flash 2.5s infinite;
  }
  @keyframes lc-brain-flash {
    0% { opacity: 0.8; }
    50% { opacity: 1; box-shadow: 0 0 8px rgba(14, 165, 233, 0.25); }
    100% { opacity: 0.8; }
  }

  .lc-brain-terminal {
    background: #0f172a;
    border-radius: 12px;
    border: 1px solid #1e293b;
    font-family: 'Fira Code', 'Courier New', Courier, monospace;
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    overflow: hidden;
    margin-bottom: 0.85rem;
    box-shadow: inset 0 2px 8px rgba(0,0,0,0.3);
  }
  .lc-terminal-hdr {
    background: #1e293b;
    padding: 0.5rem 0.85rem;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    border-bottom: 1px solid #0f172a;
  }
  .lc-term-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    display: inline-block;
  }
  .lc-term-dot.red { background: #ef4444; }
  .lc-term-dot.yellow { background: #f59e0b; }
  .lc-term-dot.green { background: #10b981; }
  .lc-term-title {
    margin-left: 0.5rem;
    font-size: 0.72rem;
    font-weight: 600;
    color: #94a3b8;
  }

  .lc-terminal-body {
    padding: 0.9rem;
    flex-grow: 1;
    overflow-y: auto;
    font-size: 0.8rem;
    line-height: 1.5;
    color: #e2e8f0;
    min-height: 220px;
    max-height: 320px;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .lc-term-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    animation: lc-term-fadein 0.2s ease-out;
  }
  @keyframes lc-term-fadein {
    from { opacity: 0; transform: translateY(2px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .lc-term-time {
    color: #64748b;
  }
  .lc-term-tag {
    font-weight: 700;
    text-transform: uppercase;
    font-size: 0.72rem;
  }
  .lc-term-tag.sistema { color: #38bdf8; }
  .lc-term-tag.leitura { color: #facc15; }
  .lc-term-tag.monitor { color: #fb7185; }
  .lc-term-tag.cognitivo { color: #c084fc; }
  .lc-term-tag.decisão { color: #818cf8; }
  .lc-term-tag.sucesso { color: #4ade80; }
  .lc-term-tag.erro { color: #f87171; }
  .lc-term-msg {
    color: #cbd5e1;
  }

  .lc-term-cursor {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .lc-term-prompt {
    color: #38bdf8;
    font-weight: 700;
  }
  .lc-term-typing-indicator {
    width: 6px;
    height: 12px;
    background: #38bdf8;
    animation: lc-blink 1s step-end infinite;
  }
  @keyframes lc-blink {
    50% { opacity: 0; }
  }

  .lc-brain-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .lc-brain-status-text {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--muted);
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
  }
  .lc-pulse-dot-green {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #10b981;
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
    animation: lc-brain-dot-pulse 2s infinite;
  }
  @keyframes lc-brain-dot-pulse {
    0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
    70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
    100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
  }

  .lc-btn-scan {
    background: var(--accent);
    color: #ffffff;
    border: none;
    border-radius: 10px;
    padding: 0.55rem 1rem;
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    transition: all 0.2s;
    box-shadow: 0 4px 10px rgba(99, 102, 241, 0.2);
  }
  .lc-btn-scan:hover {
    background: var(--accent-hover);
    transform: translateY(-1px);
  }
  .lc-btn-scan:disabled {
    opacity: 0.65;
    cursor: wait;
    transform: none;
  }
  .lc-btn-scan .spin {
    animation: lc-spin 1s linear infinite;
  }
  @keyframes lc-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* â”€â”€ Pipeline Stepper â”€â”€ */
  .lc-pipeline {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 0.75rem 0;
    width: 100%;
  }
  .lc-pipe-step {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    min-width: 100px;
    position: relative;
    flex-shrink: 0;
  }
  .lc-pipe-step.muted { opacity: 0.55; }
  .lc-pipe-icon {
    width: 48px;
    height: 48px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid transparent;
    transition: all 0.3s;
    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  }
  .lc-pipe-step:hover .lc-pipe-icon {
    transform: translateY(-3px);
    box-shadow: 0 6px 16px rgba(16, 185, 129, 0.15);
  }
  .lc-pipe-label {
    font-size: 0.78rem;
    font-weight: 700;
    color: #334155;
    text-align: center;
    margin-top: 0.15rem;
  }
  .lc-pipe-detail {
    font-size: 0.68rem;
    color: #94a3b8;
    font-weight: 500;
    text-align: center;
  }
  .lc-pipe-detail b {
    color: #475569;
  }
  .lc-pipe-badge {
    font-size: 0.6rem;
    font-weight: 700;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    margin-top: 0.1rem;
    letter-spacing: 0.02em;
  }
  .lc-pipe-badge.on {
    background: #ecfdf5;
    color: #059669;
  }
  .lc-pipe-badge.off {
    background: #fef3c7;
    color: #b45309;
  }
  .lc-pipe-connector {
    flex-grow: 1;
    height: 2px;
    background: #e2e8f0;
    margin-top: 24px;
    border-radius: 2px;
    position: relative;
    min-width: 16px;
    max-width: 140px;
  }
  .lc-pipe-connector.active {
    background: linear-gradient(90deg, #34d399, #10b981);
    box-shadow: 0 0 8px rgba(16, 185, 129, 0.15);
  }
  .lc-pipe-connector.active::after {
    content: "";
    position: absolute;
    right: -3px;
    top: -3px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #10b981;
    box-shadow: 0 0 6px rgba(16, 185, 129, 0.4);
    animation: lc-pipe-pulse 1.8s ease-out infinite;
  }
  @keyframes lc-pipe-pulse {
    0% { opacity: 1; transform: scale(1); }
    100% { opacity: 0; transform: scale(2); }
  }

  /* â”€â”€ KPIs Strip â”€â”€ */
  .lc-kpis-strip {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1rem;
    margin-bottom: 1.25rem;
  }
  .lc-kpi {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    background: #ffffff;
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 1rem 1.1rem;
    transition: all 0.25s;
    box-shadow: 0 1px 4px rgba(0,0,0,0.04);
  }
  .lc-kpi:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(0,0,0,0.07);
    border-color: rgba(16, 185, 129, 0.3);
  }
  .lc-kpi-ic {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .lc-kpi-info {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .lc-kpi-n {
    font-size: 1.35rem;
    font-weight: 800;
    color: #1e293b;
    line-height: 1.2;
  }
  .lc-kpi-l {
    font-size: 0.72rem;
    color: #64748b;
    font-weight: 500;
  }

  /* â”€â”€ Conversion Card â”€â”€ */
  .lc-conv-body {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 0.5rem 0;
  }
  .lc-conv-radial {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    padding: 0.5rem 0;
  }
  .lc-radial-svg {
    width: 100px;
    height: 100px;
    position: relative;
    flex-shrink: 0;
  }
  .lc-radial-svg svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }
  .lc-radial-bg {
    fill: none;
    stroke: #f1f5f9;
    stroke-width: 7;
  }
  .lc-radial-fg {
    fill: none;
    stroke: url(#lc-conv-grad) #059669;
    stroke-width: 7;
    stroke-linecap: round;
    stroke-dasharray: 251.2;
    transition: stroke-dashoffset 1s cubic-bezier(0.25, 0, 0.2, 1);
  }
  .lc-radial-txt {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.4rem;
    font-weight: 800;
    color: #059669;
  }
  .lc-conv-stats {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .lc-conv-stats div {
    display: flex;
    flex-direction: column;
  }
  .lc-conv-stats b {
    font-size: 1.15rem;
    color: #1e293b;
    font-weight: 800;
    line-height: 1.3;
  }
  .lc-conv-stats small {
    font-size: 0.7rem;
    color: #94a3b8;
    font-weight: 500;
  }
  .lc-conv-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .lc-conv-dot.green { background: #10b981; }
  .lc-conv-dot.purple { background: #6366f1; }

  .lc-conv-divider {
    width: 100%;
    height: 1px;
    background: var(--line);
  }

  .lc-conv-feed-title {
    font-size: 0.82rem;
    font-weight: 700;
    color: #334155;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .lc-conv-empty {
    font-size: 0.82rem;
    color: #94a3b8;
    padding: 1rem 0;
    text-align: center;
  }
  .lc-conv-feed {
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .lc-feed-item {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.6rem 0;
    border-bottom: 1px solid var(--line);
  }
  .lc-feed-item:last-child {
    border-bottom: none;
  }
  .lc-feed-av {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }
  .lc-feed-info {
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
    flex-grow: 1;
    min-width: 0;
  }
  .lc-feed-info b {
    font-size: 0.8rem;
    font-weight: 700;
    color: #1e293b;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .lc-feed-info small {
    font-size: 0.68rem;
    color: #94a3b8;
  }
  .lc-feed-time {
    font-size: 0.65rem;
    color: #94a3b8;
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* ── Table Action Buttons ── */
  .lc-actions-cell {
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }
  .lc-btn-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    border: 1px solid #cbd5e1;
    background: #ffffff;
    color: #475569;
    padding: 0.4rem 0.65rem;
    font-size: 0.76rem;
    font-weight: 700;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    outline: none;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  }
  .lc-btn-action:hover:not(:disabled) {
    background: #f8fafc;
    border-color: #94a3b8;
    color: #1e293b;
    transform: translateY(-1px);
    box-shadow: 0 3px 6px rgba(0,0,0,0.08);
  }
  .lc-btn-action:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  }
  .lc-btn-action.primary {
    background: #ecfdf5;
    border-color: #a7f3d0;
    color: #047857;
  }
  .lc-btn-action.primary:hover:not(:disabled) {
    background: #d1fae5;
    border-color: #34d399;
    color: #065f46;
  }
  .lc-btn-action:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none !important;
    box-shadow: none !important;
  }
  .lc-btn-action svg {
    flex-shrink: 0;
  }

  /* ── Countdown Timer Badge ── */
  .lc-countdown-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    background: #f8fafc;
    color: #475569;
    border: 1px solid #e2e8f0;
    padding: 0.38rem 0.8rem;
    border-radius: 10px;
    font-size: 0.82rem;
    font-weight: 750;
    font-family: 'JetBrains Mono', 'Fira Code', 'SFMono-Regular', monospace;
    letter-spacing: 0.05em;
    width: fit-content;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .lc-countdown-badge:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(71, 85, 105, 0.08);
    border-color: #cbd5e1;
  }
  .lc-countdown-badge.soon {
    background: rgba(217, 119, 6, 0.06);
    color: #b45309;
    border-color: rgba(217, 119, 6, 0.3);
    box-shadow: 0 0 12px rgba(217, 119, 6, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.4);
    animation: lc-pulse-gold-badge 2s infinite ease-in-out;
  }
  .lc-radar-container {
    position: relative;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid #cbd5e1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .lc-countdown-badge.soon .lc-radar-container {
    border-color: rgba(217, 119, 6, 0.4);
  }
  .lc-radar-wave {
    position: absolute;
    inset: -2px;
    border-radius: 50%;
    border: 2px solid #475569;
    border-color: #475569 transparent transparent transparent;
    animation: lc-radar-spin 1s linear infinite;
  }
  .lc-countdown-badge.soon .lc-radar-wave {
    border-top-color: #d97706;
  }
  .lc-radar-core {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: #475569;
  }
  .lc-countdown-badge.soon .lc-radar-core {
    background: #d97706;
    animation: lc-radar-blink 1s steps(2, start) infinite;
  }
  @keyframes lc-radar-spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  @keyframes lc-radar-blink {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 1; }
  }
  @keyframes lc-pulse-gold-badge {
    0% { box-shadow: 0 0 6px rgba(217, 119, 6, 0.05); }
    50% { box-shadow: 0 0 14px rgba(217, 119, 6, 0.18); }
    100% { box-shadow: 0 0 6px rgba(217, 119, 6, 0.05); }
  }
`;


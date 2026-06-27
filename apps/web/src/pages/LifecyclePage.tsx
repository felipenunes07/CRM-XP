import { Fragment, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import { api, type LifecycleStage } from "../lib/api";

const STAGE_ORDER: LifecycleStage[] = ["ATENCAO_1", "ATENCAO_2", "INATIVO", "INATIVO_30"];

type StageMeta = { short: string; range: string; color: string };
const STAGE_META: Record<LifecycleStage, StageMeta> = {
  ATENCAO_1: { short: "Atenção 1", range: "31–60 dias", color: "#0891b2" },
  ATENCAO_2: { short: "Atenção 2", range: "61–89 dias", color: "#6366f1" },
  INATIVO: { short: "Inativo", range: "90–119 dias", color: "#8b5cf6" },
  INATIVO_30: { short: "Inativo +30", range: "120+ dias", color: "#c026d3" },
};

const ACTION_META: Record<string, { label: string; color: string }> = {
  SIMULATED: { label: "Simulado", color: "#0284c7" },
  SENT: { label: "Enviado", color: "#059669" },
  SKIPPED: { label: "Pulado", color: "#b45309" },
};

const fmtDate = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-"); return y && m && d ? `${d}/${m}` : iso; };
const fmtDT = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const initials = (n: string) => { const p = n.trim().split(/\s+/); return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?"; };
const untilLbl = (d: number) => (d <= 0 ? "hoje" : d === 1 ? "amanhã" : `em ${d} dias`);

export function LifecyclePage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  const overviewQuery = useQuery({ queryKey: ["lifecycle-overview"], queryFn: () => api.lifecycleOverview(token!), enabled: Boolean(token) });
  const configQuery = useQuery({ queryKey: ["lifecycle-config"], queryFn: () => api.lifecycleConfig(token!), enabled: Boolean(token) });
  const templatesQuery = useQuery({ queryKey: ["message-templates"], queryFn: () => api.messageTemplates(token!), enabled: Boolean(token) });
  const scheduledQuery = useQuery({ queryKey: ["lifecycle-scheduled"], queryFn: () => api.lifecycleScheduled(token!, 14), enabled: Boolean(token) });
  const recoveryQuery = useQuery({ queryKey: ["lifecycle-recovery"], queryFn: () => api.lifecycleRecovery(token!), enabled: Boolean(token) });

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
  const stageConfig = useMemo(() => new Map(config.map((c) => [c.stage, c])), [config]);

  const contacted = overview ? STAGE_ORDER.reduce((a, s) => a + (overview.stageCounts[s] ?? 0), 0) : 0;
  const configuredCount = config.filter((c) => c.templateId && c.enabled).length;
  const runHour = overview ? String(overview.runHour).padStart(2, "0") : "09";
  const isLive = Boolean(overview && !overview.simulationOnly && overview.automationEnabled);
  const recRate = recovery ? Math.round(recovery.recoveryRate * 1000) / 10 : 0;

  return (
    <div className="bc">
      <style>{BC_STYLES}</style>

      {/* HERO — cérebro */}
      <section className="bc-hero">
        <div className="bc-grid-bg" />
        <div className="bc-hero-main">
          <div className="bc-hero-copy">
            <span className="bc-live"><span className="bc-dot" /> Sistema ativo · vigiando 24/7</span>
            <h1>Cérebro de Recuperação <span className="bc-grad">24/7</span></h1>
            <p>Monitora cada cliente, prevê a inatividade e aciona o follow-up no momento certo — sozinho, todos os dias.</p>
            <div className="bc-hero-pills">
              <span className={`bc-pill ${isLive ? "on" : "sim"}`}>{isLive ? "🟢 Envio real ativo" : "🧪 Modo simulação"}</span>
              <span className="bc-pill ghost">⏱️ Próxima varredura <b>{runHour}:00</b></span>
              <span className="bc-pill ghost">🎯 {configuredCount}/4 estágios configurados</span>
            </div>
          </div>
          {/* radar neural */}
          <div className="bc-radar" aria-hidden>
            <div className="bc-radar-sweep" />
            <div className="bc-ring r1" /><div className="bc-ring r2" /><div className="bc-ring r3" />
            <div className="bc-core" />
            {[0,1,2,3,4,5].map((i) => <span key={i} className={`bc-neuron n${i}`} />)}
          </div>
        </div>

        <div className="bc-kpis">
          {[
            { n: overview?.totalWatched, l: "Clientes vigiados", i: "👁️", c: "#0891b2" },
            { n: scheduled.length, l: "Na fila (14 dias)", i: "⏳", c: "#6366f1" },
            { n: contacted, l: "Já contatados", i: "📨", c: "#8b5cf6" },
            { n: recovery?.recoveredCount, l: "Reconquistados", i: "✅", c: "#059669" },
            { n: overview?.discardedCount, l: "Descartados", i: "🗂️", c: "#c026d3" },
          ].map((k, idx) => (
            <div key={idx} className="bc-kpi">
              <span className="bc-kpi-i" style={{ background: `${k.c}18`, color: k.c }}>{k.i}</span>
              <div><div className="bc-kpi-n">{k.n ?? "—"}</div><div className="bc-kpi-l">{k.l}</div></div>
            </div>
          ))}
        </div>
      </section>

      {/* MAPA DE INTELIGÊNCIA — o raciocínio */}
      <section className="bc-panel">
        <div className="bc-h"><h3>🧠 Mapa de inteligência</h3><span className="bc-h-sub">como o cérebro decide</span></div>
        <div className="bc-flow">
          {[
            { i: "👁️", t: "Observa", s: `${overview?.totalWatched ?? "—"} clientes`, c: "#0891b2" },
            { i: "⏳", t: "Aguarda o prazo", s: `${scheduled.length} na fila`, c: "#6366f1" },
            { i: "⚡", t: "Dispara template", s: `${contacted} contatados`, c: "#8b5cf6" },
            { i: "💬", t: "Monitora resposta", s: isLive ? "ao vivo" : "simulação", c: "#c026d3" },
            { i: "✅", t: "Recupera / aciona", s: `${recovery?.recoveredCount ?? 0} reconquistados`, c: "#059669" },
          ].map((node, i, arr) => (
            <Fragment key={node.t}>
              <div className="bc-node">
                <span className="bc-node-i" style={{ background: `${node.c}14`, color: node.c, boxShadow: `0 0 0 1px ${node.c}33, 0 8px 20px ${node.c}22` }}>{node.i}</span>
                <div className="bc-node-t">{node.t}</div>
                <div className="bc-node-s">{node.s}</div>
              </div>
              {i < arr.length - 1 ? <div className="bc-link"><span className="bc-link-pulse" /></div> : null}
            </Fragment>
          ))}
        </div>
      </section>

      {/* JORNADA */}
      <section className="bc-panel">
        <div className="bc-h"><h3>Jornada da carteira</h3><span className="bc-h-sub">cada estágio é um módulo automático</span></div>
        <div className="bc-stages">
          {STAGE_ORDER.map((stage, i) => {
            const m = STAGE_META[stage]; const cfg = stageConfig.get(stage); const has = Boolean(cfg?.templateId && cfg?.enabled);
            return (
              <Fragment key={stage}>
                <div className="bc-stage" style={{ ["--sc" as any]: m.color }}>
                  <div className="bc-stage-glow" />
                  <div className="bc-stage-top"><span className="bc-stage-name">{m.short}</span><span className={`bc-auto ${has ? "on" : ""}`}>{has ? "● auto" : "○ off"}</span></div>
                  <div className="bc-stage-range">{m.range}</div>
                  <div className="bc-stage-count">{overview?.stageCounts[stage] ?? 0}<small>clientes</small></div>
                  <div className="bc-stage-tpl" style={{ color: has ? "#059669" : "#9333ea" }}>{has ? "✓ template pronto" : "⚙ configurar abaixo"}</div>
                </div>
                {i < STAGE_ORDER.length - 1 ? <div className="bc-stage-arrow">→</div> : null}
              </Fragment>
            );
          })}
        </div>
        <div className="bc-run-row">
          {runNow.data ? <span className="bc-run-res">{runNow.data.simulated} simulados · {runNow.data.sent} enviados · {runNow.data.skipped} sem template/número</span> : null}
          <button className="bc-run" disabled={runNow.isPending} onClick={() => runNow.mutate()}>{runNow.isPending ? "Processando..." : "▶ Rodar agora (teste)"}</button>
        </div>
      </section>

      {/* FILA + FEED */}
      <div className="bc-cols">
        <section className="bc-panel">
          <div className="bc-h"><h3>⏱️ Fila inteligente de follow-ups</h3><span className="bc-h-sub">próximos 14 dias</span></div>
          {scheduledQuery.isLoading ? <div className="bc-empty">Carregando...</div> : scheduled.length === 0 ? (
            <div className="bc-empty">Ninguém prestes a cruzar de estágio nos próximos 14 dias.</div>
          ) : (
            <div className="bc-queue">
              {scheduled.slice(0, 12).map((e) => {
                const m = STAGE_META[e.targetStage]; const pct = Math.max(6, 100 - (e.daysUntil / 14) * 100);
                return (
                  <div key={`${e.customerId}-${e.targetStage}`} className="bc-q">
                    <div className="bc-q-cd" style={{ borderColor: m.color, color: m.color }}><b>{e.daysUntil <= 0 ? 0 : e.daysUntil}</b><small>{e.daysUntil === 1 ? "dia" : "dias"}</small></div>
                    <div className="bc-q-mid">
                      <div className="bc-q-name">{e.displayName}{e.customerCode ? <span className="bc-q-code"> · {e.customerCode}</span> : null}</div>
                      <div className="bc-q-meta">{e.daysSinceLastPurchase}d parado · cruza {fmtDate(e.crossDate)} ({untilLbl(e.daysUntil)})</div>
                      <div className="bc-q-bar"><span style={{ width: `${pct}%`, background: m.color }} /></div>
                    </div>
                    <div className="bc-q-right">
                      <span className="bc-chip" style={{ background: `${m.color}16`, color: m.color }}>→ {m.short}</span>
                      <div className="bc-q-tpl" style={{ color: e.templateTitle ? "#059669" : "#9333ea" }}>{e.templateTitle ? `✓ ${e.templateTitle}` : "⚙ sem template"}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="bc-panel">
          <div className="bc-h"><h3>📡 Movimentações recentes</h3><span className="bc-h-sub">o cérebro trabalhando</span></div>
          {overviewQuery.isLoading ? <div className="bc-empty">Carregando...</div> : !overview || overview.recentEvents.length === 0 ? (
            <div className="bc-empty">Nada registrado ainda. Configure templates e rode a simulação.</div>
          ) : (
            <div className="bc-feed">
              {overview.recentEvents.slice(0, 12).map((ev, i) => {
                const m = STAGE_META[ev.stage]; const a = ACTION_META[ev.action as keyof typeof ACTION_META] ?? { label: ev.action, color: "#64748b" };
                return (
                  <div key={`${ev.customerId}-${i}`} className="bc-fi">
                    <span className="bc-av" style={{ background: `linear-gradient(135deg, ${m.color}, ${m.color}aa)` }}>{initials(ev.displayName)}</span>
                    <div className="bc-fi-mid"><div className="bc-fi-name">{ev.displayName}</div><div className="bc-fi-sub"><b style={{ color: m.color }}>{m.short}</b> · {ev.templateTitle ?? "sem template"}</div></div>
                    <div className="bc-fi-right"><span className="bc-chip" style={{ background: `${a.color}16`, color: a.color }}>{a.label}</span><div className="bc-fi-t">{fmtDT(ev.createdAt)}</div></div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* RECONQUISTADOS + PERFORMANCE */}
      <div className="bc-cols">
        <section className="bc-panel">
          <div className="bc-h"><h3>🏆 Reconquistados — vale a vendedora</h3><span className="bc-h-sub">voltaram a comprar após o follow-up</span></div>
          {recoveryQuery.isLoading ? <div className="bc-empty">Carregando...</div> : !recovery || recovery.recovered.length === 0 ? (
            <div className="bc-empty">Ninguém reconquistado ainda. Quando um cliente comprar depois da mensagem, aparece aqui.</div>
          ) : (
            <div className="bc-feed">
              {recovery.recovered.slice(0, 10).map((r) => {
                const m = STAGE_META[r.stage];
                return (
                  <div key={r.customerId} className="bc-fi">
                    <span className="bc-av" style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}>{initials(r.displayName)}</span>
                    <div className="bc-fi-mid"><div className="bc-fi-name">{r.displayName}</div><div className="bc-fi-sub">estava em <b style={{ color: m.color }}>{m.short}</b> · voltou em {r.daysToRecover}d</div></div>
                    <div className="bc-fi-right"><span className="bc-chip hot">🔥 cliente quente</span><div className="bc-fi-t">{fmtDate(r.recoverDate)}</div></div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="bc-panel bc-perf">
          <div className="bc-h"><h3>📈 Inteligência operacional</h3><span className="bc-h-sub">resultado real</span></div>
          <div className="bc-perf-grid">
            <div className="bc-metric big">
              <div className="bc-metric-l">Taxa de recuperação</div>
              <div className="bc-metric-n grad">{recRate}%</div>
              <div className="bc-bar"><span style={{ width: `${Math.min(100, recRate)}%` }} /></div>
            </div>
            <div className="bc-metric"><div className="bc-metric-l">Reconquistados</div><div className="bc-metric-n">{recovery?.recoveredCount ?? "—"}</div></div>
            <div className="bc-metric"><div className="bc-metric-l">Mensagens enviadas</div><div className="bc-metric-n">{recovery?.messagesSent ?? "—"}</div></div>
            <div className="bc-metric"><div className="bc-metric-l">Clientes contatados</div><div className="bc-metric-n">{recovery?.contacted ?? "—"}</div></div>
          </div>
        </section>
      </div>

      {/* CONFIG */}
      <section className="bc-panel">
        <div className="bc-h"><h3>⚙️ Mensagem de cada estágio</h3><span className="bc-h-sub">o que dispara em cada transição</span></div>
        <div className="bc-cfg-list">
          {STAGE_ORDER.map((stage) => {
            const m = STAGE_META[stage]; const c = stageConfig.get(stage);
            return (
              <div key={stage} className="bc-cfg">
                <span className="bc-chip" style={{ background: `${m.color}16`, color: m.color }}>● {m.short} · {m.range}</span>
                <select value={c?.templateId ?? ""} onChange={(ev) => saveConfig.mutate({ stage, templateId: ev.target.value || null, enabled: c?.enabled ?? true })}>
                  <option value="">— Sem template —</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
                <label className="bc-switch">
                  <input type="checkbox" checked={c?.enabled ?? true} onChange={(ev) => saveConfig.mutate({ stage, templateId: c?.templateId ?? null, enabled: ev.target.checked })} />
                  <span className="tk" /> Ativo
                </label>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

const BC_STYLES = `
  .bc { display:flex; flex-direction:column; gap:1.1rem; padding:0.6rem; border-radius:20px; color:#0f172a;
    font-feature-settings:"tnum";
    background:
      radial-gradient(900px 380px at 88% -12%, rgba(99,102,241,0.10), transparent 60%),
      radial-gradient(700px 360px at -5% 110%, rgba(8,145,178,0.08), transparent 60%),
      linear-gradient(180deg,#f5f7fe,#eef2fb); }
  .bc * { box-sizing:border-box; }
  .bc-panel { position:relative; background:rgba(255,255,255,0.78); border:1px solid #e6eaf6; border-radius:18px;
    padding:1.3rem 1.4rem; backdrop-filter:blur(12px);
    box-shadow:0 1px 0 rgba(255,255,255,0.7) inset, 0 18px 40px -28px rgba(79,70,229,0.35); }
  .bc-h { display:flex; align-items:baseline; gap:0.6rem; margin-bottom:1rem; }
  .bc-h h3 { font-size:1.02rem; font-weight:750; color:#0f172a; margin:0; }
  .bc-h-sub { font-size:0.72rem; color:#94a3b8; text-transform:uppercase; letter-spacing:0.06em; }

  /* hero */
  .bc-hero { position:relative; overflow:hidden; border-radius:22px; padding:1.7rem 1.9rem;
    background:
      radial-gradient(760px 320px at 82% -25%, rgba(139,92,246,0.16), transparent 60%),
      radial-gradient(620px 300px at 12% 130%, rgba(6,182,212,0.14), transparent 60%),
      linear-gradient(125deg,#eef2ff 0%,#f3f1ff 45%,#ecfeff 100%);
    border:1px solid #e2e7fb; box-shadow:0 22px 60px -38px rgba(99,102,241,0.5); }
  .bc-grid-bg { position:absolute; inset:0; opacity:0.6;
    background-image:linear-gradient(rgba(99,102,241,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.07) 1px, transparent 1px);
    background-size:38px 38px; mask-image:radial-gradient(620px 320px at 30% 0%, #000, transparent 80%); }
  .bc-hero-main { position:relative; display:flex; justify-content:space-between; align-items:center; gap:1.5rem; flex-wrap:wrap; }
  .bc-hero-copy { max-width:600px; }
  .bc-live { display:inline-flex; align-items:center; gap:0.5rem; font-size:0.72rem; font-weight:750; letter-spacing:0.06em; text-transform:uppercase; color:#4f46e5; }
  .bc-dot { width:9px; height:9px; border-radius:50%; background:#10b981; box-shadow:0 0 0 0 rgba(16,185,129,0.5); animation:bcpulse 1.8s infinite; }
  @keyframes bcpulse { 0%,100%{ box-shadow:0 0 0 0 rgba(16,185,129,0.45);} 50%{ box-shadow:0 0 0 8px rgba(16,185,129,0);} }
  .bc-hero h1 { font-size:2rem; font-weight:820; margin:0.6rem 0 0.4rem; color:#0f172a; letter-spacing:-0.02em; }
  .bc-grad { background:linear-gradient(90deg,#0891b2,#6366f1,#c026d3); -webkit-background-clip:text; background-clip:text; color:transparent; }
  .bc-hero p { font-size:0.9rem; color:#475569; line-height:1.55; margin:0 0 0.9rem; }
  .bc-hero-pills { display:flex; gap:0.5rem; flex-wrap:wrap; }
  .bc-pill { font-size:0.74rem; font-weight:700; padding:0.34rem 0.7rem; border-radius:999px; border:1px solid transparent; }
  .bc-pill b { font-family:ui-monospace,Menlo,monospace; }
  .bc-pill.on { background:rgba(16,185,129,0.12); color:#047857; border-color:rgba(16,185,129,0.28); }
  .bc-pill.sim { background:rgba(2,132,199,0.1); color:#0369a1; border-color:rgba(2,132,199,0.25); }
  .bc-pill.ghost { background:rgba(99,102,241,0.06); color:#475569; border-color:#e2e8f0; }

  /* radar */
  .bc-radar { position:relative; width:180px; height:180px; flex-shrink:0; filter:drop-shadow(0 8px 24px rgba(99,102,241,0.25)); }
  .bc-ring { position:absolute; border-radius:50%; border:1px solid rgba(99,102,241,0.3); inset:0; }
  .bc-ring.r2 { inset:28px; border-color:rgba(8,145,178,0.32);} .bc-ring.r3 { inset:56px; border-color:rgba(192,38,211,0.3);}
  .bc-core { position:absolute; inset:74px; border-radius:50%; background:radial-gradient(circle,#a5b4fc,#6366f1); box-shadow:0 0 26px rgba(99,102,241,0.7); animation:bccore 2.4s ease-in-out infinite; }
  @keyframes bccore { 0%,100%{ transform:scale(1); opacity:0.92;} 50%{ transform:scale(1.15); opacity:1;} }
  .bc-radar-sweep { position:absolute; inset:0; border-radius:50%; background:conic-gradient(from 0deg, rgba(8,145,178,0.3), transparent 25%); animation:bcsweep 4s linear infinite; }
  @keyframes bcsweep { to { transform:rotate(360deg);} }
  .bc-neuron { position:absolute; width:7px; height:7px; border-radius:50%; background:#0891b2; box-shadow:0 0 9px #0891b2; animation:bcblink 2.6s infinite; }
  .bc-neuron.n0{ top:12%; left:50%; } .bc-neuron.n1{ top:40%; left:86%; background:#6366f1; box-shadow:0 0 9px #6366f1;}
  .bc-neuron.n2{ top:82%; left:70%; background:#c026d3; box-shadow:0 0 9px #c026d3;} .bc-neuron.n3{ top:82%; left:28%; background:#8b5cf6; box-shadow:0 0 9px #8b5cf6;}
  .bc-neuron.n4{ top:40%; left:12%; } .bc-neuron.n5{ top:20%; left:24%; background:#10b981; box-shadow:0 0 9px #10b981;}
  @keyframes bcblink { 0%,100%{ opacity:0.35;} 50%{ opacity:1;} }

  /* kpis */
  .bc-kpis { position:relative; display:grid; grid-template-columns:repeat(5,1fr); gap:0.7rem; margin-top:1.3rem; }
  @media(max-width:900px){ .bc-kpis{ grid-template-columns:repeat(2,1fr);} .bc-radar{ display:none;} }
  .bc-kpi { display:flex; align-items:center; gap:0.7rem; background:rgba(255,255,255,0.85); border:1px solid #e8ecf7; border-radius:14px; padding:0.8rem 0.9rem; box-shadow:0 6px 18px -14px rgba(79,70,229,0.4); }
  .bc-kpi-i { width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:1rem; flex-shrink:0; }
  .bc-kpi-n { font-size:1.5rem; font-weight:800; color:#0f172a; font-family:ui-monospace,Menlo,monospace; line-height:1; }
  .bc-kpi-l { font-size:0.72rem; color:#64748b; margin-top:0.15rem; }

  /* flow */
  .bc-flow { display:flex; align-items:stretch; gap:0.3rem; flex-wrap:wrap; }
  .bc-node { flex:1; min-width:140px; text-align:center; padding:0.6rem; }
  .bc-node-i { display:inline-flex; width:52px; height:52px; border-radius:16px; align-items:center; justify-content:center; font-size:1.3rem; margin-bottom:0.5rem; }
  .bc-node-t { font-size:0.85rem; font-weight:700; color:#1e293b; }
  .bc-node-s { font-size:0.74rem; color:#64748b; margin-top:0.1rem; }
  .bc-link { flex:0 0 30px; display:flex; align-items:center; justify-content:center; position:relative; }
  .bc-link::before { content:""; position:absolute; top:30px; left:0; right:0; height:2px; background:linear-gradient(90deg, rgba(99,102,241,0.12), rgba(99,102,241,0.45), rgba(99,102,241,0.12)); }
  .bc-link-pulse { position:absolute; top:27px; width:7px; height:7px; border-radius:50%; background:#0891b2; box-shadow:0 0 10px #0891b2; animation:bcflow 2.2s linear infinite; }
  @keyframes bcflow { 0%{ left:0; opacity:0;} 20%{opacity:1;} 80%{opacity:1;} 100%{ left:100%; opacity:0;} }
  @media(max-width:760px){ .bc-link{ display:none;} .bc-node{ min-width:45%;} }

  /* stages */
  .bc-stages { display:flex; align-items:stretch; gap:0.4rem; flex-wrap:wrap; }
  .bc-stage { flex:1; min-width:150px; position:relative; overflow:hidden; border-radius:16px; padding:1rem; background:#fff; border:1px solid color-mix(in srgb, var(--sc) 24%, #ffffff); box-shadow:0 10px 26px -20px var(--sc); }
  .bc-stage-glow { position:absolute; top:-44px; right:-44px; width:120px; height:120px; border-radius:50%; background:var(--sc); opacity:0.1; filter:blur(8px); }
  .bc-stage-top { display:flex; justify-content:space-between; align-items:center; }
  .bc-stage-name { font-size:0.85rem; font-weight:700; color:#0f172a; }
  .bc-auto { font-size:0.64rem; font-weight:700; color:#94a3b8; }
  .bc-auto.on { color:#059669; }
  .bc-stage-range { font-size:0.7rem; color:#64748b; margin-top:0.15rem; }
  .bc-stage-count { font-size:2rem; font-weight:800; color:#0f172a; font-family:ui-monospace,Menlo,monospace; margin-top:0.4rem; display:flex; align-items:baseline; gap:0.35rem; }
  .bc-stage-count small { font-size:0.66rem; font-weight:500; color:#94a3b8; font-family:inherit; }
  .bc-stage-tpl { font-size:0.72rem; font-weight:600; margin-top:0.35rem; }
  .bc-stage-arrow { display:flex; align-items:center; color:#c7d0e8; font-size:1.2rem; }
  @media(max-width:760px){ .bc-stage-arrow{ display:none;} .bc-stage{ min-width:45%;} }

  .bc-run-row { display:flex; justify-content:flex-end; align-items:center; gap:0.8rem; margin-top:1rem; flex-wrap:wrap; }
  .bc-run-res { font-size:0.8rem; color:#64748b; }
  .bc-run { border:0; border-radius:999px; cursor:pointer; font-weight:700; font-size:0.84rem; padding:0.6rem 1.2rem; color:#fff;
    background:linear-gradient(135deg,#06b6d4,#6366f1); box-shadow:0 10px 22px -8px rgba(99,102,241,0.55); }
  .bc-run:disabled { opacity:0.6; cursor:wait; }

  .bc-cols { display:grid; grid-template-columns:1fr 1fr; gap:1.1rem; }
  @media(max-width:980px){ .bc-cols{ grid-template-columns:1fr;} }

  /* queue */
  .bc-queue { display:flex; flex-direction:column; gap:0.5rem; }
  .bc-q { display:grid; grid-template-columns:auto 1fr auto; gap:0.85rem; align-items:center; padding:0.65rem 0.8rem; border:1px solid #eef1f8; border-radius:13px; background:#fcfdff; }
  .bc-q-cd { width:54px; height:54px; border:2px solid; border-radius:14px; display:flex; flex-direction:column; align-items:center; justify-content:center; }
  .bc-q-cd b { font-size:1.15rem; font-family:ui-monospace,Menlo,monospace; line-height:1; }
  .bc-q-cd small { font-size:0.58rem; text-transform:uppercase; opacity:0.85; }
  .bc-q-name { font-weight:600; color:#0f172a; font-size:0.9rem; }
  .bc-q-code { color:#94a3b8; font-weight:400; }
  .bc-q-meta { font-size:0.74rem; color:#64748b; margin-top:0.12rem; }
  .bc-q-bar { height:4px; border-radius:3px; background:#eef2ف7; background:#eef2f7; margin-top:0.4rem; overflow:hidden; }
  .bc-q-bar span { display:block; height:100%; border-radius:3px; }
  .bc-q-right { text-align:right; }
  .bc-q-tpl { font-size:0.7rem; margin-top:0.3rem; }
  .bc-chip { display:inline-flex; align-items:center; gap:0.3rem; font-size:0.7rem; font-weight:700; padding:0.24rem 0.55rem; border-radius:999px; white-space:nowrap; }
  .bc-chip.hot { background:rgba(217,70,239,0.12); color:#a21caf; }

  /* feed */
  .bc-feed { display:flex; flex-direction:column; }
  .bc-fi { display:grid; grid-template-columns:auto 1fr auto; gap:0.75rem; align-items:center; padding:0.65rem 0; border-bottom:1px solid #eef1f8; }
  .bc-fi:last-child { border-bottom:0; }
  .bc-av { width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.72rem; font-weight:800; color:#fff; text-shadow:0 1px 2px rgba(0,0,0,0.2); }
  .bc-fi-name { font-weight:600; color:#0f172a; font-size:0.88rem; }
  .bc-fi-sub { font-size:0.74rem; color:#64748b; margin-top:0.1rem; }
  .bc-fi-right { text-align:right; }
  .bc-fi-t { font-size:0.68rem; color:#94a3b8; margin-top:0.25rem; }
  .bc-empty { text-align:center; padding:1.8rem 1rem; color:#94a3b8; font-size:0.86rem; }

  /* perf */
  .bc-perf-grid { display:grid; grid-template-columns:1fr 1fr; gap:0.7rem; }
  .bc-metric { background:#fcfdff; border:1px solid #eef1f8; border-radius:14px; padding:0.9rem 1rem; }
  .bc-metric.big { grid-column:1 / -1; }
  .bc-metric-l { font-size:0.74rem; color:#64748b; }
  .bc-metric-n { font-size:1.7rem; font-weight:800; color:#0f172a; font-family:ui-monospace,Menlo,monospace; margin-top:0.15rem; }
  .bc-metric-n.grad { background:linear-gradient(90deg,#059669,#06b6d4); -webkit-background-clip:text; background-clip:text; color:transparent; font-size:2.2rem; }
  .bc-bar { height:7px; border-radius:5px; background:#eef2f7; margin-top:0.5rem; overflow:hidden; }
  .bc-bar span { display:block; height:100%; border-radius:5px; background:linear-gradient(90deg,#10b981,#06b6d4); }

  /* config */
  .bc-cfg-list { display:flex; flex-direction:column; gap:0.6rem; }
  .bc-cfg { display:grid; grid-template-columns:210px 1fr auto; gap:1rem; align-items:center; padding:0.7rem 0.9rem; border:1px solid #eef1f8; border-radius:13px; background:#fcfdff; }
  @media(max-width:760px){ .bc-cfg{ grid-template-columns:1fr;} }
  .bc-cfg select { width:100%; padding:0.5rem 0.65rem; border-radius:10px; border:1px solid #dbe1ee; background:#fff; color:#0f172a; font-size:0.86rem; }
  .bc-switch { display:inline-flex; align-items:center; gap:0.5rem; cursor:pointer; font-size:0.78rem; font-weight:600; color:#475569; }
  .bc-switch input { display:none; }
  .bc-switch .tk { width:38px; height:22px; border-radius:999px; background:#cbd5e1; position:relative; transition:background .15s; }
  .bc-switch .tk::after { content:""; position:absolute; top:2px; left:2px; width:18px; height:18px; border-radius:50%; background:#fff; box-shadow:0 1px 2px rgba(0,0,0,0.15); transition:transform .15s; }
  .bc-switch input:checked + .tk { background:#10b981; }
  .bc-switch input:checked + .tk::after { transform:translateX(16px); }
`;

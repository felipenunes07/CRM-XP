import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Trophy, 
  Target, 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Save,
  Pencil,
  Trash2,
  Users,
  Briefcase
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { formatNumber, formatCurrency } from "../lib/format";
import type { MonthlyTarget } from "@olist-crm/shared";

export function MetasPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [isAdding, setIsAdding] = useState(false);
  const [editingTarget, setEditingTarget] = useState<MonthlyTarget | null>(null);
  
  // Form State
  const [newTarget, setNewTarget] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    attendant: 'TOTAL',
    targetScreenXp: "" as number | string,
    targetScreenVv: "" as number | string,
    targetScreenDe: "" as number | string,
    targetBatteries: "" as number | string,
    targetChargingDocks: "" as number | string,
    targetRevenue: "" as number | string
  });

  const { data: targets = [], isLoading: loadingTargets } = useQuery({
    queryKey: ["monthly-targets", selectedYear],
    queryFn: () => api.getMonthlyTargets(token!, selectedYear),
    enabled: !!token
  });

  const { data: targetActuals = [], isError: targetActualsError } = useQuery({
    queryKey: ["monthly-target-actuals", selectedYear],
    queryFn: () => api.getMonthlyTargetActuals(token!, selectedYear),
    enabled: !!token
  });

  const { data: attendantsData } = useQuery({
    queryKey: ["attendants"],
    queryFn: () => api.attendants(token!),
    enabled: !!token
  });

  const saveMutation = useMutation({
    mutationFn: (target: {
      year: number;
      month: number;
      attendant: string;
      targetAmount: number;
      targetBatteries: number;
      targetRevenue: number;
      targetScreenXp: number;
      targetScreenVv: number;
      targetScreenDe: number;
      targetChargingDocks: number;
    }) =>
      api.saveMonthlyTarget(
        token!,
        target.year,
        target.month,
        target.targetAmount,
        target.attendant,
        target.targetRevenue,
        target.targetBatteries,
        target.targetScreenXp,
        target.targetScreenVv,
        target.targetScreenDe,
        target.targetChargingDocks,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["monthly-targets"] });
      queryClient.invalidateQueries({ queryKey: ["monthly-target-actuals"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setIsAdding(false);
      setEditingTarget(null);
      setNewTarget(prev => ({
        ...prev,
        targetScreenXp: "",
        targetScreenVv: "",
        targetScreenDe: "",
        targetBatteries: "",
        targetChargingDocks: "",
        targetRevenue: "",
      }));
    },
    onError: (err) => {
      alert("Falha ao salvar meta. Verifique se os dados estão corretos: " + String(err));
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (target: { year: number; month: number; attendant: string }) =>
      api.deleteMonthlyTarget(token!, target.year, target.month, target.attendant),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["monthly-targets"] });
      queryClient.invalidateQueries({ queryKey: ["monthly-target-actuals"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err) => {
      alert("Falha ao excluir meta: " + String(err));
    }
  });

  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  const attendants = ["TOTAL", ...(attendantsData?.attendants.map(a => a.attendant) || [])];

  const globalTargets = targets.filter(t => t.attendant === 'TOTAL');
  const sellerTargets = targets.filter(t => t.attendant !== 'TOTAL');

  const closeTargetForm = () => {
    setIsAdding(false);
    setEditingTarget(null);
  };

  const startNewTarget = () => {
    if (isAdding) {
      closeTargetForm();
      return;
    }

    setEditingTarget(null);
    setNewTarget({
      month: new Date().getMonth() + 1,
      year: selectedYear,
      attendant: 'TOTAL',
      targetScreenXp: "",
      targetScreenVv: "",
      targetScreenDe: "",
      targetBatteries: "",
      targetChargingDocks: "",
      targetRevenue: "",
    });
    setIsAdding(true);
  };

  const startEditingTarget = (target: MonthlyTarget) => {
    setSelectedYear(target.year);
    setEditingTarget(target);
    setNewTarget({
      month: target.month,
      year: target.year,
      attendant: target.attendant,
      targetScreenXp: target.targetScreenXp,
      targetScreenVv: target.targetScreenVv,
      targetScreenDe: target.targetScreenDe,
      targetBatteries: target.targetBatteries,
      targetChargingDocks: target.targetChargingDocks,
      targetRevenue: target.targetRevenue,
    });
    setIsAdding(true);
    window.requestAnimationFrame(() => {
      document.getElementById("monthly-target-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const handleSave = () => {
    const screenXp = Number(newTarget.targetScreenXp) || 0;
    const screenVv = Number(newTarget.targetScreenVv) || 0;
    const screenDe = Number(newTarget.targetScreenDe) || 0;
    const batteries = Number(newTarget.targetBatteries) || 0;
    const chargingDocks = Number(newTarget.targetChargingDocks) || 0;
    const revenue = Number(newTarget.targetRevenue) || 0;
    const amount = screenXp + screenVv + screenDe;

    if (amount <= 0 && batteries <= 0 && chargingDocks <= 0 && revenue <= 0) {
      alert("Defina pelo menos uma meta: XP, VV, DE, baterias, docks de carga ou faturamento.");
      return;
    }

    if (newTarget.attendant !== 'TOTAL') {
      const global = globalTargets.find(t => t.month === newTarget.month && t.year === newTarget.year);
      
      if (!global) {
        alert("Por favor, defina a Meta Global (Empresa) para este mês antes de registrar metas individuais das vendedoras.");
        return;
      }

      const others = sellerTargets.filter(t => t.month === newTarget.month && t.year === newTarget.year && t.attendant !== newTarget.attendant);
      const allocatedAmount = others.reduce((acc, t) => acc + t.targetAmount, 0);
      const allocatedBatteries = others.reduce((acc, t) => acc + Number(t.targetBatteries || 0), 0);
      const allocatedXp = others.reduce((acc, t) => acc + Number(t.targetScreenXp || 0), 0);
      const allocatedVv = others.reduce((acc, t) => acc + Number(t.targetScreenVv || 0), 0);
      const allocatedDe = others.reduce((acc, t) => acc + Number(t.targetScreenDe || 0), 0);
      const allocatedDocks = others.reduce((acc, t) => acc + Number(t.targetChargingDocks || 0), 0);
      const allocatedRevenue = others.reduce((acc, t) => acc + Number(t.targetRevenue || 0), 0);
      const globalRevenue = Number(global.targetRevenue || 0);

      if (amount + allocatedAmount > global.targetAmount) {
        alert(`A soma de telas das vendedoras (${amount + allocatedAmount}) ultrapassa a Meta Global da Empresa (${global.targetAmount}). Restam ${global.targetAmount - allocatedAmount} telas para distribuir.`);
        return;
      }

      if (batteries + allocatedBatteries > global.targetBatteries) {
        alert(`A soma de baterias das vendedoras (${batteries + allocatedBatteries}) ultrapassa a Meta Global da Empresa (${global.targetBatteries}). Restam ${global.targetBatteries - allocatedBatteries} baterias para distribuir.`);
        return;
      }

      const factoryLimits = [
        { label: "XP", value: screenXp, allocated: allocatedXp, global: global.targetScreenXp },
        { label: "VV", value: screenVv, allocated: allocatedVv, global: global.targetScreenVv },
        { label: "DE", value: screenDe, allocated: allocatedDe, global: global.targetScreenDe },
        { label: "docks de carga", value: chargingDocks, allocated: allocatedDocks, global: global.targetChargingDocks },
      ];
      const exceeded = factoryLimits.find((item) => item.value + item.allocated > item.global);
      if (exceeded) {
        alert(`A soma de ${exceeded.label} das vendedoras (${exceeded.value + exceeded.allocated}) ultrapassa a meta global (${exceeded.global}). Restam ${Math.max(0, exceeded.global - exceeded.allocated)} para distribuir.`);
        return;
      }

      if (globalRevenue > 0 && revenue + allocatedRevenue > globalRevenue) {
        alert(`A soma de faturamento das vendedoras (${formatCurrency(revenue + allocatedRevenue)}) ultrapassa a Meta Global da Empresa (${formatCurrency(globalRevenue)}). Restam ${formatCurrency(globalRevenue - allocatedRevenue)} para distribuir.`);
        return;
      }
    }

    saveMutation.mutate({
      year: newTarget.year,
      month: newTarget.month,
      attendant: newTarget.attendant,
      targetAmount: amount,
      targetBatteries: batteries,
      targetRevenue: revenue,
      targetScreenXp: screenXp,
      targetScreenVv: screenVv,
      targetScreenDe: screenDe,
      targetChargingDocks: chargingDocks,
    });
  };

  const getActualsFor = (year: number, month: number, attendant: string) => {
    if (attendant === 'TOTAL') {
      const point = targetActuals.find(p => p.year === year && p.month === month && p.attendant === 'TOTAL');
      return {
        amount: point?.screenItems ?? 0,
        screenXp: point?.screenXpItems ?? 0,
        screenVv: point?.screenVvItems ?? 0,
        screenDe: point?.screenDeItems ?? 0,
        batteries: point?.batteryItems ?? 0,
        chargingDocks: point?.chargingDockItems ?? 0,
        revenue: point?.totalRevenue || 0
      };
    } else {
      const seller = attendantsData?.attendants.find(a => a.attendant === attendant);
      const point = seller?.monthlyTrend.find(p => {
        const [pYear, pMonth] = p.month.split('-').map(Number);
        return pYear === year && pMonth === month;
      });
      return {
        amount: point?.screenPieces || 0,
        screenXp: point?.screenXpPieces || 0,
        screenVv: point?.screenVvPieces || 0,
        screenDe: point?.screenDePieces || 0,
        batteries: point?.batteryPieces || 0,
        chargingDocks: point?.chargingDockPieces || 0,
        revenue: point?.revenue || 0
      };
    }
  };

  const renderTargetRow = (target: MonthlyTarget) => {
    const actuals = getActualsFor(target.year, target.month, target.attendant);
    const metricCell = (goal: number, actual: number, color: string) => {
      const progress = goal > 0 ? Math.round((actual / goal) * 100) : 0;
      return (
        <div style={{ minWidth: 92 }}>
          <strong>{formatNumber(goal)}</strong>
          <small className="muted" style={{ display: "block", marginTop: 2 }}>
            {formatNumber(actual)} realizado
          </small>
          {goal > 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
              <div className="progress-bar-small" style={{ width: 54, height: 5, background: "rgba(0,0,0,0.06)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${Math.min(100, progress)}%`, height: "100%", background: progress >= 100 ? "#10b981" : color }} />
              </div>
              <small>{progress}%</small>
            </div>
          ) : null}
        </div>
      );
    };
    const revenueProgress = target.targetRevenue > 0 ? Math.round((actuals.revenue / target.targetRevenue) * 100) : 0;
    
    return (
      <tr key={`${target.year}-${target.month}-${target.attendant}`}>
        <td>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Calendar size={14} className="muted" />
            <strong>{monthNames[target.month - 1]}</strong>
          </div>
        </td>
        <td>
          <span className={`badge ${target.attendant === 'TOTAL' ? 'primary' : 'neutral'}`}>
            {target.attendant === 'TOTAL' ? 'EMPRESA' : target.attendant}
          </span>
        </td>
        <td>{metricCell(target.targetAmount, actuals.amount, "#3b82f6")}</td>
        <td>{metricCell(target.targetScreenXp, actuals.screenXp, "#2956d7")}</td>
        <td>{metricCell(target.targetScreenVv, actuals.screenVv, "#7c3aed")}</td>
        <td>{metricCell(target.targetScreenDe, actuals.screenDe, "#0891b2")}</td>
        <td>{metricCell(target.targetBatteries, actuals.batteries, "#f59e0b")}</td>
        <td>{metricCell(target.targetChargingDocks, actuals.chargingDocks, "#64748b")}</td>
        <td style={{ color: revenueProgress >= 100 ? 'var(--success)' : 'inherit' }}>
          <strong>{formatCurrency(target.targetRevenue)}</strong>
          <small className="muted" style={{ display: "block", marginTop: 2 }}>{formatCurrency(actuals.revenue)} realizado</small>
          {target.targetRevenue > 0 ? <small style={{ display: "block", marginTop: 4 }}>{revenueProgress}%</small> : null}
        </td>
        <td>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              className="admin-icon-button"
              style={{ color: "#2956d7", borderColor: "rgba(41, 86, 215, 0.2)", background: "rgba(41, 86, 215, 0.05)" }}
              title="Editar meta"
              aria-label={`Editar meta de ${target.attendant === 'TOTAL' ? 'empresa' : target.attendant} para ${monthNames[target.month - 1]} de ${target.year}`}
              onClick={() => startEditingTarget(target)}
            >
              <Pencil size={16} />
            </button>
            <button
              type="button"
              className="premium-button-danger-icon"
              title="Remover Meta"
              onClick={() => {
                if (window.confirm("Remover esta meta?")) {
                  deleteMutation.mutate({
                    year: target.year,
                    month: target.month,
                    attendant: target.attendant
                  });
                }
              }}
            >
              <Trash2 size={18} />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  const tableHeader = (
    <thead>
      <tr>
        <th>Mês / Ano</th>
        <th>Vendedora</th>
        <th>Telas total</th>
        <th>XP</th>
        <th>VV</th>
        <th>DE</th>
        <th>Baterias</th>
        <th>Dock de carga</th>
        <th>Faturamento</th>
        <th>Ações</th>
      </tr>
    </thead>
  );

  return (
    <div className="page-stack">
      <section className="dashboard-hero-premium">
        <div className="hero-premium-bg">
          <div className="hero-premium-gradient"></div>
        </div>
        <div className="hero-premium-content">
          <div className="hero-premium-copy">
            <div className="premium-badge">Gestão Comercial</div>
            <h2 className="premium-title">Planejamento de Metas</h2>
            <p className="premium-subtitle">Defina objetivos mensais para o time e acompanhe o desempenho histórico com detalhamento por vendedora.</p>
            <div className="premium-actions" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <button 
                className="premium-button primary" 
                onClick={startNewTarget}
              >
                <Plus size={18} />
                {isAdding ? (editingTarget ? "Cancelar edição" : "Cancelar") : "Nova Meta"}
              </button>
              <div 
                className="year-selector" 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.5rem', 
                  background: '#fff', 
                  border: '1px solid rgba(0,0,0,0.1)', 
                  padding: '0.25rem 0.5rem', 
                  borderRadius: '8px', 
                  color: 'var(--text-color, #1e293b)', 
                  boxShadow: '0 2px 4px rgba(0,0,0,0.05)' 
                }}
              >
                <button onClick={() => setSelectedYear(y => y - 1)} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex', padding: '0.25rem' }}><ChevronLeft size={18} /></button>
                <strong style={{ minWidth: '60px', textAlign: 'center', fontSize: '1.1rem' }}>{selectedYear}</strong>
                <button onClick={() => setSelectedYear(y => y + 1)} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex', padding: '0.25rem' }}><ChevronRight size={18} /></button>
              </div>
            </div>
          </div>
          
          <div className="hero-premium-stats">
            <div className="premium-stat-card">
              <div className="premium-stat-icon accent-success">
                <Trophy size={20} />
              </div>
              <div className="premium-stat-info">
                <span>Metas Globais Definidas</span>
                <strong>{globalTargets.length} meses</strong>
              </div>
            </div>
            <div className="premium-stat-card">
              <div className="premium-stat-icon accent-primary">
                <Target size={20} />
              </div>
              <div className="premium-stat-info">
                <span>Metas de Vendedoras</span>
                <strong>{sellerTargets.length} definidos</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      {isAdding && (
        <section id="monthly-target-form" className="panel animate-in">
          <div className="panel-header">
            <div>
              <h3>{editingTarget ? "Editar Meta" : "Registrar Nova Meta"}</h3>
              {editingTarget ? (
                <p className="muted" style={{ margin: "0.35rem 0 0" }}>
                  Alterando {editingTarget.attendant === 'TOTAL' ? "a meta da empresa" : `a meta de ${editingTarget.attendant}`} para {monthNames[editingTarget.month - 1]} de {editingTarget.year}.
                </p>
              ) : null}
            </div>
          </div>
          
          <div style={{ marginBottom: '2rem' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '1rem', fontSize: '1.1rem' }}>Que tipo de meta deseja cadastrar?</label>
            <div className="grid-responsive" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              <div 
                onClick={() => {
                  if (!editingTarget) setNewTarget({ ...newTarget, attendant: 'TOTAL' });
                }}
                aria-disabled={Boolean(editingTarget)}
                style={{ 
                  border: `2px solid ${newTarget.attendant === 'TOTAL' ? 'var(--primary)' : 'rgba(0,0,0,0.1)'}`, 
                  borderRadius: '12px', 
                  padding: '1.25rem', 
                  cursor: editingTarget ? 'not-allowed' : 'pointer',
                  opacity: editingTarget ? 0.72 : 1,
                  background: newTarget.attendant === 'TOTAL' ? 'rgba(59, 130, 246, 0.05)' : '#fff',
                  transition: 'all 0.2s ease-in-out'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <input type="radio" checked={newTarget.attendant === 'TOTAL'} readOnly style={{ margin: 0, width: '1.2rem', height: '1.2rem', accentColor: 'var(--primary)' }} />
                  <strong style={{ fontSize: '1.1rem', color: newTarget.attendant === 'TOTAL' ? 'var(--primary)' : 'inherit' }}>Meta da Empresa</strong>
                </div>
                <p className="muted" style={{ margin: 0, paddingLeft: '2rem', fontSize: '0.9rem', lineHeight: 1.4 }}>
                  Define o objetivo global consolidado de vendas para o mês.
                </p>
              </div>

              <div 
                onClick={() => {
                   if (editingTarget) return;
                   const firstSeller = attendants.find(a => a !== 'TOTAL') || 'TOTAL';
                   setNewTarget({ ...newTarget, attendant: firstSeller });
                }}
                aria-disabled={Boolean(editingTarget)}
                style={{ 
                  border: `2px solid ${newTarget.attendant !== 'TOTAL' ? 'var(--primary)' : 'rgba(0,0,0,0.1)'}`, 
                  borderRadius: '12px', 
                  padding: '1.25rem', 
                  cursor: editingTarget ? 'not-allowed' : 'pointer',
                  opacity: editingTarget ? 0.72 : 1,
                  background: newTarget.attendant !== 'TOTAL' ? 'rgba(59, 130, 246, 0.05)' : '#fff',
                  transition: 'all 0.2s ease-in-out'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <input type="radio" checked={newTarget.attendant !== 'TOTAL'} readOnly style={{ margin: 0, width: '1.2rem', height: '1.2rem', accentColor: 'var(--primary)' }} />
                  <strong style={{ fontSize: '1.1rem', color: newTarget.attendant !== 'TOTAL' ? 'var(--primary)' : 'inherit' }}>Meta Individual (Vendedora)</strong>
                </div>
                <p className="muted" style={{ margin: 0, paddingLeft: '2rem', fontSize: '0.9rem', lineHeight: 1.4 }}>
                  Define uma cota específica e individual para uma vendedora do time.
                </p>
              </div>
            </div>
          </div>

          <div style={{ height: '1px', background: 'var(--border-color)', margin: '0 0 2rem 0' }} />

          <div className="grid-responsive" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
            <div className="form-group">
              <label>Mês de Referência</label>
              <select 
                value={newTarget.month} 
                onChange={e => setNewTarget({...newTarget, month: parseInt(e.target.value)})}
                className="form-input"
                disabled={Boolean(editingTarget)}
              >
                {monthNames.map((name, i) => <option key={i} value={i+1}>{name}</option>)}
              </select>
            </div>
            
            <div className="form-group">
              <label>Ano de Referência</label>
              <input 
                type="number" 
                value={newTarget.year} 
                onChange={e => setNewTarget({...newTarget, year: parseInt(e.target.value)})}
                className="form-input"
                disabled={Boolean(editingTarget)}
              />
            </div>

            {newTarget.attendant !== 'TOTAL' && (
              <div className="form-group">
                <label>Selecione a Vendedora</label>
                <select 
                  value={newTarget.attendant} 
                  onChange={e => setNewTarget({...newTarget, attendant: e.target.value})}
                  className="form-input"
                  style={{ borderColor: 'var(--primary)' }}
                  disabled={Boolean(editingTarget)}
                >
                  {attendants.filter(a => a !== 'TOTAL').map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            )}
            
            {newTarget.attendant === 'TOTAL' && (
              <div className="form-group">
                <label>Visão</label>
                <input className="form-input" value="Todas as Vendedoras (Global)" disabled style={{ opacity: 0.6, background: 'rgba(0,0,0,0.02)' }} />
              </div>
            )}

            <div className="form-group">
              <label>Meta de Telas XP (un)</label>
              <input
                type="number"
                min="0"
                value={newTarget.targetScreenXp}
                onChange={e => setNewTarget({...newTarget, targetScreenXp: e.target.value})}
                className="form-input"
                placeholder="Ex: 300"
              />
            </div>

            <div className="form-group">
              <label>Meta de Telas VV (un)</label>
              <input
                type="number"
                min="0"
                value={newTarget.targetScreenVv}
                onChange={e => setNewTarget({...newTarget, targetScreenVv: e.target.value})}
                className="form-input"
                placeholder="Ex: 120"
              />
            </div>

            <div className="form-group">
              <label>Meta de Telas DE (un)</label>
              <input
                type="number"
                min="0"
                value={newTarget.targetScreenDe}
                onChange={e => setNewTarget({...newTarget, targetScreenDe: e.target.value})}
                className="form-input"
                placeholder="Ex: 80"
              />
            </div>

            <div className="form-group">
              <label>Meta de Baterias (un)</label>
              <input
                type="number"
                min="0"
                value={newTarget.targetBatteries}
                onChange={e => setNewTarget({...newTarget, targetBatteries: e.target.value})}
                className="form-input"
                placeholder="Ex: 100"
              />
            </div>

            <div className="form-group">
              <label>Meta de Docks de Carga (un)</label>
              <input
                type="number"
                min="0"
                value={newTarget.targetChargingDocks}
                onChange={e => setNewTarget({...newTarget, targetChargingDocks: e.target.value})}
                className="form-input"
                placeholder="Ex: 60"
              />
            </div>

            <div className="form-group">
              <label>Meta de Faturamento (R$)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={newTarget.targetRevenue}
                onChange={e => setNewTarget({...newTarget, targetRevenue: e.target.value})}
                className="form-input"
                placeholder="Ex: 250000"
              />
            </div>
          </div>
          <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
            <button className="premium-button ghost" onClick={closeTargetForm}>
              Cancelar
            </button>
            <button className="premium-button primary" onClick={handleSave} disabled={saveMutation.isPending}>
              <Save size={18} />
              {saveMutation.isPending ? "Salvando..." : editingTarget ? "Atualizar Meta" : "Salvar Meta"}
            </button>
          </div>
        </section>
      )}

      {targetActualsError ? (
        <section className="panel" style={{ borderColor: "rgba(217, 83, 79, 0.35)", color: "var(--danger)" }}>
          Não foi possível carregar os valores realizados. As metas continuam preservadas; tente atualizar a página em alguns instantes.
        </section>
      ) : null}

      <div style={{ display: 'grid', gap: '2rem', marginTop: '2rem' }}>
        <section className="panel">
          <div className="panel-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Briefcase className="muted" size={20} />
              <div>
                <h3>Metas da Empresa (Globais)</h3>
                <p className="muted">Análise de desempenho total da empresa consolidada ao longo de {selectedYear}</p>
              </div>
            </div>
          </div>

          <div className="table-scroll">
            <table className="data-table">
              {tableHeader}
              <tbody>
                {loadingTargets ? (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: '2rem' }}>Carregando metas globais...</td></tr>
                ) : globalTargets.length === 0 ? (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: '2rem' }}>Nenhuma meta global registrada para a empresa em {selectedYear}.</td></tr>
                ) : (
                  globalTargets.map(renderTargetRow)
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Users className="muted" size={20} />
              <div>
                <h3>Metas por Vendedora</h3>
                <p className="muted">Análise de desempenho individual da equipe comercial em {selectedYear}</p>
              </div>
            </div>
          </div>

          <div className="table-scroll">
            <table className="data-table">
              {tableHeader}
              <tbody>
                {loadingTargets ? (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: '2rem' }}>Carregando metas das vendedoras...</td></tr>
                ) : sellerTargets.length === 0 ? (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: '2rem' }}>Nenhuma meta individual registrada para a equipe em {selectedYear}.</td></tr>
                ) : (
                  sellerTargets.map(renderTargetRow)
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

    </div>
  );
}

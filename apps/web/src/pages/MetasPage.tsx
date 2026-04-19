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
  
  // Form State
  const [newTarget, setNewTarget] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    attendant: 'TOTAL',
    targetAmount: "" as number | string,
    targetRevenue: "" as number | string
  });

  const { data: targets = [], isLoading: loadingTargets } = useQuery({
    queryKey: ["monthly-targets", selectedYear],
    queryFn: () => api.getMonthlyTargets(token!, selectedYear),
    enabled: !!token
  });

  const { data: dashboardData } = useQuery({
    queryKey: ["dashboard", 730],
    queryFn: () => api.dashboard(token!, 730),
    enabled: !!token
  });

  const { data: attendantsData } = useQuery({
    queryKey: ["attendants"],
    queryFn: () => api.attendants(token!),
    enabled: !!token
  });

  const saveMutation = useMutation({
    mutationFn: (target: { year: number; month: number; attendant: string; targetAmount: number; targetRevenue: number }) => 
      api.saveMonthlyTarget(token!, target.year, target.month, target.targetAmount, target.attendant, target.targetRevenue),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["monthly-targets"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setIsAdding(false);
      setNewTarget(prev => ({ ...prev, targetAmount: "", targetRevenue: "" }));
    },
    onError: (err) => {
      alert("Falha ao salvar meta. Verifique se os dados estão corretos: " + String(err));
    }
  });

  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  const attendants = ["TOTAL", ...(attendantsData?.attendants.map(a => a.attendant) || [])];

  const globalTargets = targets.filter(t => t.attendant === 'TOTAL');
  const sellerTargets = targets.filter(t => t.attendant !== 'TOTAL');

  const handleSave = () => {
    const amount = Number(newTarget.targetAmount) || 0;
    const revenue = Number(newTarget.targetRevenue) || 0;

    if (amount <= 0 && revenue <= 0) {
      alert("Defina pelo menos um valor de meta (telas ou faturamento).");
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
      const allocatedRevenue = others.reduce((acc, t) => acc + Number(t.targetRevenue || 0), 0);
      const globalRevenue = Number(global.targetRevenue || 0);

      if (amount + allocatedAmount > global.targetAmount) {
        alert(`A soma de telas das vendedoras (${amount + allocatedAmount}) ultrapassa a Meta Global da Empresa (${global.targetAmount}). Restam ${global.targetAmount - allocatedAmount} telas para distribuir.`);
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
      targetRevenue: revenue
    });
  };

  const getActualsFor = (year: number, month: number, attendant: string) => {
    if (attendant === 'TOTAL') {
      const point = dashboardData?.itemsSoldTrend.find(p => p.year === year && p.month === month);
      return {
        amount: point?.totalItems || 0,
        revenue: point?.totalRevenue || 0
      };
    } else {
      const seller = attendantsData?.attendants.find(a => a.attendant === attendant);
      const point = seller?.monthlyTrend.find(p => {
        const [pYear, pMonth] = p.month.split('-').map(Number);
        return pYear === year && pMonth === month;
      });
      return {
        amount: point?.pieces || 0,
        revenue: point?.revenue || 0
      };
    }
  };

  const renderTargetRow = (target: MonthlyTarget) => {
    const actuals = getActualsFor(target.year, target.month, target.attendant);
    const progress = target.targetAmount > 0 ? Math.round((actuals.amount / target.targetAmount) * 100) : 0;
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
        <td>{formatNumber(target.targetAmount)}</td>
        <td style={{ color: progress >= 100 ? 'var(--success)' : 'inherit', fontWeight: progress >= 100 ? 600 : 400 }}>
          {formatNumber(actuals.amount)}
        </td>
        <td>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div className="progress-bar-small" style={{ width: '60px', height: '6px', background: 'rgba(0,0,0,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, progress)}%`, height: '100%', background: progress >= 100 ? '#10b981' : '#3b82f6' }}></div>
            </div>
            <small>{progress}%</small>
          </div>
        </td>
        <td style={{ color: revenueProgress >= 100 ? 'var(--success)' : 'inherit', fontWeight: revenueProgress >= 100 ? 600 : 400 }}>
          {formatCurrency(actuals.revenue)}
        </td>
        <td>
          <button 
            className="ghost-btn icon-only danger"
            title="Remover Meta"
            onClick={() => {
              if (window.confirm("Remover esta meta?")) {
                saveMutation.mutate({
                  year: target.year,
                  month: target.month,
                  attendant: target.attendant,
                  targetAmount: 0,
                  targetRevenue: 0
                });
              }
            }}
          >
            <Trash2 size={16} />
          </button>
        </td>
      </tr>
    );
  };

  const tableHeader = (
    <thead>
      <tr>
        <th>Mês / Ano</th>
        <th>Vendedora</th>
        <th>Meta Telas (un)</th>
        <th>Realizado Telas</th>
        <th>Progresso</th>
        <th>Faturamento (Realizado)</th>
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
                onClick={() => setIsAdding(!isAdding)}
              >
                <Plus size={18} />
                {isAdding ? "Cancelar" : "Nova Meta"}
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
        <section className="panel animate-in">
          <div className="panel-header">
            <h3>Registrar Nova Meta</h3>
          </div>
          
          <div style={{ marginBottom: '2rem' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '1rem', fontSize: '1.1rem' }}>Que tipo de meta deseja cadastrar?</label>
            <div className="grid-responsive" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              <div 
                onClick={() => setNewTarget({ ...newTarget, attendant: 'TOTAL' })}
                style={{ 
                  border: `2px solid ${newTarget.attendant === 'TOTAL' ? 'var(--primary)' : 'rgba(0,0,0,0.1)'}`, 
                  borderRadius: '12px', 
                  padding: '1.25rem', 
                  cursor: 'pointer',
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
                   const firstSeller = attendants.find(a => a !== 'TOTAL') || 'TOTAL';
                   setNewTarget({ ...newTarget, attendant: firstSeller });
                }}
                style={{ 
                  border: `2px solid ${newTarget.attendant !== 'TOTAL' ? 'var(--primary)' : 'rgba(0,0,0,0.1)'}`, 
                  borderRadius: '12px', 
                  padding: '1.25rem', 
                  cursor: 'pointer',
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
              <label>Meta de Telas (un)</label>
              <input 
                type="number" 
                value={newTarget.targetAmount} 
                onChange={e => setNewTarget({...newTarget, targetAmount: e.target.value})}
                className="form-input"
                placeholder="Ex: 500"
              />
            </div>
          </div>
          <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
            <button className="premium-button ghost" onClick={() => setIsAdding(false)}>
              Cancelar
            </button>
            <button className="premium-button primary" onClick={handleSave} disabled={saveMutation.isPending}>
              <Save size={18} />
              {saveMutation.isPending ? "Salvando..." : "Salvar Meta"}
            </button>
          </div>
        </section>
      )}

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
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>Carregando metas globais...</td></tr>
                ) : globalTargets.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>Nenhuma meta global registrada para a empresa em {selectedYear}.</td></tr>
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
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>Carregando metas das vendedoras...</td></tr>
                ) : sellerTargets.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>Nenhuma meta individual registrada para a equipe em {selectedYear}.</td></tr>
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

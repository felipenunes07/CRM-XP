import { useState, useEffect } from "react";
import { 
  Sparkles, 
  Wrench, 
  ShieldAlert, 
  Calendar, 
  Clock, 
  RefreshCw, 
  PartyPopper, 
  ThumbsUp, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  MessageSquare,
  Send,
  Check,
  RotateCcw
} from "lucide-react";
import { useUiLanguage } from "../i18n";

// ── Types ──
interface ChangeItem {
  type: "feature" | "improvement" | "bugfix";
  title: string;
  description: string;
}

interface ChangelogEntry {
  date: string;
  version: string;
  title: string;
  changes: ChangeItem[];
}

interface Suggestion {
  id: string;
  type: "feature" | "improvement" | "bugfix";
  title: string;
  description: string;
  urgency: "low" | "medium" | "high";
  status: "pending" | "completed";
  votes: number;
  votedBy: string[]; // Store mock user IDs or simple flag
  createdAt: string;
}

// ── Seeded Commit-based Changelog ──
const changelogData: ChangelogEntry[] = [
  {
    date: "2026-05-20",
    version: "1.1.0",
    title: "Central de Changelog & Otimizações no WhatsApp",
    changes: [
      {
        type: "feature",
        title: "Changelog do Sistema",
        description: "Lançamento da central de Changelog integrada ao menu 'Mais' para permitir que toda a equipe acompanhe as novas funcionalidades, melhorias e correções feitas no CRM XP em tempo real."
      },
      {
        type: "improvement",
        title: "Visualização Limpa da Atividade do WhatsApp",
        description: "Reestruturação da aba de Conversas nos Relatórios do WhatsApp. A tabela lateral de lista de conversas foi removida para foco exclusivo nos gráficos estatísticos, que agora ocupam 100% da largura útil da tela em um grid elegante de 2 colunas."
      }
    ]
  },
  {
    date: "2026-05-18",
    version: "1.0.8",
    title: "Relatório de Métricas do WhatsApp",
    changes: [
      {
        type: "feature",
        title: "Página WhatsappActivityPage",
        description: "Implementação do painel avançado para visualizar e reportar métricas detalhadas de conversas, fluxos e interações ativas do WhatsApp."
      },
      {
        type: "improvement",
        title: "Estrutura do Cliente da API do CRM",
        description: "Otimização das conexões internas de rede e do módulo de API cliente no frontend para consultas mais eficientes ao backend."
      }
    ]
  },
  {
    date: "2026-05-12",
    version: "1.0.4",
    title: "Dashboard de Vendas Geográficas & Segurança",
    changes: [
      {
        type: "feature",
        title: "Dashboard Geográfico Interativo",
        description: "Lançamento do mapa de vendas com estatísticas regionais, facilitando a identificação da distribuição física dos contatos e clientes."
      },
      {
        type: "improvement",
        title: "Migração para Variáveis de Ambiente",
        description: "Correção de segurança crucial removendo credenciais estáticas de banco de dados e padronizando a autenticação via variáveis de ambiente (.env)."
      }
    ]
  }
];

// ── Initial Seed Suggestions ──
const initialSuggestions: Suggestion[] = [
  {
    id: "sug-1",
    type: "feature",
    title: "Integração Bidirecional com Google Calendar",
    description: "Sincronizar tarefas e lembretes criados na Agenda do CRM XP diretamente com a conta Google do atendente.",
    urgency: "medium",
    status: "pending",
    votes: 8,
    votedBy: [],
    createdAt: "2026-05-19"
  },
  {
    id: "sug-2",
    type: "bugfix",
    title: "Delay nas notificações sonoras do chat",
    description: "Ocasionalmente o som de nova mensagem recebida toca com 5 a 10 segundos de atraso no navegador Chrome.",
    urgency: "high",
    status: "pending",
    votes: 12,
    votedBy: [],
    createdAt: "2026-05-20"
  },
  {
    id: "sug-3",
    type: "improvement",
    title: "Filtro de tags múltiplas no Kanban",
    description: "Permitir selecionar mais de um rótulo simultaneamente para filtrar os cards no Pipeline.",
    urgency: "low",
    status: "completed",
    votes: 5,
    votedBy: [],
    createdAt: "2026-05-15"
  }
];

function formatDate(dateStr: string) {
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const year = parts[0];
  const monthStr = parts[1];
  const day = parts[2];
  if (!year || !monthStr || !day) return dateStr;
  
  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  const month = monthNames[parseInt(monthStr, 10) - 1] || monthStr;
  return `${day} de ${month} de ${year}`;
}

export function NovidadesPage() {
  const { tx } = useUiLanguage();
  
  // Tabs State: "changelog" | "suggestions"
  const [activeTab, setActiveTab] = useState<"changelog" | "suggestions">("changelog");
  
  // Changelog Filtering
  const [changelogFilter, setChangelogFilter] = useState<"all" | "feature" | "improvement" | "bugfix">("all");
  
  // Suggestions State
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  
  // Form State
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newType, setNewType] = useState<"feature" | "improvement" | "bugfix">("feature");
  const [newUrgency, setNewUrgency] = useState<"low" | "medium" | "high">("medium");
  const [showForm, setShowForm] = useState(false);
  const [suggestionFilter, setSuggestionFilter] = useState<"all" | "pending" | "completed">("all");

  // Load Suggestions
  useEffect(() => {
    const cached = localStorage.getItem("crm_xp_changelog_suggestions");
    if (cached) {
      try {
        setSuggestions(JSON.parse(cached));
      } catch (e) {
        setSuggestions(initialSuggestions);
      }
    } else {
      setSuggestions(initialSuggestions);
      localStorage.setItem("crm_xp_changelog_suggestions", JSON.stringify(initialSuggestions));
    }
  }, []);

  // Save Suggestions helper
  const saveSuggestions = (updated: Suggestion[]) => {
    setSuggestions(updated);
    localStorage.setItem("crm_xp_changelog_suggestions", JSON.stringify(updated));
  };

  // Handle Add Suggestion
  const handleAddSuggestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDescription.trim()) return;

    const newItem: Suggestion = {
      id: `sug-${Date.now()}`,
      type: newType,
      title: newTitle.trim(),
      description: newDescription.trim(),
      urgency: newUrgency,
      status: "pending",
      votes: 1,
      votedBy: ["me"], // Automatically voted by creator
      createdAt: new Date().toISOString().split("T")[0] || "2026-05-20"
    };

    const nextSuggestions = [newItem, ...suggestions];
    saveSuggestions(nextSuggestions);
    
    // Clear form
    setNewTitle("");
    setNewDescription("");
    setNewType("feature");
    setNewUrgency("medium");
    setShowForm(false);
  };

  // Upvote
  const handleUpvote = (id: string) => {
    const next = suggestions.map(item => {
      if (item.id === id) {
        const hasVoted = item.votedBy.includes("me");
        return {
          ...item,
          votes: hasVoted ? item.votes - 1 : item.votes + 1,
          votedBy: hasVoted 
            ? item.votedBy.filter(u => u !== "me") 
            : [...item.votedBy, "me"]
        };
      }
      return item;
    });
    saveSuggestions(next);
  };

  // Toggle Status (Felipe/Admin marks completed)
  const handleToggleStatus = (id: string) => {
    const next = suggestions.map(item => {
      if (item.id === id) {
        return {
          ...item,
          status: item.status === "completed" ? "pending" as const : "completed" as const
        };
      }
      return item;
    });
    saveSuggestions(next);
  };

  // Delete Suggestion
  const handleDeleteSuggestion = (id: string) => {
    if (window.confirm(tx("Deseja realmente remover esta sugestão?", "确认要删除此建议吗？"))) {
      const next = suggestions.filter(item => item.id !== id);
      saveSuggestions(next);
    }
  };

  // Filtered Changelog
  const filteredChangelog = changelogData
    .map(entry => {
      const changes = entry.changes.filter(c => changelogFilter === "all" || c.type === changelogFilter);
      return { ...entry, changes };
    })
    .filter(entry => entry.changes.length > 0);

  // Filtered & Sorted Suggestions
  const filteredSuggestions = suggestions
    .filter(item => {
      if (suggestionFilter === "all") return true;
      return item.status === suggestionFilter;
    })
    .sort((a, b) => b.votes - a.votes); // Most voted first

  return (
    <div className="changelog-page">
      {/* ── Page Header ── */}
      <header className="changelog-header">
        <div className="changelog-header-left">
          <div className="changelog-eyebrow">
            <PartyPopper size={14} />
            <span>CENTRAL DO SISTEMA</span>
          </div>
          <h1>{tx("Changelog & Sugestões", "更新日志与功能建议")}</h1>
          <p>{tx("Acompanhe o que foi lançado e ajude a decidir o que deve ser priorizado no CRM XP", "追踪已发布功能并共同决定 CRM XP 的未来开发优先级")}</p>
        </div>
        <div className="changelog-badge">
          <Clock size={16} />
          <span>Versão Atual: v1.1.0</span>
        </div>
      </header>

      {/* ── Tab Switcher ── */}
      <div className="changelog-tab-switcher">
        <button
          type="button"
          className={`tab-btn ${activeTab === "changelog" ? "active" : ""}`}
          onClick={() => setActiveTab("changelog")}
        >
          <Clock size={16} />
          <span>{tx("Histórico de Atualizações", "系统更新日志")}</span>
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === "suggestions" ? "active" : ""}`}
          onClick={() => setActiveTab("suggestions")}
        >
          <MessageSquare size={16} />
          <span>{tx("Sugestões & Roadmap", "建议反馈与路线图")}</span>
          {suggestions.filter(s => s.status === "pending").length > 0 && (
            <span className="pending-badge">
              {suggestions.filter(s => s.status === "pending").length}
            </span>
          )}
        </button>
      </div>

      {/* ── TAB 1: CHANGELOG TIMELINE ── */}
      {activeTab === "changelog" && (
        <>
          {/* Filters */}
          <div className="changelog-filters">
            <button
              type="button"
              className={changelogFilter === "all" ? "active" : ""}
              onClick={() => setChangelogFilter("all")}
            >
              {tx("Todas", "全部")}
            </button>
            <button
              type="button"
              className={changelogFilter === "feature" ? "active feature" : ""}
              onClick={() => setChangelogFilter("feature")}
            >
              <Sparkles size={14} />
              {tx("Features", "新功能")}
            </button>
            <button
              type="button"
              className={changelogFilter === "improvement" ? "active improvement" : ""}
              onClick={() => setChangelogFilter("improvement")}
            >
              <Wrench size={14} />
              {tx("Melhorias", "功能改进")}
            </button>
            <button
              type="button"
              className={changelogFilter === "bugfix" ? "active bugfix" : ""}
              onClick={() => setChangelogFilter("bugfix")}
            >
              <ShieldAlert size={14} />
              {tx("Correções", "问题修复")}
            </button>
          </div>

          {/* Timeline Container */}
          <div className="changelog-timeline-container">
            {filteredChangelog.length > 0 ? (
              <div className="changelog-timeline">
                {filteredChangelog.map((entry) => (
                  <div key={entry.date} className="changelog-timeline-item">
                    <div className="changelog-timeline-marker"></div>
                    
                    {/* Left Column (Date & Version) */}
                    <div className="changelog-timeline-date">
                      <div className="changelog-date-badge">
                        <Calendar size={14} />
                        <span>{formatDate(entry.date)}</span>
                      </div>
                      <span className="changelog-version-tag">v{entry.version}</span>
                    </div>

                    {/* Right Column (Card Content) */}
                    <div className="changelog-timeline-content">
                      <div className="changelog-card">
                        <h2 className="changelog-card-title">{entry.title}</h2>
                        <div className="changelog-change-list">
                          {entry.changes.map((change, idx) => (
                            <div key={idx} className={`changelog-change-item ${change.type}`}>
                              <div className="changelog-change-header">
                                <span className={`changelog-tag ${change.type}`}>
                                  {change.type === "feature" && <Sparkles size={12} />}
                                  {change.type === "improvement" && <Wrench size={12} />}
                                  {change.type === "bugfix" && <ShieldAlert size={12} />}
                                  {change.type === "feature" && "Feature"}
                                  {change.type === "improvement" && "Melhoria"}
                                  {change.type === "bugfix" && "Correção"}
                                </span>
                                <h3>{change.title}</h3>
                              </div>
                              <p>{change.description}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="changelog-empty">
                <RefreshCw size={24} className="spin-icon" />
                <h3>{tx("Nenhum registro", "没有记录")}</h3>
                <p>{tx("Nenhum registro encontrado para o filtro selecionado.", "未找到该筛选条件下的更新记录。")}</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── TAB 2: INTERACTIVE SUGGESTIONS ── */}
      {activeTab === "suggestions" && (
        <div className="roadmap-section">
          {/* Header Action Row */}
          <div className="roadmap-toolbar">
            <div className="roadmap-filters">
              <button 
                type="button" 
                className={suggestionFilter === "all" ? "active" : ""}
                onClick={() => setSuggestionFilter("all")}
              >
                {tx("Todas as Sugestões", "所有建议")}
              </button>
              <button 
                type="button" 
                className={suggestionFilter === "pending" ? "active" : ""}
                onClick={() => setSuggestionFilter("pending")}
              >
                {tx("Em Aberto", "待处理")}
              </button>
              <button 
                type="button" 
                className={suggestionFilter === "completed" ? "active" : ""}
                onClick={() => setSuggestionFilter("completed")}
              >
                {tx("Concluídas", "已完成")}
              </button>
            </div>
            
            <button
              type="button"
              className="add-suggestion-trigger-btn"
              onClick={() => setShowForm(!showForm)}
            >
              {showForm ? <RotateCcw size={16} /> : <Plus size={16} />}
              <span>{showForm ? tx("Fechar Formulário", "关闭表单") : tx("Nova Sugestão / Aviso", "提交新建议/报告")}</span>
            </button>
          </div>

          {/* Suggestion Creation Form */}
          {showForm && (
            <form onSubmit={handleAddSuggestion} className="roadmap-form-card">
              <h3>{tx("O que podemos melhorar no sistema?", "为系统提交新建议")}</h3>
              <p className="form-helper">{tx("Registre uma nova sugestão de melhoria, aviso de bug ou feature. Toda a equipe poderá ver e votar para ajudar na priorização.", "提交功能建议或报告缺陷，全团队都可参与投票帮助优先级决策。")}</p>
              
              <div className="form-grid">
                <div className="form-group full-width">
                  <label htmlFor="sug-title">{tx("Título Objetivo", "建议标题")}</label>
                  <input
                    id="sug-title"
                    type="text"
                    required
                    placeholder={tx("Ex: Integração automática com WhatsApp API", "例如：与 WhatsApp 接口自动同步")}
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="sug-type">{tx("Tipo de Registro", "反馈类型")}</label>
                  <select
                    id="sug-type"
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as any)}
                  >
                    <option value="feature">✨ Feature (Nova Funcionalidade)</option>
                    <option value="improvement">🔧 Melhoria (Otimização)</option>
                    <option value="bugfix">⚠️ Bug (Aviso de Problema)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="sug-urgency">{tx("Grau de Urgência", "紧急程度")}</label>
                  <select
                    id="sug-urgency"
                    value={newUrgency}
                    onChange={(e) => setNewUrgency(e.target.value as any)}
                  >
                    <option value="low">🔵 Baixa (Pode esperar)</option>
                    <option value="medium">🟡 Média (Importante)</option>
                    <option value="high">🔴 Alta (Urgente / Impeditivo)</option>
                  </select>
                </div>

                <div className="form-group full-width">
                  <label htmlFor="sug-desc">{tx("Descrição Detalhada", "详细描述")}</label>
                  <textarea
                    id="sug-desc"
                    required
                    rows={4}
                    placeholder={tx("Explique o que é, o benefício prático e como deve funcionar...", "请详细说明该建议的实际应用场景、预期效果或问题复现步骤...")}
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-actions">
                <button type="submit" className="form-submit-btn">
                  <Send size={14} />
                  <span>{tx("Enviar Registro para o Quadro", "发布到看板")}</span>
                </button>
              </div>
            </form>
          )}

          {/* Suggestions List Container */}
          <div className="roadmap-list">
            {filteredSuggestions.length > 0 ? (
              <div className="roadmap-grid">
                {filteredSuggestions.map((item) => {
                  const hasVoted = item.votedBy.includes("me");
                  return (
                    <div 
                      key={item.id} 
                      className={`roadmap-card ${item.status === "completed" ? "completed" : ""}`}
                    >
                      {/* Urgency Pill & Type tag */}
                      <div className="roadmap-card-header">
                        <span className={`changelog-tag ${item.type}`}>
                          {item.type === "feature" && <Sparkles size={11} />}
                          {item.type === "improvement" && <Wrench size={11} />}
                          {item.type === "bugfix" && <ShieldAlert size={11} />}
                          {item.type === "feature" && tx("Feature", "新功能")}
                          {item.type === "improvement" && tx("Melhoria", "改进")}
                          {item.type === "bugfix" && tx("Bug", "问题")}
                        </span>

                        <div className="header-badges">
                          {/* Urgency Indicator */}
                          <span className={`urgency-badge ${item.urgency}`}>
                            {item.urgency === "high" && "🔴 Alta"}
                            {item.urgency === "medium" && "🟡 Média"}
                            {item.urgency === "low" && "🔵 Baixa"}
                          </span>

                          {/* Status Badge */}
                          <span className={`status-badge ${item.status}`}>
                            {item.status === "completed" ? (
                              <>
                                <CheckCircle2 size={12} />
                                <span>Concluído</span>
                              </>
                            ) : (
                              <>
                                <AlertCircle size={12} />
                                <span>Pendente</span>
                              </>
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Main Title & Body */}
                      <div className="roadmap-card-body">
                        <h3>{item.title}</h3>
                        <p>{item.description}</p>
                        <small className="card-date">
                          Criado em: {formatDate(item.createdAt)}
                        </small>
                      </div>

                      {/* Card Footer Actions */}
                      <div className="roadmap-card-footer">
                        {/* Vote Button */}
                        <button
                          type="button"
                          className={`vote-btn ${hasVoted ? "voted" : ""}`}
                          onClick={() => handleUpvote(item.id)}
                          title={hasVoted ? "Remover voto útil" : "Marcar como útil / votar"}
                        >
                          <ThumbsUp size={14} />
                          <span>{item.votes} {item.votes === 1 ? "Útil" : "Úteis"}</span>
                        </button>

                        {/* Interactive Admin Controls (Mark Completed & Remove) */}
                        <div className="admin-actions">
                          <button
                            type="button"
                            className={`toggle-status-btn ${item.status === "completed" ? "undo" : ""}`}
                            onClick={() => handleToggleStatus(item.id)}
                            title={item.status === "completed" ? "Marcar como pendente" : "Marcar como concluído"}
                          >
                            {item.status === "completed" ? <RotateCcw size={14} /> : <Check size={14} />}
                            <span>
                              {item.status === "completed" ? tx("Refazer", "重新开启") : tx("Concluir", "完成")}
                            </span>
                          </button>
                          
                          <button
                            type="button"
                            className="delete-sug-btn"
                            onClick={() => handleDeleteSuggestion(item.id)}
                            title="Remover do quadro"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="roadmap-empty-board">
                <MessageSquare size={36} />
                <h3>{tx("Nenhuma sugestão registrada", "尚无任何反馈建议")}</h3>
                <p>{tx("Seja o primeiro a enviar uma ideia ou reportar um bug para melhorarmos o CRM XP!", "点击右上角按钮提交第一份功能建议或缺陷报告！")}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

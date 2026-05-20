import { useState } from "react";
import { Sparkles, Wrench, ShieldAlert, Calendar, Clock, RefreshCw, PartyPopper } from "lucide-react";
import { useUiLanguage } from "../i18n";

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

const changelogData: ChangelogEntry[] = [
  {
    date: "2026-05-20",
    version: "1.1.0",
    title: "Central de Changelog & Otimizações no WhatsApp",
    changes: [
      {
        type: "feature",
        title: "Changelog do Sistema",
        description: "Lançamento da central de Changelog integrada sob o menu 'Mais' para permitir que toda a equipe acompanhe as novas funcionalidades, melhorias e correções de bugs em tempo real."
      },
      {
        type: "improvement",
        title: "Visualização Limpa da Atividade do WhatsApp",
        description: "Reestruturação da aba de Conversas nos Relatórios do WhatsApp. A tabela lateral de lista de conversas foi removida para foco exclusivo nos gráficos estatísticos, que agora ocupam 100% da largura útil da tela em um grid elegante de 2 colunas."
      }
    ]
  },
  {
    date: "2026-05-15",
    version: "1.0.8",
    title: "Otimizações de Kanban & Filtros Avançados",
    changes: [
      {
        type: "improvement",
        title: "Filtros Rápidos no Pipeline",
        description: "Melhorias significativas no tempo de resposta e filtros do funil de vendas (Pipeline) para agilizar a consulta de contatos em aberto."
      },
      {
        type: "bugfix",
        title: "Correção de Movimentação de Cards",
        description: "Corrigido um bug onde o arrastar e soltar (drag and drop) de cards congelava em telas de menor resolução."
      }
    ]
  },
  {
    date: "2026-05-08",
    version: "1.0.5",
    title: "Lançamento da Tela de Metas Integradas",
    changes: [
      {
        type: "feature",
        title: "Painel Dinâmico de Metas",
        description: "Nova tela de gerenciamento de objetivos comerciais por atendente, com barras de progresso interativas e cálculo automático de comissões estimadas."
      }
    ]
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
  const [filter, setFilter] = useState<"all" | "feature" | "improvement" | "bugfix">("all");

  const filteredEntries = changelogData
    .map(entry => {
      const changes = entry.changes.filter(c => filter === "all" || c.type === filter);
      return { ...entry, changes };
    })
    .filter(entry => entry.changes.length > 0);

  return (
    <div className="changelog-page">
      <header className="changelog-header">
        <div>
          <div className="changelog-eyebrow">
            <PartyPopper size={14} style={{ marginRight: "4px", display: "inline" }} />
            <span>CENTRAL DE ATUALIZAÇÕES</span>
          </div>
          <h1>{tx("Changelog do Sistema", "系统更新日志")}</h1>
          <p>{tx("Acompanhe o histórico de novas funcionalidades, melhorias e correções no CRM XP", "追踪 CRM XP 的新功能、系统改进 with 缺陷修复")}</p>
        </div>
        <div className="changelog-badge">
          <Clock size={16} />
          <span>Versão Atual: v1.1.0</span>
        </div>
      </header>

      {/* ── Filters ── */}
      <div className="changelog-filters">
        <button
          type="button"
          className={filter === "all" ? "active" : ""}
          onClick={() => setFilter("all")}
        >
          {tx("Todas", "全部")}
        </button>
        <button
          type="button"
          className={filter === "feature" ? "active feature" : ""}
          onClick={() => setFilter("feature")}
        >
          <Sparkles size={14} />
          {tx("Features", "新功能")}
        </button>
        <button
          type="button"
          className={filter === "improvement" ? "active improvement" : ""}
          onClick={() => setFilter("improvement")}
        >
          <Wrench size={14} />
          {tx("Melhorias", "功能改进")}
        </button>
        <button
          type="button"
          className={filter === "bugfix" ? "active bugfix" : ""}
          onClick={() => setFilter("bugfix")}
        >
          <ShieldAlert size={14} />
          {tx("Correções", "问题修复")}
        </button>
      </div>

      {/* ── Timeline ── */}
      <div className="changelog-timeline-container">
        {filteredEntries.length > 0 ? (
          <div className="changelog-timeline">
            {filteredEntries.map((entry) => (
              <div key={entry.date} className="changelog-timeline-item">
                {/* Left Side (Date) */}
                <div className="changelog-timeline-date">
                  <div className="changelog-date-badge">
                    <Calendar size={14} />
                    <span>{formatDate(entry.date)}</span>
                  </div>
                  <span className="changelog-version-tag">v{entry.version}</span>
                </div>

                {/* Right Side (Content Cards) */}
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
            <RefreshCw size={24} />
            <p>{tx("Nenhum registro encontrado para o filtro selecionado.", "未找到该筛选条件下的更新记录。")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

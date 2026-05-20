import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { 
  LayoutDashboard, 
  MessageSquare, 
  Bell, 
  TrendingUp, 
  ShieldAlert,
  BarChart3,
  Search,
  Filter,
  CheckCircle2
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { EventsSummaryPanel } from "../components/events/EventsSummaryPanel";
import { SentimentTrendChart } from "../components/events/SentimentTrendChart";
import { EventsListView } from "../components/events/EventsListView";
import { EventsFilters } from "../components/events/EventsFilters";
import { MessageEvent } from "@olist-crm/shared";

export function EventsPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Record<string, any>>({
    page: 1,
    pageSize: 20,
    isGroup: false
  });

  const [dateRange, setDateRange] = useState({
    from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0]
  });

  const metricsQuery = useQuery({
    queryKey: ["events-metrics", dateRange, filters.isGroup],
    queryFn: () => api.getEventsMetrics(token!, { dateFrom: dateRange.from, dateTo: dateRange.to, isGroup: filters.isGroup }),
    enabled: Boolean(token)
  });

  const eventsQuery = useQuery({
    queryKey: ["events-list", filters, dateRange],
    queryFn: () => api.listEvents(token!, { ...filters, dateFrom: dateRange.from, dateTo: dateRange.to }, { page: filters.page, pageSize: filters.pageSize }),
    enabled: Boolean(token)
  });

  const sentimentQuery = useQuery({
    queryKey: ["daily-sentiments", dateRange],
    queryFn: () => api.getDailySentiments(token!, dateRange),
    enabled: Boolean(token)
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, note }: { id: string, note: string }) => 
      api.resolveEvent(token!, id, { resolutionNote: note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events-list"] });
      queryClient.invalidateQueries({ queryKey: ["events-metrics"] });
    }
  });

  const handleResolve = (event: MessageEvent) => {
    const note = prompt("Deseja adicionar uma nota de resolução?", "Resolvido via atendimento.");
    if (note !== null) {
      resolveMutation.mutate({ id: event.id, note });
    }
  };

  const handleViewConversation = (dealId: string) => {
    navigate(`/mensagens?dealId=${dealId}`);
  };

  return (
    <div className="wa-events-page">
      <header className="wa-page-header">
        <div className="wa-header-content">
          <div className="wa-title-row">
            <ShieldAlert size={28} className="text-primary" />
            <h1>Inteligência de Mensagens</h1>
          </div>
          <p>Monitoramento analítico de riscos, sentimentos e performance operacional</p>
        </div>
        
        <div className="wa-header-actions">
          <div className="wa-date-picker-simple">
            <input 
              type="date" 
              value={dateRange.from} 
              onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
            />
            <span>até</span>
            <input 
              type="date" 
              value={dateRange.to} 
              onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
            />
          </div>
        </div>
      </header>

      <div className="wa-events-content">
        {metricsQuery.data?.executiveSummary && (
          <div className="wa-executive-summary-banner" style={{
            background: "linear-gradient(to right, rgba(41, 86, 215, 0.1), rgba(41, 86, 215, 0.05))",
            borderLeft: "4px solid var(--primary)",
            padding: "16px 20px",
            borderRadius: "8px",
            marginBottom: "24px",
            display: "flex",
            flexDirection: "column",
            gap: "8px"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "600", color: "var(--primary)" }}>
              <LayoutDashboard size={20} />
              <span>Resumo Executivo para Gestão</span>
            </div>
            <p style={{ margin: 0, fontSize: "14px", lineHeight: "1.5", color: "var(--text-color)" }}>
              Hoje tivemos <strong>{metricsQuery.data.executiveSummary.complaintsCount}</strong> reclamações, 
              sendo <strong>{metricsQuery.data.executiveSummary.vipComplaintsCount}</strong> de clientes de alto valor. 
              {metricsQuery.data.executiveSummary.bottleneckAgentText && (
                <> <span style={{ color: "var(--danger-color)", fontWeight: "500" }}>{metricsQuery.data.executiveSummary.bottleneckAgentText}</span></>
              )}
            </p>
          </div>
        )}

        <section className="wa-section metrics">
          <EventsSummaryPanel metrics={metricsQuery.data || null} />
        </section>

        <div className="wa-dashboard-grid">
          <section className="wa-section chart-card">
            <SentimentTrendChart data={sentimentQuery.data || []} />
          </section>
          
          <section className="wa-section list-card">
            <div className="wa-card-header">
              <div className="wa-card-title">
                <Bell size={20} />
                <h2>Eventos Recentes</h2>
              </div>
              <EventsFilters filters={filters} onChange={setFilters} />
            </div>
            
            <EventsListView 
              events={eventsQuery.data?.events || []} 
              onResolve={handleResolve}
              onViewConversation={handleViewConversation}
            />
            
            {eventsQuery.data && eventsQuery.data.total > filters.pageSize && (
              <div className="wa-pagination">
                <button 
                  disabled={filters.page === 1}
                  onClick={() => setFilters((f: Record<string, any>) => ({ ...f, page: f.page - 1 }))}
                >
                  Anterior
                </button>
                <span>Página {filters.page}</span>
                <button 
                  disabled={eventsQuery.data.events.length < filters.pageSize}
                  onClick={() => setFilters((f: Record<string, any>) => ({ ...f, page: f.page + 1 }))}
                >
                  Próxima
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

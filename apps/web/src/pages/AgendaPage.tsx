import { useQuery } from "@tanstack/react-query";
import { ContactQueueCard } from "../components/ContactQueueCard";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";

export function AgendaPage() {
  const { token } = useAuth();
  const agendaQuery = useQuery({
    queryKey: ["agenda"],
    queryFn: () => api.agenda(token!),
    enabled: Boolean(token),
  });

  if (agendaQuery.isLoading) {
    return <div className="page-loading">Montando agenda diaria...</div>;
  }

  if (agendaQuery.isError || !agendaQuery.data) {
    return <div className="page-error">Nao foi possivel montar a agenda.</div>;
  }

  const highestPriorityItem = agendaQuery.data[0];

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Agenda de contato</p>
            <h2>Fila automatica do dia</h2>
            <p className="panel-subcopy">
              A ordem considera recencia, valor do cliente, queda de frequencia e recompra atrasada.
            </p>
          </div>
          <div className="inline-actions">
            <span className="agenda-metric">{agendaQuery.data.length} clientes hoje</span>
            {highestPriorityItem ? <span className="agenda-metric">Maior score: {highestPriorityItem.priorityScore.toFixed(1)}</span> : null}
          </div>
        </div>

        {agendaQuery.data.length ? (
          <div className="queue-list">
            {agendaQuery.data.map((item) => (
              <ContactQueueCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="empty-state">Nenhum cliente entrou na fila automatica hoje.</div>
        )}
      </section>
    </div>
  );
}

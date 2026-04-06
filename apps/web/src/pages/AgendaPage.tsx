import { useInfiniteQuery } from "@tanstack/react-query";
import { ContactQueueCard } from "../components/ContactQueueCard";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatNumber } from "../lib/format";

const PAGE_SIZE = 15;

export function AgendaPage() {
  const { token } = useAuth();
  const agendaQuery = useInfiniteQuery({
    queryKey: ["agenda"],
    queryFn: ({ pageParam = 0 }) => api.agenda(token!, PAGE_SIZE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) {
        return undefined;
      }

      return allPages.reduce((total, page) => total + page.items.length, 0);
    },
    enabled: Boolean(token),
  });

  if (agendaQuery.isLoading) {
    return <div className="page-loading">Montando agenda diaria...</div>;
  }

  if (agendaQuery.isError || !agendaQuery.data) {
    return <div className="page-error">Nao foi possivel montar a agenda.</div>;
  }

  const agendaItems = agendaQuery.data.pages.flatMap((page) => page.items);
  const totalEligible = agendaQuery.data.pages[0]?.totalEligible ?? 0;
  const highestPriorityItem = agendaItems[0];

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Agenda de contato</p>
            <h2>Fila automatica do dia</h2>
            <p className="panel-subcopy">
              Entram clientes com recompra prevista vencida ou risco de churn, ordenados pela prioridade comercial.
            </p>
          </div>
          <div className="inline-actions">
            <span className="agenda-metric">{formatNumber(totalEligible)} clientes elegiveis</span>
            {highestPriorityItem ? <span className="agenda-metric">Maior score: {highestPriorityItem.priorityScore.toFixed(1)}</span> : null}
          </div>
        </div>

        {agendaItems.length ? (
          <>
            <div className="queue-list">
              {agendaItems.map((item) => (
                <ContactQueueCard key={item.id} item={item} />
              ))}
            </div>

            {agendaQuery.hasNextPage ? (
              <div className="load-more-row">
                <button className="ghost-button" type="button" onClick={() => void agendaQuery.fetchNextPage()} disabled={agendaQuery.isFetchingNextPage}>
                  {agendaQuery.isFetchingNextPage ? "Carregando mais..." : "Carregar mais 15"}
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <div className="empty-state">Nenhum cliente entrou na fila automatica hoje.</div>
        )}
      </section>
    </div>
  );
}

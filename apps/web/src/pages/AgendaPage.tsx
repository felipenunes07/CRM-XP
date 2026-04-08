import { useState } from "react";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { ContactQueueCard } from "../components/ContactQueueCard";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatNumber } from "../lib/format";

const PAGE_SIZE = 15;

export function AgendaPage() {
  const { token } = useAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [label, setLabel] = useState("");
  const [excludeLabel, setExcludeLabel] = useState("");
  const [ambassadorOnly, setAmbassadorOnly] = useState("");

  const labelsQuery = useQuery({
    queryKey: ["customer-labels"],
    queryFn: () => api.customerLabels(token!),
    enabled: Boolean(token),
  });

  const agendaQuery = useInfiniteQuery({
    queryKey: ["agenda", search, status, label, excludeLabel, ambassadorOnly],
    queryFn: ({ pageParam = 0 }) =>
      api.agenda(token!, PAGE_SIZE, pageParam, {
        search,
        status,
        labels: label,
        excludeLabels: excludeLabel,
        isAmbassador: ambassadorOnly === "true" ? true : undefined,
      }),
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
          <div style={{
            background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)',
            borderRadius: '24px',
            padding: '2rem',
            color: 'white',
            marginBottom: '1.5rem',
            boxShadow: 'var(--shadow)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '1.5rem',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ maxWidth: '600px' }}>
              <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
                Agenda de Contato
              </p>
              <h2 style={{ fontSize: '2rem', fontWeight: 800, margin: '0 0 0.5rem 0', color: 'white', letterSpacing: '-0.03em' }}>
                Fila automatica do dia
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.9)', margin: 0, lineHeight: 1.5, fontSize: '0.95rem' }}>
                Entram clientes com recompra prevista vencida ou risco de churn, ordenados pela prioridade comercial.
              </p>
            </div>
            
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ 
                background: 'rgba(255,255,255,0.15)', 
                backdropFilter: 'blur(12px)', 
                padding: '1rem 1.5rem', 
                borderRadius: '16px', 
                border: '1px solid rgba(255,255,255,0.2)',
                textAlign: 'center',
                minWidth: '130px'
              }}>
                <p style={{ margin: '0 0 0.25rem', fontSize: '0.8rem', color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>Elegiveis na Fila</p>
                <span style={{ fontSize: '2rem', fontWeight: 800, color: 'white', lineHeight: 1 }}>{formatNumber(totalEligible)}</span>
              </div>
              
              {highestPriorityItem ? (
                <div style={{ 
                  background: 'rgba(255,255,255,0.15)', 
                  backdropFilter: 'blur(12px)', 
                  padding: '1rem 1.5rem', 
                  borderRadius: '16px', 
                  border: '1px solid rgba(255,255,255,0.2)',
                  textAlign: 'center',
                  minWidth: '130px'
                }}>
                  <p style={{ margin: '0 0 0.25rem', fontSize: '0.8rem', color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>Maior Score 🔥</p>
                  <span style={{ fontSize: '2rem', fontWeight: 800, color: '#fef08a', lineHeight: 1 }}>{highestPriorityItem.priorityScore.toFixed(1)}</span>
                </div>
              ) : null}
            </div>
          </div>

          <div style={{ 
            background: 'rgba(41, 86, 215, 0.04)', 
            border: '1px solid var(--line)', 
            padding: '1.25rem', 
            borderRadius: '16px', 
            marginBottom: '1.5rem',
            display: 'flex',
            gap: '1rem',
            alignItems: 'flex-start'
          }}>
            <div style={{ 
              background: 'white', 
              borderRadius: '10px', 
              padding: '8px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              boxShadow: '0 4px 12px rgba(41,86,215,0.08)' 
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
            </div>
            <div>
              <h4 style={{ margin: '0 0 0.35rem', color: 'var(--text)', fontSize: '0.95rem', fontWeight: 600 }}>Entendendo o Score (Priority Score)</h4>
              <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.85rem', lineHeight: 1.5 }}>
                O <strong>Score de Prioridade</strong> varia de <strong>0 a 100</strong> e sugere quem deve ser contatado com maior urgencia. Nossa IA calcula essa nota priorizando clientes de alto valor (bom historico ou recorrencia) que estao sumindo (risco de churn) ou com a data media de recompra atrasada. Quanto mais alto, mais estrategico e fecha-lo hoje!
              </p>
            </div>
          </div>

          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '1.25rem',
            border: '1px solid var(--line)',
            boxShadow: '0 4px 15px rgba(0,0,0,0.03)',
            marginBottom: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
               <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
               <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Filtros</h4>
            </div>
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '1rem'
            }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>
                Buscar cliente
                <input 
                  value={search} 
                  onChange={(event) => setSearch(event.target.value)} 
                  placeholder="Nome ou codigo..." 
                  style={{ padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--bg-soft)', fontSize: '0.9rem', outline: 'none', transition: 'border-color 0.2s' }}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>
                Status
                <select 
                  value={status} 
                  onChange={(event) => setStatus(event.target.value)}
                  style={{ padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--bg-soft)', fontSize: '0.9rem', outline: 'none', transition: 'border-color 0.2s', cursor: 'pointer' }}
                >
                  <option value="">Todos</option>
                  <option value="ACTIVE">Ativos</option>
                  <option value="ATTENTION">Atencao</option>
                  <option value="INACTIVE">Inativos</option>
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>
                Rótulo principal
                <select 
                  value={label} 
                  onChange={(event) => setLabel(event.target.value)}
                  style={{ padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--bg-soft)', fontSize: '0.9rem', outline: 'none', transition: 'border-color 0.2s', cursor: 'pointer' }}
                >
                  <option value="">Qualquer rotulo</option>
                  {labelsQuery.data?.map((item) => (
                    <option key={item.id} value={item.name}>{item.name}</option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>
                Excluir rótulo
                <select 
                  value={excludeLabel} 
                  onChange={(event) => setExcludeLabel(event.target.value)}
                  style={{ padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--bg-soft)', fontSize: '0.9rem', outline: 'none', transition: 'border-color 0.2s', cursor: 'pointer' }}
                >
                  <option value="">Nenhum (nao excluir)</option>
                  {labelsQuery.data?.map((item) => (
                    <option key={item.id} value={item.name}>{item.name}</option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>
                Embaixador
                <select 
                  value={ambassadorOnly} 
                  onChange={(event) => setAmbassadorOnly(event.target.value)}
                  style={{ padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--bg-soft)', fontSize: '0.9rem', outline: 'none', transition: 'border-color 0.2s', cursor: 'pointer' }}
                >
                  <option value="">Mostrar todos</option>
                  <option value="true">Somente parceiros</option>
                </select>
              </label>
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

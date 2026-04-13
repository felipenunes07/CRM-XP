import sys

file_path = "c:/Users/Felipe/Desktop/CRM XP/CRM-XP/apps/web/src/pages/ReactivationPage.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

index = content.rfind("return (")
if index == -1:
    sys.exit(1)

new_jsx = """return (
    <div className="page-stack">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <div>
          <p className="eyebrow" style={{ margin: 0, marginBottom: '0.2rem' }}>Ranking de reativacao</p>
          <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Recuperadoras de Ouro</h2>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
            <div className="stat-card-header"><h3 className="stat-card-title">Mes analisado</h3></div>
            <div className="stat-card-body">
                <strong>{monthLabel}</strong>
                <p className="stat-card-helper">Primeira reativacao no mes</p>
            </div>
        </div>
        <div className="stat-card tone-success">
            <div className="stat-card-header"><h3 className="stat-card-title">Clientes recuperados</h3></div>
            <div className="stat-card-body">
                <strong>{formatNumber(totalRecoveredCustomers)}</strong>
                <p className="stat-card-helper">Soma total do ranking</p>
            </div>
        </div>
        <div className="stat-card">
            <div className="stat-card-header"><h3 className="stat-card-title">Faturamento reativado</h3></div>
            <div className="stat-card-body">
                <strong>{formatCurrency(totalRecoveredRevenue)}</strong>
                <p className="stat-card-helper">Soma de pedidos de retorno</p>
            </div>
        </div>
        <div className="stat-card">
            <div className="stat-card-header"><h3 className="stat-card-title">Equipe ativa</h3></div>
            <div className="stat-card-body">
                <strong>{formatNumber(leaderboard.length)}</strong>
                <p className="stat-card-helper">Atendentes com reativacao</p>
            </div>
        </div>
      </div>

      <section className="panel" style={{ padding: '0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="panel-header" style={{ padding: '1.25rem 1.25rem 1rem 1.25rem', borderBottom: '1px solid var(--line)', background: 'transparent' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', margin: 0 }}>Placar Consolidado</h3>
            <p className="panel-subcopy" style={{ marginTop: '0.3rem' }}>Detalhamento da conversao por consultor e seus respectivos clientes reativados.</p>
          </div>
        </div>

        {leaderboard.length ? (
          <div className="leaderboard-list" style={{ display: 'flex', flexDirection: 'column' }}>
            {leaderboard.map((entry, index) => {
              return (
                <article key={`${entry.attendant}-${index}`} style={{ borderBottom: '1px solid var(--line)', display: 'flex', flexDirection: 'column' }}>
                  
                  {/* Attendant Strip */}
                  <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      padding: '1rem 1.25rem', 
                      background: 'transparent'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ 
                          width: '32px', height: '32px', 
                          display: 'flex', alignItems: 'center', justifyContent: 'center', 
                          borderRadius: '8px', 
                          background: 'var(--line)', 
                          color: 'var(--text)',
                          fontSize: '1rem', fontWeight: 800
                      }}>
                        {index + 1}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <strong style={{ fontSize: '1.2rem', color: 'var(--text)' }}>{entry.attendant}</strong>
                          <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{formatNumber(entry.recoveredCustomers)} carteiras reativadas</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                       <span style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Faturamento gerado</span>
                       <strong style={{ fontSize: '1.25rem', color: 'var(--text)' }}>{formatCurrency(entry.recoveredRevenue)}</strong>
                    </div>
                  </div>

                  {/* Compact Clients Table */}
                  <div style={{ padding: '0 1.25rem 1.25rem 4.25rem' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>
                                <th style={{ textAlign: 'left', padding: '0.4rem 0.5rem', fontWeight: 600 }}>Cliente</th>
                                <th style={{ textAlign: 'center', padding: '0.4rem 0.5rem', fontWeight: 600 }}>Inativo por</th>
                                <th style={{ textAlign: 'right', padding: '0.4rem 0.5rem', fontWeight: 600 }}>Pedido Retorno</th>
                                <th style={{ width: '80px' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {entry.recoveredClients.map((client) => (
                                <tr key={`${entry.attendant}-${client.customerId}`} style={{ borderBottom: '1px solid rgba(41,86,215,0.05)' }}>
                                    <td style={{ padding: '0.6rem 0.5rem' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <strong style={{ color: 'var(--text)' }}>{client.displayName}</strong>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{client.customerCode || "Sem codigo"}</span>
                                        </div>
                                    </td>
                                    <td style={{ textAlign: 'center', padding: '0.6rem 0.5rem', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                                        {formatNumber(client.daysInactiveBeforeReturn)} dias
                                    </td>
                                    <td style={{ textAlign: 'right', padding: '0.6rem 0.5rem', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                                        {formatCurrency(client.reactivatedOrderAmount)}
                                    </td>
                                    <td style={{ textAlign: 'right', padding: '0.6rem 0.5rem' }}>
                                        <Link to={`/clientes/${client.customerId}`} style={{ fontSize: '0.8rem', color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, background: 'rgba(41,86,215,0.08)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>Abrir</Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                  </div>

                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state" style={{ padding: '3rem' }}>Ainda nao houve reativacao registrada neste mes.</div>
        )}
      </section>
    </div>
  );
}
"""

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content[:index] + new_jsx)

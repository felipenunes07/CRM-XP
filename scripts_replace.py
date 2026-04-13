import sys

file_path = "c:/Users/Felipe/Desktop/CRM XP/CRM-XP/apps/web/src/pages/AmbassadorsPage.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

index = content.rfind("return (")
if index == -1:
    sys.exit(1)

new_jsx = """return (
    <div className="page-stack">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Clientes chave</p>
          <h2>Embaixadores da empresa</h2>
          <p>
            Acompanhe de perto quem a chefia definiu como {AMBASSADOR_LABEL_NAME.toLowerCase()} e veja se essa carteira
            esta comprando mais, crescendo e puxando volume com a XP.
          </p>
        </div>
        <div className="hero-meta">
          <div className="hero-meta-item">
            <span>Janela atual</span>
            <strong>
              {formatDate(summary.currentPeriodStart)} a {formatDate(summary.currentPeriodEnd)}
            </strong>
          </div>
          <div className="hero-meta-item">
            <span>Comparacao</span>
            <strong>
              {formatDate(summary.previousPeriodStart)} a {formatDate(summary.previousPeriodEnd)}
            </strong>
          </div>
          <div className="hero-meta-item">
            <span>Cohort atual</span>
            <strong>{formatNumber(summary.totalAmbassadors)} embaixadores</strong>
          </div>
        </div>
      </section>

      <div className="stats-grid">
        {overviewItems.map((item) => (
          <div key={item.label} className={`stat-card tone-${item.tone}`}>
            <div className="stat-card-header">
              <h3 className="stat-card-title">{item.label}</h3>
            </div>
            <div className="stat-card-body">
              <strong>{item.value}</strong>
              <p className="stat-card-helper">{item.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid-two dashboard-grid" style={{ alignItems: "flex-start", marginTop: "1rem" }}>
        
        {/* LEFT COLUMN: Charts & Selected Focus */}
        <div className="page-stack">
          {selectedAmbassador && (
             <section className="panel" style={{ padding: '1.25rem' }}>
                <div className="panel-header" style={{ marginBottom: '1rem' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.4rem' }}>{selectedAmbassador.displayName}</h3>
                    <div style={{ display: 'flex', gap: '0.8rem', marginTop: '0.4rem', alignItems: 'center' }}>
                      <span className={`status-badge ${statusClass(selectedAmbassador.status)}`}>{statusLabel(selectedAmbassador.status)}</span>
                      <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{selectedAmbassador.customerCode || "Sem codigo"}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                    <Link className="ghost-button" to={`/clientes/${selectedAmbassador.id}`} style={{ padding: '0.4rem 1rem' }}>Abrir perfil</Link>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1rem', background: 'var(--line)', padding: '1rem', borderRadius: '10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                       <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Faturamento atual</span>
                       <strong style={{ fontSize: '1.1rem' }}>{formatCurrency(selectedAmbassador.currentPeriodRevenue)}</strong>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                       <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Crescimento</span>
                       <strong style={{ fontSize: '1.1rem', color: ambassadorFocusTone(selectedAmbassador) === 'success' ? 'var(--success)' : 'inherit' }}>{formatGrowth(selectedAmbassador.revenueGrowthRatio)}</strong>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                       <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Pedidos no corte</span>
                       <strong style={{ fontSize: '1.1rem' }}>{formatNumber(selectedAmbassador.currentPeriodOrders)}</strong>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                       <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Recencia</span>
                       <strong style={{ fontSize: '1.1rem' }}>{formatDaysSince(selectedAmbassador.daysSinceLastPurchase)}</strong>
                    </div>
                </div>
             </section>
          )}

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Historico mensal</p>
                <h3>{selectedAmbassador ? `Tendencia de ${selectedAmbassador.displayName}` : "Tendencia mensal"}</h3>
              </div>
              <div className="ambassador-chart-controls">
                <div className="ambassador-chart-toggle" role="tablist">
                  {(["revenue", "orders", "pieces"] as ChartMetric[]).map((metric) => (
                    <button
                      key={metric}
                      type="button"
                      className={`ambassador-chart-button ${chartMetric === metric ? "active" : ""}`}
                      onClick={() => setChartMetric(metric)}
                    >
                      {chartMetricLabel(metric)}
                    </button>
                  ))}
                </div>
                <div className="ambassador-range-toggle" role="tablist">
                  {([6, 12, 24] as TrendWindow[]).map((windowSize) => (
                    <button
                      key={windowSize}
                      type="button"
                      className={`ambassador-range-button ${trendWindow === windowSize ? "active" : ""}`}
                      onClick={() => setTrendWindow(windowSize)}
                    >
                      {windowSize}m
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="trend-chart-wrap">
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={activeTrendData} margin={{ top: 12, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke="rgba(41, 86, 215, 0.08)" vertical={false} />
                  <XAxis dataKey="month" tickFormatter={(value) => formatMonthLabel(String(value))} stroke="#5f6f95" minTickGap={trendWindow === 24 ? 18 : 8} />
                  <YAxis stroke="#5f6f95" tickFormatter={(value) => formatNumber(Number(value))} />
                  <Tooltip content={<AmbassadorTrendTooltip metric={chartMetric} subjectLabel={activeTrendLabel} />} cursor={{ fill: "rgba(41, 86, 215, 0.04)" }} />
                  <Bar dataKey={chartMetric} fill={chartMetricColor(chartMetric)} radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN: Filter & List */}
        <section className="panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '800px', padding: '1.25rem' }}>
          <div className="panel-header" style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--line)' }}>
            <h3 style={{ fontSize: '1.2rem', margin: 0 }}>Encontrar Embaixador</h3>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', paddingBottom: '1rem' }}>
            <input 
               value={search} 
               onChange={(event) => setSearch(event.target.value)} 
               placeholder="Nome ou codigo..." 
               style={{ padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid var(--line)', background: 'var(--panel)', width: '100%' }} 
            />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
                <select 
                   value={statusFilter} 
                   onChange={(event) => setStatusFilter(event.target.value)} 
                   style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--line)' }}
                >
                  <option value="">Status</option>
                  <option value="ACTIVE">Ativos</option>
                  <option value="ATTENTION">Atencao</option>
                  <option value="INACTIVE">Inativos</option>
                </select>
                <select 
                   value={sortKey} 
                   onChange={(event) => setSortKey(event.target.value)} 
                   style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--line)' }}
                >
                  <option value="revenue">Vendas</option>
                  <option value="growth">Crescimento</option>
                  <option value="recency">Recencia</option>
                </select>
            </div>
          </div>

          <div style={{ overflowY: 'auto', flex: 1, paddingRight: '0.3rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {ambassadors.length ? ambassadors.map((ambassador) => (
              <article 
                key={ambassador.id} 
                onClick={() => setSelectedAmbassadorId(ambassador.id)}
                style={{ 
                    cursor: 'pointer', 
                    padding: '0.8rem', 
                    borderRadius: '8px', 
                    border: '1px solid', 
                    borderColor: selectedAmbassador?.id === ambassador.id ? 'var(--accent)' : 'var(--line)', 
                    background: selectedAmbassador?.id === ambassador.id ? 'rgba(41, 86, 215, 0.05)' : 'var(--line)',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <strong style={{ fontSize: '0.9rem', color: 'var(--text)', lineHeight: 1.2 }}>{ambassador.displayName}</strong>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent)' }}>{formatCurrency(ambassador.currentPeriodRevenue)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className={`status-badge ${statusClass(ambassador.status)}`} style={{ padding: '0.1rem 0.45rem', fontSize: '0.65rem' }}>{statusLabel(ambassador.status)}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Crescem: {formatGrowth(ambassador.revenueGrowthRatio)}</span>
                </div>
              </article>
            )) : <span style={{ color: 'var(--muted)', fontSize: '0.85rem', textAlign: 'center', marginTop: '2rem' }}>Nenhum encontrado no filtro.</span>}
          </div>
        </section>

      </div>
    </div>
  );
}
"""

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content[:index] + new_jsx)

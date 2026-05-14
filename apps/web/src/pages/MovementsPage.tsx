import { CustomerMovementsPanel } from "../components/CustomerMovementsPanel";
import { useUiLanguage } from "../i18n";

export function MovementsPage() {
  const { tx } = useUiLanguage();

  return (
    <div className="page-stack">
      <section className="dashboard-hero-premium" style={{ minHeight: "auto", padding: "2rem 2.5rem", borderRadius: "12px", overflow: "hidden" }}>
        <div className="hero-premium-bg">
          <div className="hero-premium-gradient"></div>
        </div>
        <div className="hero-premium-content">
          <div className="hero-premium-copy">
            <div className="premium-badge">{tx("Inteligência de Base", "Base Intelligence")}</div>
            <h2 className="premium-title">{tx("Movimentação da Base", "Customer Movements")}</h2>
            <p className="premium-subtitle">
              {tx(
                "Acompanhe as mudanças de status da sua carteira para identificar riscos e recuperações em tempo real.",
                "Track status changes in your portfolio to identify risks and recoveries in real-time."
              )}
            </p>
          </div>
        </div>
      </section>

      <div style={{ marginTop: "-0.5rem" }}>
        <CustomerMovementsPanel initialDays={7} />
      </div>
    </div>
  );
}

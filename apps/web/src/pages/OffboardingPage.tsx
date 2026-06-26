import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import { api, type OffboardingCustomer } from "../lib/api";

const WINDOW_OPTIONS: { label: string; value: number | "all" }[] = [
  { label: "Últimos 7 dias", value: 7 },
  { label: "Últimos 30 dias", value: 30 },
  { label: "Últimos 90 dias", value: 90 },
  { label: "Todos os inativos", value: "all" },
];

function urgency(avgPiecesPerMonth: number): { label: string; color: string } {
  if (avgPiecesPerMonth > 300) return { label: "🔴 Crítica", color: "#dc2626" };
  if (avgPiecesPerMonth > 100) return { label: "🟠 Alta", color: "#ea580c" };
  if (avgPiecesPerMonth > 50) return { label: "🟡 Média", color: "#ca8a04" };
  return { label: "⚪ Baixa", color: "#64748b" };
}

function formatBrDate(isoDate: string | null): string {
  if (!isoDate) return "—";
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : "—";
}

function CustomerCard({
  customer,
  selectable,
  selected,
  onToggle,
}: {
  customer: OffboardingCustomer;
  selectable?: boolean;
  selected?: boolean;
  onToggle?: () => void;
}) {
  const u = urgency(customer.avgPiecesPerMonth);
  return (
    <div
      className="panel-row"
      style={{
        display: "grid",
        gridTemplateColumns: selectable ? "auto 1fr auto" : "1fr auto",
        gap: "1rem",
        alignItems: "center",
        borderLeft: `4px solid ${u.color}`,
      }}
    >
      {selectable ? (
        <input type="checkbox" checked={Boolean(selected)} onChange={onToggle} style={{ width: 18, height: 18 }} />
      ) : null}
      <div>
        <p style={{ fontWeight: 600, marginBottom: "0.2rem" }}>
          {customer.displayName}
          {customer.customerCode ? <span style={{ opacity: 0.5, fontWeight: 400 }}> · cód. {customer.customerCode}</span> : null}
        </p>
        <p style={{ fontSize: "0.82rem", opacity: 0.7 }}>
          Última compra {formatBrDate(customer.lastPurchaseAt)} · {customer.daysSinceLastPurchase} dias parado ·{" "}
          {customer.totalOrders === 1 ? "1 compra" : `${customer.totalOrders} compras`}
        </p>
      </div>
      <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
        <span className="badge" style={{ background: `${u.color}1a`, color: u.color, fontWeight: 600 }}>{u.label}</span>
        <p style={{ fontSize: "0.82rem", opacity: 0.7, marginTop: "0.25rem" }}>~{customer.avgPiecesPerMonth} telas/mês</p>
      </div>
    </div>
  );
}

export function OffboardingPage() {
  const { token } = useAuth();
  const [window, setWindow] = useState<number | "all">(30);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [toast, setToast] = useState<string | null>(null);

  const upcomingQuery = useQuery({
    queryKey: ["offboarding-upcoming"],
    queryFn: () => api.offboardingUpcoming(token!, 1),
    enabled: Boolean(token),
  });

  const backlogQuery = useQuery({
    queryKey: ["offboarding-backlog", window],
    queryFn: () => api.offboardingBacklog(token!, window),
    enabled: Boolean(token),
  });

  const sendMutation = useMutation({
    mutationFn: (ids: string[]) => api.offboardingSend(token!, ids),
    onSuccess: (result) => {
      setSelected(new Set());
      setToast(
        result.sent
          ? `Enviado! ${result.customers.length} cliente(s) disparado(s) para o grupo.`
          : "Nenhuma mensagem enviada.",
      );
      setTimeout(() => setToast(null), 5000);
    },
    onError: (error) => {
      setToast(`Falha ao enviar: ${String(error)}`);
      setTimeout(() => setToast(null), 6000);
    },
  });

  const upcoming = upcomingQuery.data?.customers ?? [];
  const backlog = backlogQuery.data?.customers ?? [];

  const allSelected = backlog.length > 0 && backlog.every((c) => selected.has(c.customerId));
  const selectedList = useMemo(() => Array.from(selected), [selected]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(backlog.map((c) => c.customerId)));
    }
  }

  return (
    <div className="page-stack">
      {toast ? (
        <div className="panel" style={{ background: "#0f172a", color: "white", padding: "0.85rem 1.25rem" }}>
          {toast}
        </div>
      ) : null}

      {/* Programado para amanhã */}
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Saída da Base</p>
            <h2 className="premium-header-title">Programado para amanhã</h2>
            <p className="panel-subcopy">
              O automático roda todo dia às 8h. Estes clientes estão com 89 dias e vão virar INATIVOS amanhã — é
              exatamente o que será disparado no grupo no próximo ciclo.
            </p>
          </div>
        </div>

        {upcomingQuery.isLoading ? (
          <div className="page-loading">Carregando...</div>
        ) : upcoming.length === 0 ? (
          <div className="panel-empty">Ninguém programado para amanhã. ✅</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            <p style={{ fontSize: "0.85rem", opacity: 0.7 }}>
              {upcoming.length} cliente(s) vão virar inativos amanhã:
            </p>
            {upcoming.map((c) => (
              <CustomerCard key={c.customerId} customer={c} />
            ))}
          </div>
        )}
      </section>

      {/* Backlog manual */}
      <section className="panel">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Clientes já inativos (envio manual)</h3>
            <p className="panel-subcopy">
              Estes já cruzaram os 90 dias antes do automático existir — ele nunca vai pegá-los. Selecione e dispare
              você mesmo para o grupo.
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            {WINDOW_OPTIONS.map((opt) => (
              <button
                key={String(opt.value)}
                type="button"
                className={`filter-chip ${window === opt.value ? "active" : ""}`}
                onClick={() => {
                  setWindow(opt.value);
                  setSelected(new Set());
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {backlogQuery.isLoading ? (
          <div className="page-loading">Carregando...</div>
        ) : backlog.length === 0 ? (
          <div className="panel-empty">Nenhum cliente inativo nessa janela.</div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.75rem",
                flexWrap: "wrap",
                gap: "0.75rem",
              }}
            >
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.88rem", cursor: "pointer" }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ width: 18, height: 18 }} />
                Selecionar todos ({backlog.length})
              </label>
              <button
                type="button"
                className="btn-primary"
                disabled={selectedList.length === 0 || sendMutation.isPending}
                onClick={() => sendMutation.mutate(selectedList)}
              >
                {sendMutation.isPending
                  ? "Enviando..."
                  : `Enviar ${selectedList.length} selecionado(s) ao grupo`}
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {backlog.map((c) => (
                <CustomerCard
                  key={c.customerId}
                  customer={c}
                  selectable
                  selected={selected.has(c.customerId)}
                  onToggle={() => toggle(c.customerId)}
                />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

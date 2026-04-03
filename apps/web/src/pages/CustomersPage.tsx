import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { CustomerTable } from "../components/CustomerTable";

export function CustomersPage() {
  const { token } = useAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [sortBy, setSortBy] = useState<"priority" | "faturamento" | "recencia">("priority");
  const [label, setLabel] = useState("");
  const [excludeLabel, setExcludeLabel] = useState("");

  const labelsQuery = useQuery({
    queryKey: ["customer-labels"],
    queryFn: () => api.customerLabels(token!),
    enabled: Boolean(token),
  });

  const customersQuery = useQuery({
    queryKey: ["customers", search, status, sortBy, label, excludeLabel],
    queryFn: () =>
      api.customers(token!, {
        search,
        status,
        sortBy,
        labels: label,
        excludeLabels: excludeLabel,
        limit: 120,
      }),
    enabled: Boolean(token),
  });

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Clientes</p>
            <h2>Procure, filtre e priorize sua carteira</h2>
          </div>
        </div>

        <div className="filters-grid filters-grid-wide">
          <label>
            Buscar
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome ou código" />
          </label>

          <label>
            Status
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Todos</option>
              <option value="ACTIVE">Ativos</option>
              <option value="ATTENTION">Atenção</option>
              <option value="INACTIVE">Inativos</option>
            </select>
          </label>

          <label>
            Ordenar por
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}>
              <option value="priority">Prioridade</option>
              <option value="faturamento">Faturamento</option>
              <option value="recencia">Recência</option>
            </select>
          </label>

          <label>
            Com rótulo
            <select value={label} onChange={(event) => setLabel(event.target.value)}>
              <option value="">Todos</option>
              {labelsQuery.data?.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Excluir rótulo
            <select value={excludeLabel} onChange={(event) => setExcludeLabel(event.target.value)}>
              <option value="">Nenhum</option>
              {labelsQuery.data?.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {customersQuery.isLoading ? <div className="page-loading">Carregando clientes...</div> : null}
      {customersQuery.isError ? <div className="page-error">Falha ao carregar a carteira.</div> : null}
      {customersQuery.data ? <CustomerTable customers={customersQuery.data} /> : null}
    </div>
  );
}

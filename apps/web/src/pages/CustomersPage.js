import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { CustomerTable } from "../components/CustomerTable";
export function CustomersPage() {
    const { token } = useAuth();
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("");
    const [sortBy, setSortBy] = useState("priority");
    const [label, setLabel] = useState("");
    const [excludeLabel, setExcludeLabel] = useState("");
    const labelsQuery = useQuery({
        queryKey: ["customer-labels"],
        queryFn: () => api.customerLabels(token),
        enabled: Boolean(token),
    });
    const customersQuery = useQuery({
        queryKey: ["customers", search, status, sortBy, label, excludeLabel],
        queryFn: () => api.customers(token, {
            search,
            status,
            sortBy,
            labels: label,
            excludeLabels: excludeLabel,
            limit: 120,
        }),
        enabled: Boolean(token),
    });
    return (_jsxs("div", { className: "page-stack", children: [_jsxs("section", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Clientes" }), _jsx("h2", { children: "Procure, filtre e priorize sua carteira" })] }) }), _jsxs("div", { className: "filters-grid filters-grid-wide", children: [_jsxs("label", { children: ["Buscar", _jsx("input", { value: search, onChange: (event) => setSearch(event.target.value), placeholder: "Nome ou c\u00F3digo" })] }), _jsxs("label", { children: ["Status", _jsxs("select", { value: status, onChange: (event) => setStatus(event.target.value), children: [_jsx("option", { value: "", children: "Todos" }), _jsx("option", { value: "ACTIVE", children: "Ativos" }), _jsx("option", { value: "ATTENTION", children: "Aten\u00E7\u00E3o" }), _jsx("option", { value: "INACTIVE", children: "Inativos" })] })] }), _jsxs("label", { children: ["Ordenar por", _jsxs("select", { value: sortBy, onChange: (event) => setSortBy(event.target.value), children: [_jsx("option", { value: "priority", children: "Prioridade" }), _jsx("option", { value: "faturamento", children: "Faturamento" }), _jsx("option", { value: "recencia", children: "Rec\u00EAncia" })] })] }), _jsxs("label", { children: ["Com r\u00F3tulo", _jsxs("select", { value: label, onChange: (event) => setLabel(event.target.value), children: [_jsx("option", { value: "", children: "Todos" }), labelsQuery.data?.map((item) => (_jsx("option", { value: item.name, children: item.name }, item.id)))] })] }), _jsxs("label", { children: ["Excluir r\u00F3tulo", _jsxs("select", { value: excludeLabel, onChange: (event) => setExcludeLabel(event.target.value), children: [_jsx("option", { value: "", children: "Nenhum" }), labelsQuery.data?.map((item) => (_jsx("option", { value: item.name, children: item.name }, item.id)))] })] })] })] }), customersQuery.isLoading ? _jsx("div", { className: "page-loading", children: "Carregando clientes..." }) : null, customersQuery.isError ? _jsx("div", { className: "page-error", children: "Falha ao carregar a carteira." }) : null, customersQuery.data ? _jsx(CustomerTable, { customers: customersQuery.data }) : null] }));
}

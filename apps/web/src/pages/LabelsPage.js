import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AMBASSADOR_LABEL_NAME } from "@olist-crm/shared";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
export function LabelsPage() {
    const { token } = useAuth();
    const queryClient = useQueryClient();
    const [newLabel, setNewLabel] = useState("");
    const labelsQuery = useQuery({
        queryKey: ["customer-labels"],
        queryFn: () => api.customerLabels(token),
        enabled: Boolean(token),
    });
    const createMutation = useMutation({
        mutationFn: (name) => api.createCustomerLabel(token, name),
        onSuccess: () => {
            setNewLabel("");
            void queryClient.invalidateQueries({ queryKey: ["customer-labels"] });
        },
    });
    const deleteMutation = useMutation({
        mutationFn: (id) => api.deleteCustomerLabel(token, id),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["customer-labels"] });
            void queryClient.invalidateQueries({ queryKey: ["customers"] });
            void queryClient.invalidateQueries({ queryKey: ["ambassadors"] });
        },
    });
    function handleCreate(event) {
        event.preventDefault();
        if (!newLabel.trim()) {
            return;
        }
        createMutation.mutate(newLabel.trim());
    }
    return (_jsxs("div", { className: "page-stack", children: [_jsxs("section", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Rotulos" }), _jsx("h2", { children: "Crie e apague rotulos do sistema" })] }) }), _jsxs("form", { className: "label-create-row", onSubmit: handleCreate, children: [_jsx("input", { value: newLabel, onChange: (event) => setNewLabel(event.target.value), placeholder: "Ex: Lista negra, Nao insistir, Pode reativar" }), _jsx("button", { type: "submit", className: "primary-button", disabled: createMutation.isPending, children: createMutation.isPending ? "Criando..." : "Criar rotulo" })] }), createMutation.isError ? _jsx("div", { className: "inline-error", children: "Nao foi possivel criar esse rotulo." }) : null] }), _jsxs("section", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Biblioteca" }), _jsx("h3", { children: "Rotulos disponiveis" })] }) }), labelsQuery.isLoading ? _jsx("div", { className: "page-loading", children: "Carregando rotulos..." }) : null, labelsQuery.isError ? _jsx("div", { className: "page-error", children: "Falha ao carregar os rotulos." }) : null, labelsQuery.data ? (_jsx("div", { className: "label-library", children: labelsQuery.data.length ? (labelsQuery.data.map((label) => (_jsxs("div", { className: "label-library-item", children: [_jsx("span", { className: "tag", style: { background: `${label.color}14`, color: label.color, borderColor: `${label.color}33` }, children: label.name }), _jsx("button", { type: "button", className: "ghost-button danger", onClick: () => deleteMutation.mutate(label.id), disabled: deleteMutation.isPending || label.name === AMBASSADOR_LABEL_NAME, children: label.name === AMBASSADOR_LABEL_NAME ? "Reservado" : "Apagar" })] }, label.id)))) : (_jsx("div", { className: "empty-state", children: "Nenhum rotulo criado ainda." })) })) : null, _jsxs("p", { className: "panel-subcopy", children: ["Quando voce apaga um rotulo aqui, ele sai do sistema inteiro e deixa de ficar aplicado nos clientes. O rotulo ", AMBASSADOR_LABEL_NAME, " fica protegido porque alimenta a aba de acompanhamento dos embaixadores."] })] })] }));
}

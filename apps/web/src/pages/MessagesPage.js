import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, PencilLine, Trash2 } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
const emptyTemplate = {
    category: "reativacao",
    title: "",
    content: "",
};
function copyText(text) {
    navigator.clipboard.writeText(text).catch(() => undefined);
}
export function MessagesPage() {
    const { token } = useAuth();
    const queryClient = useQueryClient();
    const [draft, setDraft] = useState(emptyTemplate);
    const [editingId, setEditingId] = useState(null);
    const templatesQuery = useQuery({
        queryKey: ["message-templates"],
        queryFn: () => api.messageTemplates(token),
        enabled: Boolean(token),
    });
    const saveMutation = useMutation({
        mutationFn: async (payload) => {
            if (editingId) {
                return api.updateMessageTemplate(token, editingId, payload);
            }
            return api.createMessageTemplate(token, payload);
        },
        onSuccess: async () => {
            setDraft(emptyTemplate);
            setEditingId(null);
            await queryClient.invalidateQueries({ queryKey: ["message-templates"] });
        },
    });
    const deleteMutation = useMutation({
        mutationFn: (id) => api.deleteMessageTemplate(token, id),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["message-templates"] });
        },
    });
    const grouped = useMemo(() => templatesQuery.data ?? [], [templatesQuery.data]);
    function handleSubmit(event) {
        event.preventDefault();
        saveMutation.mutate(draft);
    }
    return (_jsxs("div", { className: "page-stack", children: [_jsxs("section", { className: "grid-two", children: [_jsxs("form", { className: "panel", onSubmit: handleSubmit, children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Biblioteca de mensagens" }), _jsx("h2", { className: "premium-header-title", children: editingId ? "Editar template" : "Criar template" })] }) }), _jsxs("div", { className: "filters-grid", children: [_jsxs("label", { children: ["Categoria", _jsxs("select", { value: draft.category, onChange: (event) => setDraft((current) => ({ ...current, category: event.target.value })), children: [_jsx("option", { value: "reativacao", children: "Reativa\u00E7\u00E3o" }), _jsx("option", { value: "follow_up", children: "Follow-up" }), _jsx("option", { value: "promocao", children: "Promo\u00E7\u00E3o" })] })] }), _jsxs("label", { className: "full-span", children: ["T\u00EDtulo", _jsx("input", { value: draft.title, onChange: (event) => setDraft((current) => ({ ...current, title: event.target.value })) })] }), _jsxs("label", { className: "full-span", children: ["Conte\u00FAdo", _jsx("textarea", { rows: 6, value: draft.content, onChange: (event) => setDraft((current) => ({ ...current, content: event.target.value })) })] })] }), _jsxs("div", { className: "inline-actions", children: [_jsx("button", { className: "primary-button", type: "submit", children: editingId ? "Salvar alterações" : "Criar template" }), editingId ? (_jsx("button", { className: "ghost-button", type: "button", onClick: () => {
                                            setEditingId(null);
                                            setDraft(emptyTemplate);
                                        }, children: "Cancelar edi\u00E7\u00E3o" })) : null] })] }), _jsxs("article", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Pr\u00E9via" }), _jsx("h3", { children: "Como o texto vai sair para o time" })] }) }), _jsx("div", { className: "message-preview", children: draft.content || "Escreva um template para visualizar aqui." })] })] }), _jsx("section", { className: "message-grid", children: grouped.map((template) => (_jsxs("article", { className: "panel message-card", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: template.category }), _jsx("h3", { children: template.title })] }) }), _jsx("p", { children: template.content }), _jsxs("div", { className: "inline-actions", children: [_jsxs("button", { className: "ghost-button", type: "button", onClick: () => copyText(template.content), children: [_jsx(Copy, { size: 16 }), "Copiar"] }), _jsxs("button", { className: "ghost-button", type: "button", onClick: () => {
                                        setEditingId(template.id);
                                        setDraft({
                                            category: template.category,
                                            title: template.title,
                                            content: template.content,
                                        });
                                    }, children: [_jsx(PencilLine, { size: 16 }), "Editar"] }), _jsxs("button", { className: "ghost-button danger", type: "button", onClick: () => deleteMutation.mutate(template.id), children: [_jsx(Trash2, { size: 16 }), "Excluir"] })] })] }, template.id))) })] }));
}

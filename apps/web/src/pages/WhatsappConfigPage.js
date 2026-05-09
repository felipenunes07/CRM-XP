import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Copy, Grid3X3, List, MoreVertical, Plus, ShieldCheck, Trash2, Upload, UserRound, X, } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
function statusLabel(status) {
    if (status === "ACTIVE") {
        return "Conectado";
    }
    if (status === "DISCONNECTED") {
        return "Desconectado";
    }
    return "Desativado";
}
function statusClass(status) {
    if (status === "ACTIVE") {
        return "connected";
    }
    if (status === "DISCONNECTED") {
        return "disconnected";
    }
    return "paused";
}
function buildCsv(instances) {
    const rows = [
        ["nome", "email", "telefone", "instancia", "status", "setor", "gestor"],
        ...instances.map((instance) => [
            instance.displayLabel,
            instance.assignedUserName ? `${instance.assignedUserName.toLocaleLowerCase("pt-BR").replace(/\s+/g, ".")}@whats.ws` : "",
            instance.phoneNumber ?? "",
            instance.instanceName,
            statusLabel(instance.status),
            "Comercial",
            instance.assignedUserName ?? "Gestor comercial",
        ]),
    ];
    return rows
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
        .join("\n");
}
function downloadCsv(instances) {
    const blob = new Blob([buildCsv(instances)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "usuarios-monitorados-whatsapp.csv";
    link.click();
    URL.revokeObjectURL(url);
}
function UserCard({ instance, onDelete, onConfigure, deleting, configuring, }) {
    const email = instance.assignedUserName?.trim()
        ? `${instance.assignedUserName.toLocaleLowerCase("pt-BR").replace(/\s+/g, ".")}@whats.ws`
        : `${instance.instanceName}@whats.ws`;
    return (_jsxs("article", { className: "wa-user-card", children: [_jsx("button", { type: "button", className: "wa-user-menu", title: "Mais opcoes", children: _jsx(MoreVertical, { size: 18 }) }), _jsxs("span", { className: "wa-user-photo", children: [instance.profilePictureUrl ? (_jsx("img", { src: instance.profilePictureUrl, alt: "", loading: "lazy", onError: (event) => {
                            event.currentTarget.style.display = "none";
                        } })) : null, _jsx(UserRound, { size: 28 })] }), _jsx("h3", { children: instance.displayLabel }), _jsx("p", { children: email }), _jsx("span", { children: instance.phoneNumber || instance.instanceName }), _jsxs("div", { className: "wa-user-tags", children: [_jsx("span", { className: "wa-user-tag", children: "Comercial" }), _jsx("span", { className: `wa-user-status ${statusClass(instance.status)}`, children: statusLabel(instance.status) })] }), _jsxs("div", { className: "wa-user-foot", children: [_jsx("button", { type: "button", className: "wa-user-configure", onClick: onConfigure, disabled: configuring, title: "Configurar Webhook e Grupos automaticamente", children: configuring ? "..." : "Configurar Agora" }), _jsx("button", { type: "button", className: "wa-user-remove", onClick: onDelete, disabled: deleting, title: "Remover usuario", children: _jsx(Trash2, { size: 15 }) })] })] }));
}
export function WhatsappConfigPage() {
    const auth = useAuth();
    const { token, user } = auth;
    const queryClient = useQueryClient();
    const [showAddModal, setShowAddModal] = useState(false);
    const [copiedWebhook, setCopiedWebhook] = useState(false);
    const [activeTab, setActiveTab] = useState("monitorados");
    const [statusFilter, setStatusFilter] = useState("all");
    const instancesQuery = useQuery({
        queryKey: ["whatsapp-instances"],
        queryFn: () => api.whatsappInstances(token),
        enabled: Boolean(token),
    });
    const deleteMutation = useMutation({
        mutationFn: (id) => api.deleteWhatsappInstance(token, id),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
        },
    });
    const configureMutation = useMutation({
        mutationFn: (id) => api.configureWhatsappInstance(token, id),
        onSuccess: () => {
            alert("Instancia configurada com sucesso na Evolution API!");
            void queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
        },
        onError: (error) => {
            alert(`Erro ao configurar instancia: ${error.message}`);
        },
    });
    const instances = instancesQuery.data ?? [];
    const connectedCount = instances.filter((instance) => instance.status === "ACTIVE").length;
    const disconnectedCount = instances.filter((instance) => instance.status === "DISCONNECTED").length;
    const pausedCount = instances.filter((instance) => instance.status === "PAUSED").length;
    const visibleInstances = useMemo(() => {
        if (activeTab === "grupos") {
            return instances;
        }
        if (activeTab !== "monitorados") {
            return [];
        }
        if (statusFilter === "all") {
            return instances;
        }
        return instances.filter((instance) => instance.status === statusFilter);
    }, [activeTab, instances, statusFilter]);
    const webhookUrl = `${window.location.origin}/api/webhooks/evolution`;
    function copyWebhook() {
        navigator.clipboard.writeText(webhookUrl).catch(() => undefined);
        setCopiedWebhook(true);
        setTimeout(() => setCopiedWebhook(false), 1800);
    }
    if (user?.role !== "ADMIN" && user?.role !== "MANAGER") {
        return (_jsx("div", { className: "page-stack", children: _jsxs("div", { className: "panel", children: [_jsx("h2", { children: "Acesso negado" }), _jsx("p", { children: "Apenas administradores e gestores podem configurar usu\u00E1rios monitorados." })] }) }));
    }
    return (_jsxs("div", { className: "wa-users-page", children: [_jsxs("header", { className: "wa-users-header", children: [_jsxs("div", { children: [_jsx("h2", { children: "Usu\u00E1rios" }), _jsx("p", { children: "Controle total sobre usu\u00E1rios monitorados, status de conex\u00E3o, setores e gestores respons\u00E1veis." })] }), _jsxs("div", { className: "wa-users-actions", children: [_jsxs("button", { type: "button", className: "wa-secondary-action", title: "Importar usuarios via CSV", children: [_jsx(Upload, { size: 16 }), "Importar via CSV"] }), _jsx("button", { type: "button", className: "wa-secondary-action", onClick: () => downloadCsv(instances), children: "Exportar como CSV" })] })] }), _jsxs("section", { className: "wa-users-toolbar", children: [_jsx("div", { className: "wa-users-tabs", role: "tablist", "aria-label": "Abas de usuarios", children: [
                            ["monitorados", "Monitorados"],
                            ["gestores", "Gestores"],
                            ["grupos", "Grupos"],
                        ].map(([id, label]) => (_jsx("button", { type: "button", className: activeTab === id ? "active" : "", onClick: () => setActiveTab(id), children: label }, id))) }), _jsx("div", { className: "wa-users-filters", children: [
                            ["all", "Grupos", instances.length],
                            ["ACTIVE", "Conectado", connectedCount],
                            ["DISCONNECTED", "Desconectado", disconnectedCount],
                            ["PAUSED", "Desativado", pausedCount],
                        ].map(([id, label, count]) => (_jsxs("button", { type: "button", className: statusFilter === id ? "active" : "", onClick: () => setStatusFilter(id), children: [label, _jsx("span", { children: count })] }, String(id)))) }), _jsxs("div", { className: "wa-users-view-actions", children: [_jsx("button", { type: "button", className: "wa-icon-button active", title: "Cards", children: _jsx(Grid3X3, { size: 18 }) }), _jsx("button", { type: "button", className: "wa-icon-button", title: "Lista", children: _jsx(List, { size: 18 }) }), _jsxs("button", { type: "button", className: "wa-add-user", onClick: () => setShowAddModal(true), children: [_jsx(Plus, { size: 17 }), "Adicionar"] })] })] }), _jsxs("section", { className: "wa-webhook-strip", children: [_jsxs("div", { children: [_jsx(ShieldCheck, { size: 20 }), _jsxs("div", { children: [_jsx("strong", { children: "Evolution API" }), _jsx("span", { children: webhookUrl })] })] }), _jsxs("button", { type: "button", className: "wa-secondary-action compact", onClick: copyWebhook, children: [copiedWebhook ? _jsx(CheckCircle2, { size: 15 }) : _jsx(Copy, { size: 15 }), copiedWebhook ? "Copiado" : "Copiar webhook"] })] }), instancesQuery.isLoading ? (_jsx("div", { className: "page-loading", children: "Carregando usu\u00E1rios monitorados..." })) : visibleInstances.length ? (_jsx("section", { className: "wa-users-grid", children: visibleInstances.map((instance) => (_jsx(UserCard, { instance: instance, deleting: deleteMutation.isPending, configuring: configureMutation.isPending && configureMutation.variables === instance.id, onDelete: () => {
                        if (confirm("Tem certeza que deseja remover este usuário monitorado?")) {
                            deleteMutation.mutate(instance.id);
                        }
                    }, onConfigure: () => {
                        configureMutation.mutate(instance.id);
                    } }, instance.id))) })) : (_jsxs("section", { className: "wa-users-empty", children: [_jsx("strong", { children: "Nenhum usu\u00E1rio nesta vis\u00E3o" }), _jsx("span", { children: "Adicione uma inst\u00E2ncia da Evolution para come\u00E7ar a monitoria." })] })), showAddModal ? _jsx(AddInstanceModal, { onClose: () => setShowAddModal(false) }) : null] }));
}
function AddInstanceModal({ onClose }) {
    const auth = useAuth();
    const queryClient = useQueryClient();
    const [instanceName, setInstanceName] = useState("");
    const [displayLabel, setDisplayLabel] = useState("");
    const [phoneNumber, setPhoneNumber] = useState("");
    const [evolutionBaseUrl, setEvolutionBaseUrl] = useState("");
    const [evolutionApiKey, setEvolutionApiKey] = useState("");
    const [isDefault, setIsDefault] = useState(false);
    const defaultsQuery = useQuery({
        queryKey: ["whatsapp-defaults"],
        queryFn: () => api.whatsappInstanceDefaults(auth.token),
        enabled: Boolean(auth.token),
        staleTime: Infinity,
    });
    useEffect(() => {
        if (defaultsQuery.data) {
            if (!evolutionBaseUrl)
                setEvolutionBaseUrl(defaultsQuery.data.baseUrl);
            if (!evolutionApiKey)
                setEvolutionApiKey(defaultsQuery.data.apiKey);
        }
    }, [defaultsQuery.data, evolutionApiKey, evolutionBaseUrl]);
    const createMutation = useMutation({
        mutationFn: () => api.createWhatsappInstance(auth.token, {
            instanceName,
            displayLabel,
            phoneNumber,
            evolutionBaseUrl,
            evolutionApiKey,
            isDefault,
        }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
            onClose();
        },
    });
    return (_jsx("div", { className: "modal-backdrop", onClick: onClose, children: _jsxs("div", { className: "modal-container pipeline-modal", onClick: (event) => event.stopPropagation(), children: [_jsxs("div", { className: "modal-header", children: [_jsx("h3", { children: "Conectar Evolution API" }), _jsx("button", { type: "button", className: "modal-close", onClick: onClose, children: _jsx(X, { size: 20 }) })] }), _jsxs("div", { className: "modal-body", children: [_jsxs("label", { children: ["Nome do usu\u00E1rio *", _jsx("input", { value: displayLabel, onChange: (event) => setDisplayLabel(event.target.value), placeholder: "Ex: Amanda Comercial" })] }), _jsxs("label", { children: ["Nome da inst\u00E2ncia *", _jsx("input", { value: instanceName, onChange: (event) => setInstanceName(event.target.value), placeholder: "Ex: comercial-amanda" })] }), _jsxs("label", { children: ["API Key *", _jsx("input", { type: "password", value: evolutionApiKey, onChange: (event) => setEvolutionApiKey(event.target.value), placeholder: "Cole a API Key" })] }), _jsxs("label", { children: ["URL Base da Evolution *", _jsx("input", { value: evolutionBaseUrl, onChange: (event) => setEvolutionBaseUrl(event.target.value), placeholder: "https://..." })] }), _jsxs("label", { children: ["Telefone", _jsx("input", { value: phoneNumber, onChange: (event) => setPhoneNumber(event.target.value), placeholder: "5511999999999" })] }), _jsxs("label", { className: "wa-checkbox-label", children: [_jsx("input", { type: "checkbox", checked: isDefault, onChange: (event) => setIsDefault(event.target.checked) }), "Definir como inst\u00E2ncia padr\u00E3o"] }), createMutation.isError ? _jsx("div", { className: "page-error", children: createMutation.error.message }) : null] }), _jsxs("div", { className: "modal-footer", children: [_jsx("button", { type: "button", className: "secondary-button", onClick: onClose, children: "Cancelar" }), _jsxs("button", { type: "button", className: "primary-button", disabled: !instanceName || !displayLabel || !evolutionBaseUrl || !evolutionApiKey || createMutation.isPending, onClick: () => createMutation.mutate(), children: [_jsx(Plus, { size: 16 }), createMutation.isPending ? "Salvando..." : "Salvar usuário"] })] })] }) }));
}

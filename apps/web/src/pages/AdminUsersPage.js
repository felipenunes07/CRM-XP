import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, RefreshCw, Save, ShieldCheck, UserX } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
const roleOptions = [
    { value: "admin", label: "Admin" },
    { value: "vendas", label: "Vendas" },
    { value: "financeiro", label: "Financeiro" },
    { value: "operacional", label: "Operacional" },
    { value: "viewer", label: "Viewer" },
];
function emptyDraft() {
    return {
        email: "",
        fullName: "",
        role: "viewer",
        isActive: true,
        permissionOverrides: [],
        password: "",
    };
}
function draftFromUser(user) {
    return {
        email: user.email,
        fullName: user.name,
        role: user.role,
        isActive: user.is_active ?? user.isActive ?? true,
        permissionOverrides: user.permission_overrides ?? [],
        password: "",
    };
}
function overrideValue(overrides, permissionKey) {
    const override = overrides.find((entry) => entry.permissionKey === permissionKey);
    if (!override)
        return "inherit";
    return override.allowed ? "allow" : "deny";
}
function setOverride(overrides, permissionKey, value) {
    const next = overrides.filter((entry) => entry.permissionKey !== permissionKey);
    if (value === "inherit")
        return next;
    return [...next, { permissionKey, allowed: value === "allow" }];
}
function permissionGroups(permissions) {
    return permissions.reduce((groups, permission) => {
        const group = permission.key.split(".")[0] ?? "geral";
        groups[group] = [...(groups[group] ?? []), permission];
        return groups;
    }, {});
}
export function AdminUsersPage() {
    const { token, refreshUser } = useAuth();
    const queryClient = useQueryClient();
    const [selectedId, setSelectedId] = useState("new");
    const [draft, setDraft] = useState(emptyDraft);
    const [resetLink, setResetLink] = useState(null);
    const usersQuery = useQuery({
        queryKey: ["admin-users"],
        queryFn: () => api.users(token),
        enabled: Boolean(token),
    });
    const permissionsQuery = useQuery({
        queryKey: ["admin-permissions"],
        queryFn: () => api.permissions(token),
        enabled: Boolean(token),
    });
    const users = usersQuery.data ?? [];
    const selectedUser = selectedId === "new" ? null : users.find((user) => user.id === selectedId) ?? null;
    const permissions = permissionsQuery.data ?? [];
    const groupedPermissions = useMemo(() => permissionGroups(permissions), [permissions]);
    useEffect(() => {
        setResetLink(null);
        setDraft(selectedUser ? draftFromUser(selectedUser) : emptyDraft());
    }, [selectedUser?.id]);
    const saveMutation = useMutation({
        mutationFn: async () => {
            if (!token)
                throw new Error("Sessao ausente");
            if (selectedId === "new") {
                return api.createUser(token, draft);
            }
            return api.updateUser(token, selectedId, draft);
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
            await refreshUser();
        },
    });
    const statusMutation = useMutation({
        mutationFn: async (input) => {
            if (!token)
                throw new Error("Sessao ausente");
            return api.setUserActive(token, input.id, input.isActive);
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
        },
    });
    const resetMutation = useMutation({
        mutationFn: async (id) => {
            if (!token)
                throw new Error("Sessao ausente");
            return api.resetUserPassword(token, id);
        },
        onSuccess: (result) => {
            setResetLink(result.actionLink);
        },
    });
    function handleSubmit(event) {
        event.preventDefault();
        setResetLink(null);
        saveMutation.mutate();
    }
    return (_jsxs("div", { className: "admin-users-page", children: [_jsxs("header", { className: "admin-users-header", children: [_jsxs("div", { children: [_jsx("h1", { children: "Gestao de usuarios" }), _jsx("p", { children: "Crie logins, defina roles e ajuste permissoes individuais sem expor controles sensiveis para usuarios comuns." })] }), _jsxs("button", { type: "button", className: "primary-button", onClick: () => setSelectedId("new"), children: [_jsx(Plus, { size: 16 }), "Novo usuario"] })] }), _jsxs("div", { className: "admin-users-layout", children: [_jsxs("aside", { className: "admin-users-list", "aria-label": "Usuarios cadastrados", children: [usersQuery.isLoading ? _jsx("span", { className: "admin-muted", children: "Carregando usuarios..." }) : null, users.map((user) => {
                                const isActive = user.is_active ?? user.isActive ?? true;
                                return (_jsxs("button", { type: "button", className: `admin-user-row ${selectedId === user.id ? "active" : ""}`, onClick: () => setSelectedId(user.id), children: [_jsxs("span", { children: [_jsx("strong", { children: user.name }), _jsx("small", { children: user.email })] }), _jsx("em", { className: isActive ? "enabled" : "disabled", children: isActive ? "Ativo" : "Inativo" })] }, user.id));
                            })] }), _jsxs("form", { className: "admin-user-editor", onSubmit: handleSubmit, children: [_jsxs("section", { className: "admin-editor-section", children: [_jsxs("div", { className: "admin-section-title", children: [_jsx(ShieldCheck, { size: 18 }), _jsx("h2", { children: selectedUser ? "Editar acesso" : "Criar usuario" })] }), _jsxs("div", { className: "admin-form-grid", children: [_jsxs("label", { children: ["Nome", _jsx("input", { value: draft.fullName, onChange: (event) => setDraft({ ...draft, fullName: event.target.value }) })] }), _jsxs("label", { children: ["Email", _jsx("input", { value: draft.email, type: "email", onChange: (event) => setDraft({ ...draft, email: event.target.value }) })] }), _jsxs("label", { children: ["Role", _jsx("select", { value: draft.role, onChange: (event) => setDraft({ ...draft, role: event.target.value }), children: roleOptions.map((role) => (_jsx("option", { value: role.value, children: role.label }, role.value))) })] }), _jsxs("label", { children: ["Status", _jsxs("select", { value: draft.isActive ? "active" : "inactive", onChange: (event) => setDraft({ ...draft, isActive: event.target.value === "active" }), children: [_jsx("option", { value: "active", children: "Ativo" }), _jsx("option", { value: "inactive", children: "Inativo" })] })] }), selectedId === "new" ? (_jsxs("label", { children: ["Senha inicial", _jsx("input", { value: draft.password ?? "", type: "password", onChange: (event) => setDraft({ ...draft, password: event.target.value }) })] })) : null] })] }), _jsxs("section", { className: "admin-editor-section", children: [_jsxs("div", { className: "admin-section-title", children: [_jsx(KeyRound, { size: 18 }), _jsx("h2", { children: "Permissoes individuais" })] }), _jsx("div", { className: "admin-permissions-grid", children: Object.entries(groupedPermissions).map(([group, groupPermissions]) => (_jsxs("div", { className: "admin-permission-group", children: [_jsx("h3", { children: group }), groupPermissions.map((permission) => (_jsxs("label", { className: "admin-permission-row", children: [_jsxs("span", { children: [_jsx("strong", { children: permission.name }), _jsx("small", { children: permission.key })] }), _jsxs("select", { value: overrideValue(draft.permissionOverrides, permission.key), onChange: (event) => setDraft({
                                                                ...draft,
                                                                permissionOverrides: setOverride(draft.permissionOverrides, permission.key, event.target.value),
                                                            }), children: [_jsx("option", { value: "inherit", children: "Padrao da role" }), _jsx("option", { value: "allow", children: "Permitir" }), _jsx("option", { value: "deny", children: "Bloquear" })] })] }, permission.key)))] }, group))) })] }), saveMutation.error ? _jsx("div", { className: "inline-error", children: String(saveMutation.error.message) }) : null, resetMutation.error ? _jsx("div", { className: "inline-error", children: String(resetMutation.error.message) }) : null, resetLink ? (_jsxs("div", { className: "admin-reset-link", children: [_jsx("strong", { children: "Link de recuperacao gerado" }), _jsx("input", { readOnly: true, value: resetLink, onFocus: (event) => event.currentTarget.select() })] })) : null, _jsxs("footer", { className: "admin-editor-actions", children: [selectedUser ? (_jsxs(_Fragment, { children: [_jsxs("button", { type: "button", className: "secondary-button", onClick: () => resetMutation.mutate(selectedUser.id), disabled: resetMutation.isPending, children: [_jsx(RefreshCw, { size: 16 }), "Resetar senha"] }), _jsxs("button", { type: "button", className: "secondary-button danger", onClick: () => statusMutation.mutate({ id: selectedUser.id, isActive: !(selectedUser.is_active ?? true) }), disabled: statusMutation.isPending, children: [_jsx(UserX, { size: 16 }), (selectedUser.is_active ?? true) ? "Desativar" : "Ativar"] })] })) : null, _jsxs("button", { type: "submit", className: "primary-button", disabled: saveMutation.isPending, children: [_jsx(Save, { size: 16 }), saveMutation.isPending ? "Salvando..." : "Salvar acesso"] })] })] })] })] }));
}

import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CheckCircle2, Copy, Eye, EyeOff, KeyRound, Mail, Plus, RefreshCw, Save, Search, ShieldCheck, SlidersHorizontal, UserRound, UserX, } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
const roleOptions = [
    { value: "admin", label: "Admin", description: "Acesso total, painel admin e configuracoes." },
    { value: "vendas", label: "Vendas", description: "Ferramentas comerciais, mensagens e relatorios." },
    { value: "financeiro", label: "Financeiro", description: "Financeiro, comprovantes, metas e relatorios." },
    { value: "operacional", label: "Operacional", description: "Rotina operacional, mensagens e integracoes." },
    { value: "viewer", label: "Viewer", description: "Apenas leitura em areas permitidas." },
];
const fallbackRole = roleOptions[roleOptions.length - 1];
const groupLabels = {
    admin: "Administracao",
    automations: "Automacoes",
    commercial: "Comercial",
    dashboard: "Dashboard",
    finance: "Financeiro",
    integrations: "Integracoes",
    messages: "Mensagens",
    reports: "Relatorios",
    settings: "Configuracoes",
};
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
function initials(name, email) {
    const source = name.trim() || email.split("@")[0] || "XP";
    return source
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("");
}
function formatDate(value) {
    if (!value)
        return "Nunca";
    return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(value));
}
function roleLabel(role) {
    return roleOptions.find((option) => option.value === role)?.label ?? role;
}
export function AdminUsersPage() {
    const { token, refreshUser } = useAuth();
    const queryClient = useQueryClient();
    const [selectedId, setSelectedId] = useState("new");
    const [draft, setDraft] = useState(emptyDraft);
    const [resetLink, setResetLink] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [showCreatePassword, setShowCreatePassword] = useState(false);
    const [showTemporaryPassword, setShowTemporaryPassword] = useState(false);
    const [temporaryPassword, setTemporaryPassword] = useState("");
    const [passwordSaved, setPasswordSaved] = useState(false);
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
    const selectedRole = roleOptions.find((role) => role.value === draft.role) ?? fallbackRole;
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const filteredUsers = users.filter((user) => {
        const target = `${user.name} ${user.email} ${user.role}`.toLowerCase();
        return !normalizedSearch || target.includes(normalizedSearch);
    });
    const activeCount = users.filter((user) => user.is_active ?? user.isActive ?? true).length;
    const adminCount = users.filter((user) => user.role === "admin").length;
    const allowedOverrides = draft.permissionOverrides.filter((entry) => entry.allowed).length;
    const deniedOverrides = draft.permissionOverrides.filter((entry) => !entry.allowed).length;
    const effectivePermissionCount = selectedUser?.permissions?.length ?? 0;
    useEffect(() => {
        setResetLink(null);
        setTemporaryPassword("");
        setPasswordSaved(false);
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
        onSuccess: async (savedUsers) => {
            await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
            await refreshUser();
            const savedUser = savedUsers.find((user) => user.email.toLowerCase() === draft.email.toLowerCase());
            if (savedUser) {
                setSelectedId(savedUser.id);
            }
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
    const passwordMutation = useMutation({
        mutationFn: async () => {
            if (!token)
                throw new Error("Sessao ausente");
            if (!selectedUser)
                throw new Error("Selecione um usuario");
            return api.setUserPassword(token, selectedUser.id, temporaryPassword);
        },
        onSuccess: () => {
            setPasswordSaved(true);
        },
    });
    function handleSubmit(event) {
        event.preventDefault();
        setResetLink(null);
        saveMutation.mutate();
    }
    return (_jsxs("div", { className: "admin-users-page", children: [_jsxs("header", { className: "admin-access-header", children: [_jsxs("div", { children: [_jsx("span", { className: "admin-access-eyebrow", children: "Admin / Acessos do CRM" }), _jsx("h1", { children: "Gestao de acessos" }), _jsx("p", { children: "Crie logins, escolha a role base e use excecoes individuais apenas quando necessario." })] }), _jsxs("button", { type: "button", className: "primary-button admin-new-user-button", onClick: () => setSelectedId("new"), children: [_jsx(Plus, { size: 16 }), "Novo acesso"] })] }), _jsxs("section", { className: "admin-access-summary", "aria-label": "Resumo de acessos", children: [_jsxs("div", { children: [_jsx("span", { children: "Total de usuarios" }), _jsx("strong", { children: users.length })] }), _jsxs("div", { children: [_jsx("span", { children: "Ativos" }), _jsx("strong", { children: activeCount })] }), _jsxs("div", { children: [_jsx("span", { children: "Admins" }), _jsx("strong", { children: adminCount })] }), _jsxs("div", { children: [_jsx("span", { children: "Permissoes" }), _jsx("strong", { children: permissions.length })] })] }), _jsxs("div", { className: "admin-users-workspace", children: [_jsxs("aside", { className: "admin-directory", "aria-label": "Usuarios cadastrados", children: [_jsxs("div", { className: "admin-directory-header", children: [_jsxs("div", { children: [_jsx("h2", { children: "Usuarios" }), _jsxs("span", { children: [filteredUsers.length, " encontrados"] })] }), _jsx("button", { type: "button", className: "admin-icon-button", onClick: () => usersQuery.refetch(), title: "Atualizar lista", children: _jsx(RefreshCw, { size: 16 }) })] }), _jsxs("label", { className: "admin-search", children: [_jsx(Search, { size: 16 }), _jsx("input", { value: searchTerm, onChange: (event) => setSearchTerm(event.target.value), placeholder: "Buscar nome, email ou role" })] }), _jsxs("div", { className: "admin-user-list", children: [usersQuery.isLoading ? _jsx("span", { className: "admin-muted", children: "Carregando usuarios..." }) : null, !usersQuery.isLoading && filteredUsers.length === 0 ? (_jsx("span", { className: "admin-empty-state", children: "Nenhum usuario encontrado." })) : null, filteredUsers.map((user) => {
                                        const isActive = user.is_active ?? user.isActive ?? true;
                                        return (_jsxs("button", { type: "button", className: `admin-user-row ${selectedId === user.id ? "active" : ""}`, onClick: () => setSelectedId(user.id), children: [_jsx("span", { className: "admin-user-avatar", children: initials(user.name, user.email) }), _jsxs("span", { className: "admin-user-main", children: [_jsx("strong", { children: user.name }), _jsx("small", { children: user.email })] }), _jsxs("span", { className: "admin-user-meta", children: [_jsx("em", { className: isActive ? "enabled" : "disabled", children: isActive ? "Ativo" : "Inativo" }), _jsx("small", { children: roleLabel(user.role) })] })] }, user.id));
                                    })] })] }), _jsxs("form", { className: "admin-access-editor", onSubmit: handleSubmit, children: [_jsxs("section", { className: "admin-editor-hero", children: [_jsxs("div", { className: "admin-editor-identity", children: [_jsx("span", { className: `admin-editor-avatar ${draft.isActive ? "" : "inactive"}`, children: selectedUser ? initials(selectedUser.name, selectedUser.email) : _jsx(UserRound, { size: 22 }) }), _jsxs("div", { children: [_jsx("span", { children: selectedUser ? "Editando acesso" : "Novo acesso" }), _jsx("h2", { children: draft.fullName || "Usuario sem nome" }), _jsx("p", { children: draft.email || "Informe email, senha inicial e role para criar o login." })] })] }), _jsxs("div", { className: "admin-editor-badges", children: [_jsxs("span", { className: draft.isActive ? "enabled" : "disabled", children: [draft.isActive ? _jsx(CheckCircle2, { size: 14 }) : _jsx(Ban, { size: 14 }), draft.isActive ? "Ativo" : "Inativo"] }), _jsxs("span", { children: [_jsx(ShieldCheck, { size: 14 }), roleLabel(draft.role)] }), selectedUser ? _jsxs("span", { children: [effectivePermissionCount, " permissoes efetivas"] }) : null] })] }), _jsxs("section", { className: "admin-editor-panel", children: [_jsxs("div", { className: "admin-section-title", children: [_jsx(Mail, { size: 18 }), _jsxs("div", { children: [_jsx("h3", { children: "Dados de login" }), _jsx("p", { children: "Essas informacoes definem a conta de acesso ao CRM." })] })] }), _jsxs("div", { className: "admin-form-grid", children: [_jsxs("label", { children: ["Nome completo", _jsx("input", { value: draft.fullName, required: true, autoComplete: "name", onChange: (event) => setDraft({ ...draft, fullName: event.target.value }), placeholder: "Ex.: Maria Oliveira" })] }), _jsxs("label", { children: ["Email de login", _jsx("input", { value: draft.email, required: true, type: "email", autoComplete: "email", onChange: (event) => setDraft({ ...draft, email: event.target.value }), placeholder: "nome@empresa.com" })] }), _jsxs("label", { children: ["Role base", _jsx("select", { value: draft.role, onChange: (event) => setDraft({ ...draft, role: event.target.value }), children: roleOptions.map((role) => (_jsx("option", { value: role.value, children: role.label }, role.value))) }), _jsx("small", { children: selectedRole.description })] }), _jsxs("label", { children: ["Status da conta", _jsxs("select", { value: draft.isActive ? "active" : "inactive", onChange: (event) => setDraft({ ...draft, isActive: event.target.value === "active" }), children: [_jsx("option", { value: "active", children: "Ativo" }), _jsx("option", { value: "inactive", children: "Inativo" })] }), _jsx("small", { children: "Usuarios inativos nao conseguem acessar o sistema." })] }), selectedId === "new" ? (_jsxs("label", { children: ["Senha inicial", _jsxs("span", { className: "admin-password-control", children: [_jsx("input", { value: draft.password ?? "", required: true, minLength: 6, type: showCreatePassword ? "text" : "password", autoComplete: "new-password", onChange: (event) => setDraft({ ...draft, password: event.target.value }), placeholder: "Minimo 6 caracteres" }), _jsx("button", { type: "button", onClick: () => setShowCreatePassword((current) => !current), title: showCreatePassword ? "Ocultar senha" : "Mostrar senha", children: showCreatePassword ? _jsx(EyeOff, { size: 16 }) : _jsx(Eye, { size: 16 }) }), _jsx("button", { type: "button", onClick: () => navigator.clipboard?.writeText(draft.password ?? ""), title: "Copiar senha inicial", children: _jsx(Copy, { size: 15 }) })] }), _jsx("small", { children: "Essa senha pode ser vista aqui apenas enquanto voce cria o login." })] })) : (_jsxs("label", { children: ["Ultimo acesso", _jsx("input", { readOnly: true, value: formatDate(selectedUser?.last_sign_in_at) })] }))] })] }), selectedUser ? (_jsxs("section", { className: "admin-editor-panel", children: [_jsxs("div", { className: "admin-section-title", children: [_jsx(KeyRound, { size: 18 }), _jsxs("div", { children: [_jsx("h3", { children: "Senha temporaria" }), _jsx("p", { children: "Senha atual nao pode ser exibida. Defina uma nova senha quando precisar entregar acesso ao usuario." })] })] }), _jsxs("div", { className: "admin-password-reset-row", children: [_jsxs("label", { children: ["Nova senha", _jsxs("span", { className: "admin-password-control", children: [_jsx("input", { value: temporaryPassword, minLength: 6, type: showTemporaryPassword ? "text" : "password", autoComplete: "new-password", onChange: (event) => {
                                                                    setPasswordSaved(false);
                                                                    setTemporaryPassword(event.target.value);
                                                                }, placeholder: "Digite uma nova senha temporaria" }), _jsx("button", { type: "button", onClick: () => setShowTemporaryPassword((current) => !current), title: showTemporaryPassword ? "Ocultar senha" : "Mostrar senha", children: showTemporaryPassword ? _jsx(EyeOff, { size: 16 }) : _jsx(Eye, { size: 16 }) }), _jsx("button", { type: "button", onClick: () => navigator.clipboard?.writeText(temporaryPassword), title: "Copiar senha temporaria", children: _jsx(Copy, { size: 15 }) })] })] }), _jsxs("button", { type: "button", className: "secondary-button", disabled: temporaryPassword.trim().length < 6 || passwordMutation.isPending, onClick: () => passwordMutation.mutate(), children: [_jsx(Save, { size: 16 }), "Salvar nova senha"] })] }), passwordSaved ? _jsx("div", { className: "admin-success-message", children: "Nova senha salva. Ela nao sera exibida novamente depois que voce sair desta tela." }) : null, passwordMutation.error ? _jsx("div", { className: "inline-error", children: String(passwordMutation.error.message) }) : null] })) : null, _jsxs("section", { className: "admin-editor-panel", children: [_jsxs("div", { className: "admin-permission-heading", children: [_jsxs("div", { className: "admin-section-title", children: [_jsx(KeyRound, { size: 18 }), _jsxs("div", { children: [_jsx("h3", { children: "Permissoes individuais" }), _jsx("p", { children: "Automatico usa o acesso do cargo escolhido. Use Liberar ou Bloquear apenas para excecoes." })] })] }), _jsxs("div", { className: "admin-override-summary", children: [_jsxs("span", { children: [allowedOverrides, " extras"] }), _jsxs("span", { children: [deniedOverrides, " bloqueios"] })] })] }), _jsx("div", { className: "admin-permissions-grid", children: Object.entries(groupedPermissions).map(([group, groupPermissions]) => (_jsxs("div", { className: "admin-permission-group", children: [_jsxs("div", { className: "admin-permission-group-title", children: [_jsx(SlidersHorizontal, { size: 15 }), _jsx("h4", { children: groupLabels[group] ?? group })] }), groupPermissions.map((permission) => {
                                                    const currentValue = overrideValue(draft.permissionOverrides, permission.key);
                                                    return (_jsxs("div", { className: "admin-permission-row", children: [_jsxs("span", { children: [_jsx("strong", { children: permission.name }), _jsx("small", { children: permission.description || permission.key })] }), _jsx("div", { className: "admin-permission-toggle", role: "group", "aria-label": `Permissao ${permission.name}`, children: ["inherit", "allow", "deny"].map((value) => (_jsx("button", { type: "button", className: currentValue === value ? "active" : "", onClick: () => setDraft({
                                                                        ...draft,
                                                                        permissionOverrides: setOverride(draft.permissionOverrides, permission.key, value),
                                                                    }), children: value === "inherit" ? "Automatico" : value === "allow" ? "Liberar" : "Bloquear" }, value))) })] }, permission.key));
                                                })] }, group))) })] }), saveMutation.error ? _jsx("div", { className: "inline-error", children: String(saveMutation.error.message) }) : null, resetMutation.error ? _jsx("div", { className: "inline-error", children: String(resetMutation.error.message) }) : null, resetLink ? (_jsxs("div", { className: "admin-reset-link", children: [_jsxs("div", { children: [_jsx("strong", { children: "Link de recuperacao gerado" }), _jsx("span", { children: "Envie este link para o usuario redefinir a senha." })] }), _jsx("input", { readOnly: true, value: resetLink, onFocus: (event) => event.currentTarget.select() }), _jsxs("button", { type: "button", className: "secondary-button", onClick: () => navigator.clipboard?.writeText(resetLink), children: [_jsx(Copy, { size: 15 }), "Copiar"] })] })) : null, _jsxs("footer", { className: "admin-editor-actions", children: [selectedUser ? (_jsxs("div", { className: "admin-secondary-actions", children: [_jsxs("button", { type: "button", className: "secondary-button", onClick: () => resetMutation.mutate(selectedUser.id), disabled: resetMutation.isPending, children: [_jsx(RefreshCw, { size: 16 }), "Resetar senha"] }), _jsxs("button", { type: "button", className: "secondary-button danger", onClick: () => statusMutation.mutate({ id: selectedUser.id, isActive: !(selectedUser.is_active ?? true) }), disabled: statusMutation.isPending, children: [_jsx(UserX, { size: 16 }), (selectedUser.is_active ?? true) ? "Desativar" : "Ativar"] })] })) : (_jsx("span", { className: "admin-form-hint", children: "O usuario recebera acesso com a senha inicial informada." })), _jsxs("button", { type: "submit", className: "primary-button", disabled: saveMutation.isPending, children: [_jsx(Save, { size: 16 }), saveMutation.isPending ? "Salvando..." : selectedUser ? "Salvar alteracoes" : "Criar acesso"] })] })] })] })] }));
}

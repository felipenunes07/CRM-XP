import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  Users,
  UserX,
} from "lucide-react";
import { useAuth, type AppRole } from "../hooks/useAuth";
import { api, type AdminUser, type AdminUserInput, type PermissionDefinition, type UserPermissionOverride } from "../lib/api";
import { navigationAccessFolders, navigationPermissionKeys } from "../lib/navigationPermissions";

const roleOptions: Array<{ value: AppRole; label: string; description: string }> = [
  { value: "admin", label: "Admin", description: "Modelo com acesso total. Bloqueios individuais continuam valendo." },
  { value: "vendas", label: "Vendas", description: "Modelo para vendedoras, com ferramentas comerciais, mensagens e relatorios." },
  { value: "financeiro", label: "Financeiro", description: "Financeiro, comprovantes, metas e relatorios." },
  { value: "operacional", label: "Operacional", description: "Rotina operacional, mensagens e integracoes." },
  { value: "viewer", label: "Viewer", description: "Apenas leitura em areas permitidas." },
];

const fallbackRole = roleOptions[roleOptions.length - 1]!;

const groupLabels: Record<string, string> = {
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

function emptyDraft(): AdminUserInput {
  return {
    email: "",
    fullName: "",
    role: "viewer",
    isActive: true,
    permissionOverrides: [],
    password: "",
  };
}

function draftFromUser(user: AdminUser): AdminUserInput {
  return {
    email: user.email,
    fullName: user.name,
    role: user.role,
    isActive: user.is_active ?? user.isActive ?? true,
    permissionOverrides: user.permission_overrides ?? [],
    password: "",
  };
}

function overrideValue(overrides: UserPermissionOverride[], permissionKey: string) {
  const override = overrides.find((entry) => entry.permissionKey === permissionKey);
  if (!override) return "inherit";
  return override.allowed ? "allow" : "deny";
}

function setOverride(
  overrides: UserPermissionOverride[],
  permissionKey: string,
  value: "inherit" | "allow" | "deny",
) {
  const next = overrides.filter((entry) => entry.permissionKey !== permissionKey);
  if (value === "inherit") return next;
  return [...next, { permissionKey, allowed: value === "allow" }];
}

type OverrideChoice = "inherit" | "allow" | "deny";

function folderOverrideValue(overrides: UserPermissionOverride[], permissionKeys: string[]): OverrideChoice | "mixed" {
  const values = new Set(permissionKeys.map((permissionKey) => overrideValue(overrides, permissionKey)));
  return values.size === 1 ? (Array.from(values)[0] as OverrideChoice) : "mixed";
}

function setFolderOverrides(
  overrides: UserPermissionOverride[],
  permissionKeys: string[],
  value: OverrideChoice,
) {
  return permissionKeys.reduce((next, permissionKey) => setOverride(next, permissionKey, value), overrides);
}

function permissionGroups(permissions: PermissionDefinition[]) {
  return permissions.reduce<Record<string, PermissionDefinition[]>>((groups, permission) => {
    const group = permission.key.split(".")[0] ?? "geral";
    groups[group] = [...(groups[group] ?? []), permission];
    return groups;
  }, {});
}

function initials(name: string, email: string) {
  const source = name.trim() || email.split("@")[0] || "XP";
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function formatDate(value?: string | null) {
  if (!value) return "Nunca";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function roleLabel(role: AppRole) {
  return roleOptions.find((option) => option.value === role)?.label ?? role;
}

export function AdminUsersPage() {
  const { token, user: currentUser, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | "new">("new");
  const [draft, setDraft] = useState<AdminUserInput>(emptyDraft);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [showTemporaryPassword, setShowTemporaryPassword] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api.users(token!),
    enabled: Boolean(token),
  });

  const permissionsQuery = useQuery({
    queryKey: ["admin-permissions"],
    queryFn: () => api.permissions(token!),
    enabled: Boolean(token),
  });

  const users = usersQuery.data ?? [];
  const selectedUser = selectedId === "new" ? null : users.find((user) => user.id === selectedId) ?? null;
  const permissions = permissionsQuery.data ?? [];
  const isEditingOwnAccess = Boolean(selectedUser && selectedUser.id === currentUser?.id);
  const permissionDefinitions = useMemo(
    () => new Map(permissions.map((permission) => [permission.key, permission])),
    [permissions],
  );
  const groupedPermissions = useMemo(
    () => permissionGroups(permissions.filter((permission) => !navigationPermissionKeys.has(permission.key))),
    [permissions],
  );
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
    setToastMessage(null);
    setDraft(selectedUser ? draftFromUser(selectedUser) : emptyDraft());
  }, [selectedUser?.id]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Sessao ausente");
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
      setToastMessage(selectedId === "new" ? "Acesso criado com sucesso!" : "Alterações salvas com sucesso!");
    },
    onError: (err: any) => {
      setToastMessage(`Erro ao salvar: ${err.message}`);
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (input: { id: string; isActive: boolean }) => {
      if (!token) throw new Error("Sessao ausente");
      return api.setUserActive(token, input.id, input.isActive);
    },
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setToastMessage(variables.isActive ? "Usuário ativado com sucesso!" : "Usuário desativado com sucesso!");
    },
    onError: (err: any) => {
      setToastMessage(`Erro ao alterar status: ${err.message}`);
    },
  });

  const resetMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!token) throw new Error("Sessao ausente");
      return api.resetUserPassword(token, id);
    },
    onSuccess: (result) => {
      setResetLink(result.actionLink);
      setToastMessage("Link de recuperação gerado!");
    },
    onError: (err: any) => {
      setToastMessage(`Erro ao resetar senha: ${err.message}`);
    },
  });

  const passwordMutation = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Sessao ausente");
      if (!selectedUser) throw new Error("Selecione um usuario");
      return api.setUserPassword(token, selectedUser.id, temporaryPassword);
    },
    onSuccess: () => {
      setPasswordSaved(true);
      setToastMessage("Nova senha salva com sucesso!");
    },
    onError: (err: any) => {
      setToastMessage(`Erro ao salvar nova senha: ${err.message}`);
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setResetLink(null);
    saveMutation.mutate();
  }

  return (
    <div className="admin-users-page">
      <header className="admin-access-header">
        <div>
          <span className="admin-access-eyebrow">Admin / Acessos do CRM</span>
          <h1>Gestao de acessos</h1>
          <p>Crie logins, escolha a role base e use excecoes individuais apenas quando necessario.</p>
        </div>
        <button type="button" className="primary-button admin-new-user-button" onClick={() => setSelectedId("new")}>
          <Plus size={16} />
          Novo acesso
        </button>
      </header>

      <section className="admin-access-summary" aria-label="Resumo de acessos">
        <div>
          <span>Total de usuarios</span>
          <strong>{users.length}</strong>
        </div>
        <div>
          <span>Ativos</span>
          <strong>{activeCount}</strong>
        </div>
        <div>
          <span>Admins</span>
          <strong>{adminCount}</strong>
        </div>
        <div>
          <span>Permissoes</span>
          <strong>{permissions.length}</strong>
        </div>
      </section>

      <div className="admin-users-workspace">
        <aside className="admin-directory" aria-label="Usuarios cadastrados">
          <div className="admin-directory-header">
            <div>
              <h2>Usuarios</h2>
              <span>{filteredUsers.length} encontrados</span>
            </div>
            <button type="button" className="admin-icon-button" onClick={() => usersQuery.refetch()} title="Atualizar lista">
              <RefreshCw size={16} />
            </button>
          </div>

          <label className="admin-search">
            <Search size={16} />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar nome, email ou role"
            />
          </label>

          <div className="admin-user-list">
            {usersQuery.isLoading ? <span className="admin-muted">Carregando usuarios...</span> : null}
            {!usersQuery.isLoading && filteredUsers.length === 0 ? (
              <span className="admin-empty-state">Nenhum usuario encontrado.</span>
            ) : null}
            {filteredUsers.map((user) => {
              const isActive = user.is_active ?? user.isActive ?? true;
              return (
                <button
                  key={user.id}
                  type="button"
                  className={`admin-user-row ${selectedId === user.id ? "active" : ""}`}
                  onClick={() => setSelectedId(user.id)}
                >
                  <span className="admin-user-avatar">{initials(user.name, user.email)}</span>
                  <span className="admin-user-main">
                    <strong>{user.name}</strong>
                    <small>{user.email}</small>
                  </span>
                  <span className="admin-user-meta">
                    <em className={isActive ? "enabled" : "disabled"}>{isActive ? "Ativo" : "Inativo"}</em>
                    <small>{roleLabel(user.role)}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <form className="admin-access-editor" onSubmit={handleSubmit}>
          <section className="admin-editor-hero">
            <div className="admin-editor-identity">
              <span className={`admin-editor-avatar ${draft.isActive ? "" : "inactive"}`}>
                {selectedUser ? initials(selectedUser.name, selectedUser.email) : <UserRound size={22} />}
              </span>
              <div>
                <span>{selectedUser ? "Editando acesso" : "Novo acesso"}</span>
                <h2>{draft.fullName || "Usuario sem nome"}</h2>
                <p>{draft.email || "Informe email, senha inicial e role para criar o login."}</p>
              </div>
            </div>
            <div className="admin-editor-badges">
              <span className={draft.isActive ? "enabled" : "disabled"}>
                {draft.isActive ? <CheckCircle2 size={14} /> : <Ban size={14} />}
                {draft.isActive ? "Ativo" : "Inativo"}
              </span>
              <span>
                <ShieldCheck size={14} />
                {roleLabel(draft.role)}
              </span>
              {selectedUser ? <span>{effectivePermissionCount} permissoes efetivas</span> : null}
            </div>
          </section>

          <section className="admin-editor-panel">
            <div className="admin-section-title">
              <Mail size={18} />
              <div>
                <h3>Dados de login</h3>
                <p>Essas informacoes definem a conta de acesso ao CRM.</p>
              </div>
            </div>

            <div className="admin-form-grid">
              <label>
                Nome completo
                <input
                  value={draft.fullName}
                  required
                  autoComplete="name"
                  onChange={(event) => setDraft({ ...draft, fullName: event.target.value })}
                  placeholder="Ex.: Maria Oliveira"
                />
              </label>
              <label>
                Email de login
                <input
                  value={draft.email}
                  required
                  type="email"
                  autoComplete="email"
                  onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                  placeholder="nome@empresa.com"
                />
              </label>
              <label>
                Role base
                <select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as AppRole })}>
                  {roleOptions.map((role) => (
                    <option key={role.value} value={role.value}>{role.label}</option>
                  ))}
                </select>
                <small>{selectedRole.description}</small>
              </label>
              <label>
                Status da conta
                <select
                  value={draft.isActive ? "active" : "inactive"}
                  onChange={(event) => setDraft({ ...draft, isActive: event.target.value === "active" })}
                >
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </select>
                <small>Usuarios inativos nao conseguem acessar o sistema.</small>
              </label>
              {selectedId === "new" ? (
                <label>
                  Senha inicial
                  <span className="admin-password-control">
                    <input
                      value={draft.password ?? ""}
                      required
                      minLength={6}
                      type={showCreatePassword ? "text" : "password"}
                      autoComplete="new-password"
                      onChange={(event) => setDraft({ ...draft, password: event.target.value })}
                      placeholder="Minimo 6 caracteres"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCreatePassword((current) => !current)}
                      title={showCreatePassword ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {showCreatePassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(draft.password ?? "")}
                      title="Copiar senha inicial"
                    >
                      <Copy size={15} />
                    </button>
                  </span>
                  <small>Essa senha pode ser vista aqui apenas enquanto voce cria o login.</small>
                </label>
              ) : (
                <label>
                  Ultimo acesso
                  <input readOnly value={formatDate(selectedUser?.last_sign_in_at)} />
                </label>
              )}
            </div>
          </section>

          {selectedUser ? (
            <section className="admin-editor-panel">
              <div className="admin-section-title">
                <KeyRound size={18} />
                <div>
                  <h3>Senha temporaria</h3>
                  <p>Senha atual nao pode ser exibida. Defina uma nova senha quando precisar entregar acesso ao usuario.</p>
                </div>
              </div>
              <div className="admin-password-reset-row">
                <label>
                  Nova senha
                  <span className="admin-password-control">
                    <input
                      value={temporaryPassword}
                      minLength={6}
                      type={showTemporaryPassword ? "text" : "password"}
                      autoComplete="new-password"
                      onChange={(event) => {
                        setPasswordSaved(false);
                        setTemporaryPassword(event.target.value);
                      }}
                      placeholder="Digite uma nova senha temporaria"
                    />
                    <button
                      type="button"
                      onClick={() => setShowTemporaryPassword((current) => !current)}
                      title={showTemporaryPassword ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {showTemporaryPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(temporaryPassword)}
                      title="Copiar senha temporaria"
                    >
                      <Copy size={15} />
                    </button>
                  </span>
                </label>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={temporaryPassword.trim().length < 6 || passwordMutation.isPending}
                  onClick={() => passwordMutation.mutate()}
                >
                  <Save size={16} />
                  Salvar nova senha
                </button>
              </div>
              {passwordSaved ? <div className="admin-success-message">Nova senha salva. Ela nao sera exibida novamente depois que voce sair desta tela.</div> : null}
              {passwordMutation.error ? <div className="inline-error">{String(passwordMutation.error.message)}</div> : null}
            </section>
          ) : null}

          <section className="admin-editor-panel">
            <div className="admin-permission-heading">
              <div className="admin-section-title">
                <SlidersHorizontal size={18} />
                <div>
                  <h3>Acessos do menu</h3>
                  <p>Controle uma pasta inteira ou cada tela separadamente. Automatico segue a role base.</p>
                </div>
              </div>
              <div className="admin-override-summary">
                <span>{allowedOverrides} extras</span>
                <span>{deniedOverrides} bloqueios</span>
              </div>
            </div>

            <div className="admin-menu-access-grid">
              {navigationAccessFolders.map((folder) => {
                const folderPermissionKeys = folder.items.map((item) => item.permissionKey);
                const folderValue = folderOverrideValue(draft.permissionOverrides, folderPermissionKeys);
                return (
                  <div key={folder.key} className="admin-menu-folder">
                    <div className="admin-menu-folder-header">
                      <div>
                        <h4>{folder.label}</h4>
                        <p>{folder.description}</p>
                      </div>
                      <div className="admin-permission-toggle" role="group" aria-label={`Pasta ${folder.label}`}>
                        {(["inherit", "allow", "deny"] as const).map((value) => (
                          <button
                            key={value}
                            type="button"
                            className={folderValue === value ? "active" : ""}
                            onClick={() =>
                              setDraft({
                                ...draft,
                                permissionOverrides: setFolderOverrides(
                                  draft.permissionOverrides,
                                  value === "deny" && isEditingOwnAccess
                                    ? folderPermissionKeys.filter((key) => key !== "admin.users.manage")
                                    : folderPermissionKeys,
                                  value,
                                ),
                              })
                            }
                          >
                            {value === "inherit" ? "Automatico" : value === "allow" ? "Liberar pasta" : "Bloquear pasta"}
                          </button>
                        ))}
                      </div>
                    </div>
                    {folderValue === "mixed" ? (
                      <span className="admin-menu-folder-summary">Acessos personalizados por tela</span>
                    ) : null}
                    <div className="admin-menu-folder-items">
                      {folder.items.map((item) => {
                        const permission = permissionDefinitions.get(item.permissionKey);
                        const currentValue = overrideValue(draft.permissionOverrides, item.permissionKey);
                        return (
                          <div key={item.permissionKey} className="admin-permission-row">
                            <span>
                              <strong>{item.label}</strong>
                              <small>{permission?.description || item.path}</small>
                            </span>
                            <div className="admin-permission-toggle" role="group" aria-label={`Tela ${item.label}`}>
                              {(["inherit", "allow", "deny"] as const).map((value) => (
                                <button
                                  key={value}
                                  type="button"
                                  className={currentValue === value ? "active" : ""}
                                  disabled={
                                    value === "deny"
                                    && isEditingOwnAccess
                                    && item.permissionKey === "admin.users.manage"
                                  }
                                  title={
                                    value === "deny"
                                    && isEditingOwnAccess
                                    && item.permissionKey === "admin.users.manage"
                                      ? "Outro administrador precisa remover este acesso."
                                      : undefined
                                  }
                                  onClick={() =>
                                    setDraft({
                                      ...draft,
                                      permissionOverrides: setOverride(
                                        draft.permissionOverrides,
                                        item.permissionKey,
                                        value,
                                      ),
                                    })
                                  }
                                >
                                  {value === "inherit" ? "Automatico" : value === "allow" ? "Liberar" : "Bloquear"}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="admin-editor-panel">
            <div className="admin-section-title">
              <KeyRound size={18} />
              <div>
                <h3>Permissoes avancadas</h3>
                <p>Ajuste acoes de gestao e configuracoes que nao correspondem a uma tela do menu.</p>
              </div>
            </div>

            <div className="admin-permissions-grid">
              {Object.entries(groupedPermissions).map(([group, groupPermissions]) => (
                <div key={group} className="admin-permission-group">
                  <div className="admin-permission-group-title">
                    <SlidersHorizontal size={15} />
                    <h4>{groupLabels[group] ?? group}</h4>
                  </div>
                  {groupPermissions.map((permission) => {
                    const currentValue = overrideValue(draft.permissionOverrides, permission.key);
                    return (
                      <div key={permission.key} className="admin-permission-row">
                        <span>
                          <strong>{permission.name}</strong>
                          <small>{permission.description || permission.key}</small>
                        </span>
                        <div className="admin-permission-toggle" role="group" aria-label={`Permissao ${permission.name}`}>
                          {(["inherit", "allow", "deny"] as const).map((value) => (
                            <button
                              key={value}
                              type="button"
                              className={currentValue === value ? "active" : ""}
                              onClick={() =>
                                setDraft({
                                  ...draft,
                                  permissionOverrides: setOverride(draft.permissionOverrides, permission.key, value),
                                })
                              }
                            >
                              {value === "inherit" ? "Automatico" : value === "allow" ? "Liberar" : "Bloquear"}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>

          {saveMutation.error ? <div className="inline-error">{String(saveMutation.error.message)}</div> : null}
          {resetMutation.error ? <div className="inline-error">{String(resetMutation.error.message)}</div> : null}
          {resetLink ? (
            <div className="admin-reset-link">
              <div>
                <strong>Link de recuperacao gerado</strong>
                <span>Envie este link para o usuario redefinir a senha.</span>
              </div>
              <input readOnly value={resetLink} onFocus={(event) => event.currentTarget.select()} />
              <button type="button" className="secondary-button" onClick={() => navigator.clipboard?.writeText(resetLink)}>
                <Copy size={15} />
                Copiar
              </button>
            </div>
          ) : null}

          <footer className="admin-editor-actions">
            {selectedUser ? (
              <div className="admin-secondary-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => resetMutation.mutate(selectedUser.id)}
                  disabled={resetMutation.isPending}
                >
                  <RefreshCw size={16} />
                  Resetar senha
                </button>
                <button
                  type="button"
                  className="secondary-button danger"
                  onClick={() => statusMutation.mutate({ id: selectedUser.id, isActive: !(selectedUser.is_active ?? true) })}
                  disabled={statusMutation.isPending}
                >
                  <UserX size={16} />
                  {(selectedUser.is_active ?? true) ? "Desativar" : "Ativar"}
                </button>
              </div>
            ) : (
              <span className="admin-form-hint">O usuario recebera acesso com a senha inicial informada.</span>
            )}
            <button type="submit" className="primary-button" disabled={saveMutation.isPending}>
              <Save size={16} />
              {saveMutation.isPending ? "Salvando..." : selectedUser ? "Salvar alteracoes" : "Criar acesso"}
            </button>
          </footer>
        </form>
      </div>
      {toastMessage ? (
        <div className="idea-canvas-toast" style={{ background: "rgba(47, 157, 103, 0.96)" }}>
          <span>{toastMessage}</span>
          <button type="button" className="ghost-button icon-only" onClick={() => setToastMessage(null)} style={{ color: "white" }}>
            Fechar
          </button>
        </div>
      ) : null}
    </div>
  );
}

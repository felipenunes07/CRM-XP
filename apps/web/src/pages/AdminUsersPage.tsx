import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, RefreshCw, Save, ShieldCheck, UserX } from "lucide-react";
import { useAuth, type AppRole } from "../hooks/useAuth";
import { api, type AdminUser, type AdminUserInput, type PermissionDefinition, type UserPermissionOverride } from "../lib/api";

const roleOptions: Array<{ value: AppRole; label: string }> = [
  { value: "admin", label: "Admin" },
  { value: "vendas", label: "Vendas" },
  { value: "financeiro", label: "Financeiro" },
  { value: "operacional", label: "Operacional" },
  { value: "viewer", label: "Viewer" },
];

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

function permissionGroups(permissions: PermissionDefinition[]) {
  return permissions.reduce<Record<string, PermissionDefinition[]>>((groups, permission) => {
    const group = permission.key.split(".")[0] ?? "geral";
    groups[group] = [...(groups[group] ?? []), permission];
    return groups;
  }, {});
}

export function AdminUsersPage() {
  const { token, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | "new">("new");
  const [draft, setDraft] = useState<AdminUserInput>(emptyDraft);
  const [resetLink, setResetLink] = useState<string | null>(null);

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
  const groupedPermissions = useMemo(() => permissionGroups(permissions), [permissions]);

  useEffect(() => {
    setResetLink(null);
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      await refreshUser();
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (input: { id: string; isActive: boolean }) => {
      if (!token) throw new Error("Sessao ausente");
      return api.setUserActive(token, input.id, input.isActive);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!token) throw new Error("Sessao ausente");
      return api.resetUserPassword(token, id);
    },
    onSuccess: (result) => {
      setResetLink(result.actionLink);
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setResetLink(null);
    saveMutation.mutate();
  }

  return (
    <div className="admin-users-page">
      <header className="admin-users-header">
        <div>
          <h1>Gestao de usuarios</h1>
          <p>Crie logins, defina roles e ajuste permissoes individuais sem expor controles sensiveis para usuarios comuns.</p>
        </div>
        <button type="button" className="primary-button" onClick={() => setSelectedId("new")}>
          <Plus size={16} />
          Novo usuario
        </button>
      </header>

      <div className="admin-users-layout">
        <aside className="admin-users-list" aria-label="Usuarios cadastrados">
          {usersQuery.isLoading ? <span className="admin-muted">Carregando usuarios...</span> : null}
          {users.map((user) => {
            const isActive = user.is_active ?? user.isActive ?? true;
            return (
              <button
                key={user.id}
                type="button"
                className={`admin-user-row ${selectedId === user.id ? "active" : ""}`}
                onClick={() => setSelectedId(user.id)}
              >
                <span>
                  <strong>{user.name}</strong>
                  <small>{user.email}</small>
                </span>
                <em className={isActive ? "enabled" : "disabled"}>{isActive ? "Ativo" : "Inativo"}</em>
              </button>
            );
          })}
        </aside>

        <form className="admin-user-editor" onSubmit={handleSubmit}>
          <section className="admin-editor-section">
            <div className="admin-section-title">
              <ShieldCheck size={18} />
              <h2>{selectedUser ? "Editar acesso" : "Criar usuario"}</h2>
            </div>

            <div className="admin-form-grid">
              <label>
                Nome
                <input value={draft.fullName} onChange={(event) => setDraft({ ...draft, fullName: event.target.value })} />
              </label>
              <label>
                Email
                <input value={draft.email} type="email" onChange={(event) => setDraft({ ...draft, email: event.target.value })} />
              </label>
              <label>
                Role
                <select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as AppRole })}>
                  {roleOptions.map((role) => (
                    <option key={role.value} value={role.value}>{role.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select
                  value={draft.isActive ? "active" : "inactive"}
                  onChange={(event) => setDraft({ ...draft, isActive: event.target.value === "active" })}
                >
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </select>
              </label>
              {selectedId === "new" ? (
                <label>
                  Senha inicial
                  <input
                    value={draft.password ?? ""}
                    type="password"
                    onChange={(event) => setDraft({ ...draft, password: event.target.value })}
                  />
                </label>
              ) : null}
            </div>
          </section>

          <section className="admin-editor-section">
            <div className="admin-section-title">
              <KeyRound size={18} />
              <h2>Permissoes individuais</h2>
            </div>

            <div className="admin-permissions-grid">
              {Object.entries(groupedPermissions).map(([group, groupPermissions]) => (
                <div key={group} className="admin-permission-group">
                  <h3>{group}</h3>
                  {groupPermissions.map((permission) => (
                    <label key={permission.key} className="admin-permission-row">
                      <span>
                        <strong>{permission.name}</strong>
                        <small>{permission.key}</small>
                      </span>
                      <select
                        value={overrideValue(draft.permissionOverrides, permission.key)}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            permissionOverrides: setOverride(
                              draft.permissionOverrides,
                              permission.key,
                              event.target.value as "inherit" | "allow" | "deny",
                            ),
                          })
                        }
                      >
                        <option value="inherit">Padrao da role</option>
                        <option value="allow">Permitir</option>
                        <option value="deny">Bloquear</option>
                      </select>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </section>

          {saveMutation.error ? <div className="inline-error">{String(saveMutation.error.message)}</div> : null}
          {resetMutation.error ? <div className="inline-error">{String(resetMutation.error.message)}</div> : null}
          {resetLink ? (
            <div className="admin-reset-link">
              <strong>Link de recuperacao gerado</strong>
              <input readOnly value={resetLink} onFocus={(event) => event.currentTarget.select()} />
            </div>
          ) : null}

          <footer className="admin-editor-actions">
            {selectedUser ? (
              <>
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
              </>
            ) : null}
            <button type="submit" className="primary-button" disabled={saveMutation.isPending}>
              <Save size={16} />
              {saveMutation.isPending ? "Salvando..." : "Salvar acesso"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

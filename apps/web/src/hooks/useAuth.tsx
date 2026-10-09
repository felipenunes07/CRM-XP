import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, isApiAuthError } from "../lib/api";
import { navigationAccessFolders } from "../lib/navigationPermissions";
import { supabase } from "../lib/supabase";

const delay = (ms: number) => new Promise<void>((resolve) => globalThis.setTimeout(resolve, ms));
const SESSION_RESTORE_TIMEOUT_MS = 2_000;

function readPersistedAccessToken() {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) return null;

    const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
    const rawSession = globalThis.localStorage?.getItem(`sb-${projectRef}-auth-token`);
    if (!rawSession) return null;

    const session = JSON.parse(rawSession) as { access_token?: unknown; expires_at?: unknown };
    const accessToken = typeof session.access_token === "string" ? session.access_token : null;
    const expiresAt = typeof session.expires_at === "number" ? session.expires_at : 0;

    // O fallback nunca usa token vencido. O cliente do Supabase continua
    // inicializando em background e assume novamente assim que responder.
    return accessToken && expiresAt * 1000 > Date.now() + 30_000 ? accessToken : null;
  } catch {
    return null;
  }
}

export type LegacyRole = "ADMIN" | "MANAGER" | "SELLER";
export type AppRole = "admin" | "vendas" | "financeiro" | "operacional" | "tarefas" | "viewer";

export interface AuthUser {
  id: string;
  email: string;
  role: LegacyRole;
  appRole: AppRole;
  name: string;
  profileAvatarUrl?: string | null;
  isActive: boolean;
  permissions: string[];
}

interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
type LoadUserOutcome = "ok" | "auth-error" | "transient";

const localAdminPermissions = [
  ...navigationAccessFolders.flatMap((folder) => folder.items.map((item) => item.permissionKey)),
  "commercial.view",
  "commercial.manage",
  "messages.view",
  "messages.manage",
  "finance.view",
  "finance.manage",
  "reports.view",
  "settings.manage",
  "admin.panel.view",
  "automations.manage",
  "integrations.manage",
];

const isLocalAddress = () => {
  return (
    import.meta.env.DEV ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname.startsWith("192.168.") ||
    window.location.hostname.startsWith("10.") ||
    window.location.hostname.endsWith(".ngrok-free.dev") ||
    window.location.hostname.endsWith(".ngrok-free.app")
  );
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const resilientLoadsRef = useRef<Map<string, Promise<LoadUserOutcome>>>(new Map());

  const loadUser = useCallback(async (accessToken: string) => {
    const result = await api.me(accessToken);
    setToken(accessToken);
    setUser(result.user);
  }, []);

  /**
   * Carrega o usuario tolerando falhas transitorias (rede, 500, timeout, cold start).
   * Retorna "auth-error" apenas quando o backend confirma que a sessao e invalida (401),
   * caso em que a sessao deve ser descartada. Em qualquer outra falha retorna "transient"
   * e a sessao persistida NUNCA e apagada — assim um soluco no backend nao desloga o usuario.
   */
  const loadUserResilient = useCallback(
    (accessToken: string, attempts = 4): Promise<LoadUserOutcome> => {
      const existing = resilientLoadsRef.current.get(accessToken);
      if (existing) {
        return existing;
      }

      const pending = (async (): Promise<LoadUserOutcome> => {
        for (let attempt = 0; attempt < attempts; attempt += 1) {
          try {
            await loadUser(accessToken);
            return "ok";
          } catch (error) {
            if (isApiAuthError(error)) {
              return "auth-error";
            }
            if (attempt < attempts - 1) {
              await delay(600 * (attempt + 1));
            }
          }
        }
        return "transient";
      })();

      resilientLoadsRef.current.set(accessToken, pending);
      const clearPending = () => {
        if (resilientLoadsRef.current.get(accessToken) === pending) {
          resilientLoadsRef.current.delete(accessToken);
        }
      };
      void pending.then(clearPending, clearPending);
      return pending;
    },
    [loadUser],
  );

  const clearSession = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (isLocalAddress()) {
      if (!cancelled) {
        setToken("local-dev-token");
        setUser({
          id: "00000000-0000-0000-0000-000000000001",
          email: "admin@olist-crm.com.br",
          role: "ADMIN",
          appRole: "admin",
          name: "Administrador Local",
          isActive: true,
          permissions: localAdminPermissions,
        });
        setLoading(false);
      }
      return () => {
        cancelled = true;
      };
    }

    async function restoreSession() {
      setLoading(true);
      const sessionResult = await Promise.race([
        supabase.auth.getSession(),
        delay(SESSION_RESTORE_TIMEOUT_MS).then(() => null),
      ]);
      const accessToken = sessionResult?.data.session?.access_token ?? readPersistedAccessToken();

      if (!accessToken) {
        if (!cancelled) {
          clearSession();
          setLoading(false);
        }
        return;
      }

      const outcome = await loadUserResilient(accessToken);
      if (cancelled) {
        return;
      }

      // So descarta a sessao quando o backend CONFIRMA que ela e invalida (401).
      // Falhas transitorias mantem a sessao persistida intacta para a proxima tentativa,
      // garantindo que o usuario nunca seja deslogado sem querer.
      if (outcome === "auth-error") {
        await supabase.auth.signOut();
        if (!cancelled) {
          clearSession();
        }
      }
      if (!cancelled) {
        setLoading(false);
      }
    }

    void restoreSession();

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      const accessToken = session?.access_token ?? null;
      if (!accessToken) {
        // So limpa a sessao em logout explicito; ignora eventos sem token de outras causas.
        if (event === "SIGNED_OUT") {
          clearSession();
          setLoading(false);
        }
        return;
      }

      void loadUserResilient(accessToken).then(async (outcome) => {
        if (outcome === "auth-error") {
          await supabase.auth.signOut();
          clearSession();
        }
      });
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [clearSession, loadUserResilient]);

  // Mantém nome, permissões e foto do perfil atualizados quando um administrador
  // altera o cadastro, sem obrigar o funcionário a sair e entrar novamente.
  useEffect(() => {
    if (!token || isLocalAddress()) return;
    const refresh = () => void loadUserResilient(token);
    const timer = window.setInterval(refresh, 20_000);
    return () => window.clearInterval(timer);
  }, [loadUserResilient, token]);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      loading,
      async login(email: string, password: string) {
        setLoading(true);
        try {
          if (isLocalAddress()) {
            setToken("local-dev-token");
            setUser({
              id: "00000000-0000-0000-0000-000000000001",
              email: email.trim().toLowerCase() || "admin@olist-crm.com.br",
              role: "ADMIN",
              appRole: "admin",
              name: "Administrador Local",
              isActive: true,
              permissions: localAdminPermissions,
            });
            return;
          }

          const { data, error } = await supabase.auth.signInWithPassword({
            email: email.trim().toLowerCase(),
            password,
          });
          if (error || !data.session?.access_token) {
            throw new Error(error?.message ?? "Falha ao entrar");
          }
          await loadUser(data.session.access_token);
        } finally {
          setLoading(false);
        }
      },
      logout() {
        if (isLocalAddress()) {
          clearSession();
          setLoading(false);
          return;
        }
        void supabase.auth.signOut();
        clearSession();
        setLoading(false);
      },
      async refreshUser() {
        if (isLocalAddress()) {
          return;
        }
        const { data } = await supabase.auth.getSession();
        if (data.session?.access_token) {
          await loadUser(data.session.access_token);
        }
      },
    }),
    [clearSession, loadUser, loading, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}

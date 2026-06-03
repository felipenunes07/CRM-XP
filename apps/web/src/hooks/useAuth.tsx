import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { supabase } from "../lib/supabase";

export type LegacyRole = "ADMIN" | "MANAGER" | "SELLER";
export type AppRole = "admin" | "vendas" | "financeiro" | "operacional" | "viewer";

export interface AuthUser {
  id: string;
  email: string;
  role: LegacyRole;
  appRole: AppRole;
  name: string;
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

  const loadUser = useCallback(async (accessToken: string) => {
    const result = await api.me(accessToken);
    setToken(accessToken);
    setUser(result.user);
  }, []);

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
          permissions: [
            "dashboard.view",
            "commercial.view",
            "commercial.manage",
            "messages.view",
            "messages.manage",
            "finance.view",
            "finance.manage",
            "reports.view",
            "settings.manage",
            "admin.panel.view",
            "admin.users.manage",
            "automations.view",
            "automations.manage",
            "integrations.manage"
          ],
        });
        setLoading(false);
      }
      return () => {
        cancelled = true;
      };
    }

    async function restoreSession() {
      setLoading(true);
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token ?? null;

      if (!accessToken) {
        if (!cancelled) {
          clearSession();
          setLoading(false);
        }
        return;
      }

      try {
        if (!cancelled) {
          await loadUser(accessToken);
        }
      } catch {
        await supabase.auth.signOut();
        if (!cancelled) {
          clearSession();
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void restoreSession();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      const accessToken = session?.access_token ?? null;
      if (!accessToken) {
        clearSession();
        setLoading(false);
        return;
      }

      void loadUser(accessToken).catch(async () => {
        await supabase.auth.signOut();
        clearSession();
      });
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [clearSession, loadUser]);

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
              permissions: [
                "dashboard.view",
                "commercial.view",
                "commercial.manage",
                "messages.view",
                "messages.manage",
                "finance.view",
                "finance.manage",
                "reports.view",
                "settings.manage",
                "admin.panel.view",
                "admin.users.manage",
                "automations.view",
                "automations.manage",
                "integrations.manage"
              ],
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

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

export interface AuthUser {
  id: string;
  email: string;
  role: "ADMIN" | "MANAGER" | "SELLER";
  name: string;
}

interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const STORAGE_KEY = "xp-crm-auth-token";

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>("local-dev-token");
  const [user, setUser] = useState<AuthUser | null>({
    id: "00000000-0000-0000-0000-000000000001",
    email: "admin@olist-crm.com.br",
    role: "ADMIN",
    name: "Administrador Local",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Autenticação desativada para facilidade de uso local
    setLoading(false);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      loading,
      async login(email: string, password: string) {
        const result = await api.login(email, password);
        window.localStorage.setItem(STORAGE_KEY, result.token);
        setToken(result.token);
        setUser(result.user);
      },
      logout() {
        window.localStorage.removeItem(STORAGE_KEY);
        setToken(null);
        setUser(null);
      },
    }),
    [loading, token, user],
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

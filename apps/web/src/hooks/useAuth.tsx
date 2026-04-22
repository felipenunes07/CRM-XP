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
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const storedToken = window.localStorage.getItem(STORAGE_KEY);
      if (!storedToken) {
        if (!cancelled) {
          setLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setToken(storedToken);
      }

      try {
        const result = await api.me(storedToken);
        if (!cancelled) {
          setUser(result.user);
        }
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
        if (!cancelled) {
          setToken(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      loading,
      async login(email: string, password: string) {
        setLoading(true);
        try {
          const result = await api.login(email, password);
          window.localStorage.setItem(STORAGE_KEY, result.token);
          setToken(result.token);
          setUser(result.user);
        } finally {
          setLoading(false);
        }
      },
      logout() {
        window.localStorage.removeItem(STORAGE_KEY);
        setToken(null);
        setUser(null);
        setLoading(false);
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

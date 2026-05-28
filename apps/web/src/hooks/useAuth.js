import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { supabase } from "../lib/supabase";
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
    const [token, setToken] = useState(null);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const loadUser = useCallback(async (accessToken) => {
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
        const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
        if (isLocal) {
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
            }
            catch {
                await supabase.auth.signOut();
                if (!cancelled) {
                    clearSession();
                }
            }
            finally {
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
    const value = useMemo(() => ({
        token,
        user,
        loading,
        async login(email, password) {
            setLoading(true);
            try {
                const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
                if (isLocal) {
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
            }
            finally {
                setLoading(false);
            }
        },
        logout() {
            const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
            if (isLocal) {
                clearSession();
                setLoading(false);
                return;
            }
            void supabase.auth.signOut();
            clearSession();
            setLoading(false);
        },
        async refreshUser() {
            const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
            if (isLocal) {
                return;
            }
            const { data } = await supabase.auth.getSession();
            if (data.session?.access_token) {
                await loadUser(data.session.access_token);
            }
        },
    }), [clearSession, loadUser, loading, token, user]);
    return _jsx(AuthContext.Provider, { value: value, children: children });
}
export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used inside AuthProvider");
    }
    return context;
}

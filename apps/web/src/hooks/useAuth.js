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
            void supabase.auth.signOut();
            clearSession();
            setLoading(false);
        },
        async refreshUser() {
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

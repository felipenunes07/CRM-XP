import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
const STORAGE_KEY = "xp-crm-auth-token";
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
    const [token, setToken] = useState(null);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        let active = true;
        const storedToken = window.localStorage.getItem(STORAGE_KEY);
        if (!storedToken) {
            setLoading(false);
            return;
        }
        void api
            .me(storedToken)
            .then((result) => {
            if (!active) {
                return;
            }
            setToken(storedToken);
            setUser(result.user);
        })
            .catch(() => {
            window.localStorage.removeItem(STORAGE_KEY);
            if (!active) {
                return;
            }
            setToken(null);
            setUser(null);
        })
            .finally(() => {
            if (active) {
                setLoading(false);
            }
        });
        return () => {
            active = false;
        };
    }, []);
    const value = useMemo(() => ({
        token,
        user,
        loading,
        async login(email, password) {
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
    }), [loading, token, user]);
    return _jsx(AuthContext.Provider, { value: value, children: children });
}
export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used inside AuthProvider");
    }
    return context;
}

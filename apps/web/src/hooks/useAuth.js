import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
const STORAGE_KEY = "xp-crm-auth-token";
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
    const [token, setToken] = useState("local-dev-token");
    const [user, setUser] = useState({
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

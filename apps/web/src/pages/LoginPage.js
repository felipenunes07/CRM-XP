import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
export function LoginPage() {
    const { login, loading } = useAuth();
    const [email, setEmail] = useState("admin@example.com");
    const [password, setPassword] = useState("change-me");
    const [error, setError] = useState(null);
    async function handleSubmit(event) {
        event.preventDefault();
        setError(null);
        try {
            await login(email, password);
        }
        catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : "Falha ao entrar");
        }
    }
    return (_jsxs("div", { className: "login-shell", children: [_jsxs("section", { className: "login-hero", children: [_jsx("img", { className: "login-logo", src: "/xp-factory-logo.png", alt: "XP Factory" }), _jsxs("div", { className: "login-hero-copy", children: [_jsx("p", { className: "eyebrow", children: "XP CRM" }), _jsx("h1", { children: "Entrar no CRM" }), _jsx("p", { children: "Acesso interno da equipe." })] })] }), _jsxs("form", { className: "login-card", onSubmit: handleSubmit, children: [_jsxs("div", { className: "login-card-header", children: [_jsx("p", { className: "eyebrow", children: "Acesso interno" }), _jsx("h2", { children: "Entrar no painel" })] }), _jsxs("div", { className: "login-form-grid", children: [_jsxs("label", { children: ["Email", _jsx("input", { value: email, onChange: (event) => setEmail(event.target.value), type: "email", autoComplete: "username", placeholder: "seu.email@empresa.com" })] }), _jsxs("label", { children: ["Senha", _jsx("input", { value: password, onChange: (event) => setPassword(event.target.value), type: "password", autoComplete: "current-password", placeholder: "Digite sua senha" })] })] }), error ? _jsx("div", { className: "inline-error", children: error }) : null, _jsx("button", { className: "primary-button login-submit-button", type: "submit", disabled: loading, children: loading ? "Entrando..." : "Entrar" })] })] }));
}

import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
export function LoginPage() {
    const { login } = useAuth();
    const [email, setEmail] = useState("admin@example.com");
    const [password, setPassword] = useState("change-me");
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    async function handleSubmit(event) {
        event.preventDefault();
        setLoading(true);
        setError(null);
        try {
            await login(email, password);
        }
        catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : "Falha ao entrar");
        }
        finally {
            setLoading(false);
        }
    }
    return (_jsxs("div", { className: "login-shell", children: [_jsxs("section", { className: "login-hero", children: [_jsx("img", { className: "login-logo", src: "/xp-factory-logo.png", alt: "XP Factory" }), _jsx("p", { className: "eyebrow", children: "XP CRM" }), _jsx("h1", { children: "Clientes, recorrencia e prioridade comercial em um painel leve e objetivo." }), _jsx("p", { children: "Acompanhe a base consolidada, identifique risco de churn e mantenha a equipe focada nos contatos que mais importam." })] }), _jsxs("form", { className: "login-card", onSubmit: handleSubmit, children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Acesso interno" }), _jsx("h2", { children: "Entrar no painel" })] }), _jsxs("label", { children: ["Email", _jsx("input", { value: email, onChange: (event) => setEmail(event.target.value), type: "email" })] }), _jsxs("label", { children: ["Senha", _jsx("input", { value: password, onChange: (event) => setPassword(event.target.value), type: "password" })] }), error ? _jsx("div", { className: "inline-error", children: error }) : null, _jsx("button", { className: "primary-button", type: "submit", disabled: loading, children: loading ? "Entrando..." : "Entrar" })] })] }));
}

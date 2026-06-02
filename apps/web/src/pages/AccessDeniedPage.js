import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ShieldAlert } from "lucide-react";
export function AccessDeniedPage() {
    return (_jsx("div", { className: "access-denied-page", children: _jsxs("div", { className: "access-denied-panel", children: [_jsx(ShieldAlert, { size: 32 }), _jsx("h1", { children: "Acesso negado" }), _jsx("p", { children: "Seu usuario nao possui permissao para acessar esta area. Fale com um administrador se precisar desse acesso." })] }) }));
}

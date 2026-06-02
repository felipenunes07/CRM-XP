import { jsx as _jsx } from "react/jsx-runtime";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { usePermissions } from "../hooks/usePermissions";
import { useUiLanguage } from "../i18n";
function RouteLoadingFallback() {
    const { tx } = useUiLanguage();
    return _jsx("div", { className: "page-loading fullscreen", children: tx("Carregando tela...", "Carregando tela...") });
}
export function ProtectedRoute({ permission }) {
    const { token, user, loading } = useAuth();
    const { canAccess } = usePermissions();
    const location = useLocation();
    if (loading) {
        return _jsx(RouteLoadingFallback, {});
    }
    if (!token || !user) {
        return _jsx(Navigate, { to: "/login", replace: true, state: { from: location.pathname } });
    }
    if (permission && !canAccess(permission)) {
        return _jsx(Navigate, { to: "/acesso-negado", replace: true });
    }
    return _jsx(Outlet, {});
}
export function PublicOnlyRoute({ children }) {
    const { token, user, loading } = useAuth();
    if (loading) {
        return _jsx(RouteLoadingFallback, {});
    }
    if (token && user) {
        return _jsx(Navigate, { to: "/", replace: true });
    }
    return children;
}

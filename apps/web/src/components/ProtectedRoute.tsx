import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { usePermissions } from "../hooks/usePermissions";
import { useUiLanguage } from "../i18n";

function RouteLoadingFallback() {
  const { tx } = useUiLanguage();
  return <div className="page-loading fullscreen">{tx("Carregando tela...", "Carregando tela...")}</div>;
}

export function ProtectedRoute({ permission }: { permission?: string }) {
  const { token, user, loading } = useAuth();
  const { canAccess } = usePermissions();
  const location = useLocation();

  if (loading) {
    return <RouteLoadingFallback />;
  }

  if (!token || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (permission && !canAccess(permission)) {
    return <Navigate to="/acesso-negado" replace />;
  }

  return <Outlet />;
}

export function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { token, user, loading } = useAuth();

  if (loading) {
    return <RouteLoadingFallback />;
  }

  if (token && user) {
    return <Navigate to="/" replace />;
  }

  return children;
}

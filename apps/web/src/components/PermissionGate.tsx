import { usePermissions } from "../hooks/usePermissions";

export function PermissionGate({
  permission,
  children,
  fallback = null,
}: {
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { canAccess } = usePermissions();
  return canAccess(permission) ? <>{children}</> : <>{fallback}</>;
}

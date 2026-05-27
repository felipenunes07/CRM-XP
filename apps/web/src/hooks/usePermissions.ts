import { useMemo } from "react";
import { useAuth } from "./useAuth";
import { buildPermissionChecker } from "../lib/permissions";

export function usePermissions() {
  const { user } = useAuth();

  return useMemo(() => {
    const canAccess = user?.permissions
      ? buildPermissionChecker(user.permissions)
      : (permissionKey: string) => user?.role === "ADMIN" && Boolean(permissionKey);
    return {
      permissions: user?.permissions ?? [],
      canAccess,
      requirePermission(permissionKey: string) {
        if (!canAccess(permissionKey)) {
          throw new Error(`Acesso negado: ${permissionKey}`);
        }
      },
    };
  }, [user?.permissions]);
}

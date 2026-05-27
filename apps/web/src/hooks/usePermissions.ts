import { useMemo } from "react";
import { useAuth } from "./useAuth";
import { buildPermissionChecker } from "../lib/permissions";

export function usePermissions() {
  const { user } = useAuth();

  return useMemo(() => {
    const isAdmin = user?.role === "ADMIN" || user?.appRole === "admin";
    const canAccess = user?.permissions?.length
      ? buildPermissionChecker(user.permissions)
      : (permissionKey: string) => isAdmin && Boolean(permissionKey);
    return {
      permissions: user?.permissions ?? [],
      canAccess,
      requirePermission(permissionKey: string) {
        if (!canAccess(permissionKey)) {
          throw new Error(`Acesso negado: ${permissionKey}`);
        }
      },
    };
  }, [user?.permissions, user?.role, user?.appRole]);
}

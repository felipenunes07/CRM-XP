import { Fragment as _Fragment, jsx as _jsx } from "react/jsx-runtime";
import { usePermissions } from "../hooks/usePermissions";
export function PermissionGate({ permission, children, fallback = null, }) {
    const { canAccess } = usePermissions();
    return canAccess(permission) ? _jsx(_Fragment, { children: children }) : _jsx(_Fragment, { children: fallback });
}

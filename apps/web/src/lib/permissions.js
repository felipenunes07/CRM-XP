export function buildPermissionChecker(permissions = []) {
    const permissionSet = new Set(permissions);
    return (permissionKey) => permissionSet.has(permissionKey);
}

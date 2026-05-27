export function buildPermissionChecker(permissions: string[] = []) {
  const permissionSet = new Set(permissions);
  return (permissionKey: string) => permissionSet.has(permissionKey);
}

import { describe, expect, it } from "vitest";
import {
  APP_PERMISSIONS,
  ROLE_PERMISSIONS,
  computeEffectivePermissions,
  hasPermission,
  normalizeAppRole,
} from "./permissionService.js";

describe("permissionService", () => {
  it("combines role permissions with individual allow and deny overrides", () => {
    const effective = computeEffectivePermissions({
      role: "vendas",
      overrides: [
        { permissionKey: "finance.view", allowed: true },
        { permissionKey: "messages.view", allowed: false },
      ],
    });

    expect(effective).toContain("commercial.view");
    expect(effective).toContain("finance.view");
    expect(effective).not.toContain("messages.view");
  });

  it("gives admins every declared permission", () => {
    const effective = computeEffectivePermissions({ role: "admin", overrides: [] });

    expect(effective.sort()).toEqual(APP_PERMISSIONS.map((permission) => permission.key).sort());
  });

  it("normalizes legacy roles without leaking manager as admin", () => {
    expect(normalizeAppRole("ADMIN")).toBe("admin");
    expect(normalizeAppRole("SELLER")).toBe("vendas");
    expect(normalizeAppRole("MANAGER")).toBe("operacional");
  });

  it("checks permissions against the effective permission set", () => {
    expect(hasPermission(ROLE_PERMISSIONS.financeiro, "finance.view")).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.financeiro, "admin.users.manage")).toBe(false);
  });
});

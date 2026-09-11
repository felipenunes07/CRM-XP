import { describe, expect, it } from "vitest";
import {
  navigationAccessFolders,
  navigationPermissionKeys,
  permissionForPath,
} from "./navigationPermissions";

describe("navigation permissions", () => {
  it("assigns independent permissions to communication screens", () => {
    expect(permissionForPath("/mensagens")).toBe("messages.inbox.view");
    expect(permissionForPath("/eventos")).toBe("messages.events.view");
    expect(permissionForPath("/templates")).toBe("messages.templates.view");
  });

  it("protects nested customer routes with the corresponding screen permission", () => {
    expect(permissionForPath("/clientes/123")).toBe("commercial.customers.view");
    expect(permissionForPath("/clientes/financeiro/123")).toBe("finance.customers.view");
  });

  it("uses its own permission for the executive report shortcut", () => {
    expect(permissionForPath("/relatorio-executivo")).toBe("reports.executive.view");
  });

  it("protects the task board with its own permission", () => {
    expect(permissionForPath("/tarefas")).toBe("tasks.view");
  });

  it("keeps one unique permission for every configurable menu item", () => {
    const items = navigationAccessFolders.flatMap((folder) => folder.items);
    expect(navigationPermissionKeys.size).toBe(items.length);
    expect(items.every((item) => permissionForPath(item.path) === item.permissionKey)).toBe(true);
  });
});

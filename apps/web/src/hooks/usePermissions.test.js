import { describe, expect, it } from "vitest";
import { buildPermissionChecker } from "../lib/permissions";
describe("buildPermissionChecker", () => {
    it("returns true only for permissions present in the effective set", () => {
        const canAccess = buildPermissionChecker(["dashboard.view", "finance.view"]);
        expect(canAccess("dashboard.view")).toBe(true);
        expect(canAccess("finance.view")).toBe(true);
        expect(canAccess("admin.users.manage")).toBe(false);
    });
});

import { afterEach, describe, expect, it, vi } from "vitest";

const { ensureDefaultAdminMock, runMigrationsMock } = vi.hoisted(() => ({
  ensureDefaultAdminMock: vi.fn(),
  runMigrationsMock: vi.fn(),
}));

vi.mock("../../db/migrate.js", () => ({
  runMigrations: runMigrationsMock,
}));

vi.mock("./authService.js", () => ({
  ensureDefaultAdmin: ensureDefaultAdminMock,
}));

import { bootstrapPlatform } from "./bootstrap.js";

describe("bootstrapPlatform", () => {
  afterEach(() => {
    ensureDefaultAdminMock.mockReset();
    runMigrationsMock.mockReset();
  });

  it("does not rerun database migrations during server bootstrap", async () => {
    await bootstrapPlatform();

    expect(ensureDefaultAdminMock).toHaveBeenCalledTimes(1);
    expect(runMigrationsMock).not.toHaveBeenCalled();
  });
});

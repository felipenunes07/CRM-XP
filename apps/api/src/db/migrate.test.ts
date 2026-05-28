import { afterEach, describe, expect, it, vi } from "vitest";

const { poolEndMock, versionedRunMigrationsMock } = vi.hoisted(() => ({
  poolEndMock: vi.fn(),
  versionedRunMigrationsMock: vi.fn(),
}));

vi.mock("./client.js", () => ({
  pool: {
    end: poolEndMock,
  },
}));

vi.mock("./runMigrations.js", () => ({
  runMigrations: versionedRunMigrationsMock,
}));

import { runMigrations } from "./migrate.js";

describe("migrate CLI entrypoint", () => {
  afterEach(() => {
    poolEndMock.mockReset();
    versionedRunMigrationsMock.mockReset();
  });

  it("delegates to the versioned migration runner", async () => {
    await runMigrations();

    expect(versionedRunMigrationsMock).toHaveBeenCalledTimes(1);
  });
});

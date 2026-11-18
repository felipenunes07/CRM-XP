import { afterEach, describe, expect, it, vi } from "vitest";
const { config } = vi.hoisted(() => ({ config: { NODE_ENV: "production" } }));
vi.mock("../../lib/env.js", () => ({ env: config }));
vi.mock("../../db/client.js", () => ({ pool: { query: vi.fn() } }));
vi.mock("./supabaseAdmin.js", () => ({
  createSupabaseAdminClient: vi.fn(), createSupabaseAuthClient: vi.fn(),
  isSupabaseAdminConfigured: vi.fn(), isSupabaseAuthConfigured: vi.fn(),
}));
import { verifyToken } from "./authService.js";

describe("local development authentication", () => {
  afterEach(() => { config.NODE_ENV = "production"; });
  it("rejects the development credential in production", async () => {
    await expect(verifyToken("local-dev-token")).rejects.toMatchObject({ statusCode: 401 });
  });
  it("keeps the development environment usable", async () => {
    config.NODE_ENV = "development";
    await expect(verifyToken("local-dev-token")).resolves.toMatchObject({ appRole: "admin", name: "Administrador Local" });
  });
});

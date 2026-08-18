import { describe, expect, it } from "vitest";
import { resolveOlistApiToken } from "./olistTokenProvider.js";

describe("Olist token resolution", () => {
  it("prefers the EasyPanel environment token when both sources exist", () => {
    expect(resolveOlistApiToken(" env-token ", "vault-token")).toBe("env-token");
  });

  it("uses the encrypted Supabase Vault token when production has no environment token", () => {
    expect(resolveOlistApiToken("", " vault-token ")).toBe("vault-token");
  });

  it("reports an unconfigured integration when neither source has a token", () => {
    expect(resolveOlistApiToken(undefined, "  ")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { recoverySuggestedAction } from "./decisionCenterService.js";

describe("decision center recovery guidance", () => {
  it("prioritizes prevention for customers who are losing purchase rhythm", () => {
    expect(recoverySuggestedAction("ATTENTION", 35)).toContain("Antecipar");
  });

  it("uses a stronger win-back action for long inactive customers", () => {
    expect(recoverySuggestedAction("INACTIVE", 120)).toContain("oferta forte");
    expect(recoverySuggestedAction("INACTIVE", 60)).toContain("reativação hoje");
  });
});


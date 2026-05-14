import { describe, expect, it } from "vitest";
import {
  INACTIVITY_AUTOMATION_STAGES,
  buildInactivitySegmentDefinition,
  buildStageEntryEventKey,
  filterUnhandledStageEntryCustomerIds,
  resolveEligibleRunStatus,
} from "./automationCore.js";

describe("automationCore", () => {
  it("maps CRM inactivity stages to non-overlapping segment definitions", () => {
    expect(buildInactivitySegmentDefinition("ATTENTION_1")).toEqual({
      status: ["ATTENTION"],
      minDaysInactive: 30,
      maxDaysInactive: 59,
    });
    expect(buildInactivitySegmentDefinition("ATTENTION_2")).toEqual({
      status: ["ATTENTION"],
      minDaysInactive: 60,
      maxDaysInactive: 89,
    });
    expect(buildInactivitySegmentDefinition("INACTIVE_1")).toEqual({
      status: ["INACTIVE"],
      minDaysInactive: 90,
      maxDaysInactive: 179,
    });
    expect(buildInactivitySegmentDefinition("INACTIVE_2")).toEqual({
      status: ["INACTIVE"],
      minDaysInactive: 180,
    });
  });

  it("keeps the visual stage labels aligned with the inactivity ranges", () => {
    expect(INACTIVITY_AUTOMATION_STAGES.map((stage) => stage.label)).toEqual([
      "Atencao 1",
      "Atencao 2",
      "Inativo 1",
      "Inativo 2",
    ]);
  });

  it("resolves eligible run status from the selected send mode", () => {
    expect(resolveEligibleRunStatus("APPROVAL")).toBe("PENDING_APPROVAL");
    expect(resolveEligibleRunStatus("AUTOMATIC")).toBe("ENQUEUED");
  });

  it("builds a stable stage entry event key from the configured audience", () => {
    expect(buildStageEntryEventKey(buildInactivitySegmentDefinition("ATTENTION_1"))).toBe(
      "stage-entry:ATTENTION:30:59",
    );
    expect(buildStageEntryEventKey(buildInactivitySegmentDefinition("INACTIVE_2"))).toBe(
      "stage-entry:INACTIVE:180:any",
    );
  });

  it("keeps only customers that have not triggered this stage entry before", () => {
    expect(filterUnhandledStageEntryCustomerIds(["c1", "c2", "c3"], new Set(["c2"]))).toEqual(["c1", "c3"]);
  });
});

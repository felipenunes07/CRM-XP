import { describe, expect, it } from "vitest";
import { mapMonthlyTargetRow } from "./dashboardService.js";

describe("mapMonthlyTargetRow", () => {
  it("treats a legacy screen target as an XP target", () => {
    expect(
      mapMonthlyTargetRow({
        year: 2026,
        month: 7,
        attendant: "TOTAL",
        target_amount: 500,
        target_screen_xp: 0,
        target_screen_vv: 0,
        target_screen_de: 0,
        target_batteries: 100,
        target_charging_docks: 0,
        target_revenue: 250000,
      }),
    ).toMatchObject({
      targetAmount: 500,
      targetScreenXp: 500,
      targetScreenVv: 0,
      targetScreenDe: 0,
    });
  });

  it("preserves targets already divided by factory", () => {
    expect(
      mapMonthlyTargetRow({
        year: 2026,
        month: 8,
        attendant: "Amanda",
        target_amount: 500,
        target_screen_xp: 300,
        target_screen_vv: 120,
        target_screen_de: 80,
      }),
    ).toMatchObject({
      targetAmount: 500,
      targetScreenXp: 300,
      targetScreenVv: 120,
      targetScreenDe: 80,
    });
  });
});

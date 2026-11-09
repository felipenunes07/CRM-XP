import { describe, expect, it } from "vitest";
import { buildProspectFollowupText, getProspectFollowupSchedule, pickProspectCustomer, prospectConversionReason, type ProspectCustomerRecord } from "./prospectFollowupCore.js";

describe("new-group followup rules", () => {
  it.each([
    ["2026-11-11T11:59:59Z", false],
    ["2026-11-11T12:00:00Z", true],
    ["2026-11-11T12:14:59Z", true],
    ["2026-11-11T12:15:00Z", false],
    ["2026-11-08T12:00:00Z", true],
  ])("runs at 9h in Brasilia, including Sundays: %s", (now, due) => {
    expect(getProspectFollowupSchedule(new Date(now)).due).toBe(due);
  });
  it("uses the calendar date two days before the send date", () => {
    expect(getProspectFollowupSchedule(new Date("2026-11-11T12:00:00Z"))).toEqual({date:"2026-11-11",createdDate:"2026-11-09",due:true});
    expect(getProspectFollowupSchedule(new Date("2026-12-01T12:00:00Z")).createdDate).toBe("2026-11-29");
  });
  it("mentions only the unique customer and excludes staff phone and LID aliases", () => {
    expect(pickProspectCustomer([
      {id:"111111111111111@lid",phoneNumber:"5511999999999@s.whatsapp.net"},
      {id:"222222222222222@lid"},
      {id:"333333333333333@lid",phoneNumber:"558189999000@s.whatsapp.net"},
    ],["5511999999999","222222222222222"])).toEqual({phone:"558189999000",reason:null});
  });
  it("does not guess a target for multiple external members or unknown LIDs", () => {
    expect(pickProspectCustomer([{id:"5511988888888@s.whatsapp.net"},{id:"5511977777777@s.whatsapp.net"}],[]).reason).toBe("multiple_customers");
    expect(pickProspectCustomer([{id:"123456789012345@lid"}],[]).reason).toBe("unresolved_customer_phone");
    expect(pickProspectCustomer([],[]).reason).toBe("no_customer_in_group");
  });
  const record: ProspectCustomerRecord = {id:"buyer",customerCode:null,name:"Janfone Celulares",phone:"5581989999000",hasPurchase:true};
  it("stops after a purchase matched by mobile alias even if the group still has no CL", () => {
    expect(prospectConversionReason("Outro nome","558189999000",[],[record])).toBe("already_purchased");
  });
  it("stops for a customer matched by name or mapped ID even when the phone is missing", () => {
    expect(prospectConversionReason("Cliente Janfone Celulares / XP EXPOR TELAS","557100000000",[],[{...record,phone:null}])).toBe("already_purchased");
    expect(prospectConversionReason("Outro","557100000000",["buyer"],[{...record,phone:null}])).toBe("already_purchased");
  });
  it("stops when the person is already registered as a customer", () => {
    expect(prospectConversionReason("Cliente Janfone Celulares","558189999000",[],[{...record,hasPurchase:false,customerCode:"CL1584"}])).toBe("already_customer");
  });
  it("allows an unconverted prospect and preserves the exact requested text", () => {
    expect(prospectConversionReason("Cliente Janfone Celulares","558189999000",[],[])).toBeNull();
    expect(buildProspectFollowupText("558189999000")).toBe("Bom dia @558189999000 ☀️🙏🏻🤩\n\nGostou dos nossos preços?\n\nQualquer coisa é só avisar a gente que deixamos tudo separado e prontinho pra vc! 📦🤝☺️");
  });
});

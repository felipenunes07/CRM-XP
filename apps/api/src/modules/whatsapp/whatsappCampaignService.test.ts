import { describe, expect, it } from "vitest";
import {
  buildWhatsappCampaignDiagnosis,
  isWithinWhatsappCampaignAttributionWindow,
  normalizeWhatsappCampaignMessageText,
  pickMostRecentWhatsappCampaignAttribution,
  shouldCurrentCampaignKeepAttribution,
  whatsappCampaignIdentityMatches,
} from "./whatsappCampaignService.js";

describe("whatsapp campaign attribution", () => {
  const sentAt = "2026-06-01T12:00:00.000Z";

  it("does not count responses before the campaign send", () => {
    expect(isWithinWhatsappCampaignAttributionWindow(sentAt, "2026-06-01T11:59:59.000Z")).toBe(false);
  });

  it("counts responses inside the 7 day attribution window", () => {
    expect(isWithinWhatsappCampaignAttributionWindow(sentAt, "2026-06-05T12:00:00.000Z")).toBe(true);
  });

  it("does not count responses after the 7 day attribution window", () => {
    expect(isWithinWhatsappCampaignAttributionWindow(sentAt, "2026-06-08T12:00:00.000Z")).toBe(false);
  });

  it("lets the most recent campaign steal attribution before the event", () => {
    expect(
      shouldCurrentCampaignKeepAttribution({
        currentSentAt: "2026-06-01T12:00:00.000Z",
        newerSentAt: "2026-06-03T09:00:00.000Z",
        eventAt: "2026-06-03T10:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("keeps attribution when the newer campaign was sent after the event", () => {
    expect(
      shouldCurrentCampaignKeepAttribution({
        currentSentAt: "2026-06-01T12:00:00.000Z",
        newerSentAt: "2026-06-03T11:00:00.000Z",
        eventAt: "2026-06-03T10:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("matches purchases by customer_id and customer_code fallback", () => {
    expect(whatsappCampaignIdentityMatches({ customerId: "customer-1" }, { customerId: "customer-1" })).toBe(true);
    expect(whatsappCampaignIdentityMatches({ customerCode: "CL123" }, { customerCode: "cl123" })).toBe(true);
  });

  it("picks the most recent eligible recipient for a customer event", () => {
    const selected = pickMostRecentWhatsappCampaignAttribution(
      [
        { id: "campaign-old", customerCode: "CL123", sentAt: "2026-06-01T12:00:00.000Z" },
        { id: "campaign-new", customerCode: "CL123", sentAt: "2026-06-03T09:00:00.000Z" },
      ],
      { customerCode: "CL123", eventAt: "2026-06-03T10:00:00.000Z" },
    );

    expect(selected?.id).toBe("campaign-new");
  });

  it("diagnoses blocked or failed campaigns before engagement quality", () => {
    expect(
      buildWhatsappCampaignDiagnosis({
        sentRecipients: 10,
        blockedRecipients: 4,
        failedRecipients: 0,
        responseRate: 0.3,
        purchaseRate: 0.2,
        purchasedRecipients: 2,
      }),
    ).toMatchObject({
      tone: "danger",
    });
  });
});

describe("normalizeWhatsappCampaignMessageText", () => {
  it("allows video campaigns without a caption", () => {
    expect(normalizeWhatsappCampaignMessageText({ messageText: "", messageType: "VIDEO" })).toBe("");
  });

  it("still requires text for non-video campaigns", () => {
    expect(() => normalizeWhatsappCampaignMessageText({ messageText: "", messageType: "TEXT" })).toThrow("mensagem");
  });
});

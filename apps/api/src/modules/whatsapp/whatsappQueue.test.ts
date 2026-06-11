import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claimRecipientForDispatch: vi.fn(),
  listDueWhatsappCampaignRecipientJobs: vi.fn(),
  markRecipientDispatchClaimFailed: vi.fn(),
  markRecipientFailed: vi.fn(),
  markRecipientSent: vi.fn(),
  recoverWhatsappCampaignDispatchClaimFailures: vi.fn(),
  resetStaleSendingRecipients: vi.fn(),
  sendWhatsappInstanceMediaMessage: vi.fn(),
  sendWhatsappInstanceTextMessage: vi.fn(),
  sendWhatsappTextMessage: vi.fn(),
  sendUazapiCarouselMessage: vi.fn(),
  sendUazapiTextMessage: vi.fn(),
  sendUazapiVideoMessage: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("../../lib/env.js", () => ({
  env: {
    REDIS_URL: "",
    EVOLUTION_INSTANCE_NAME: "default-instance",
    EVOLUTION_API_BASE_URL: "https://evolution.example",
    EVOLUTION_API_KEY: "evolution-key",
  },
}));

vi.mock("../../lib/logger.js", () => ({
  logger: {
    info: mocks.loggerInfo,
    error: mocks.loggerError,
  },
}));

vi.mock("./whatsappCampaignService.js", () => ({
  claimRecipientForDispatch: mocks.claimRecipientForDispatch,
  listDueWhatsappCampaignRecipientJobs: mocks.listDueWhatsappCampaignRecipientJobs,
  markRecipientDispatchClaimFailed: mocks.markRecipientDispatchClaimFailed,
  markRecipientFailed: mocks.markRecipientFailed,
  markRecipientSent: mocks.markRecipientSent,
  recoverWhatsappCampaignDispatchClaimFailures: mocks.recoverWhatsappCampaignDispatchClaimFailures,
  resetStaleSendingRecipients: mocks.resetStaleSendingRecipients,
}));

vi.mock("./evolutionService.js", () => ({
  sendWhatsappInstanceMediaMessage: mocks.sendWhatsappInstanceMediaMessage,
  sendWhatsappInstanceTextMessage: mocks.sendWhatsappInstanceTextMessage,
  sendWhatsappTextMessage: mocks.sendWhatsappTextMessage,
}));

vi.mock("./uazapiService.js", () => ({
  sendUazapiCarouselMessage: mocks.sendUazapiCarouselMessage,
  sendUazapiTextMessage: mocks.sendUazapiTextMessage,
  sendUazapiVideoMessage: mocks.sendUazapiVideoMessage,
}));

const { resumeDueWhatsappCampaignRecipients } = await import("./whatsappQueue.js");

const baseContext = {
  recipientId: "recipient-1",
  campaignId: "campaign-1",
  groupId: "group-1",
  customerId: "customer-1",
  templateId: null,
  jid: "120363123456789@g.us",
  messageText: "",
  messageType: "VIDEO",
  carouselData: null,
  videoUrl: "data:video/mp4;base64,AAAA",
  sourceName: "Grupo teste",
  sourceCode: null,
  createdByUserId: "user-1",
  createdByName: "Admin",
  evolutionInstance: null,
  uazapiInstance: null,
} as const;

describe("resumeDueWhatsappCampaignRecipients", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.recoverWhatsappCampaignDispatchClaimFailures.mockResolvedValue({ recovered: 0, campaignIds: [] });
    mocks.resetStaleSendingRecipients.mockResolvedValue(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("dispatches due UazAPI video campaign recipients and marks them sent", async () => {
    const providerPayload = { key: { id: "uaz-message-1" }, status: "SENT" };
    const uazapiInstance = { baseUrl: "https://uazapi.example", token: "uaz-token" };
    mocks.listDueWhatsappCampaignRecipientJobs.mockResolvedValueOnce([
      { recipientId: "recipient-uaz", campaignId: "campaign-1", delayMs: 0 },
    ]);
    mocks.claimRecipientForDispatch.mockResolvedValueOnce({
      ...baseContext,
      recipientId: "recipient-uaz",
      uazapiInstance,
    });
    mocks.sendUazapiVideoMessage.mockResolvedValueOnce(providerPayload);
    mocks.markRecipientSent.mockResolvedValueOnce(undefined);

    await expect(resumeDueWhatsappCampaignRecipients("campaign-1", 1)).resolves.toEqual({
      candidates: 1,
      started: 1,
    });
    await vi.runAllTimersAsync();

    expect(mocks.sendUazapiVideoMessage).toHaveBeenCalledWith(
      uazapiInstance,
      "120363123456789@g.us",
      "data:video/mp4;base64,AAAA",
      "",
    );
    expect(mocks.recoverWhatsappCampaignDispatchClaimFailures).toHaveBeenCalledWith({
      campaignId: "campaign-1",
      limit: 1,
    });
    expect(mocks.markRecipientSent).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: "recipient-uaz" }),
      providerPayload,
      "uaz-message-1",
      "SENT",
    );
    expect(mocks.markRecipientFailed).not.toHaveBeenCalled();
  });

  it("dispatches due Evolution video campaign recipients and marks them sent", async () => {
    const providerPayload = { key: { id: "evo-message-1" }, status: "SENT" };
    const evolutionInstance = {
      instanceName: "evolution-instance",
      evolutionBaseUrl: "https://evolution.example",
      evolutionApiKey: "evolution-key",
    };
    mocks.listDueWhatsappCampaignRecipientJobs.mockResolvedValueOnce([
      { recipientId: "recipient-evo", campaignId: "campaign-1", delayMs: 0 },
    ]);
    mocks.claimRecipientForDispatch.mockResolvedValueOnce({
      ...baseContext,
      recipientId: "recipient-evo",
      messageText: "Legenda opcional",
      evolutionInstance,
    });
    mocks.sendWhatsappInstanceMediaMessage.mockResolvedValueOnce(providerPayload);
    mocks.markRecipientSent.mockResolvedValueOnce(undefined);

    await expect(resumeDueWhatsappCampaignRecipients("campaign-1", 1)).resolves.toEqual({
      candidates: 1,
      started: 1,
    });
    await vi.runAllTimersAsync();

    expect(mocks.sendWhatsappInstanceMediaMessage).toHaveBeenCalledWith(
      evolutionInstance,
      "120363123456789@g.us",
      "data:video/mp4;base64,AAAA",
      "video",
      "video.mp4",
      "Legenda opcional",
    );
    expect(mocks.markRecipientSent).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: "recipient-evo" }),
      providerPayload,
      "evo-message-1",
      "SENT",
    );
    expect(mocks.markRecipientFailed).not.toHaveBeenCalled();
  });

  it("marks a due pending recipient as failed when the dispatch claim crashes", async () => {
    mocks.listDueWhatsappCampaignRecipientJobs.mockResolvedValueOnce([
      { recipientId: "recipient-error", campaignId: "campaign-1", delayMs: 0 },
    ]);
    mocks.claimRecipientForDispatch.mockRejectedValueOnce(new Error("database timeout"));
    mocks.markRecipientDispatchClaimFailed.mockResolvedValueOnce({ failed: true, recipientId: "recipient-error" });

    await expect(resumeDueWhatsappCampaignRecipients("campaign-1", 1)).resolves.toEqual({
      candidates: 1,
      started: 1,
    });
    await vi.runAllTimersAsync();

    expect(mocks.markRecipientDispatchClaimFailed).toHaveBeenCalledWith("recipient-error", "database timeout");
    expect(mocks.sendUazapiVideoMessage).not.toHaveBeenCalled();
    expect(mocks.sendWhatsappInstanceMediaMessage).not.toHaveBeenCalled();
    expect(mocks.markRecipientSent).not.toHaveBeenCalled();
  });
});

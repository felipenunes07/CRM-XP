import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { WhatsappCampaignDetail, WhatsappCampaignRecipient } from "@olist-crm/shared";
import {
  CampaignPerformancePanel,
  campaignPerformanceFilterCount,
  campaignHasDuePendingRecipients,
  filterCampaignRecipients,
  validateDisparadorVideoFile,
  WHATSAPP_VIDEO_MAX_FILE_SIZE_BYTES,
} from "./DisparadorPage";

vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({
    token: "token",
    user: { name: "Admin", role: "ADMIN" },
  }),
}));

const baseRecipient: WhatsappCampaignRecipient = {
  id: "recipient-1",
  campaignId: "campaign-1",
  groupId: "group-1",
  jid: "120363123@g.us",
  sourceName: "CL123 - Cliente Teste",
  sourceCode: "CL123",
  classification: "WITH_ORDER",
  mappingStatus: "AUTO_MAPPED",
  customerId: "customer-1",
  customerCode: "CL123",
  customerDisplayName: "Cliente Teste",
  status: "SENT",
  scheduledFor: "2026-06-01T12:00:00.000Z",
  lastAttemptAt: "2026-06-01T12:00:00.000Z",
  sentAt: "2026-06-01T12:01:00.000Z",
  failedAt: null,
  skippedAt: null,
  lastError: null,
  providerMessageId: "provider-1",
  providerStatus: "SENT",
  responsePayload: null,
  responded: false,
  firstResponseAt: null,
  responseCount: 0,
  purchased: false,
  firstOrderAt: null,
  ordersCount: 0,
  pieces: 0,
  revenue: 0,
  createdAt: "2026-06-01T12:00:00.000Z",
  updatedAt: "2026-06-01T12:01:00.000Z",
};

const respondedBuyer: WhatsappCampaignRecipient = {
  ...baseRecipient,
  id: "recipient-2",
  customerId: "customer-2",
  customerCode: "CL456",
  customerDisplayName: "Cliente Comprador",
  responded: true,
  firstResponseAt: "2026-06-01T13:00:00.000Z",
  responseCount: 2,
  purchased: true,
  firstOrderAt: "2026-06-02T00:00:00.000Z",
  ordersCount: 1,
  pieces: 12,
  revenue: 1500,
};

const blockedRecipient: WhatsappCampaignRecipient = {
  ...baseRecipient,
  id: "recipient-3",
  customerId: "customer-3",
  customerCode: "CL789",
  customerDisplayName: "Cliente Bloqueado",
  status: "BLOCKED_RECENT",
  sentAt: null,
};

const campaign: WhatsappCampaignDetail = {
  id: "campaign-1",
  name: "Campanha Junho",
  status: "COMPLETED",
  whatsappInstanceId: null,
  templateId: null,
  templateTitle: null,
  savedSegmentId: null,
  savedSegmentName: null,
  messageText: "Mensagem comercial da campanha",
  messageType: "TEXT",
  carouselData: null,
  menuData: null,
  videoUrl: null,
  minDelaySeconds: 183,
  maxDelaySeconds: 304,
  overrideRecentBlock: false,
  createdByUserId: "user-1",
  createdByName: "Admin",
  createdAt: "2026-06-01T12:00:00.000Z",
  scheduledStartAt: null,
  startedAt: "2026-06-01T12:00:00.000Z",
  finishedAt: "2026-06-01T12:10:00.000Z",
  cancelledAt: null,
  filtersSnapshot: {},
  progress: {
    totalRecipients: 3,
    pendingCount: 0,
    blockedRecentCount: 1,
    sendingCount: 0,
    sentCount: 2,
    failedCount: 0,
    skippedCount: 0,
    completedCount: 3,
    remainingCount: 0,
    completionRatio: 1,
    nextScheduledAt: null,
    estimatedFinishAt: null,
  },
  recipients: [baseRecipient, respondedBuyer, blockedRecipient],
  performance: {
    attributionWindowDays: 7,
    totalRecipients: 3,
    eligibleRecipients: 2,
    sentRecipients: 2,
    blockedRecipients: 1,
    failedRecipients: 0,
    skippedRecipients: 0,
    respondedRecipients: 1,
    notRespondedRecipients: 1,
    purchasedRecipients: 1,
    responseRate: 0.5,
    purchaseRate: 0.5,
    orderCount: 1,
    pieces: 12,
    revenue: 1500,
    sentMessages: 2,
    receivedMessages: 2,
    diagnosis: {
      tone: "success",
      title: "Campanha performou bem",
      description: "O publico respondeu e comprou.",
    },
    recipients: [
      {
        recipientId: "recipient-1",
        responded: false,
        firstResponseAt: null,
        responseCount: 0,
        purchased: false,
        firstOrderAt: null,
        ordersCount: 0,
        pieces: 0,
        revenue: 0,
      },
      {
        recipientId: "recipient-2",
        responded: true,
        firstResponseAt: "2026-06-01T13:00:00.000Z",
        responseCount: 2,
        purchased: true,
        firstOrderAt: "2026-06-02T00:00:00.000Z",
        ordersCount: 1,
        pieces: 12,
        revenue: 1500,
      },
    ],
    messages: [
      {
        id: "message-out-1",
        recipientId: "recipient-2",
        campaignId: "campaign-1",
        customerId: "customer-2",
        customerCode: "CL456",
        customerDisplayName: "Cliente Comprador",
        jid: "120363123@g.us",
        direction: "OUTBOUND",
        source: "message_logs",
        senderName: "Admin",
        content: "Mensagem comercial da campanha",
        createdAt: "2026-06-01T12:01:00.000Z",
      },
      {
        id: "message-in-1",
        recipientId: "recipient-2",
        campaignId: "campaign-1",
        customerId: "customer-2",
        customerCode: "CL456",
        customerDisplayName: "Cliente Comprador",
        jid: "120363123@g.us",
        direction: "INBOUND",
        source: "deal_activities",
        senderName: "Cliente Comprador",
        content: "Quero comprar",
        createdAt: "2026-06-01T13:00:00.000Z",
      },
    ],
  },
  recipientsPage: {
    total: 3,
    offset: 0,
    limit: 200,
    hasMore: false,
  },
};

describe("Disparador campaign performance", () => {
  it("filters responded, non-responded and purchased campaign recipients", () => {
    expect(filterCampaignRecipients(campaign.recipients, "RESPONDED").map((recipient) => recipient.id)).toEqual(["recipient-2"]);
    expect(filterCampaignRecipients(campaign.recipients, "NO_RESPONSE").map((recipient) => recipient.id)).toEqual(["recipient-1"]);
    expect(filterCampaignRecipients(campaign.recipients, "PURCHASED").map((recipient) => recipient.id)).toEqual(["recipient-2"]);
  });

  it("builds filter counts from campaign performance totals", () => {
    expect(campaignPerformanceFilterCount("RESPONDED", campaign)).toBe("1");
    expect(campaignPerformanceFilterCount("NO_RESPONSE", campaign)).toBe("1");
    expect(campaignPerformanceFilterCount("ISSUES", campaign)).toBe("1");
  });

  it("filters responded, non-responded and purchased campaign recipients", () => {
    expect(filterCampaignRecipients(campaign.recipients, "RESPONDED").map((recipient) => recipient.id)).toEqual(["recipient-2"]);
    expect(filterCampaignRecipients(campaign.recipients, "NO_RESPONSE").map((recipient) => recipient.id)).toEqual(["recipient-1"]);
    expect(filterCampaignRecipients(campaign.recipients, "PURCHASED").map((recipient) => recipient.id)).toEqual(["recipient-2"]);
  });

  it("builds filter counts from campaign performance totals", () => {
    expect(campaignPerformanceFilterCount("RESPONDED", campaign)).toBe("1");
    expect(campaignPerformanceFilterCount("NO_RESPONSE", campaign)).toBe("1");
    expect(campaignPerformanceFilterCount("ISSUES", campaign)).toBe("1");
  });

  it("renders performance cards, filters and attributed messages", () => {
    const markup = renderToStaticMarkup(
      <CampaignPerformancePanel
        campaign={campaign}
        activeFilter="ALL"
        recipients={campaign.recipients}
        onFilterChange={() => undefined}
        onOpenMiniChat={() => undefined}
      />,
    );

    expect(markup).toContain("Público");
    expect(markup).toContain("Responderam");
    expect(markup).toContain("Compraram");
    expect(markup).toContain("Nao responderam");
    expect(markup).toContain("Clientes da campanha");
    expect(markup).toContain("Mensagens da campanha");
    expect(markup).toContain("Quero comprar");
  });

  it("renders an empty state when the filtered recipient list has no rows", () => {
    const markup = renderToStaticMarkup(
      <CampaignPerformancePanel
        campaign={campaign}
        activeFilter="PURCHASED"
        recipients={[]}
        onFilterChange={() => undefined}
        onOpenMiniChat={() => undefined}
      />,
    );

    expect(markup).toContain("Nenhum cliente encontrado neste filtro.");
  });
});

describe("Disparador video upload validation", () => {
  it("accepts MP4 files up to the configured max size", () => {
    expect(
      validateDisparadorVideoFile({
        name: "campanha.mp4",
        size: WHATSAPP_VIDEO_MAX_FILE_SIZE_BYTES,
        type: "video/mp4",
      }),
    ).toBeNull();
  });

  it("rejects QuickTime files with a clear MP4-only message", () => {
    expect(
      validateDisparadorVideoFile({
        name: "campanha.mov",
        size: 1024,
        type: "video/quicktime",
      }),
    ).toContain("MP4");
  });

  it("rejects files above the configured max size", () => {
    expect(
      validateDisparadorVideoFile({
        name: "campanha.mp4",
        size: WHATSAPP_VIDEO_MAX_FILE_SIZE_BYTES + 1,
        type: "video/mp4",
      }),
    ).toContain("64MB");
  });
});

describe("Disparador live campaign recovery", () => {
  it("detects a running campaign with a pending recipient past its scheduled time", () => {
    const runningCampaign: WhatsappCampaignDetail = {
      ...campaign,
      status: "QUEUED",
      progress: {
        ...campaign.progress,
        pendingCount: 1,
        remainingCount: 1,
        nextScheduledAt: "2026-06-08T14:00:00.000Z",
      },
      recipients: [
        {
          ...baseRecipient,
          status: "PENDING",
          scheduledFor: "2026-06-08T14:00:00.000Z",
          sentAt: null,
          lastAttemptAt: null,
        },
      ],
    };

    expect(campaignHasDuePendingRecipients(runningCampaign, Date.parse("2026-06-08T14:00:31.000Z"))).toBe(true);
    expect(campaignHasDuePendingRecipients(runningCampaign, Date.parse("2026-06-08T13:59:59.000Z"))).toBe(false);
  });
});

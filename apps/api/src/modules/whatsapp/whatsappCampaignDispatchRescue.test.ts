import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();

vi.mock("../../db/client.js", () => ({
  pool: {
    query: queryMock,
  },
}));

const { listDueWhatsappCampaignRecipientJobs } = await import("./whatsappCampaignService.js");

describe("listDueWhatsappCampaignRecipientJobs", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("returns due pending campaign recipients as immediate dispatch jobs", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "recipient-1",
          campaign_id: "campaign-1",
          scheduled_for: "2026-06-08T14:00:00.000Z",
        },
      ],
    });

    const jobs = await listDueWhatsappCampaignRecipientJobs({
      campaignId: "campaign-1",
      limit: 10,
      now: new Date("2026-06-08T14:01:00.000Z"),
    });

    expect(jobs).toEqual([
      {
        recipientId: "recipient-1",
        campaignId: "campaign-1",
        delayMs: 0,
      },
    ]);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("r.status = 'PENDING'"), [
      "2026-06-08T14:01:00.000Z",
      "campaign-1",
      10,
    ]);
  });
});

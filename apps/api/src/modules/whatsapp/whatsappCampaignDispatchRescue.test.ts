import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const connectMock = vi.fn();
const clientQueryMock = vi.fn();
const releaseMock = vi.fn();

vi.mock("../../db/client.js", () => ({
  pool: {
    connect: connectMock,
    query: queryMock,
  },
}));

const {
  claimRecipientForDispatch,
  listDueWhatsappCampaignRecipientJobs,
  recoverWhatsappCampaignDispatchClaimFailures,
} = await import("./whatsappCampaignService.js");

describe("listDueWhatsappCampaignRecipientJobs", () => {
  beforeEach(() => {
    queryMock.mockReset();
    connectMock.mockReset();
    clientQueryMock.mockReset();
    releaseMock.mockReset();
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

  it("locks only the recipient row when claiming dispatch after optional instance joins", async () => {
    connectMock.mockResolvedValueOnce({
      query: clientQueryMock,
      release: releaseMock,
    });
    clientQueryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(claimRecipientForDispatch("recipient-1")).resolves.toBeNull();

    const [selectSql] = clientQueryMock.mock.calls[1] as [string, unknown[]];
    expect(selectSql).toContain("LEFT JOIN whatsapp_instances");
    expect(selectSql).toContain("FOR UPDATE OF r");
    expect(releaseMock).toHaveBeenCalled();
  });

  it("recovers only recipients that failed before provider dispatch because of the FOR UPDATE join error", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          recovered_count: 2,
          campaign_ids: ["campaign-1"],
        },
      ],
    });

    const result = await recoverWhatsappCampaignDispatchClaimFailures({
      campaignId: "campaign-1",
      limit: 2,
    });

    expect(result).toEqual({ recovered: 2, campaignIds: ["campaign-1"] });
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("r.status = 'FAILED'");
    expect(sql).toContain("r.last_error LIKE $1");
    expect(sql).toContain("status = 'PENDING'");
    expect(sql).toContain("finished_at = NULL");
    expect(params).toEqual(["FOR UPDATE cannot be applied to the nullable side of an outer join%", 2, "campaign-1"]);
  });
});

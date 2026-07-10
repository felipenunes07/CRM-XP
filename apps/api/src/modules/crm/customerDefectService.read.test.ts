import { beforeEach, describe, expect, it, vi } from "vitest";

const { poolQueryMock, downloadFileByPathMock, listDropboxFilesMock } = vi.hoisted(() => ({
  poolQueryMock: vi.fn(),
  downloadFileByPathMock: vi.fn(),
  listDropboxFilesMock: vi.fn(),
}));

vi.mock("../../db/client.js", () => ({
  pool: {
    query: poolQueryMock,
    connect: vi.fn(),
  },
}));

vi.mock("../../lib/dropboxClient.js", () => ({
  cleanupTempFile: vi.fn(),
  downloadFileByPath: downloadFileByPathMock,
  downloadLatestFileByPrefix: vi.fn(),
  listDropboxFiles: listDropboxFilesMock,
}));

import { getCustomerDefectOverview } from "./customerDefectService.js";

describe("customer defect cached overview", () => {
  beforeEach(() => {
    poolQueryMock.mockReset();
    downloadFileByPathMock.mockReset();
    listDropboxFilesMock.mockReset();
  });

  it("serves the active snapshot without scanning Dropbox or loading movement payloads", async () => {
    poolQueryMock
      .mockResolvedValueOnce({
        rows: [{
          id: "snapshot-1",
          sourceFileId: null,
          sourceFilePath: "/defeitos.xlsx",
          sourceFileName: "defeitos.xlsx",
          sourceFileSizeBytes: 25_000_000,
          sourceFileUpdatedAt: "2026-07-04T13:03:36.000Z",
          sourceFiles: [],
          parserVersion: 5,
          periodStartDate: "2023-05-17",
          periodEndDate: "2026-07-04",
          totalRows: 169_983,
          matchedRows: 663,
          unmatchedRows: 11,
          importedAt: "2026-07-04T14:00:00.000Z",
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const overview = await getCustomerDefectOverview();

    expect(overview.snapshot?.id).toBe("snapshot-1");
    expect(listDropboxFilesMock).not.toHaveBeenCalled();
    expect(downloadFileByPathMock).not.toHaveBeenCalled();
    expect(poolQueryMock).toHaveBeenCalledTimes(2);
    expect(String(poolQueryMock.mock.calls[1]?.[0])).toContain("yearly_breakdown");
    expect(String(poolQueryMock.mock.calls[1]?.[0])).not.toContain("raw_payload");
  });
});

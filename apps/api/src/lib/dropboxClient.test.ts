import { beforeEach, describe, expect, it, vi } from "vitest";

const { filesListFolderMock, filesDownloadMock } = vi.hoisted(() => ({
  filesListFolderMock: vi.fn(),
  filesDownloadMock: vi.fn(),
}));

vi.mock("dropbox", () => ({
  Dropbox: class {
    filesListFolder = filesListFolderMock;
    filesDownload = filesDownloadMock;
  },
}));

import { findLatestDropboxFileByPrefix } from "./dropboxClient.js";

describe("findLatestDropboxFileByPrefix", () => {
  beforeEach(() => {
    filesListFolderMock.mockReset();
    filesDownloadMock.mockReset();
  });

  it("returns metadata for the newest matching workbook without downloading it", async () => {
    filesListFolderMock.mockResolvedValue({
      result: {
        entries: [
          {
            ".tag": "file",
            name: "SALDO VENDAS - 21.07.xlsx",
            path_display: "/XP SALDO TEMPORARIO/SALDO VENDAS - 21.07.xlsx",
            path_lower: "/xp saldo temporario/saldo vendas - 21.07.xlsx",
            size: 61_000_000,
            server_modified: "2026-07-21T20:00:00.000Z",
          },
          {
            ".tag": "file",
            name: "SALDO VENDAS - 22.07.xlsx",
            path_display: "/XP SALDO TEMPORARIO/SALDO VENDAS - 22.07.xlsx",
            path_lower: "/xp saldo temporario/saldo vendas - 22.07.xlsx",
            size: 62_333_071,
            server_modified: "2026-07-22T20:01:10.000Z",
          },
          {
            ".tag": "file",
            name: "OUTRO RELATORIO.xlsx",
            path_display: "/XP SALDO TEMPORARIO/OUTRO RELATORIO.xlsx",
            path_lower: "/xp saldo temporario/outro relatorio.xlsx",
            size: 99,
            server_modified: "2026-07-23T20:00:00.000Z",
          },
        ],
      },
    });

    await expect(
      findLatestDropboxFileByPrefix("/XP SALDO TEMPORARIO", "SALDO VENDAS"),
    ).resolves.toEqual({
      sourcePath: "/XP SALDO TEMPORARIO/SALDO VENDAS - 22.07.xlsx",
      fileName: "SALDO VENDAS - 22.07.xlsx",
      fileSizeBytes: 62_333_071,
      fileUpdatedAt: "2026-07-22T20:01:10.000Z",
    });

    expect(filesDownloadMock).not.toHaveBeenCalled();
  });
});

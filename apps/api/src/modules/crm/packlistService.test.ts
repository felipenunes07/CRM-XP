import { beforeEach, describe, expect, it, vi } from "vitest";
import XLSX from "xlsx";

const mocks = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn(), connect: vi.fn(), stat: vi.fn(), readFile: vi.fn(),
  list: vi.fn(), download: vi.fn(), cleanup: vi.fn(),
  env: { PACKLIST_WORKBOOK_PATH: "local.xlsx", DROPBOX_PACKLIST_FILE_PATH: "/Packlist/Telas PACKLIST.xlsx",
    PACKLIST_SYNC_INTERVAL_MINUTES: 15, DROPBOX_ACCESS_TOKEN: "test-token", DROPBOX_REFRESH_TOKEN: "", DROPBOX_APP_KEY: "" },
}));
vi.mock("../../db/client.js", () => ({ pool: { connect: mocks.connect, query: mocks.query } }));
vi.mock("../../lib/env.js", () => ({ env: mocks.env }));
vi.mock("node:fs/promises", () => ({ default: { stat: mocks.stat, readFile: mocks.readFile } }));
vi.mock("../../lib/dropboxClient.js", () => ({ listDropboxFiles: mocks.list, downloadFileByPath: mocks.download, cleanupTempFile: mocks.cleanup }));
import { syncPacklist } from "./packlistService.js";

const updatedAt = "2026-11-06T21:04:00.000Z";
function sourceBytes() {
  const sheet = XLSX.utils.aoa_to_sheet([
    [], ["", "", "", "", "", "", "", "", "8 CAIXAS 29/09"],
    ["", "SKU", "Produto", "", "", "", "", "", "LOT-1"],
    ["", "0001-1", "Tela", "", "", "", "", "", 20],
  ]);
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, "PACKLIST");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
  mocks.query.mockImplementation(async (sql: string) => ({ rows: sql.includes("pg_try_advisory_lock") ? [{ locked: true }] : [] }));
  const bytes = sourceBytes();
  mocks.readFile.mockResolvedValue(bytes);
  mocks.stat.mockResolvedValue({ mtime: new Date(updatedAt), size: bytes.length });
});

describe("Packlist synchronization", () => {
  it("saves an atomically replaced snapshot with parsed pending quantities", async () => {
    await syncPacklist();
    const insert = mocks.query.mock.calls.find(([sql]) => sql.includes("source_size, imported_at"));
    expect(JSON.parse(insert?.[1][3]).lots[0]).toMatchObject({ id: "LOT-1", arrivalDate: "2026-11-28", quantities: { "0001-1": 20 } });
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.query).toHaveBeenCalledWith("SELECT pg_advisory_unlock(8208, 1)");
  });

  it("checks metadata without reading the workbook again when unchanged", async () => {
    mocks.query.mockImplementation(async (sql: string) => ({ rows: sql.includes("pg_try_advisory_lock") ? [{ locked: true }] :
      sql.startsWith("SELECT source_path") ? [{ source_path: "local.xlsx", source_updated_at: updatedAt, source_size: sourceBytes().length, data: { lots: [] } }] : [] }));
    await syncPacklist();
    expect(mocks.readFile).not.toHaveBeenCalled();
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("last_error = NULL"));
  });

  it("records failure without overwriting the last good data", async () => {
    mocks.readFile.mockResolvedValue(Buffer.alloc(sourceBytes().length));
    await expect(syncPacklist()).rejects.toThrow();
    const writes = mocks.query.mock.calls.filter(([sql]) => sql.startsWith("INSERT"));
    expect(writes).toHaveLength(1);
    expect(writes[0]?.[0]).toContain("last_error = EXCLUDED.last_error");
    expect(writes[0]?.[0]).not.toContain("data =");
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("does not publish a workbook saved during the read", async () => {
    mocks.stat.mockResolvedValueOnce({ mtime: new Date(updatedAt), size: sourceBytes().length })
      .mockResolvedValueOnce({ mtime: new Date("2026-11-06T21:05:00Z"), size: sourceBytes().length });
    await expect(syncPacklist()).rejects.toThrow("está sendo salvo");
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes("data = EXCLUDED.data"))).toBe(false);
  });

  it("uses Dropbox when the local file is unavailable and cleans the downloaded file", async () => {
    mocks.stat.mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" }));
    mocks.list.mockResolvedValue([{ ".tag": "file", name: "Telas PACKLIST.xlsx", server_modified: updatedAt, size: sourceBytes().length, path_display: "/Packlist/Telas PACKLIST.xlsx" }]);
    mocks.download.mockResolvedValue({ localPath: "downloaded.xlsx", fileUpdatedAt: updatedAt });
    await syncPacklist();
    expect(mocks.download).toHaveBeenCalledWith("/Packlist/Telas PACKLIST.xlsx");
    expect(mocks.cleanup).toHaveBeenCalledWith("downloaded.xlsx");
  });

  it("leaves another replica's import alone", async () => {
    mocks.query.mockResolvedValue({ rows: [{ locked: false }] });
    await syncPacklist();
    expect(mocks.stat).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledOnce();
  });
});

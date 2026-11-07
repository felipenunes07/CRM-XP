import fs from "node:fs/promises";
import path from "node:path";
import type { InventoryPacklistMeta } from "@olist-crm/shared";
import { pool } from "../../db/client.js";
import { env } from "../../lib/env.js";
import { cleanupTempFile, downloadFileByPath, listDropboxFiles } from "../../lib/dropboxClient.js";
import { logger } from "../../lib/logger.js";
import { startRecurringJob } from "../platform/scheduledJobs.js";
import { parsePacklistWorkbook, type PacklistData } from "./packlistCore.js";

export interface PacklistSnapshot {
  meta: InventoryPacklistMeta;
  data: PacklistData | null;
}

export async function getPacklistSnapshot(): Promise<PacklistSnapshot> {
  const result = await pool.query(`SELECT source_updated_at, imported_at, last_error, data FROM inventory_packlist_snapshot WHERE id = 1`);
  const row = result.rows[0];
  const data = (row?.data as PacklistData | null) ?? null;
  return { data, meta: {
    sourceUpdatedAt: row?.source_updated_at ? new Date(row.source_updated_at).toISOString() : null,
    importedAt: row?.imported_at ? new Date(row.imported_at).toISOString() : null,
    lastError: row?.last_error ?? null,
    receivedLots: data?.receivedLots ?? 0,
    pendingLots: data?.lots.length ?? 0,
  } };
}

async function findSource() {
  if (env.PACKLIST_WORKBOOK_PATH) {
    try {
      const stat = await fs.stat(env.PACKLIST_WORKBOOK_PATH);
      return { sourcePath: env.PACKLIST_WORKBOOK_PATH, updatedAt: stat.mtime.toISOString(), size: stat.size, local: true };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  if (!(env.DROPBOX_ACCESS_TOKEN || (env.DROPBOX_REFRESH_TOKEN && env.DROPBOX_APP_KEY))) {
    throw new Error("Packlist local não encontrado e Dropbox não configurado.");
  }
  const entries = await listDropboxFiles(path.posix.dirname(env.DROPBOX_PACKLIST_FILE_PATH));
  const entry = entries.find((item) => item[".tag"] === "file" && item.name.toLowerCase() === path.posix.basename(env.DROPBOX_PACKLIST_FILE_PATH).toLowerCase());
  if (!entry || entry[".tag"] !== "file") throw new Error("O arquivo Packlist não foi encontrado no Dropbox.");
  return { sourcePath: entry.path_display ?? env.DROPBOX_PACKLIST_FILE_PATH, updatedAt: entry.server_modified, size: entry.size, local: false };
}

export async function syncPacklist() {
  const client = await pool.connect();
  let locked = false;
  let downloadedPath: string | null = null;
  try {
    locked = Boolean((await client.query("SELECT pg_try_advisory_lock(8208, 1) AS locked")).rows[0]?.locked);
    if (!locked) return;
    const source = await findSource();
    const previous = (await client.query("SELECT source_path, source_updated_at, source_size, data FROM inventory_packlist_snapshot WHERE id = 1")).rows[0];
    if (previous?.data && previous.source_path === source.sourcePath &&
        new Date(previous.source_updated_at).getTime() === new Date(source.updatedAt).getTime() && Number(previous.source_size) === source.size) {
      await client.query("UPDATE inventory_packlist_snapshot SET checked_at = NOW(), last_error = NULL WHERE id = 1");
      return;
    }
    if (!source.local) {
      const downloaded = await downloadFileByPath(source.sourcePath);
      downloadedPath = downloaded.localPath;
      if (new Date(downloaded.fileUpdatedAt).getTime() !== new Date(source.updatedAt).getTime()) {
        throw new Error("O Packlist mudou durante a leitura. A próxima sincronização tentará novamente.");
      }
    }
    const bytes = await fs.readFile(downloadedPath ?? source.sourcePath);
    if (bytes.length !== source.size) throw new Error("O tamanho do Packlist mudou durante a leitura. Tente novamente após salvar.");
    if (source.local) {
      const stat = await fs.stat(source.sourcePath);
      if (stat.mtime.toISOString() !== source.updatedAt || stat.size !== bytes.length) {
        throw new Error("O Packlist está sendo salvo. A próxima sincronização tentará novamente.");
      }
    }
    const data = parsePacklistWorkbook(bytes, source.updatedAt);
    await client.query(`INSERT INTO inventory_packlist_snapshot
      (id, source_path, source_updated_at, source_size, imported_at, checked_at, data, last_error)
      VALUES (1, $1, $2, $3, NOW(), NOW(), $4::jsonb, NULL)
      ON CONFLICT (id) DO UPDATE SET source_path = EXCLUDED.source_path, source_updated_at = EXCLUDED.source_updated_at,
        source_size = EXCLUDED.source_size, imported_at = NOW(), checked_at = NOW(), data = EXCLUDED.data, last_error = NULL`,
    [source.sourcePath, source.updatedAt, source.size, JSON.stringify(data)]);
    logger.info("packlist synchronized", { pendingLots: data.lots.length, receivedLots: data.receivedLots });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível sincronizar o Packlist.";
    // Preserve the last valid snapshot; a failed import must never erase incoming stock.
    await client.query(`INSERT INTO inventory_packlist_snapshot(id, checked_at, last_error) VALUES (1, NOW(), $1)
      ON CONFLICT (id) DO UPDATE SET checked_at = NOW(), last_error = EXCLUDED.last_error`, [message]);
    throw error;
  } finally {
    if (downloadedPath) await cleanupTempFile(downloadedPath);
    if (locked) await client.query("SELECT pg_advisory_unlock(8208, 1)").catch(() => undefined);
    client.release();
  }
}

export function startPacklistScheduler() {
  return startRecurringJob({ intervalMs: env.PACKLIST_SYNC_INTERVAL_MINUTES * 60_000, run: syncPacklist,
    onError: (error) => logger.error("packlist sync failed; previous snapshot preserved", { error: String(error) }) });
}

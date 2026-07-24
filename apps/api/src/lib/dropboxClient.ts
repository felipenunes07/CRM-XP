import { Dropbox } from "dropbox";
import fetch from "isomorphic-fetch";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { env } from "./env.js";
import { logger } from "./logger.js";

const dbx = new Dropbox({
  accessToken: env.DROPBOX_REFRESH_TOKEN ? undefined : env.DROPBOX_ACCESS_TOKEN,
  refreshToken: env.DROPBOX_REFRESH_TOKEN,
  clientId: env.DROPBOX_APP_KEY,
  clientSecret: env.DROPBOX_APP_SECRET,
  fetch,
});

export interface DropboxFileMetadata {
  sourcePath: string;
  fileName: string;
  fileSizeBytes: number;
  fileUpdatedAt: string;
}

export async function listDropboxFiles(folderPath: string) {
  try {
    const response = await dbx.filesListFolder({ path: folderPath });
    return response.result.entries;
  } catch (error) {
    logger.error("Error listing Dropbox files", { folderPath, error });
    throw error;
  }
}

export async function findLatestDropboxFileByPrefix(
  folderPath: string,
  prefix: string,
): Promise<DropboxFileMetadata | null> {
  try {
    const entries = await listDropboxFiles(folderPath);

    const candidates = entries
      .filter((entry): entry is any => entry[".tag"] === "file")
      .filter((entry) => entry.name.toLowerCase().endsWith(".xlsx"))
      .filter((entry) => entry.name.toLowerCase().startsWith(prefix.toLowerCase()));

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort((a, b) => {
      return new Date(b.server_modified).getTime() - new Date(a.server_modified).getTime();
    });

    const latest = candidates[0];
    return {
      sourcePath: latest.path_display ?? latest.path_lower ?? latest.name,
      fileName: latest.name,
      fileSizeBytes: latest.size,
      fileUpdatedAt: latest.server_modified,
    };
  } catch (error) {
    logger.error("Error finding latest file in Dropbox", { folderPath, prefix, error });
    throw error;
  }
}

export async function downloadLatestFileByPrefix(folderPath: string, prefix: string) {
  const latest = await findLatestDropboxFileByPrefix(folderPath, prefix);
  if (!latest) {
    return null;
  }

  const downloaded = await downloadFileByPath(latest.sourcePath);
  return {
    ...downloaded,
    fileName: latest.fileName,
    fileSizeBytes: latest.fileSizeBytes,
    fileUpdatedAt: latest.fileUpdatedAt,
  };
}

export async function downloadFileByPath(dropboxPath: string) {
  try {
    logger.info("Downloading file from Dropbox", { dropboxPath });
    const response = await dbx.filesDownload({ path: dropboxPath });
    const fileBuffer = (response.result as any).fileBinary;
    const fileName = response.result.name;
    
    // Create a temp file
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "crm-xp-download-"));
    const tempFilePath = path.join(tempDir, fileName);
    
    await fs.writeFile(tempFilePath, fileBuffer);
    
    return {
      localPath: tempFilePath,
      sourcePath: response.result.path_display ?? response.result.path_lower ?? dropboxPath,
      fileName,
      fileSizeBytes: response.result.size,
      fileUpdatedAt: response.result.server_modified,
    };
  } catch (error) {
    logger.error("Error downloading file from Dropbox by path", { dropboxPath, error });
    throw error;
  }
}

export async function cleanupTempFile(filePath: string) {
  try {
    const dir = path.dirname(filePath);
    await fs.unlink(filePath);
    await fs.rmdir(dir);
  } catch (error) {
    logger.error("Error cleaning up temp file", { filePath, error });
  }
}

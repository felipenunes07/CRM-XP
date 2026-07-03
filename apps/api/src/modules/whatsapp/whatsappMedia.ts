import { promises as fsPromises } from "node:fs";
import path from "node:path";

export const OUTBOUND_VIDEO_MIME_TYPE = "video/mp4";
export const OUTBOUND_VIDEO_FILE_NAME = "video.mp4";
export const CAMPAIGN_VIDEO_PUBLIC_PATH = "/media/campaign-videos";
export const CAMPAIGN_IMAGE_PUBLIC_PATH = "/media/campaign-images";

// Extensão de arquivo a partir do mime de imagem, para salvar o upload com a
// extensão certa (o express infere o Content-Type pela extensão ao servir).
export const IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

const dataUrlMimePattern = /^data:([^;,]+)(?:;[^,]*)*;base64,/i;
const unsupportedVideoUrlExtensionPattern = /\.(mov|qt|webm|ogg|ogv|avi|mkv|wmv|flv|3gp|m4v)(?:[?#].*)?$/i;

export function getCampaignMediaDir() {
  return process.env.CAMPAIGN_MEDIA_DIR || path.join(process.cwd(), "uploads", "campaign-media");
}

export function getDataUrlMimeType(value: string) {
  const match = value.match(dataUrlMimePattern);
  return match?.[1]?.toLowerCase() ?? null;
}

export function assertSupportedOutboundVideo(value: string) {
  const mimeType = getDataUrlMimeType(value);

  if (mimeType && mimeType !== OUTBOUND_VIDEO_MIME_TYPE) {
    throw new Error("Formato de video invalido. Envie um arquivo MP4 (video/mp4).");
  }

  if (!mimeType && unsupportedVideoUrlExtensionPattern.test(value.trim())) {
    throw new Error("Formato de video invalido. URLs de video precisam apontar para um arquivo MP4.");
  }
}

export function getOutboundMediaMimeType(value: string, mediaType: "image" | "video" | "audio" | "document") {
  if (mediaType === "video") {
    assertSupportedOutboundVideo(value);
    return OUTBOUND_VIDEO_MIME_TYPE;
  }

  const mimeType = getDataUrlMimeType(value);
  if (mimeType) return mimeType;

  if (mediaType === "image") return "image/png";
  if (mediaType === "audio") return "audio/mp3";
  return "application/octet-stream";
}

export function getOutboundMediaFileName(mediaType: "image" | "video" | "audio" | "document", fileName?: string) {
  if (mediaType === "video") return OUTBOUND_VIDEO_FILE_NAME;
  return fileName || (mediaType === "image" ? "image.png" : "file");
}

export function getCampaignVideoObjectName(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("data:")) {
    return null;
  }

  let pathname = trimmed;
  try {
    pathname = new URL(trimmed).pathname;
  } catch {
    // Relative paths are accepted below.
  }

  const prefix = `${CAMPAIGN_VIDEO_PUBLIC_PATH}/`;
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const objectName = decodeURIComponent(pathname.slice(prefix.length));
  if (!objectName || objectName.includes("/") || objectName.includes("\\") || !objectName.toLowerCase().endsWith(".mp4")) {
    return null;
  }

  return objectName;
}

export async function resolveOutboundVideoPayload(value: string) {
  assertSupportedOutboundVideo(value);

  const objectName = getCampaignVideoObjectName(value);
  if (!objectName) {
    return value;
  }

  const mediaDir = path.resolve(getCampaignMediaDir());
  const filePath = path.resolve(mediaDir, objectName);
  if (!filePath.startsWith(`${mediaDir}${path.sep}`)) {
    return value;
  }

  try {
    const buffer = await fsPromises.readFile(filePath);
    return `data:${OUTBOUND_VIDEO_MIME_TYPE};base64,${buffer.toString("base64")}`;
  } catch {
    return value;
  }
}

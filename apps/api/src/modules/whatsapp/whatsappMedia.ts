export const OUTBOUND_VIDEO_MIME_TYPE = "video/mp4";
export const OUTBOUND_VIDEO_FILE_NAME = "video.mp4";

const dataUrlMimePattern = /^data:([^;,]+)(?:;[^,]*)*;base64,/i;
const unsupportedVideoUrlExtensionPattern = /\.(mov|qt|webm|ogg|ogv|avi|mkv|wmv|flv|3gp|m4v)(?:[?#].*)?$/i;

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

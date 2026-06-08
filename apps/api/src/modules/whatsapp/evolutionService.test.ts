import { afterEach, describe, expect, it, vi } from "vitest";
import { sendWhatsappInstanceMediaMessage } from "./evolutionService.js";

const instance = {
  instanceName: "xp",
  evolutionBaseUrl: "https://evolution.example",
  evolutionApiKey: "secret",
};

describe("sendWhatsappInstanceMediaMessage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("rejects non-MP4 video data URLs before calling Evolution", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendWhatsappInstanceMediaMessage(
        instance,
        "5511999999999@s.whatsapp.net",
        "data:video/quicktime;base64,AAAA",
        "video",
        "clip.mov",
      ),
    ).rejects.toThrow("MP4");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends MP4 video data URLs with a consistent MP4 mime type and filename", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ key: { id: "message-1" } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await sendWhatsappInstanceMediaMessage(
      instance,
      "5511999999999@s.whatsapp.net",
      "data:video/mp4;base64,AAAA",
      "video",
      "clip.mov",
      "Legenda",
    );

    const [, requestInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const requestBody = JSON.parse(String(requestInit.body));
    expect(requestBody).toMatchObject({
      number: "5511999999999",
      mediatype: "video",
      mimetype: "video/mp4",
      media: "data:video/mp4;base64,AAAA",
      fileName: "video.mp4",
      caption: "Legenda",
    });
  });

  it("preserves WhatsApp group chat ids for campaign video sends", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ key: { id: "message-1" } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await sendWhatsappInstanceMediaMessage(
      instance,
      "120363123456789@g.us",
      "data:video/mp4;base64,AAAA",
      "video",
      "clip.mp4",
      "",
    );

    const [, requestInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const requestBody = JSON.parse(String(requestInit.body));
    expect(requestBody).toMatchObject({
      number: "120363123456789@g.us",
      mediatype: "video",
      mimetype: "video/mp4",
      fileName: "video.mp4",
      caption: "",
    });
  });
});

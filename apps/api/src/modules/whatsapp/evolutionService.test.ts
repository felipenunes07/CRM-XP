import { afterEach, describe, expect, it, vi } from "vitest";
import { disableInstanceWebhook, sendWhatsappInstanceMediaMessage } from "./evolutionService.js";

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

  it("disables message webhook events without disconnecting the instance", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({ enabled: false, events: [] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await disableInstanceWebhook(instance);

    const [url, requestInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://evolution.example/webhook/set/xp");
    expect(requestInit.method).toBe("POST");
    expect(JSON.parse(String(requestInit.body))).toMatchObject({
      webhook: {
        enabled: false,
        events: [],
      },
    });
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
      media: "AAAA",
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

  it("surfaces nested Evolution provider errors instead of generic Bad Request", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({
        status: 400,
        error: "Bad Request",
        response: {
          message: ["SessionError: No sessions"],
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendWhatsappInstanceMediaMessage(
        instance,
        "120363123456789@g.us",
        "data:video/mp4;base64,AAAA",
        "video",
        "clip.mp4",
        "",
      ),
    ).rejects.toThrow("SessionError: No sessions");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries media sends with the legacy mediaMessage payload when Evolution rejects the v2 payload", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          status: 400,
          error: "Bad Request",
          response: {
            message: [["instance requires property mediaMessage"]],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ key: { id: "message-legacy" }, status: "PENDING" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendWhatsappInstanceMediaMessage(
        instance,
        "120363123456789@g.us",
        "data:video/mp4;base64,AAAA",
        "video",
        "clip.mp4",
        "Legenda",
      ),
    ).resolves.toMatchObject({ key: { id: "message-legacy" } });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, legacyRequestInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    const legacyBody = JSON.parse(String(legacyRequestInit.body));
    expect(legacyBody).toMatchObject({
      number: "120363123456789@g.us",
      mediaMessage: {
        mediaType: "video",
        mimetype: "video/mp4",
        fileName: "video.mp4",
        caption: "Legenda",
        media: "AAAA",
      },
      options: {
        delay: 0,
        presence: "composing",
      },
    });
  });
});

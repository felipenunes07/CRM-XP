import { afterEach, describe, expect, it, vi } from "vitest";
import { sendUazapiVideoMessage } from "./uazapiService.js";

const config = {
  baseUrl: "https://uazapi.example",
  token: "secret",
};

describe("sendUazapiVideoMessage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("rejects non-MP4 video data URLs before calling UazAPI", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendUazapiVideoMessage(config, "5511999999999@s.whatsapp.net", "data:video/quicktime;base64,AAAA", "Legenda"),
    ).rejects.toThrow("MP4");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends MP4 video data URLs with explicit video metadata", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: "message-1" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await sendUazapiVideoMessage(config, "5511999999999@s.whatsapp.net", "data:video/mp4;base64,AAAA", "Legenda");

    const [, requestInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const requestBody = JSON.parse(String(requestInit.body));
    expect(requestBody).toMatchObject({
      number: "5511999999999",
      text: "Legenda",
      file: "data:video/mp4;base64,AAAA",
      type: "video",
      mimetype: "video/mp4",
      filename: "video.mp4",
      caption: "Legenda",
    });
  });

  it("preserves WhatsApp group chat ids for campaign video sends", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: "message-1" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await sendUazapiVideoMessage(config, "120363123456789@g.us", "data:video/mp4;base64,AAAA", "");

    const [, requestInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const requestBody = JSON.parse(String(requestInit.body));
    expect(requestBody).toMatchObject({
      number: "120363123456789@g.us",
      text: "",
      type: "video",
      file: "data:video/mp4;base64,AAAA",
    });
  });
});

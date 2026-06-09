import { describe, expect, it } from "vitest";

import {
  avatarPublicUrl,
  avatarStorageKey,
  isCacheableAvatarUrl,
} from "./whatsappAvatarCache.js";

describe("avatarStorageKey", () => {
  it("is deterministic", () => {
    expect(avatarStorageKey("amanda", "12345@s.whatsapp.net")).toBe(
      avatarStorageKey("amanda", "12345@s.whatsapp.net"),
    );
  });

  it("is case-insensitive on instance name", () => {
    expect(avatarStorageKey("Amanda", "12345@s.whatsapp.net")).toBe(
      avatarStorageKey("amanda", "12345@s.whatsapp.net"),
    );
  });

  it("differs per remote jid", () => {
    expect(avatarStorageKey("amanda", "1@s.whatsapp.net")).not.toBe(
      avatarStorageKey("amanda", "2@s.whatsapp.net"),
    );
  });

  it("produces a .jpg key", () => {
    expect(avatarStorageKey("a", "b@s.whatsapp.net").endsWith(".jpg")).toBe(true);
  });
});

describe("avatarPublicUrl", () => {
  it("points at the avatar route", () => {
    expect(avatarPublicUrl("abc.jpg")).toContain("/api/whatsapp-monitor/avatar/abc.jpg");
  });
});

describe("isCacheableAvatarUrl", () => {
  it("rejects empty / null / undefined", () => {
    expect(isCacheableAvatarUrl(null)).toBe(false);
    expect(isCacheableAvatarUrl(undefined)).toBe(false);
    expect(isCacheableAvatarUrl("")).toBe(false);
  });

  it("rejects non-http schemes", () => {
    expect(isCacheableAvatarUrl("data:image/png;base64,AAAA")).toBe(false);
    expect(isCacheableAvatarUrl("ftp://example.com/x.jpg")).toBe(false);
  });

  it("rejects our own avatar endpoint (already cached)", () => {
    expect(
      isCacheableAvatarUrl("https://crm.example.com/api/whatsapp-monitor/avatar/abc.jpg"),
    ).toBe(false);
  });

  it("accepts an ephemeral WhatsApp CDN url", () => {
    expect(
      isCacheableAvatarUrl("https://pps.whatsapp.net/v/t61.000/123.jpg?oe=ABCDEF&oh=xyz"),
    ).toBe(true);
  });
});

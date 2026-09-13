import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { poolQuery, readFile } = vi.hoisted(() => ({
  poolQuery: (() => {
    process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
    process.env.JWT_SECRET ??= "test-jwt-secret";
    return vi.fn();
  })(),
  readFile: vi.fn(),
}));

vi.mock("./db/client.js", () => ({
  pool: { query: poolQuery },
  redis: { ping: vi.fn().mockResolvedValue("PONG") },
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    promises: { ...actual.promises, readFile },
  };
});

import { createApp } from "./app.js";

const userId = "11111111-1111-4111-8111-111111111111";

describe("task avatar route", () => {
  beforeEach(() => {
    poolQuery.mockReset();
    readFile.mockReset();
  });

  it("falls back to the saved image URL when the old local file is unavailable", async () => {
    const sourceUrl = "https://old-crm.example/media/profile-avatars/lili.jpg";
    poolQuery.mockResolvedValue({ rows: [{ profile_avatar_url: sourceUrl }] });
    const missingFile = Object.assign(new Error("missing"), { code: "ENOENT" });
    readFile.mockRejectedValue(missingFile);

    const response = await request(createApp())
      .get(`/api/tasks/avatar/${userId}`)
      .redirects(0);

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(sourceUrl);
  });

  it("serves the avatar file directly when it exists on the current CRM", async () => {
    poolQuery.mockResolvedValue({ rows: [{ profile_avatar_url: "/media/profile-avatars/lili.png" }] });
    readFile.mockResolvedValue(Buffer.from("avatar-bytes"));

    const response = await request(createApp()).get(`/api/tasks/avatar/${userId}`);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("image/png");
    expect(response.body).toEqual(Buffer.from("avatar-bytes"));
  });

  it("serves a persisted profile avatar without relying on the server disk", async () => {
    poolQuery.mockResolvedValue({
      rows: [{ content_type: "image/webp", bytes: Buffer.from("persisted-avatar") }],
    });

    const response = await request(createApp()).get("/api/profile-avatars/profile-test");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("image/webp");
    expect(response.body).toEqual(Buffer.from("persisted-avatar"));
    expect(readFile).not.toHaveBeenCalled();
  });

  it("delivers a profile through the task route without login or redirect to its old host", async () => {
    poolQuery.mockResolvedValueOnce({ rows: [{ profile_avatar_url: "https://old-crm.example/api/profile-avatars/profile-test" }] })
      .mockResolvedValueOnce({ rows: [{ content_type: "image/png", bytes: Buffer.from("saved-photo") }] });
    const response = await request(createApp()).get(`/api/tasks/avatar/${userId}`).redirects(0);
    expect(response.status).toBe(200);
    expect(response.headers.location).toBeUndefined();
    expect(response.body).toEqual(Buffer.from("saved-photo"));
    expect(response.headers["cache-control"]).toBe("no-store");
  });
});

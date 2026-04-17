import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  listIdeasMock,
  createIdeaMock,
  deleteIdeaMock,
  getIdeaDetailMock,
  listIdeaFeedbacksMock,
  submitIdeaVoteMock,
  ensureEvolutionConfiguredMock,
  sendWhatsappTextMessageMock,
} = vi.hoisted(() => ({
  listIdeasMock: vi.fn(),
  createIdeaMock: vi.fn(),
  deleteIdeaMock: vi.fn(),
  getIdeaDetailMock: vi.fn(),
  listIdeaFeedbacksMock: vi.fn(),
  submitIdeaVoteMock: vi.fn(),
  ensureEvolutionConfiguredMock: vi.fn(),
  sendWhatsappTextMessageMock: vi.fn(),
}));

vi.mock("./modules/ideas/ideaBoardService.js", () => ({
  listIdeas: listIdeasMock,
  createIdea: createIdeaMock,
  deleteIdea: deleteIdeaMock,
  getIdeaDetail: getIdeaDetailMock,
  listIdeaFeedbacks: listIdeaFeedbacksMock,
  submitIdeaVote: submitIdeaVoteMock,
}));

vi.mock("./modules/whatsapp/evolutionService.js", () => ({
  ensureEvolutionConfigured: ensureEvolutionConfiguredMock,
  sendWhatsappTextMessage: sendWhatsappTextMessageMock,
}));

import { createApp } from "./app.js";

const ideaDetailFixture = {
  id: "idea-1",
  title: "Melhorar aprovacao de campanhas",
  description: "Centralizar a aprovacao num mural simples.",
  status: "OPEN" as const,
  isAnonymous: true,
  authorDisplayName: "Anonimo",
  canDelete: true,
  createdAt: "2026-04-17T12:00:00.000Z",
  updatedAt: "2026-04-17T12:00:00.000Z",
  voteSummary: {
    likeCount: 3,
    maybeCount: 1,
    noCount: 0,
    totalVotes: 4,
  },
  feedbackCount: 1,
  currentUserVote: {
    option: "LIKE" as const,
    comment: "Boa ideia.",
    createdAt: "2026-04-17T12:10:00.000Z",
    updatedAt: "2026-04-17T12:10:00.000Z",
  },
  feedbacks: [
    {
      id: "feedback-1",
      ideaId: "idea-1",
      option: "MAYBE" as const,
      comment: "Talvez valha pilotar antes.",
      createdAt: "2026-04-17T12:12:00.000Z",
      updatedAt: "2026-04-17T12:12:00.000Z",
    },
  ],
};

describe("idea board routes", () => {
  afterEach(() => {
    listIdeasMock.mockReset();
    createIdeaMock.mockReset();
    deleteIdeaMock.mockReset();
    getIdeaDetailMock.mockReset();
    listIdeaFeedbacksMock.mockReset();
    submitIdeaVoteMock.mockReset();
    ensureEvolutionConfiguredMock.mockReset();
    sendWhatsappTextMessageMock.mockReset();
  });

  it("lists the idea mural", async () => {
    listIdeasMock.mockResolvedValue([ideaDetailFixture]);

    const response = await request(createApp()).get("/api/ideas");

    expect(response.status).toBe(200);
    expect(response.body[0].title).toBe("Melhorar aprovacao de campanhas");
    expect(listIdeasMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "00000000-0000-0000-0000-000000000001",
        role: "ADMIN",
      }),
    );
  });

  it("creates an anonymous idea without notifying whatsapp automatically", async () => {
    createIdeaMock.mockResolvedValue(ideaDetailFixture);

    const response = await request(createApp()).post("/api/ideas").send({
      title: "Melhorar aprovacao de campanhas",
      description: "Centralizar a aprovacao num mural simples.",
      isAnonymous: true,
    });

    expect(response.status).toBe(201);
    expect(response.body.authorDisplayName).toBe("Anonimo");
    expect(createIdeaMock).toHaveBeenCalledWith(
      {
        title: "Melhorar aprovacao de campanhas",
        description: "Centralizar a aprovacao num mural simples.",
        isAnonymous: true,
      },
      expect.objectContaining({
        id: "00000000-0000-0000-0000-000000000001",
        role: "ADMIN",
      }),
    );
    expect(sendWhatsappTextMessageMock).not.toHaveBeenCalled();
  });

  it("returns idea detail and anonymous feedback list", async () => {
    getIdeaDetailMock.mockResolvedValue(ideaDetailFixture);
    listIdeaFeedbacksMock.mockResolvedValue(ideaDetailFixture.feedbacks);

    const detailResponse = await request(createApp()).get("/api/ideas/idea-1");
    const feedbackResponse = await request(createApp()).get("/api/ideas/idea-1/feedback");

    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.feedbacks[0].comment).toBe("Talvez valha pilotar antes.");
    expect(feedbackResponse.status).toBe(200);
    expect(feedbackResponse.body[0].comment).toBe("Talvez valha pilotar antes.");
  });

  it("submits or updates an anonymous vote", async () => {
    submitIdeaVoteMock.mockResolvedValue(ideaDetailFixture);

    const response = await request(createApp()).post("/api/ideas/idea-1/vote").send({
      option: "LIKE",
      comment: "Boa ideia.",
    });

    expect(response.status).toBe(200);
    expect(response.body.currentUserVote.option).toBe("LIKE");
    expect(submitIdeaVoteMock).toHaveBeenCalledWith(
      "idea-1",
      expect.objectContaining({
        id: "00000000-0000-0000-0000-000000000001",
        role: "ADMIN",
      }),
      {
        option: "LIKE",
        comment: "Boa ideia.",
      },
    );
  });

  it("notifies the MIDIAS whatsapp group only when requested manually", async () => {
    getIdeaDetailMock.mockResolvedValue(ideaDetailFixture);
    ensureEvolutionConfiguredMock.mockReturnValue(undefined);
    sendWhatsappTextMessageMock.mockResolvedValue({});

    const response = await request(createApp()).post("/api/ideas/idea-1/notify-whatsapp");

    expect(response.status).toBe(204);
    expect(getIdeaDetailMock).toHaveBeenCalledWith(
      "idea-1",
      expect.objectContaining({
        id: "00000000-0000-0000-0000-000000000001",
        role: "ADMIN",
      }),
    );
    expect(sendWhatsappTextMessageMock).toHaveBeenCalledWith(
      "120363025402961504@g.us",
      expect.stringContaining("Melhorar aprovacao de campanhas"),
    );
  });

  it("deletes an idea for an authorized user", async () => {
    deleteIdeaMock.mockResolvedValue(undefined);

    const response = await request(createApp()).delete("/api/ideas/idea-1");

    expect(response.status).toBe(204);
    expect(deleteIdeaMock).toHaveBeenCalledWith(
      "idea-1",
      expect.objectContaining({
        id: "00000000-0000-0000-0000-000000000001",
        role: "ADMIN",
      }),
    );
  });
});

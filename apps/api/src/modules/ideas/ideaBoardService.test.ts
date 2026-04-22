import { afterEach, describe, expect, it, vi } from "vitest";

const { poolQueryMock } = vi.hoisted(() => ({
  poolQueryMock: vi.fn(),
}));

vi.mock("../../db/client.js", () => ({
  pool: {
    query: poolQueryMock,
  },
}));

import { createIdea, deleteIdea, listIdeaFeedbacks, moveIdeaToLane, submitIdeaVote } from "./ideaBoardService.js";

describe("ideaBoardService", () => {
  afterEach(() => {
    poolQueryMock.mockReset();
  });

  it("creates anonymous ideas without exposing the internal author", async () => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "idea-1",
          title: "Nova ideia",
          description: "Descricao da ideia",
          status: "OPEN",
          is_anonymous: true,
          author_display_name: null,
          lane_override: null,
          created_at: "2026-04-17T12:00:00.000Z",
          updated_at: "2026-04-17T12:00:00.000Z",
        },
      ],
    });

    const created = await createIdea(
      {
        title: "Nova ideia",
        description: "Descricao da ideia",
        isAnonymous: true,
      },
      {
        id: "00000000-0000-0000-0000-000000000001",
        email: "admin@olist-crm.com.br",
        role: "ADMIN",
        name: "Administrador Local",
      },
    );

    expect(created.authorDisplayName).toBe("Anonimo");
    expect(created.canDelete).toBe(true);
    expect(created.status).toBe("OPEN");
    expect(created.voteSummary.totalVotes).toBe(0);
    expect(poolQueryMock.mock.calls[0]?.[1]).toEqual([
      "Nova ideia",
      "Descricao da ideia",
      true,
      null,
      "00000000-0000-0000-0000-000000000001",
    ]);
  });

  it("creates identified ideas with the typed display name", async () => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "idea-2",
          title: "Nome visivel",
          description: "Descricao",
          status: "OPEN",
          is_anonymous: false,
          author_display_name: "Time Comercial",
          lane_override: null,
          created_at: "2026-04-17T12:00:00.000Z",
          updated_at: "2026-04-17T12:00:00.000Z",
        },
      ],
    });

    const created = await createIdea(
      {
        title: "Nome visivel",
        description: "Descricao",
        isAnonymous: false,
        authorDisplayName: "Time Comercial",
      },
      {
        id: "00000000-0000-0000-0000-000000000002",
        email: "manager@olist-crm.com.br",
        role: "MANAGER",
        name: "Manager",
      },
    );

    expect(created.authorDisplayName).toBe("Time Comercial");
  });

  it("upserts the vote and returns the refreshed anonymous detail", async () => {
    poolQueryMock
      .mockResolvedValueOnce({ rows: [{ id: "idea-1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "idea-1",
            title: "Nova ideia",
            description: "Descricao da ideia",
            status: "OPEN",
            is_anonymous: true,
            author_display_name: null,
            created_by_user_id: "00000000-0000-0000-0000-000000000001",
            can_delete: false,
            lane_override: null,
            created_at: "2026-04-17T12:00:00.000Z",
            updated_at: "2026-04-17T12:30:00.000Z",
            like_count: 1,
            maybe_count: 0,
            no_count: 0,
            feedback_count: 1,
            current_vote_option: "LIKE",
            current_vote_comment: "Gostei",
            current_vote_created_at: "2026-04-17T12:30:00.000Z",
            current_vote_updated_at: "2026-04-17T12:30:00.000Z",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "feedback-1",
            idea_id: "idea-1",
            vote_option: "LIKE",
            comment: "Gostei",
            created_at: "2026-04-17T12:30:00.000Z",
            updated_at: "2026-04-17T12:30:00.000Z",
          },
        ],
      });

    const detail = await submitIdeaVote(
      "idea-1",
      {
        id: "00000000-0000-0000-0000-000000000002",
        email: "manager@olist-crm.com.br",
        role: "MANAGER",
        name: "Manager",
      },
      {
        option: "LIKE",
        comment: "Gostei",
      },
    );

    expect(poolQueryMock.mock.calls[1]?.[0]).toContain("ON CONFLICT (idea_id, voted_by_user_id)");
    expect(detail.currentUserVote?.option).toBe("LIKE");
    expect(detail.canDelete).toBe(false);
    expect(detail.feedbacks[0]?.comment).toBe("Gostei");
  });

  it("persists a manual lane move and returns refreshed detail", async () => {
    poolQueryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "idea-1",
            created_by_user_id: "00000000-0000-0000-0000-000000000001",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "idea-1",
            title: "Nova ideia",
            description: "Descricao da ideia",
            status: "OPEN",
            is_anonymous: true,
            author_display_name: null,
            created_by_user_id: "00000000-0000-0000-0000-000000000001",
            can_delete: true,
            lane_override: "SUPPORT",
            created_at: "2026-04-17T12:00:00.000Z",
            updated_at: "2026-04-17T12:35:00.000Z",
            like_count: 1,
            maybe_count: 0,
            no_count: 0,
            feedback_count: 0,
            current_vote_option: null,
            current_vote_comment: null,
            current_vote_created_at: null,
            current_vote_updated_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const detail = await moveIdeaToLane(
      "idea-1",
      {
        id: "00000000-0000-0000-0000-000000000001",
        email: "admin@olist-crm.com.br",
        role: "ADMIN",
        name: "Administrador Local",
      },
      {
        laneId: "SUPPORT",
      },
    );

    expect(poolQueryMock.mock.calls[1]?.[0]).toContain("UPDATE idea_board_items");
    expect(poolQueryMock.mock.calls[1]?.[1]).toEqual(["idea-1", "SUPPORT"]);
    expect(detail.laneOverride).toBe("SUPPORT");
  });

  it("returns public feedback rows without internal user data", async () => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "feedback-1",
          idea_id: "idea-1",
          vote_option: "NO",
          comment: "Ainda nao faz sentido.",
          created_at: "2026-04-17T12:30:00.000Z",
          updated_at: "2026-04-17T12:30:00.000Z",
          voted_by_user_id: "00000000-0000-0000-0000-000000000009",
        },
      ],
    });

    const feedbacks = await listIdeaFeedbacks("idea-1");

    expect(feedbacks).toEqual([
      {
        id: "feedback-1",
        ideaId: "idea-1",
        option: "NO",
        comment: "Ainda nao faz sentido.",
        createdAt: "2026-04-17T12:30:00.000Z",
        updatedAt: "2026-04-17T12:30:00.000Z",
      },
    ]);
  });

  it("allows the admin or author to delete an idea", async () => {
    poolQueryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "idea-1",
            created_by_user_id: "00000000-0000-0000-0000-000000000002",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    await deleteIdea("idea-1", {
      id: "00000000-0000-0000-0000-000000000001",
      email: "admin@olist-crm.com.br",
      role: "ADMIN",
      name: "Administrador Local",
    });

    expect(poolQueryMock.mock.calls[1]?.[0]).toContain("DELETE FROM idea_board_items");
  });

  it("blocks deletion for users who are not admin nor author", async () => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "idea-1",
          created_by_user_id: "00000000-0000-0000-0000-000000000009",
        },
      ],
    });

    await expect(
      deleteIdea("idea-1", {
        id: "00000000-0000-0000-0000-000000000003",
        email: "seller@olist-crm.com.br",
        role: "SELLER",
        name: "Seller",
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});

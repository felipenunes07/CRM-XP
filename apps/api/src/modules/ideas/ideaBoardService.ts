import type { IdeaBoardDetail, IdeaBoardItem, IdeaUserVote, IdeaVoteFeedback, IdeaVoteOption, IdeaVoteSummary } from "@olist-crm/shared";
import type { JwtUser } from "../platform/authService.js";
import { pool } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";

interface IdeaRow extends Record<string, unknown> {
  id: string;
  title: string;
  description: string;
  status: string;
  is_anonymous: boolean;
  author_display_name: string | null;
  created_by_user_id?: string | null;
  can_delete?: boolean | null;
  created_at: string;
  updated_at: string;
  like_count: number | string | null;
  maybe_count: number | string | null;
  no_count: number | string | null;
  feedback_count: number | string | null;
  current_vote_option?: IdeaVoteOption | null;
  current_vote_comment?: string | null;
  current_vote_created_at?: string | null;
  current_vote_updated_at?: string | null;
}

const IDEA_BASE_SELECT = `
  SELECT
    i.id,
    i.title,
    i.description,
    i.status,
    i.is_anonymous,
    i.author_display_name,
    i.created_by_user_id,
    CASE
      WHEN i.created_by_user_id = $1::uuid OR $2 = 'ADMIN' THEN TRUE
      ELSE FALSE
    END AS can_delete,
    i.created_at,
    i.updated_at,
    COALESCE(stats.like_count, 0) AS like_count,
    COALESCE(stats.maybe_count, 0) AS maybe_count,
    COALESCE(stats.no_count, 0) AS no_count,
    COALESCE(stats.feedback_count, 0) AS feedback_count,
    current_vote.vote_option AS current_vote_option,
    current_vote.comment AS current_vote_comment,
    current_vote.created_at AS current_vote_created_at,
    current_vote.updated_at AS current_vote_updated_at
  FROM idea_board_items i
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE vote_option = 'LIKE')::int AS like_count,
      COUNT(*) FILTER (WHERE vote_option = 'MAYBE')::int AS maybe_count,
      COUNT(*) FILTER (WHERE vote_option = 'NO')::int AS no_count,
      COUNT(*) FILTER (WHERE NULLIF(BTRIM(comment), '') IS NOT NULL)::int AS feedback_count
    FROM idea_board_votes
    WHERE idea_id = i.id
  ) stats ON TRUE
  LEFT JOIN LATERAL (
    SELECT vote_option, comment, created_at, updated_at
    FROM idea_board_votes
    WHERE idea_id = i.id AND voted_by_user_id = $1
  ) current_vote ON TRUE
`;

function toIsoString(value: unknown) {
  return new Date(String(value)).toISOString();
}

function toCount(value: unknown) {
  return Number(value ?? 0);
}

function normalizeOptionalText(value?: string | null) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function mapVoteSummary(row: IdeaRow): IdeaVoteSummary {
  const likeCount = toCount(row.like_count);
  const maybeCount = toCount(row.maybe_count);
  const noCount = toCount(row.no_count);

  return {
    likeCount,
    maybeCount,
    noCount,
    totalVotes: likeCount + maybeCount + noCount,
  };
}

function mapCurrentUserVote(row: IdeaRow): IdeaUserVote | null {
  if (!row.current_vote_option) {
    return null;
  }

  return {
    option: row.current_vote_option,
    comment: normalizeOptionalText(row.current_vote_comment),
    createdAt: toIsoString(row.current_vote_created_at),
    updatedAt: toIsoString(row.current_vote_updated_at),
  };
}

function mapIdeaItem(row: IdeaRow): IdeaBoardItem {
  return {
    id: String(row.id),
    title: String(row.title),
    description: String(row.description),
    status: String(row.status) as IdeaBoardItem["status"],
    isAnonymous: Boolean(row.is_anonymous),
    authorDisplayName: row.is_anonymous ? "Anonimo" : String(row.author_display_name ?? "Anonimo"),
    canDelete: Boolean(row.can_delete),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    voteSummary: mapVoteSummary(row),
    feedbackCount: toCount(row.feedback_count),
    currentUserVote: mapCurrentUserVote(row),
  };
}

function mapIdeaFeedback(row: Record<string, unknown>): IdeaVoteFeedback {
  return {
    id: String(row.id),
    ideaId: String(row.idea_id),
    option: String(row.vote_option) as IdeaVoteOption,
    comment: String(row.comment ?? ""),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function canUserDeleteIdea(createdByUserId: string | null | undefined, user: JwtUser) {
  return user.role === "ADMIN" || (createdByUserId != null && String(createdByUserId) === user.id);
}

async function getIdeaBaseRow(ideaId: string, user: JwtUser) {
  const result = await pool.query<IdeaRow>(
    `
      ${IDEA_BASE_SELECT}
      WHERE i.id = $3
    `,
    [user.id, user.role, ideaId],
  );

  return result.rows[0] ?? null;
}

async function getIdeaPermissionRow(ideaId: string) {
  const result = await pool.query<Record<string, unknown>>(
    "SELECT id, created_by_user_id FROM idea_board_items WHERE id = $1",
    [ideaId],
  );
  return result.rows[0] ?? null;
}

export async function listIdeas(user: JwtUser): Promise<IdeaBoardItem[]> {
  const result = await pool.query<IdeaRow>(
    `
      ${IDEA_BASE_SELECT}
      ORDER BY i.updated_at DESC, i.created_at DESC
    `,
    [user.id, user.role],
  );

  return result.rows.map((row) => mapIdeaItem(row));
}

export async function createIdea(
  input: { title: string; description: string; isAnonymous: boolean; authorDisplayName?: string | null },
  user: JwtUser,
): Promise<IdeaBoardDetail> {
  const title = String(input.title).trim();
  const description = String(input.description).trim();
  const authorDisplayName = input.isAnonymous ? null : normalizeOptionalText(input.authorDisplayName);

  if (!title || !description) {
    throw new HttpError(400, "Titulo e descricao sao obrigatorios");
  }

  if (!input.isAnonymous && !authorDisplayName) {
    throw new HttpError(400, "Informe o nome a ser exibido");
  }

  const result = await pool.query<Record<string, unknown>>(
    `
      INSERT INTO idea_board_items (
        title,
        description,
        status,
        is_anonymous,
        author_display_name,
        created_by_user_id,
        created_at,
        updated_at
      )
      VALUES ($1, $2, 'OPEN', $3, $4, $5, NOW(), NOW())
      RETURNING id, title, description, status, is_anonymous, author_display_name, created_at, updated_at
    `,
    [title, description, input.isAnonymous, authorDisplayName, user.id],
  );

  const row = result.rows[0];
  if (!row) {
    throw new HttpError(500, "Nao foi possivel criar a ideia");
  }

  return {
    id: String(row.id),
    title: String(row.title),
    description: String(row.description),
    status: String(row.status) as IdeaBoardItem["status"],
    isAnonymous: Boolean(row.is_anonymous),
    authorDisplayName: input.isAnonymous ? "Anonimo" : String(row.author_display_name ?? "Anonimo"),
    canDelete: true,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    voteSummary: {
      likeCount: 0,
      maybeCount: 0,
      noCount: 0,
      totalVotes: 0,
    },
    feedbackCount: 0,
    currentUserVote: null,
    feedbacks: [],
  };
}

export async function listIdeaFeedbacks(ideaId: string): Promise<IdeaVoteFeedback[]> {
  const result = await pool.query<Record<string, unknown>>(
    `
      SELECT id, idea_id, vote_option, comment, created_at, updated_at
      FROM idea_board_votes
      WHERE idea_id = $1
        AND NULLIF(BTRIM(comment), '') IS NOT NULL
      ORDER BY updated_at DESC, created_at DESC
    `,
    [ideaId],
  );

  return result.rows.map((row) => mapIdeaFeedback(row));
}

export async function getIdeaDetail(ideaId: string, user: JwtUser): Promise<IdeaBoardDetail | null> {
  const row = await getIdeaBaseRow(ideaId, user);
  if (!row) {
    return null;
  }

  return {
    ...mapIdeaItem(row),
    feedbacks: await listIdeaFeedbacks(ideaId),
  };
}

export async function submitIdeaVote(
  ideaId: string,
  user: JwtUser,
  input: { option: IdeaVoteOption; comment?: string | null },
): Promise<IdeaBoardDetail> {
  const idea = await getIdeaPermissionRow(ideaId);
  if (!idea) {
    throw new HttpError(404, "Ideia nao encontrada");
  }

  await pool.query(
    `
      INSERT INTO idea_board_votes (
        idea_id,
        voted_by_user_id,
        vote_option,
        comment,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      ON CONFLICT (idea_id, voted_by_user_id)
      DO UPDATE SET
        vote_option = EXCLUDED.vote_option,
        comment = EXCLUDED.comment,
        updated_at = NOW()
    `,
    [ideaId, user.id, input.option, normalizeOptionalText(input.comment)],
  );

  const detail = await getIdeaDetail(ideaId, user);
  if (!detail) {
    throw new HttpError(404, "Ideia nao encontrada");
  }

  return detail;
}

export async function deleteIdea(ideaId: string, user: JwtUser): Promise<void> {
  const idea = await getIdeaPermissionRow(ideaId);
  if (!idea) {
    throw new HttpError(404, "Ideia nao encontrada");
  }

  if (!canUserDeleteIdea(idea.created_by_user_id ? String(idea.created_by_user_id) : null, user)) {
    throw new HttpError(403, "Voce nao tem permissao para excluir esta ideia");
  }

  await pool.query("DELETE FROM idea_board_items WHERE id = $1", [ideaId]);
}

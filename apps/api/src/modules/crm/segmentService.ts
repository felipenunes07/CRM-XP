import type { SavedSegment, SegmentDefinition } from "@olist-crm/shared";
import { pool } from "../../db/client.js";

function mapSavedSegment(row: Record<string, unknown>): SavedSegment {
  return {
    id: String(row.id),
    name: String(row.name),
    definition: (row.definition ?? {}) as SegmentDefinition,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export async function listSavedSegments(): Promise<SavedSegment[]> {
  const result = await pool.query(
    `
      SELECT id, name, definition, created_at, updated_at
      FROM saved_segments
      ORDER BY updated_at DESC, name ASC
    `,
  );

  return result.rows.map((row) => mapSavedSegment(row));
}

export async function createSavedSegment(input: {
  name: string;
  definition: SegmentDefinition;
}): Promise<SavedSegment> {
  const result = await pool.query(
    `
      INSERT INTO saved_segments (name, definition, created_at, updated_at)
      VALUES ($1, $2::jsonb, NOW(), NOW())
      RETURNING id, name, definition, created_at, updated_at
    `,
    [input.name.trim(), JSON.stringify(input.definition)],
  );

  return mapSavedSegment(result.rows[0]);
}

export async function updateSavedSegment(
  id: string,
  input: { name: string; definition: SegmentDefinition },
): Promise<SavedSegment | null> {
  const result = await pool.query(
    `
      UPDATE saved_segments
      SET
        name = $2,
        definition = $3::jsonb,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, name, definition, created_at, updated_at
    `,
    [id, input.name.trim(), JSON.stringify(input.definition)],
  );

  return result.rows[0] ? mapSavedSegment(result.rows[0]) : null;
}

export async function deleteSavedSegment(id: string): Promise<boolean> {
  const result = await pool.query("DELETE FROM saved_segments WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}

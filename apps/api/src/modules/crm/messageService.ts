import type { MessageTemplate } from "@olist-crm/shared";
import { pool } from "../../db/client.js";

type TemplateInput = Pick<MessageTemplate, "category" | "title" | "content" | "messageType" | "mediaUrl">;

function mapTemplate(row: Record<string, unknown>): MessageTemplate {
  return {
    id: String(row.id),
    category: String(row.category) as MessageTemplate["category"],
    title: String(row.title),
    content: String(row.content),
    messageType: (String(row.message_type ?? "TEXT")) as MessageTemplate["messageType"],
    mediaUrl: row.media_url ? String(row.media_url) : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export async function listMessageTemplates() {
  const result = await pool.query("SELECT * FROM message_templates ORDER BY updated_at DESC");
  return result.rows.map((row) => mapTemplate(row));
}

export async function createMessageTemplate(input: TemplateInput) {
  const result = await pool.query(
    `
      INSERT INTO message_templates (category, title, content, message_type, media_url)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `,
    [input.category, input.title, input.content, input.messageType ?? "TEXT", input.mediaUrl ?? null],
  );
  return mapTemplate(result.rows[0]);
}

export async function updateMessageTemplate(id: string, input: TemplateInput) {
  const result = await pool.query(
    `
      UPDATE message_templates
      SET category = $2, title = $3, content = $4, message_type = $5, media_url = $6, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [id, input.category, input.title, input.content, input.messageType ?? "TEXT", input.mediaUrl ?? null],
  );
  return result.rows[0] ? mapTemplate(result.rows[0]) : null;
}

export async function deleteMessageTemplate(id: string) {
  await pool.query("DELETE FROM message_templates WHERE id = $1", [id]);
}

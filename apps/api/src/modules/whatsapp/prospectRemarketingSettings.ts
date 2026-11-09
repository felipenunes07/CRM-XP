import { z } from "zod";
import type { ProspectRemarketingSettings } from "@olist-crm/shared";
import { pool } from "../../db/client.js";
import { env } from "../../lib/env.js";
import { HttpError } from "../../lib/httpError.js";
import { DEFAULT_PROSPECT_MESSAGE } from "./prospectFollowupCore.js";

const SETTINGS_KEY = "prospect_group_followup_settings";
const days = z.number().int().min(1).max(365);
const message = z.string().trim().min(1).max(4000).refine(value => value.includes("{cliente}"), "Inclua {cliente} para marcar o cliente.");
export const prospectRemarketingSchema = z.object({
  enabled: z.boolean(),
  first: z.object({ daysAfterCreation: days, message }),
  second: z.object({ enabled: z.boolean(), daysAfterFirst: days, message: z.string().trim().max(4000) }).nullable(),
}).superRefine((value, context) => {
  if (value.second?.enabled && !message.safeParse(value.second.message).success) {
    context.addIssue({ code: "custom", path: ["second", "message"], message: "Escreva a segunda mensagem e inclua {cliente}." });
  }
});

export async function getProspectRemarketingSettings(): Promise<ProspectRemarketingSettings> {
  const result = await pool.query("SELECT cursor_value, updated_at FROM sync_cursors WHERE key=$1", [SETTINGS_KEY]);
  if (!result.rows[0]) return { enabled: env.WHATSAPP_PROSPECT_FOLLOWUP_ENABLED, first: { daysAfterCreation: 2, message: DEFAULT_PROSPECT_MESSAGE }, second: null, updatedAt: null };
  const row = result.rows[0];
  return { ...prospectRemarketingSchema.parse(JSON.parse(row.cursor_value)), updatedAt: new Date(row.updated_at).toISOString() };
}

export async function saveProspectRemarketingSettings(input: unknown): Promise<ProspectRemarketingSettings> {
  const parsed = prospectRemarketingSchema.safeParse(input);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues.map(issue => issue.message).join(" "));
  const result = await pool.query(`INSERT INTO sync_cursors(key,cursor_value,updated_at) VALUES($1,$2,NOW())
    ON CONFLICT(key) DO UPDATE SET cursor_value=EXCLUDED.cursor_value,updated_at=NOW() RETURNING updated_at`, [SETTINGS_KEY, JSON.stringify(parsed.data)]);
  return { ...parsed.data, updatedAt: new Date(result.rows[0].updated_at).toISOString() };
}

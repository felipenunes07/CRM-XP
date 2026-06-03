import { pool } from "../../db/client.js"; // pool principal: a escrita do webhook NÃO usa o pool isolado de leitura

export interface MonitorMessageInput {
  dealId: string;
  messageId: string;
  remoteJid: string | null;
  instanceName: string | null;
  fromMe: boolean;
  senderName: string | null;
  senderJid: string | null;
  senderPicUrl: string | null;
  content: string;
  mediaJson: unknown | null;
  source: "incoming" | "activity";
  createdAt: Date | string;
}

/**
 * Grava (ou atualiza) a linha achatada de leitura. Idempotente por (deal_id, message_id, source).
 * Best-effort: NUNCA deve derrubar o fluxo do webhook se falhar.
 */
export async function recordMonitorMessage(input: MonitorMessageInput): Promise<void> {
  try {
    await pool.query(
      `
      INSERT INTO whatsapp_monitor_messages (
        deal_id, message_id, remote_jid, instance_name, direction, from_me,
        sender_name, sender_jid, sender_pic_url, content, media_json, source, created_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13)
      ON CONFLICT (deal_id, message_id, source) DO UPDATE SET
        content        = EXCLUDED.content,
        sender_name    = COALESCE(EXCLUDED.sender_name, whatsapp_monitor_messages.sender_name),
        sender_pic_url = COALESCE(EXCLUDED.sender_pic_url, whatsapp_monitor_messages.sender_pic_url),
        media_json     = COALESCE(EXCLUDED.media_json, whatsapp_monitor_messages.media_json),
        from_me        = EXCLUDED.from_me
      `,
      [
        input.dealId,
        input.messageId,
        input.remoteJid,
        input.instanceName,
        input.fromMe ? "OUTBOUND" : "INBOUND",
        input.fromMe,
        input.senderName,
        input.senderJid,
        input.senderPicUrl,
        input.content ?? "",
        input.mediaJson ? JSON.stringify(input.mediaJson) : null,
        input.source,
        input.createdAt,
      ],
    );
  } catch (err) {
    // best-effort: loga e segue. A verdade continua em whatsapp_incoming_messages/deal_activities.
    console.error("recordMonitorMessage falhou (ignorado):", (err as Error).message);
  }
}

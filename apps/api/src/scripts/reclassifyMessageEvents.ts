import type { EventSeverity, EventType, WhatsappMessageRisk } from "@olist-crm/shared";
import { pool } from "../db/client.js";
import { classifyMessageContent, MESSAGE_CLASSIFIER_VERSION } from "../modules/events/eventsService.js";

interface MessageEventRow {
  id: string;
  content: string;
  event_type: EventType;
  severity: EventSeverity;
  label: string;
  metadata: Record<string, unknown> | null;
  resolved_at: Date | null;
}

function parseNumberFlag(name: string, fallback: number) {
  const entry = process.argv.find((argument) => argument.startsWith(`--${name}=`));
  if (!entry) return fallback;

  const value = Number(entry.slice(name.length + 3));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readRisk(metadata: Record<string, unknown> | null): WhatsappMessageRisk | null {
  const originalRisk = metadata?.originalRisk;
  if (!originalRisk || typeof originalRisk !== "object") return null;

  const risk = originalRisk as Partial<WhatsappMessageRisk>;
  if (!risk.keyword || !risk.severity) return null;

  return risk as WhatsappMessageRisk;
}

function mergeMetadata(row: MessageEventRow, classification: ReturnType<typeof classifyMessageContent>) {
  return {
    ...(row.metadata ?? {}),
    classifierVersion: MESSAGE_CLASSIFIER_VERSION,
    reclassifiedAt: new Date().toISOString(),
    previousEventType: row.event_type,
    previousSeverity: row.severity,
    previousLabel: row.label,
    sentimentScore: classification.sentimentScore,
    classificationReason: classification.reason,
    classificationConfidence: classification.confidence,
    classificationCategory: classification.category,
    classificationEvidence: classification.evidence,
    actionRequired: classification.actionRequired,
    shouldCreateEvent: classification.shouldCreateEvent,
  };
}

async function main() {
  const limit = parseNumberFlag("limit", 1000);
  const days = parseNumberFlag("days", 14);
  const dryRun = !process.argv.includes("--apply");

  const result = await pool.query<MessageEventRow>(`
    SELECT id, content, event_type, severity, label, metadata, resolved_at
    FROM message_events
    WHERE detected_at >= NOW() - ($1::int * INTERVAL '1 day')
    ORDER BY detected_at DESC
    LIMIT $2
  `, [days, limit]);

  const summary = {
    scanned: result.rows.length,
    changed: 0,
    filteredAsNoise: 0,
    actionable: 0,
    dryRun,
    byType: {} as Record<string, number>,
  };

  for (const row of result.rows) {
    const classification = classifyMessageContent(row.content, readRisk(row.metadata));
    const metadata = mergeMetadata(row, classification);
    const shouldChange =
      row.event_type !== classification.eventType ||
      row.severity !== classification.severity ||
      row.label !== classification.label ||
      (row.metadata?.classifierVersion !== MESSAGE_CLASSIFIER_VERSION);

    summary.byType[classification.eventType] = (summary.byType[classification.eventType] ?? 0) + 1;

    if (!shouldChange) continue;

    summary.changed++;
    if (classification.shouldCreateEvent) {
      summary.actionable++;
    } else {
      summary.filteredAsNoise++;
    }

    if (dryRun) continue;

    await pool.query(`
      UPDATE message_events
      SET
        event_type = $1,
        severity = $2,
        label = $3,
        metadata = $4,
        resolved_at = CASE
          WHEN $5::boolean THEN COALESCE(resolved_at, NOW())
          ELSE resolved_at
        END,
        resolution_note = CASE
          WHEN $5::boolean THEN COALESCE(resolution_note, 'Reclassificado automaticamente como ruido informativo.')
          ELSE resolution_note
        END,
        updated_at = NOW()
      WHERE id = $6
    `, [
      classification.eventType,
      classification.severity,
      classification.label,
      metadata,
      !classification.shouldCreateEvent,
      row.id,
    ]);
  }

  console.log(JSON.stringify(summary, null, 2));
  if (dryRun) {
    console.log("Dry-run concluido. Execute novamente com --apply para gravar as alteracoes.");
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

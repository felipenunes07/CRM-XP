import {
  EventType,
  EventSeverity,
  MessageEvent,
  ConversationContext,
  DailySentiment,
  SentimentTrend,
  EventsMetrics,
  EventsSummary,
  OperationalEfficiency,
  BottleneckAgent,
  TopEvent,
  EventsFilters,
  EventsListResponse,
  EventResolutionInput,
  WhatsappMonitorMessage,
  WhatsappMessageRisk,
} from "@olist-crm/shared";
import { pool } from "../../db/client.js";
import { logger } from "../../lib/logger.js";
import { HttpError } from "../../lib/httpError.js";
import type { JwtUser } from "../platform/authService.js";

/**
 * Detects event type based on content and risk assessment
 */
export function detectEventType(
  content: string,
  risk: WhatsappMessageRisk | null
): EventType {
  const normalized = content.toLowerCase().trim();

  // Priority 1: High risks
  if (risk && (risk.severity === "HIGH" || risk.severity === ("CRITICAL" as any))) {
    if (
      normalized.includes("urgente") ||
      normalized.includes("imediato") ||
      normalized.includes("gerente") ||
      normalized.includes("supervisor")
    ) {
      return "ESCALATION";
    }
    return "RISK";
  }

  // Priority 2: Explicit complaints
  if (
    normalized.includes("reclamacao") ||
    normalized.includes("insatisfeito") ||
    normalized.includes("pessimo") ||
    normalized.includes("horrivel") ||
    normalized.includes("cancelar")
  ) {
    return "COMPLAINT";
  }

  // Priority 3: Explicit praise
  if (
    normalized.includes("excelente") ||
    normalized.includes("perfeito") ||
    normalized.includes("otimo") ||
    normalized.includes("parabens") ||
    normalized.includes("adorei")
  ) {
    return "PRAISE";
  }

  // Priority 4: Positive feedback
  if (
    normalized.includes("obrigado") ||
    normalized.includes("agradeco") ||
    normalized.includes("satisfeito") ||
    normalized.includes("bom") ||
    normalized.includes("legal")
  ) {
    return "POSITIVE_FEEDBACK";
  }

  // Priority 5: Negative feedback
  if (
    normalized.includes("problema") ||
    normalized.includes("erro") ||
    normalized.includes("nao funciona") ||
    normalized.includes("demora") ||
    normalized.includes("ruim")
  ) {
    return "NEGATIVE_FEEDBACK";
  }

  // Priority 6: Questions
  if (
    normalized.includes("?") ||
    normalized.includes("como") ||
    normalized.includes("quando") ||
    normalized.includes("onde") ||
    normalized.includes("por que") ||
    normalized.includes("qual")
  ) {
    return "QUESTION";
  }

  // Default: Risk if exists, else negative feedback (to be safe)
  if (risk) {
    return "RISK";
  }
  return "NEGATIVE_FEEDBACK";
}

/**
 * Calculates sentiment score between -1.0 and 1.0
 */
export function calculateSentimentScore(content: string): number {
  const normalized = content.toLowerCase().trim();
  const words = normalized.split(/\s+/);

  const positiveWords = [
    "obrigado", "excelente", "otimo", "perfeito", "adorei",
    "maravilhoso", "satisfeito", "feliz", "bom", "legal",
    "parabens", "agradeco", "show", "top", "incrivel"
  ];

  const negativeWords = [
    "pessimo", "horrivel", "ruim", "problema", "erro",
    "insatisfeito", "reclamacao", "cancelar", "demora", "lento",
    "nao funciona", "decepcionado", "frustrado", "raiva", "chateado"
  ];

  let positiveCount = 0;
  let negativeCount = 0;

  for (const word of words) {
    if (positiveWords.includes(word)) positiveCount++;
    if (negativeWords.includes(word)) negativeCount++;
  }

  const totalSentimentWords = positiveCount + negativeCount;

  if (totalSentimentWords === 0) {
    return 0.0;
  }

  const rawScore = (positiveCount - negativeCount) / totalSentimentWords;
  // Smoothing
  return rawScore * 0.8;
}

export function determineSeverityFromType(eventType: EventType): EventSeverity {
  switch (eventType) {
    case "ESCALATION":
    case "RISK":
      return "HIGH";
    case "COMPLAINT":
    case "NEGATIVE_FEEDBACK":
      return "MODERATE";
    case "QUESTION":
      return "LOW";
    default:
      return "LOW";
  }
}

export function generateLabelFromType(eventType: EventType): string {
  switch (eventType) {
    case "RISK": return "Risco Detectado";
    case "ESCALATION": return "Escalacao de Atendimento";
    case "COMPLAINT": return "Reclamacao";
    case "PRAISE": return "Elogio";
    case "POSITIVE_FEEDBACK": return "Feedback Positivo";
    case "NEGATIVE_FEEDBACK": return "Feedback Negativo";
    case "QUESTION": return "Duvida do Cliente";
    default: return "Evento de Mensagem";
  }
}

function mapEventRow(row: any): MessageEvent {
  return {
    id: row.id,
    dealId: row.deal_id,
    messageId: row.message_id,
    eventType: row.event_type as EventType,
    severity: row.severity as EventSeverity,
    label: row.label,
    content: row.content,
    metadata: row.metadata || {},
    detectedAt: row.detected_at.toISOString(),
    resolvedAt: row.resolved_at ? row.resolved_at.toISOString() : null,
    resolutionNote: row.resolution_note,
    resolvedBy: row.resolved_by,
    conversationContext: row.conversation_context || {
      contactName: "Desconhecido",
      contactPhone: "",
      agentName: null,
      instanceName: null,
      isGroup: false
    }
  };
}

async function fetchConversationContext(dealId: string): Promise<ConversationContext> {
  const result = await pool.query(`
    SELECT
      d.title as deal_title,
      d.whatsapp_jid,
      d.assigned_to_name as agent_name,
      wi.display_label as instance_name,
      c.display_name as customer_name
    FROM deals d
    LEFT JOIN whatsapp_instances wi ON wi.id = d.whatsapp_instance_id
    LEFT JOIN customers c ON c.id = d.customer_id
    WHERE d.id = $1
  `, [dealId]);

  if (result.rows.length === 0) {
    return {
      contactName: "Desconhecido",
      contactPhone: "",
      agentName: null,
      instanceName: null,
      isGroup: false
    };
  }

  const row = result.rows[0];
  const jid = row.whatsapp_jid || "";

  return {
    contactName: row.customer_name || row.deal_title || "Desconhecido",
    contactPhone: jid.split("@")[0] || "",
    agentName: row.agent_name,
    instanceName: row.instance_name,
    isGroup: jid.endsWith("@g.us")
  };
}

export async function createEventFromMessage(
  message: WhatsappMonitorMessage,
  dealId: string
): Promise<MessageEvent> {
  const eventType = detectEventType(message.content, message.risk);
  const sentimentScore = calculateSentimentScore(message.content);

  let severity = determineSeverityFromType(eventType);
  let label = generateLabelFromType(eventType);

  if (message.risk) {
    severity = message.risk.severity as EventSeverity;
    label = message.risk.label || label;
  }

  const conversationContext = await fetchConversationContext(dealId);

  const metadata = {
    ...message.metadata,
    direction: message.direction,
    senderName: message.senderName,
    senderJid: message.senderJid,
    remoteJid: message.remoteJid,
    isGroup: message.isGroup,
    sentimentScore,
    originalRisk: message.risk
  };

  const result = await pool.query(`
    INSERT INTO message_events (
      deal_id, message_id, event_type, severity, label,
      content, metadata, detected_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    RETURNING *
  `, [dealId, message.id, eventType, severity, label, message.content, metadata]);

  const event = mapEventRow(result.rows[0]);
  event.conversationContext = conversationContext;

  // Background update for daily sentiment
  updateDailySentimentFromDeal(dealId, sentimentScore).catch(err => {
    logger.warn("Failed to update daily sentiment", { dealId, error: err.message });
  });

  return event;
}

export async function updateDailySentimentFromDeal(dealId: string, score: number) {
  const result = await pool.query(`
    SELECT whatsapp_instance_id FROM deals WHERE id = $1
  `, [dealId]);

  const instanceId = result.rows[0]?.whatsapp_instance_id;
  if (!instanceId) return;

  const date = new Date().toISOString().split("T")[0];
  const isPositive = score > 0.1;
  const isNegative = score < -0.1;
  const isNeutral = !isPositive && !isNegative;

  await pool.query(`
    INSERT INTO event_sentiments (
      date, whatsapp_instance_id, positive_count, negative_count, neutral_count, average_score, total_messages
    ) VALUES ($1, $2, $3, $4, $5, $6, 1)
    ON CONFLICT (date, whatsapp_instance_id) DO UPDATE SET
      positive_count = event_sentiments.positive_count + EXCLUDED.positive_count,
      negative_count = event_sentiments.negative_count + EXCLUDED.negative_count,
      neutral_count = event_sentiments.neutral_count + EXCLUDED.neutral_count,
      total_messages = event_sentiments.total_messages + 1,
      average_score = (event_sentiments.average_score * event_sentiments.total_messages + EXCLUDED.average_score) / (event_sentiments.total_messages + 1),
      updated_at = NOW()
  `, [
    date,
    instanceId,
    isPositive ? 1 : 0,
    isNegative ? 1 : 0,
    isNeutral ? 1 : 0,
    score
  ]);
}

export async function listEvents(
  user: JwtUser,
  filters: EventsFilters,
  pagination: { page: number; pageSize: number }
): Promise<EventsListResponse> {
  const params: any[] = [];
  const conditions: string[] = [];

  // Permission filtering
  if (user.role === "SELLER") {
    params.push(user.id, user.name);
    conditions.push(`(d.assigned_to = $1 OR d.assigned_to_name = $2)`);
  }

  if (filters.eventType && filters.eventType.length > 0) {
    params.push(filters.eventType);
    conditions.push(`me.event_type = ANY($${params.length})`);
  }

  if (filters.severity && filters.severity.length > 0) {
    params.push(filters.severity);
    conditions.push(`me.severity = ANY($${params.length})`);
  }

  if (filters.resolved !== undefined) {
    conditions.push(filters.resolved ? `me.resolved_at IS NOT NULL` : `me.resolved_at IS NULL`);
  }

  if (filters.dateFrom) {
    params.push(filters.dateFrom);
    conditions.push(`me.detected_at >= $${params.length}`);
  }

  if (filters.dateTo) {
    params.push(filters.dateTo);
    conditions.push(`me.detected_at <= $${params.length}`);
  }

  if (filters.agentId) {
    params.push(filters.agentId);
    conditions.push(`d.assigned_to = $${params.length}`);
  }

  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(`me.content ILIKE $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const totalResult = await pool.query(`
    SELECT COUNT(*) FROM message_events me
    JOIN deals d ON d.id = me.deal_id
    ${whereClause}
  `, params);

  const total = parseInt(totalResult.rows[0].count);
  const offset = (pagination.page - 1) * pagination.pageSize;

  params.push(pagination.pageSize, offset);
  const eventsResult = await pool.query(`
    SELECT
      me.*,
      d.title as deal_title,
      d.whatsapp_jid,
      d.assigned_to_name as agent_name,
      wi.display_label as instance_name,
      c.display_name as customer_name
    FROM message_events me
    JOIN deals d ON d.id = me.deal_id
    LEFT JOIN whatsapp_instances wi ON wi.id = d.whatsapp_instance_id
    LEFT JOIN customers c ON c.id = d.customer_id
    ${whereClause}
    ORDER BY me.detected_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `, params);

  const events = eventsResult.rows.map(row => {
    const event = mapEventRow(row);
    event.conversationContext = {
      contactName: row.customer_name || row.deal_title || "Desconhecido",
      contactPhone: (row.whatsapp_jid || "").split("@")[0],
      agentName: row.agent_name,
      instanceName: row.instance_name,
      isGroup: (row.whatsapp_jid || "").endsWith("@g.us")
    };
    return event;
  });

  return {
    events,
    total,
    page: pagination.page,
    pageSize: pagination.pageSize
  };
}

export async function resolveEvent(
  eventId: string,
  user: JwtUser,
  resolution: EventResolutionInput
): Promise<MessageEvent> {
  if (!resolution.resolutionNote.trim()) {
    throw new HttpError(400, "Nota de resolucao obrigatoria.");
  }

  // Check existence and permission
  const checkResult = await pool.query(`
    SELECT me.id, d.assigned_to
    FROM message_events me
    JOIN deals d ON d.id = me.deal_id
    WHERE me.id = $1
  `, [eventId]);

  if (checkResult.rows.length === 0) {
    throw new HttpError(404, "Evento nao encontrado.");
  }

  if (user.role === "SELLER" && checkResult.rows[0].assigned_to !== user.id) {
    throw new HttpError(403, "Sem permissao para resolver este evento.");
  }

  await pool.query("BEGIN");
  try {
    const updateResult = await pool.query(`
      UPDATE message_events
      SET
        resolved_at = NOW(),
        resolution_note = $1,
        resolved_by = $2,
        updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [resolution.resolutionNote, user.id, eventId]);

    await pool.query(`
      INSERT INTO event_resolutions (event_id, resolved_by, resolution_note, resolved_at)
      VALUES ($1, $2, $3, NOW())
    `, [eventId, user.id, resolution.resolutionNote]);

    await pool.query("COMMIT");

    return mapEventRow(updateResult.rows[0]);
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
}

export async function getDailySentiments(
  user: JwtUser,
  dateRange: { from: string; to: string }
): Promise<DailySentiment[]> {
  const params: any[] = [dateRange.from, dateRange.to];
  const conditions: string[] = ["date >= $1", "date <= $2"];

  if (user.role === "SELLER") {
    // Only show sentiments for instances assigned to the user
    conditions.push(`EXISTS (
      SELECT 1 FROM whatsapp_instances wi
      WHERE wi.id = event_sentiments.whatsapp_instance_id
      AND wi.assigned_user_id = $3
    )`);
    params.push(user.id);
  }

  const result = await pool.query(`
    SELECT
      date::text,
      SUM(positive_count)::int as positive_count,
      SUM(negative_count)::int as negative_count,
      SUM(neutral_count)::int as neutral_count,
      AVG(average_score)::numeric(4,3) as average_score,
      SUM(total_messages)::int as total_messages
    FROM event_sentiments
    WHERE ${conditions.join(" AND ")}
    GROUP BY date
    ORDER BY date ASC
  `, params);

  return result.rows.map(row => ({
    date: row.date,
    positiveCount: row.positive_count,
    negativeCount: row.negative_count,
    neutralCount: row.neutral_count,
    averageScore: parseFloat(row.average_score),
    totalMessages: row.total_messages
  }));
}

export function calculateSentimentTrend(daily: DailySentiment[]): SentimentTrend {
  if (daily.length === 0) {
    return { daily, weeklyAverage: 0, monthlyAverage: 0, trend: "STABLE" };
  }

  const scores = daily.map(d => d.averageScore);
  const monthlyAverage = scores.reduce((a, b) => a + b, 0) / scores.length;

  const recentScores = scores.slice(-7);
  const weeklyAverage = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;

  let trend: "IMPROVING" | "DECLINING" | "STABLE" = "STABLE";
  if (weeklyAverage > monthlyAverage + 0.05) trend = "IMPROVING";
  else if (weeklyAverage < monthlyAverage - 0.05) trend = "DECLINING";

  return { daily, weeklyAverage, monthlyAverage, trend };
}

export async function getEventsMetrics(
  user: JwtUser,
  dateRange?: { from: string; to: string }
): Promise<EventsMetrics> {
  const from = dateRange?.from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const to = dateRange?.to || new Date().toISOString();

  const params: any[] = [from, to];
  let accessFilter = "";
  if (user.role === "SELLER") {
    params.push(user.id, user.name);
    accessFilter = `AND (d.assigned_to = $3 OR d.assigned_to_name = $4)`;
  }

  // Summary
  const summaryResult = await pool.query(`
    SELECT
      COUNT(*)::int as total_events,
      COUNT(*) FILTER (WHERE resolved_at IS NULL)::int as unresolved_events,
      COUNT(*) FILTER (WHERE event_type = 'RISK')::int as risk_events,
      COUNT(*) FILTER (WHERE event_type = 'POSITIVE_FEEDBACK')::int as positive_feedbacks,
      COUNT(*) FILTER (WHERE event_type = 'NEGATIVE_FEEDBACK')::int as negative_feedbacks,
      COUNT(*) FILTER (WHERE event_type = 'COMPLAINT')::int as complaints_count,
      CASE
        WHEN COUNT(*) > 0 THEN COUNT(*) FILTER (WHERE resolved_at IS NOT NULL)::float / COUNT(*)
        ELSE 0
      END as resolution_rate,
      COUNT(*) FILTER (WHERE severity = 'CRITICAL')::int as critical_count,
      COUNT(*) FILTER (WHERE severity = 'HIGH')::int as high_count,
      COUNT(*) FILTER (WHERE severity = 'MODERATE')::int as moderate_count,
      COUNT(*) FILTER (WHERE severity = 'LOW')::int as low_count,
      AVG((me.metadata->>'sentimentScore')::float) as avg_sentiment
    FROM message_events me
    JOIN deals d ON d.id = me.deal_id
    WHERE me.detected_at BETWEEN $1 AND $2
    ${accessFilter}
  `, params);

  const summaryData = summaryResult.rows[0];

  // Operational Efficiency
  const efficiencyResult = await pool.query(`
    SELECT
      AVG(response_time_minutes) as avg_response_time,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_time_minutes) as median_response_time,
      AVG(EXTRACT(EPOCH FROM (resolved_at - detected_at)) / 3600) as avg_resolution_hours
    FROM (
      SELECT
        me.id,
        me.detected_at,
        me.resolved_at,
        EXTRACT(EPOCH FROM (first_response.created_at - me.detected_at)) / 60 as response_time_minutes
      FROM message_events me
      JOIN deals d ON d.id = me.deal_id
      LEFT JOIN LATERAL (
        SELECT created_at
        FROM deal_activities
        WHERE deal_id = me.deal_id
          AND created_at > me.detected_at
          AND activity_type = 'WHATSAPP_SENT'
        ORDER BY created_at ASC
        LIMIT 1
      ) first_response ON true
      WHERE me.detected_at BETWEEN $1 AND $2
      ${accessFilter}
    ) response_times
  `, params);

  const efficiencyData = efficiencyResult.rows[0];

  // Bottlenecks
  const bottlenecksResult = await pool.query(`
    SELECT
      d.assigned_to as agent_id,
      d.assigned_to_name as agent_name,
      COUNT(*) FILTER (WHERE me.resolved_at IS NULL)::int as unresolved_count,
      AVG(EXTRACT(EPOCH FROM (first_response.created_at - me.detected_at)) / 60) as avg_response_minutes,
      COUNT(DISTINCT me.deal_id)::int as conversation_count
    FROM message_events me
    JOIN deals d ON d.id = me.deal_id
    LEFT JOIN LATERAL (
      SELECT created_at
      FROM deal_activities
      WHERE deal_id = me.deal_id
        AND created_at > me.detected_at
        AND activity_type = 'WHATSAPP_SENT'
      ORDER BY created_at ASC
      LIMIT 1
    ) first_response ON true
    WHERE me.detected_at BETWEEN $1 AND $2
    ${accessFilter}
    GROUP BY d.assigned_to, d.assigned_to_name
    HAVING COUNT(*) FILTER (WHERE me.resolved_at IS NULL) > 0
    ORDER BY unresolved_count DESC
    LIMIT 5
  `, params);

  // Top Events
  const topEventsResult = await pool.query(`
    SELECT
      event_type,
      label,
      severity,
      COUNT(*)::int as count,
      MAX(detected_at) as last_occurrence
    FROM message_events me
    JOIN deals d ON d.id = me.deal_id
    WHERE me.detected_at BETWEEN $1 AND $2
    ${accessFilter}
    GROUP BY event_type, label, severity
    ORDER BY count DESC
    LIMIT 10
  `, params);

  const dailySentiments = await getDailySentiments(user, { from, to });

  return {
    summary: {
      totalEvents: summaryData.total_events,
      unresolvedEvents: summaryData.unresolved_events,
      riskEvents: summaryData.risk_events,
      positiveFeedbacks: summaryData.positive_feedbacks,
      negativeFeedbacks: summaryData.negative_feedbacks,
      complaintsCount: summaryData.complaints_count,
      resolutionRate: summaryData.resolution_rate,
      bySeverity: {
        CRITICAL: summaryData.critical_count || 0,
        HIGH: summaryData.high_count || 0,
        MODERATE: summaryData.moderate_count || 0,
        LOW: summaryData.low_count || 0
      },
      averageSentiment: parseFloat(summaryData.avg_sentiment || "0")
    },
    operationalEfficiency: {
      averageResponseTimeMinutes: efficiencyData.avg_response_time,
      medianResponseTimeMinutes: efficiencyData.median_response_time,
      averageResolutionTimeHours: efficiencyData.avg_resolution_hours,
      messagesPerAgent: null, // Aggregated by query 3
      peakHourStart: null,
      peakHourEnd: null,
      bottleneckAgents: bottlenecksResult.rows.map(row => ({
        agentId: row.agent_id,
        agentName: row.agent_name || "Desconhecido",
        unresolvedCount: row.unresolved_count,
        averageResponseMinutes: row.avg_response_minutes,
        conversationCount: row.conversation_count
      }))
    },
    sentimentAnalysis: calculateSentimentTrend(dailySentiments),
    topEvents: topEventsResult.rows.map(row => ({
      eventType: row.event_type as EventType,
      label: row.label,
      count: row.count,
      severity: row.severity as EventSeverity,
      lastOccurrence: row.last_occurrence.toISOString()
    }))
  };
}

/**
 * Background job to aggregate sentiment for all active deals.
 */
export async function aggregateAllDealsSentiment() {
  logger.info("starting batch sentiment aggregation for all active deals");
  try {
    const dealsResult = await pool.query(`
      SELECT d.id 
      FROM deals d
      JOIN pipeline_stages ps ON ps.id = d.stage_id
      WHERE ps.is_won = false AND ps.is_lost = false
        AND d.last_activity_at > NOW() - INTERVAL '30 days'
    `);

    let processed = 0;
    for (const row of dealsResult.rows) {
      // Re-calculate sentiment from recent messages for this deal
      const messagesResult = await pool.query(`
        SELECT content FROM deal_activities 
        WHERE deal_id = $1 AND activity_type = 'WHATSAPP_RECEIVED' 
        ORDER BY created_at DESC LIMIT 50
      `, [row.id]);

      if (messagesResult.rows.length > 0) {
        let totalScore = 0;
        for (const msg of messagesResult.rows) {
          totalScore += calculateSentimentScore(msg.content);
        }
        const avgScore = totalScore / messagesResult.rows.length;
        await updateDailySentimentFromDeal(row.id, avgScore);
      }
      
      processed++;
      if (processed % 50 === 0) {
        logger.info("sentiment aggregation progress", { processed, total: dealsResult.rowCount });
      }
    }

    logger.info("finished batch sentiment aggregation", { total: processed });
  } catch (error: any) {
    logger.error("failed batch sentiment aggregation", { error: error.message });
  }
}

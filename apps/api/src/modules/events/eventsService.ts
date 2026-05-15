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

export const MESSAGE_CLASSIFIER_VERSION = "2026-05-15-v4";

type MessageClassificationCategory =
  | "risk"
  | "opportunity"
  | "complaint"
  | "feedback"
  | "question"
  | "noise";

export interface MessageEventClassification {
  eventType: EventType;
  severity: EventSeverity;
  label: string;
  sentimentScore: number;
  confidence: number;
  reason: string;
  category: MessageClassificationCategory;
  actionRequired: boolean;
  shouldCreateEvent: boolean;
  evidence: string[];
}

interface ClassificationText {
  original: string;
  normalized: string;
  compact: string;
  tokens: string[];
  tokenSet: Set<string>;
}

const GREETING_START_PHRASES = [
  "bom dia", "boa tarde", "boa noite", "oi", "ola", "opa", "e ai", "eai",
  "fala", "salve",
];

const ROUTINE_NEUTRAL_PHRASES = [
  "tudo bem", "tudo bom", "tudo certo", "tudo tranquilo", "td bem",
  "estou bem", "to bem", "tou bem", "e tu", "e voce", "e vc",
  "sim", "nao", "ok", "blz", "beleza", "tranquilo", "certo",
  "entendi", "entendido", "ta bom", "pode deixar", "tem sim",
  "ate mais", "ate logo", "tchau", "flw", "falou", "vlw",
  "kk", "kkk", "kkkk", "haha", "rs", "rsrs", "hehe",
];

const ROUTINE_SALES_PITCH_PATTERNS = [
  /\bprecos?\s+top\s+pra\s+(vc|voce)\b/u,
  /\bconsigo\s+fazer\s+por\s+(r\$\s*)?\d/u,
  /\ba\s+caixa\s+vem\s+\d+/u,
];

const PRODUCT_TOKENS = new Set([
  "iphone", "iphones", "ip", "samsung", "xiaomi", "motorola", "tela", "telas",
  "peca", "pecas", "bateria", "display", "lcd", "modelo", "modelos",
]);

const COMMERCIAL_TOKENS = new Set([
  "frete", "valor", "preco", "precos", "atacado", "catalogo", "orcamento",
  "tabela", "reposicao", "caixa", "fechada", "modelo", "modelos", "pecas",
  "disponivel", "disponibilidade", "estoque", "chegou", "chegaram",
]);

const CHURN_PHRASES = [
  "outro fornecedor", "achei mais barato", "achado mais barato",
  "cobriu o preco", "vou parar de comprar", "nao vou comprar mais",
  "comprar em outro lugar", "na concorrencia",
];

const COMPLAINT_PHRASES = [
  "reclamacao", "insatisfeito", "pessimo", "horrivel", "cancelar",
  "absurdo", "ridiculo", "veio errado", "veio com defeito", "produto errado",
  "nao chegou", "nao recebi", "atrasou", "defeito", "quebrado",
  "sem retorno", "sem resposta",
];

const NEGATIVE_FEEDBACK_PHRASES = [
  "problema", "erro", "nao funciona", "nao funcionou", "demora", "ruim",
  "decepcionado", "frustrado", "chateado", "lento",
];

const PRAISE_PHRASES = [
  "show de bola", "excelente", "perfeito", "otimo", "parabens",
  "adorei", "maravilhoso", "incrivel", "sensacional",
];

const POSITIVE_FEEDBACK_PHRASES = [
  "obrigado", "obrigada", "agradeco", "satisfeito", "gostei", "amei",
  "muito bom", "ficou bom", "top",
];

/**
 * Internal company group JIDs that should be completely ignored by the
 * intelligence system. These are operational groups (trocas, conferência,
 * correios, etc.) whose messages are NOT customer interactions.
 */
const INTERNAL_GROUP_BLOCKLIST = new Set([
  "120363045047058306@g.us",  // XP-Trocas Recebida
  "120363029236155900@g.us",  // XP-Conferencia
  "120363179964808614@g.us",  // XP-Correios
  "120363044132316737@g.us",  // XP-Saida de caixas
  "120363228554629988@g.us",  // XP-Fechar Caixas
  "120363239228364452@g.us",  // XP Técnicos
  "120363031213889254@g.us",  // XP união faz açúcar
  "120363048463637470@g.us",  // Romario Taxista
  "120363024604307554@g.us",  // INT 强大团队 XP BRASIL
  "120363025402961504@g.us",  // XP - Mídias e posts
  "120363388324650509@g.us",  // XP Equipe de Soluções
  "120363284675472016@g.us",  // XP-Trocas Entregue
  "120363219631231709@g.us",  // XP-NF PARA COBRAR CLIENTE
  "120363024388010129@g.us",  // XP-comprovante
  "120363278542101022@g.us",  // Motorista César
  "120363302011320268@g.us",  // XP-Meninos
  "120363335551619512@g.us",  // PP
  "120363024580077621@g.us",  // Leandro Rei Celular
  "120363422564243122@g.us",  // Extratos
  "120363404782149909@g.us",  // XP Conferência 2
  "120363422753753190@g.us",  // Link orçamento facil
]);

/**
 * Checks if a remoteJid belongs to an internal company group
 * that should be completely ignored by message intelligence.
 */
export function isInternalGroup(remoteJid: string | null | undefined): boolean {
  if (!remoteJid) return false;
  return INTERNAL_GROUP_BLOCKLIST.has(remoteJid);
}

/**
 * Internal company numbers and system accounts that should not be evaluated as customers.
 * If these senders send an inbound message (e.g. answering in a group or from another instance),
 * it should be ignored by the Intelligence system to avoid treating our own agents as complaining customers.
 */
const INTERNAL_SENDER_BLOCKLIST = new Set([
  "5511911279702@s.whatsapp.net", // Felipe
  "5511915863088@s.whatsapp.net", // Quedma
  "5511916263525@s.whatsapp.net", // Camila
  "5511930890128@s.whatsapp.net", // Site
  "5511944538074@s.whatsapp.net", // Lucas
  "5511944705416@s.whatsapp.net", // Thais
  "5511947879036@s.whatsapp.net", // Lili
  "5511951392256@s.whatsapp.net", // Tamires
  "5511971086782@s.whatsapp.net", // Iza
  "5511975501901@s.whatsapp.net", // Ragnar
  "5511996435466@s.whatsapp.net", // Suelen
  "5511998595698@s.whatsapp.net", // Amanda
  "5511914898986@s.whatsapp.net", // Zhao
  "5511978398236@s.whatsapp.net", // Ronaldo
  "5511964218475@s.whatsapp.net", // Rafael
  "5511976001044@s.whatsapp.net", // contabackupxp
  "5511915103835@s.whatsapp.net", // Conferência
  "5511958326930@s.whatsapp.net", // Motoboy Lucas
  "5511959502231@s.whatsapp.net",
  "93755076042876@lid",
  "269603754213443@lid",
  "226362308726972@lid",
  "214997741375562:74@lid",
  "3960597401743@lid",
  "214997741375562:78@lid",
  "32624739369122@lid",
  "128441684885669@lid"
]);

const INTERNAL_SENDER_NAMES = new Set([
  "XP - TAMIRES",
  "XP - Iza",
  "Lili Brasil",
  "XP - Camila",
  "Ragnar Lothbrok"
]);

export function isInternalSender(senderJid: string | null | undefined, senderName: string | null | undefined): boolean {
  if (senderJid && INTERNAL_SENDER_BLOCKLIST.has(senderJid)) return true;
  if (senderName && INTERNAL_SENDER_NAMES.has(senderName)) return true;
  return false;
}
import { pool } from "../../db/client.js";
import { logger } from "../../lib/logger.js";
import { HttpError } from "../../lib/httpError.js";
import type { JwtUser } from "../platform/authService.js";

/**
 * Checks if a message is a simple greeting or casual short message
 */
function collapseRepeatedLetters(value: string) {
  return value.replace(/([a-z])\1+/gu, "$1");
}

function normalizeMessageText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

function buildClassificationText(content: string): ClassificationText {
  const normalized = normalizeMessageText(content);
  const compact = collapseRepeatedLetters(normalized);
  const tokens = compact.match(/[a-z0-9]+/gu) ?? [];

  return {
    original: content,
    normalized,
    compact,
    tokens,
    tokenSet: new Set(tokens),
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasPhraseIn(text: string, phrase: string) {
  const normalizedPhrase = collapseRepeatedLetters(normalizeMessageText(phrase));
  const pattern = normalizedPhrase.split(/\s+/).map(escapeRegExp).join("\\s+");
  return new RegExp(`(?:^|\\b)${pattern}(?:\\b|$)`, "u").test(text);
}

function hasPhrase(ctx: ClassificationText, phrase: string) {
  return hasPhraseIn(ctx.compact, phrase) || hasPhraseIn(ctx.normalized, phrase);
}

function hasAnyPhrase(ctx: ClassificationText, phrases: string[]) {
  return phrases.some((phrase) => hasPhrase(ctx, phrase));
}

function hasToken(ctx: ClassificationText, token: string) {
  return ctx.tokenSet.has(collapseRepeatedLetters(normalizeMessageText(token)));
}

function hasAnyToken(ctx: ClassificationText, tokens: Iterable<string>) {
  for (const token of tokens) {
    if (hasToken(ctx, token)) return true;
  }
  return false;
}

function getMetadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readRiskFromMetadata(metadata: Record<string, unknown>): WhatsappMessageRisk | null {
  const originalRisk = metadata.originalRisk;
  if (!originalRisk || typeof originalRisk !== "object" || Array.isArray(originalRisk)) {
    return null;
  }

  const risk = originalRisk as Partial<WhatsappMessageRisk>;
  if (!risk.label || !risk.severity || !risk.keyword) {
    return null;
  }

  return risk as WhatsappMessageRisk;
}

function countMatches(value: string, pattern: RegExp) {
  return value.match(pattern)?.length ?? 0;
}

function isPriceList(ctx: ClassificationText) {
  const priceCount = countMatches(ctx.normalized, /r\$\s*\d+|\b\d+,\d{2}\b/gu);
  const separatorCount = countMatches(ctx.original, /\|/gu);
  const productCount = countMatches(ctx.compact, /\b(ip|iphone|samsung|xiaomi)[-\s]?\d{1,2}/gu);

  return priceCount >= 3 || (priceCount >= 2 && (separatorCount >= 2 || productCount >= 2)) || (ctx.original.length > 350 && priceCount >= 2);
}

function isRoutineSalesPitch(ctx: ClassificationText) {
  return ROUTINE_SALES_PITCH_PATTERNS.some((pattern) => pattern.test(ctx.compact));
}

function isGreetingMessage(ctx: ClassificationText) {
  const tokenCount = ctx.tokens.length;
  if (tokenCount === 0) return false;

  if (
    tokenCount <= 8 &&
    GREETING_START_PHRASES.some((phrase) => ctx.compact === phrase || ctx.compact.startsWith(`${phrase} `))
  ) {
    return true;
  }

  return tokenCount <= 4 && ["oi", "ola", "opa", "eai", "ei", "fala", "salve"].includes(ctx.tokens[0] ?? "");
}

function isRoutineNeutralMessage(ctx: ClassificationText) {
  if (isPriceList(ctx) || isRoutineSalesPitch(ctx)) {
    return true;
  }

  if (ctx.tokens.length <= 4 && hasAnyPhrase(ctx, ROUTINE_NEUTRAL_PHRASES)) {
    return true;
  }

  if (ctx.tokens.length <= 3 && ctx.tokens.every((token) => ["sim", "nao", "ok", "rs", "kk", "kkk"].includes(token))) {
    return true;
  }

  return false;
}

function hasCommercialIntent(ctx: ClassificationText) {
  if (hasToken(ctx, "frete") && (/\b\d{5,8}\b/u.test(ctx.compact) || hasPhrase(ctx, "pra"))) {
    return true;
  }

  if (hasAnyPhrase(ctx, ["quanto custa", "quanto fica", "qual o preco", "qual o valor", "por quanto", "caixa fechada", "por atacado"])) {
    return true;
  }

  if (hasAnyToken(ctx, ["catalogo", "orcamento", "tabela", "atacado"])) {
    return true;
  }

  if ((hasToken(ctx, "valor") || hasToken(ctx, "preco") || hasToken(ctx, "precos")) && hasAnyToken(ctx, COMMERCIAL_TOKENS)) {
    return true;
  }

  if ((hasToken(ctx, "reposicao") || hasToken(ctx, "chegou") || hasToken(ctx, "chegaram")) && hasAnyToken(ctx, PRODUCT_TOKENS) && ctx.normalized.includes("?")) {
    return true;
  }

  if ((ctx.normalized.includes("?") || hasAnyToken(ctx, ["quais", "qual", "tendo"])) && hasAnyToken(ctx, PRODUCT_TOKENS)) {
    return true;
  }

  if (hasToken(ctx, "tem") && hasAnyToken(ctx, PRODUCT_TOKENS)) {
    return true;
  }

  return false;
}

function isEscalation(ctx: ClassificationText) {
  return hasAnyPhrase(ctx, ["urgente", "imediato", "gerente", "supervisor", "procon", "processo"]);
}

function categoryFromEventType(eventType: EventType): MessageClassificationCategory {
  switch (eventType) {
    case "RISK":
    case "ESCALATION":
      return "risk";
    case "COMPLAINT":
    case "NEGATIVE_FEEDBACK":
    case "CHURN_RISK":
      return "complaint";
    case "PRAISE":
    case "POSITIVE_FEEDBACK":
      return "feedback";
    case "QUESTION":
    case "SALES_OPPORTUNITY":
      return "question";
    default:
      return "noise";
  }
}

function buildClassification(
  eventType: EventType,
  ctx: ClassificationText,
  input: Partial<Omit<MessageEventClassification, "eventType" | "severity" | "label" | "sentimentScore" | "shouldCreateEvent">>
): MessageEventClassification {
  const category = input.category ?? categoryFromEventType(eventType);
  const actionRequired = input.actionRequired ?? ["risk", "opportunity", "complaint", "question"].includes(category);

  return {
    eventType,
    severity: determineSeverityFromType(eventType),
    label: generateLabelFromType(eventType),
    sentimentScore: calculateSentimentScore(ctx.original),
    confidence: input.confidence ?? 0.75,
    reason: input.reason ?? "Classificacao por contexto da mensagem.",
    category,
    actionRequired,
    shouldCreateEvent: eventType !== "GREETING" && eventType !== "NEUTRAL" && category !== "feedback" && eventType !== "SALES_OPPORTUNITY",
    evidence: input.evidence ?? [],
  };
}

export function classifyMessageContent(
  content: string,
  risk: WhatsappMessageRisk | null
): MessageEventClassification {
  const ctx = buildClassificationText(content);

  if (!ctx.compact) {
    return buildClassification("NEUTRAL", ctx, {
      confidence: 0.99,
      reason: "Mensagem vazia ou sem texto util.",
      evidence: ["empty_content"],
    });
  }

  if (risk?.severity === "HIGH") {
    return {
      ...buildClassification(isEscalation(ctx) ? "ESCALATION" : "RISK", ctx, {
        category: "risk",
        confidence: 0.96,
        reason: risk.label || "Mensagem contem dado sensivel ou risco alto.",
        evidence: [risk.keyword],
      }),
      severity: risk.severity as EventSeverity,
      label: risk.label || generateLabelFromType("RISK"),
    };
  }

  if (hasAnyPhrase(ctx, COMPLAINT_PHRASES)) {
    return buildClassification("COMPLAINT", ctx, {
      category: "complaint",
      confidence: 0.92,
      reason: "Cliente demonstrou reclamacao ou insatisfacao explicita.",
      evidence: COMPLAINT_PHRASES.filter((phrase) => hasPhrase(ctx, phrase)).slice(0, 3),
    });
  }

  if (hasToken(ctx, "concorrente") || hasAnyPhrase(ctx, CHURN_PHRASES) || hasAnyPhrase(ctx, ["ta caro", "muito caro"])) {
    return buildClassification("CHURN_RISK", ctx, {
      category: "complaint",
      confidence: 0.9,
      reason: "Mensagem indica comparacao com concorrente, preco ou risco de perda.",
      evidence: ["churn_or_price_objection"],
    });
  }

  if (hasAnyPhrase(ctx, NEGATIVE_FEEDBACK_PHRASES)) {
    return buildClassification("NEGATIVE_FEEDBACK", ctx, {
      category: "complaint",
      confidence: 0.86,
      reason: "Mensagem contem indicador explicito de problema no atendimento ou pedido.",
      evidence: NEGATIVE_FEEDBACK_PHRASES.filter((phrase) => hasPhrase(ctx, phrase)).slice(0, 3),
    });
  }

  if (isGreetingMessage(ctx)) {
    return buildClassification("GREETING", ctx, {
      confidence: 0.95,
      reason: "Saudacao ou abertura de conversa sem acao operacional.",
      evidence: ["greeting"],
    });
  }

  if (isRoutineNeutralMessage(ctx)) {
    return buildClassification("NEUTRAL", ctx, {
      confidence: 0.9,
      reason: "Mensagem rotineira, resposta curta ou lista comercial sem pedido do cliente.",
      evidence: ["routine_or_price_list"],
    });
  }

  if (hasCommercialIntent(ctx)) {
    return buildClassification("QUESTION", ctx, {
      category: "question",
      confidence: 0.88,
      reason: "Mensagem indica interesse comercial ou duvida sobre produto/preco.",
      evidence: ctx.tokens.filter((token) => COMMERCIAL_TOKENS.has(token)).slice(0, 5),
    });
  }

  if (hasAnyPhrase(ctx, PRAISE_PHRASES)) {
    return buildClassification("PRAISE", ctx, {
      category: "feedback",
      actionRequired: false,
      confidence: 0.88,
      reason: "Cliente enviou elogio ou aprovacao clara.",
      evidence: PRAISE_PHRASES.filter((phrase) => hasPhrase(ctx, phrase)).slice(0, 3),
    });
  }

  if (!isRoutineSalesPitch(ctx) && hasAnyPhrase(ctx, POSITIVE_FEEDBACK_PHRASES)) {
    return buildClassification("POSITIVE_FEEDBACK", ctx, {
      category: "feedback",
      actionRequired: false,
      confidence: 0.8,
      reason: "Mensagem contem feedback positivo do cliente.",
      evidence: POSITIVE_FEEDBACK_PHRASES.filter((phrase) => hasPhrase(ctx, phrase)).slice(0, 3),
    });
  }

  if (ctx.normalized.includes("?") || hasAnyPhrase(ctx, ["como faco", "quando", "onde fica", "por que", "tem como", "prazo", "rastreio", "pedido"])) {
    return buildClassification("QUESTION", ctx, {
      category: "question",
      confidence: 0.78,
      reason: "Pergunta do cliente que pode exigir resposta do atendimento.",
      evidence: ["question"],
    });
  }

  if (risk) {
    return {
      ...buildClassification("RISK", ctx, {
        category: "risk",
        confidence: 0.78,
        reason: risk.label || "Mensagem contem sinal de risco operacional.",
        evidence: [risk.keyword],
      }),
      severity: risk.severity as EventSeverity,
      label: risk.label || generateLabelFromType("RISK"),
    };
  }

  return buildClassification("NEUTRAL", ctx, {
    confidence: 0.82,
    reason: "Mensagem sem pedido, risco, reclamacao ou oportunidade clara.",
    evidence: ["no_actionable_signal"],
  });
}

/**
 * Detects event type based on content and risk assessment.
 * Messages that are casual greetings or neutral are classified accordingly
 * instead of defaulting to NEGATIVE_FEEDBACK.
 */
export function detectEventType(
  content: string,
  risk: WhatsappMessageRisk | null
): EventType {
  return classifyMessageContent(content, risk).eventType;
}

/**
 * Calculates sentiment score between -1.0 and 1.0
 */
export function calculateSentimentScore(content: string): number {
  const ctx = buildClassificationText(content);

  if (isPriceList(ctx) || isRoutineSalesPitch(ctx)) {
    return 0;
  }

  let positiveSignals = 0;
  let negativeSignals = 0;

  for (const phrase of POSITIVE_FEEDBACK_PHRASES) {
    if (hasPhrase(ctx, phrase)) positiveSignals++;
  }
  for (const phrase of PRAISE_PHRASES) {
    if (hasPhrase(ctx, phrase)) positiveSignals++;
  }
  for (const phrase of NEGATIVE_FEEDBACK_PHRASES) {
    if (hasPhrase(ctx, phrase)) negativeSignals++;
  }
  for (const phrase of COMPLAINT_PHRASES) {
    if (hasPhrase(ctx, phrase)) negativeSignals++;
  }

  const totalSentimentSignals = positiveSignals + negativeSignals;
  if (totalSentimentSignals === 0) {
    return isGreetingMessage(ctx) ? 0.15 : 0;
  }

  return ((positiveSignals - negativeSignals) / totalSentimentSignals) * 0.8;
}

export function determineSeverityFromType(eventType: EventType): EventSeverity {
  switch (eventType) {
    case "ESCALATION":
    case "RISK":
      return "HIGH";
    case "CHURN_RISK":
      return "HIGH";
    case "COMPLAINT":
    case "NEGATIVE_FEEDBACK":
      return "MODERATE";
    case "SALES_OPPORTUNITY":
      return "MODERATE";
    case "QUESTION":
    case "POSITIVE_FEEDBACK":
    case "PRAISE":
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
    case "CHURN_RISK": return "Risco de Churn";
    case "SALES_OPPORTUNITY": return "Oportunidade Comercial";
    case "GREETING": return "Saudacao";
    case "NEUTRAL": return "Mensagem Neutra";
    default: return "Evento de Mensagem";
  }
}

function buildClassificationMetadata(
  metadata: Record<string, unknown>,
  classification: MessageEventClassification,
  row?: { event_type?: string; severity?: string; label?: string }
) {
  return {
    ...metadata,
    classifierVersion: MESSAGE_CLASSIFIER_VERSION,
    previousEventType: row?.event_type,
    previousSeverity: row?.severity,
    previousLabel: row?.label,
    sentimentScore: classification.sentimentScore,
    classificationReason: classification.reason,
    classificationConfidence: classification.confidence,
    classificationCategory: classification.category,
    classificationEvidence: classification.evidence,
    actionRequired: classification.actionRequired,
    shouldCreateEvent: classification.shouldCreateEvent,
  };
}

function mapEventRow(row: any): MessageEvent {
  const metadata = getMetadataRecord(row.metadata);
  const shouldReclassify = metadata.classifierVersion !== MESSAGE_CLASSIFIER_VERSION;
  const classification = shouldReclassify
    ? classifyMessageContent(row.content, readRiskFromMetadata(metadata))
    : null;

  const eventType = classification?.eventType ?? row.event_type as EventType;
  const severity = classification?.severity ?? row.severity as EventSeverity;
  const label = classification?.label ?? row.label;
  const eventMetadata = classification
    ? buildClassificationMetadata(metadata, classification, row)
    : metadata;

  return {
    id: row.id,
    dealId: row.deal_id,
    messageId: row.message_id,
    eventType,
    severity,
    label,
    content: row.content,
    metadata: eventMetadata,
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

function eventRequiresAction(event: MessageEvent) {
  if (typeof event.metadata.actionRequired === "boolean") {
    return event.metadata.actionRequired;
  }

  return ["RISK", "ESCALATION", "COMPLAINT", "NEGATIVE_FEEDBACK", "CHURN_RISK", "SALES_OPPORTUNITY", "QUESTION"]
    .includes(event.eventType);
}

function shouldListEvent(event: MessageEvent) {
  if (event.metadata.shouldCreateEvent === false) {
    return false;
  }

  return event.eventType !== "GREETING" && event.eventType !== "NEUTRAL";
}

async function persistMappedClassification(row: any, event: MessageEvent) {
  if (row.metadata?.classifierVersion === MESSAGE_CLASSIFIER_VERSION && row.event_type === event.eventType) {
    return;
  }

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
    event.eventType,
    event.severity,
    event.label,
    event.metadata,
    !shouldListEvent(event),
    event.id,
  ]);
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
): Promise<MessageEvent | null> {
  // ── Filter 1: Ignore internal company groups ──
  if (isInternalGroup(message.remoteJid)) {
    return null;
  }

  // ── Filter 2: Only analyze INBOUND messages (from customers) ──
  // Outbound messages are from agents — analyzing them pollutes sentiment data
  if (message.direction === "OUTBOUND") {
    return null;
  }

  // ── Filter 2.5: Ignore internal senders (attendants replying from own WhatsApp) ──
  if (isInternalSender(message.senderJid, message.senderName)) {
    return null;
  }

  const classification = classifyMessageContent(message.content, message.risk);
  const eventType = classification.eventType;
  const sentimentScore = classification.sentimentScore;

  // ── Filter 3: Skip greetings, neutral messages, and generic questions — they are noise ──
  if (!classification.shouldCreateEvent) {
    // Still update sentiment (greetings = slightly positive, others neutral)
    updateDailySentimentFromDeal(dealId, sentimentScore).catch(err => {
      logger.warn("Failed to update daily sentiment", { dealId, error: err.message });
    });
    return null;
  }

  let severity = classification.severity;
  let label = classification.label;

  if (message.risk && (eventType === "RISK" || eventType === "ESCALATION")) {
    severity = message.risk.severity as EventSeverity;
    label = message.risk.label || label;
  }

  const conversationContext = await fetchConversationContext(dealId);

  // ── Escalation 1: VIP Customers ──
  // Check if the customer has high value or high frequency
  const vipCheckResult = await pool.query(`
    SELECT cs.total_spent, cs.total_orders, cs.value_score 
    FROM deals d
    JOIN customer_snapshot cs ON d.customer_id = cs.customer_id
    WHERE d.id = $1
  `, [dealId]);

  let isVip = false;
  if (vipCheckResult.rows[0]) {
    const { total_spent, total_orders, value_score } = vipCheckResult.rows[0];
    if (Number(total_spent) > 5000 || Number(total_orders) > 10 || Number(value_score) > 80) {
      isVip = true;
    }
  }

  if (isVip && (eventType === "COMPLAINT" || eventType === "NEGATIVE_FEEDBACK" || eventType === "CHURN_RISK")) {
    severity = "CRITICAL";
    label = `[VIP] ${label}`;
  }

  const metadata = {
    ...message.metadata,
    direction: message.direction,
    senderName: message.senderName,
    senderJid: message.senderJid,
    remoteJid: message.remoteJid,
    isGroup: message.isGroup,
    sentimentScore,
    classifierVersion: MESSAGE_CLASSIFIER_VERSION,
    classificationReason: classification.reason,
    classificationConfidence: classification.confidence,
    classificationCategory: classification.category,
    classificationEvidence: classification.evidence,
    actionRequired: classification.actionRequired,
    shouldCreateEvent: classification.shouldCreateEvent,
    originalRisk: message.risk,
    isVip
  };

  const result = await pool.query(`
    INSERT INTO message_events (
      deal_id, message_id, event_type, severity, label,
      content, metadata, detected_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    ON CONFLICT (message_id, deal_id) DO NOTHING
    RETURNING *
  `, [dealId, message.id, eventType, severity, label, message.content, metadata]);

  // If no row was inserted, it means it was a duplicate webhook from another instance
  if (result.rows.length === 0) {
    return null;
  }

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
  } else {
    conditions.push(`me.event_type NOT IN ('GREETING', 'NEUTRAL')`);
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
    let dateTo = filters.dateTo;
    if (dateTo.length === 10) dateTo = `${dateTo}T23:59:59.999Z`;
    params.push(dateTo);
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

  if (filters.isGroup !== undefined) {
    conditions.push(`(me.metadata->>'isGroup')::boolean = ${filters.isGroup ? 'true' : 'false'}`);
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

  const mappedEvents = await Promise.all(eventsResult.rows.map(async row => {
    const event = mapEventRow(row);
    event.conversationContext = {
      contactName: row.customer_name || row.deal_title || "Desconhecido",
      contactPhone: (row.whatsapp_jid || "").split("@")[0],
      agentName: row.agent_name,
      instanceName: row.instance_name,
      isGroup: (row.whatsapp_jid || "").endsWith("@g.us")
    };
    await persistMappedClassification(row, event);
    return event;
  }));

  const events = filters.eventType && filters.eventType.length > 0
    ? mappedEvents
    : mappedEvents.filter(shouldListEvent);

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
  filters?: EventsFilters
): Promise<EventsMetrics> {
  const from = filters?.dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  // Extend dateTo to end of day to include all events on the last day
  let to = filters?.dateTo || new Date().toISOString();
  if (to.length === 10) {
    to = `${to}T23:59:59.999Z`;
  } else if (!to.includes("T")) {
    to = `${to}T23:59:59.999Z`;
  }

  const params: any[] = [from, to];
  let accessFilter = "AND me.event_type NOT IN ('GREETING', 'NEUTRAL')";
  if (user.role === "SELLER") {
    params.push(user.id, user.name);
    accessFilter += ` AND (d.assigned_to = $3 OR d.assigned_to_name = $4)`;
  }
  
  if (filters?.isGroup !== undefined) {
    accessFilter += ` AND (me.metadata->>'isGroup')::boolean = ${filters.isGroup ? 'true' : 'false'}`;
  }

  // Summary
  const summaryResult = await pool.query(`
    SELECT
      COUNT(*)::int as total_events,
      COUNT(*) FILTER (WHERE resolved_at IS NULL)::int as unresolved_events,
      COUNT(*) FILTER (WHERE event_type IN ('RISK', 'ESCALATION', 'CHURN_RISK'))::int as risk_events,
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
      COUNT(*) FILTER (WHERE (event_type = 'COMPLAINT' OR event_type = 'NEGATIVE_FEEDBACK') AND label LIKE '[VIP]%')::int as vip_complaints_count,
      COUNT(*) FILTER (WHERE event_type = 'SALES_OPPORTUNITY')::int as opportunities_count,
      COUNT(*) FILTER (WHERE event_type = 'QUESTION')::int as question_count,
      COUNT(*) FILTER (
        WHERE resolved_at IS NULL
        AND COALESCE((me.metadata->>'actionRequired')::boolean, event_type IN ('RISK', 'ESCALATION', 'COMPLAINT', 'NEGATIVE_FEEDBACK', 'CHURN_RISK', 'SALES_OPPORTUNITY', 'QUESTION'))
      )::int as action_required_events,
      COUNT(*) FILTER (
        WHERE COALESCE((me.metadata->>'actionRequired')::boolean, event_type IN ('RISK', 'ESCALATION', 'COMPLAINT', 'NEGATIVE_FEEDBACK', 'CHURN_RISK', 'SALES_OPPORTUNITY', 'QUESTION')) = false
      )::int as informational_events,
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
      COUNT(*) FILTER (
        WHERE me.resolved_at IS NULL
        AND COALESCE((me.metadata->>'actionRequired')::boolean, me.event_type IN ('RISK', 'ESCALATION', 'COMPLAINT', 'NEGATIVE_FEEDBACK', 'CHURN_RISK', 'SALES_OPPORTUNITY', 'QUESTION'))
      )::int as unresolved_count,
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
    HAVING COUNT(*) FILTER (
      WHERE me.resolved_at IS NULL
      AND COALESCE((me.metadata->>'actionRequired')::boolean, me.event_type IN ('RISK', 'ESCALATION', 'COMPLAINT', 'NEGATIVE_FEEDBACK', 'CHURN_RISK', 'SALES_OPPORTUNITY', 'QUESTION'))
    ) > 0
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
  const filteredNoiseCount = dailySentiments.reduce((total, item) => total + item.neutralCount, 0);

  // Unanswered opportunities for > 2 hours
  const unansweredOpportunitiesResult = await pool.query(`
    SELECT COUNT(*)::int as count
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
    AND me.event_type = 'SALES_OPPORTUNITY'
    AND first_response.created_at IS NULL
    AND me.detected_at < NOW() - INTERVAL '2 hours'
    ${accessFilter}
  `, params);

  let bottleneckAgentText: string | null = null;
  if (bottlenecksResult.rows.length > 0 && summaryData.action_required_events > 0) {
    const topAgent = bottlenecksResult.rows[0];
    const percentage = Math.round((topAgent.unresolved_count / summaryData.action_required_events) * 100);
    if (percentage > 25) {
      bottleneckAgentText = `A atendente ${topAgent.agent_name || "Sem nome"} concentrou ${percentage}% dos eventos pendentes.`;
    }
  }

  return {
    summary: {
      totalEvents: summaryData.total_events,
      unresolvedEvents: summaryData.unresolved_events,
      riskEvents: summaryData.risk_events,
      positiveFeedbacks: summaryData.positive_feedbacks,
      negativeFeedbacks: summaryData.negative_feedbacks,
      complaintsCount: summaryData.complaints_count,
      opportunitiesCount: summaryData.opportunities_count || 0,
      questionCount: summaryData.question_count || 0,
      actionRequiredEvents: summaryData.action_required_events || 0,
      informationalEvents: summaryData.informational_events || 0,
      filteredNoiseCount,
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
    })),
    executiveSummary: {
      complaintsCount: summaryData.complaints_count,
      vipComplaintsCount: summaryData.vip_complaints_count || 0,
      opportunitiesCount: summaryData.opportunities_count || 0,
      questionCount: summaryData.question_count || 0,
      actionRequiredEvents: summaryData.action_required_events || 0,
      informationalEvents: summaryData.informational_events || 0,
      filteredNoiseCount,
      unansweredOpportunitiesCount: unansweredOpportunitiesResult.rows[0]?.count || 0,
      bottleneckAgentText
    }
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

/**
 * Purge old data to prevent database bloat.
 * 
 * Retention policy:
 * - whatsapp_incoming_messages: 30 days
 * - message_events (resolved): 90 days  
 * - message_events (unresolved, LOW severity): 60 days
 * - event_resolutions: 90 days
 * - event_sentiments: 180 days
 */
export async function purgeOldEventsData() {
  logger.info("starting events data purge");
  const results: Record<string, number> = {};

  try {
    // 1. Old incoming messages (raw webhook data) — 30 days
    const incomingResult = await pool.query(`
      DELETE FROM whatsapp_incoming_messages
      WHERE created_at < NOW() - INTERVAL '30 days'
    `);
    results.incomingMessages = incomingResult.rowCount ?? 0;

    // 2. Old resolved events — 90 days
    const resolvedResult = await pool.query(`
      DELETE FROM message_events
      WHERE resolved_at IS NOT NULL
        AND resolved_at < NOW() - INTERVAL '90 days'
    `);
    results.resolvedEvents = resolvedResult.rowCount ?? 0;

    // 3. Old unresolved LOW-severity events — 60 days (stale noise)
    const staleResult = await pool.query(`
      DELETE FROM message_events
      WHERE resolved_at IS NULL
        AND severity = 'LOW'
        AND detected_at < NOW() - INTERVAL '60 days'
    `);
    results.staleLowEvents = staleResult.rowCount ?? 0;

    // 4. Old event resolutions audit trail — 90 days
    const resolutionsResult = await pool.query(`
      DELETE FROM event_resolutions
      WHERE resolved_at < NOW() - INTERVAL '90 days'
    `);
    results.resolutions = resolutionsResult.rowCount ?? 0;

    // 5. Old sentiment aggregation data — 180 days
    const sentimentsResult = await pool.query(`
      DELETE FROM event_sentiments
      WHERE date < CURRENT_DATE - INTERVAL '180 days'
    `);
    results.sentiments = sentimentsResult.rowCount ?? 0;

    const totalPurged = Object.values(results).reduce((a, b) => a + b, 0);
    logger.info("finished events data purge", { totalPurged, ...results });

    return results;
  } catch (error: any) {
    logger.error("failed events data purge", { error: error.message });
    throw error;
  }
}

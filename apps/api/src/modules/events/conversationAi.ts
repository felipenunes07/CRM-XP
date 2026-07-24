/**
 * Inteligencia de Mensagens v2: analise de CONVERSAS inteiras por IA.
 *
 * Em vez de classificar mensagem por mensagem com palavra-chave, o motor:
 *  1. Seleciona as conversas do dia com mensagens novas de CLIENTE
 *     (grupos deduplicados por remote_jid — a mesma conversa chega por
 *     2-3 instancias das vendedoras).
 *  2. Monta o transcript do dia (equipe + cliente, com horario) e manda
 *     lotes de conversas para a IA (Gemini/Cerebras) com resposta JSON.
 *  3. Grava uma leitura estruturada por conversa em conversation_insights:
 *     resumo, sentimento do cliente, nivel de atencao, flags, topicos,
 *     citacoes e acoes sugeridas.
 *  4. Regenera o briefing gerencial do dia (daily_briefings) — a narrativa
 *     que o gestor le sem precisar acompanhar o WhatsApp.
 *
 * Orcamento diario (requests/tokens), horario comercial e retencao sao
 * controlados por env e compartilhados com o event_ai_batches existente.
 */
import { randomUUID } from "node:crypto";
import { pool } from "../../db/client.js";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";
import { HttpError } from "../../lib/httpError.js";
import type { JwtUser } from "../platform/authService.js";
import type {
  ConversationAgentStat,
  ConversationAttentionLevel,
  ConversationInsight,
  ConversationInsightHighlight,
  ConversationInsightsListResponse,
  ConversationIntelligenceRunResult,
  ConversationTopicStat,
  DailyBriefing,
  EventsAiRunSummary,
  EventsCaptureStats,
  EventsIntelligenceProgress,
  EventsIntelligenceStatus,
  EventsOverviewResponse,
} from "@olist-crm/shared";
import {
  type EventsAiBatchConfig,
  type EventsAiProviderRuntime,
  estimatePromptTokens,
  fetchAiJson,
  fetchAiJsonWithProvider,
  getBatchUsage,
  getEventsAiBatchConfig,
  getLocalParts,
  selectEventsAiProviders,
  shouldRunEventsAiBatch,
  zonedDateToUtc,
} from "./eventsBatchAi.js";
import {
  INTERNAL_GROUP_JID_LIST,
  INTERNAL_SENDER_JID_LIST,
  INTERNAL_SENDER_NAME_LIST,
  isInternalSender,
} from "./eventsService.js";

const ATTENTION_LEVELS: ConversationAttentionLevel[] = ["none", "low", "medium", "high", "critical"];

// ── Progresso ao vivo do run manual ─────────────────────────
// O usuario clica em "Analisar agora" e o front mostra a esteira: coletando →
// IA lendo lote i/n → briefing → pronto. Estado em memoria: o run manual
// executa no mesmo processo da API que responde o poll.

let currentProgress: EventsIntelligenceProgress | null = null;

function updateProgress(patch: Partial<EventsIntelligenceProgress>) {
  if (!currentProgress) return;
  currentProgress = { ...currentProgress, ...patch };
}

export function getIntelligenceProgress(): EventsIntelligenceProgress | null {
  return currentProgress;
}

/**
 * Dispara o run manual em background (com reanalise do dia) e devolve o
 * snapshot inicial do progresso para o front comecar o poll.
 */
export function startManualIntelligenceRun(targetDate?: string): EventsIntelligenceProgress {
  if (currentProgress?.active) {
    return currentProgress;
  }

  const dayLabel = targetDate
    ? ` do dia ${targetDate.split("-").reverse().join("/")}`
    : "";

  currentProgress = {
    runId: randomUUID(),
    active: true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    phase: "queued",
    message: `Preparando a análise${dayLabel}...`,
    totalConversations: 0,
    analyzedConversations: 0,
    chunkIndex: 0,
    chunkCount: 0,
    result: null,
  };

  runConversationIntelligence(new Date(), { manual: true, force: true, targetDate, onProgress: updateProgress })
    .then((result) => {
      updateProgress({
        active: false,
        finishedAt: new Date().toISOString(),
        phase: result.status === "FAILED" ? "error" : "done",
        message: result.status === "SUCCEEDED"
          ? `Pronto: ${result.analyzedConversations ?? 0} conversas lidas.`
          : result.status === "SKIPPED"
            ? `Nada para analisar (${result.reason ?? "sem conversas"}).`
            : `Falhou: ${result.error ?? "erro no provedor de IA"}`,
        result,
      });
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("manual intelligence run crashed", { error: message });
      updateProgress({
        active: false,
        finishedAt: new Date().toISOString(),
        phase: "error",
        message: `Falhou: ${message.slice(0, 200)}`,
        result: { status: "FAILED", error: message.slice(0, 300) },
      });
    });

  return currentProgress;
}

const ATTENTION_FROM_AI: Record<string, ConversationAttentionLevel> = {
  nenhum: "none",
  nenhuma: "none",
  none: "none",
  baixo: "low",
  baixa: "low",
  low: "low",
  medio: "medium",
  media: "medium",
  medium: "medium",
  alto: "high",
  alta: "high",
  high: "high",
  critico: "critical",
  critica: "critical",
  critical: "critical",
};

const KNOWN_FLAGS = [
  "reclamacao",
  "risco_perda",
  "urgente",
  "sem_resposta",
  "oportunidade",
  "elogio",
  "problema_entrega",
  "problema_produto",
  "problema_pagamento",
] as const;

// ── Day window helpers (America/Sao_Paulo) ──────────────────

export function getDayWindow(now: Date, timezone: string) {
  const local = getLocalParts(now, timezone);
  const windowStart = zonedDateToUtc(timezone, { year: local.year, month: local.month, day: local.day, hour: 0 });
  const windowEnd = new Date(windowStart.getTime() + 24 * 60 * 60 * 1000);
  const windowDate = `${local.year}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}`;
  return { windowStart, windowEnd, windowDate };
}

/** Janela de um dia especifico (YYYY-MM-DD) no fuso local — analise retroativa. */
export function getWindowForDate(dateStr: string, timezone: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const windowStart = zonedDateToUtc(timezone, { year: year!, month: month!, day: day!, hour: 0 });
  const windowEnd = new Date(windowStart.getTime() + 24 * 60 * 60 * 1000);
  return { windowStart, windowEnd, windowDate: dateStr };
}

// ── Pure helpers (unit-tested) ──────────────────────────────

/**
 * Mascara leve para dados sensiveis antes de enviar ao provedor de IA.
 * Diferente da versao antiga, NAO destroi nomes/produtos (que sao o
 * proprio sinal da analise) — so documentos e e-mails.
 */
export function maskSensitiveText(value: string) {
  return value
    .replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/giu, "[email]")
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/gu, "[cpf]")
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2}\b/gu, "[cnpj]");
}

export interface TranscriptMessage {
  messageId: string;
  fromMe: boolean;
  senderName: string | null;
  senderJid: string | null;
  content: string;
  createdAt: string | Date;
}

/**
 * Monta o texto do transcript priorizando o FIM da conversa (o desfecho e o
 * que mais importa para o gestor): caminha de tras pra frente ate estourar o
 * orcamento de mensagens/caracteres.
 */
export function buildTranscriptText(
  messages: TranscriptMessage[],
  options: { timezone: string; maxMessages: number; maxCharsPerMessage?: number; maxTotalChars?: number },
) {
  const maxPerMessage = options.maxCharsPerMessage ?? 300;
  const maxTotal = options.maxTotalChars ?? 4500;
  const lines: string[] = [];
  let total = 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (lines.length >= options.maxMessages) break;
    const message = messages[index]!;
    const content = message.content.replace(/\s+/g, " ").trim();
    if (!content) continue;

    const local = getLocalParts(new Date(message.createdAt), options.timezone);
    const time = `${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}`;
    const companySide = message.fromMe || isInternalSender(message.senderJid, message.senderName);
    const name = (message.senderName ?? "").trim();
    const speaker = companySide
      ? (name ? `EQUIPE ${name}` : "EQUIPE")
      : (name ? `CLIENTE ${name}` : "CLIENTE");

    let text = maskSensitiveText(content);
    if (text.length > maxPerMessage) {
      text = `${text.slice(0, maxPerMessage)}...`;
    }

    const line = `[${time}] ${speaker}: ${text}`;
    if (total + line.length + 1 > maxTotal && lines.length > 0) break;
    total += line.length + 1;
    lines.push(line);
  }

  return lines.reverse().join("\n");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 429: estouro de cota por minuto do provedor — esperar resolve, dividir piora. */
export function isRateLimitError(message: string) {
  return /with 429|per minute limit|quota_exceeded|too_many/i.test(message);
}

/** 503/UNAVAILABLE: provedor sobrecarregado — transitório, esperar e re-tentar. */
export function isOverloadedError(message: string) {
  return /with 503|UNAVAILABLE|overloaded|high demand/i.test(message);
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += Math.max(1, size)) {
    chunks.push(items.slice(index, index + Math.max(1, size)));
  }
  return chunks;
}

export interface ConversationForAi {
  chave: string;
  tipo: "grupo" | "privado";
  nome: string;
  vendedora: string;
  vip: boolean;
  mensagens: string;
}

export function buildConversationsPrompt(conversations: ConversationForAi[]) {
  return [
    "Voce e o analista de qualidade de atendimento da XP Factory, distribuidora de pecas e telas de celular.",
    "Os clientes sao lojistas e assistencias tecnicas que compram no atacado pelo WhatsApp, atendidos pelas vendedoras da equipe.",
    "Analise as conversas do dia abaixo (transcritos reais). Para CADA conversa devolva um objeto no array \"conversas\".",
    "",
    "Regras:",
    "- Seja concreto: baseie tudo no transcript, nunca invente. Cite quem falou o que.",
    "- \"atencao\" e o que um gestor precisa ver HOJE:",
    "  critico = cliente muito irritado, ameaca de perda/processo, problema grave sem solucao ate o fim da conversa;",
    "  alto = reclamacao clara, cliente sem resposta da equipe, risco real de perder o cliente, defeito/troca mal resolvidos;",
    "  medio = insatisfacao leve, oportunidade de venda parada, pedido pendente;",
    "  baixo = pontos menores que valem registro;",
    "  nenhum = conversa comercial normal (orcamento, lista de precos, pedido fluindo, conversa social).",
    "- Lista de precos enviada pela equipe, cotacao e negociacao normal NAO sao motivo de atencao.",
    "- \"sentimento\" e o humor do CLIENTE na conversa, de -1 (pessimo) a 1 (otimo).",
    "- \"sem_resposta\" = a ultima coisa relevante foi o cliente pedindo algo e ninguem da equipe respondeu.",
    "- \"tema\": UM UNICO tema principal que resume a conversa, em 1 a 3 palavras minusculas (ex: \"tela quebrada\", \"atraso entrega\", \"orcamento\", \"troca\"). NUNCA mais de um tema por conversa; escolha o assunto dominante. Use sempre o mesmo termo para o mesmo assunto (nao invente sinonimos).",
    "- \"citacoes\": ate 2 falas curtas e marcantes do transcript (copiadas literalmente), com autor.",
    "- \"acoes\": o que a equipe deveria fazer em seguida (ate 3 itens curtos); vazio se nada pendente.",
    "- \"produtos\": modelos de produto citados APENAS quando ha PROBLEMA REAL de qualidade ligado ao produto: reclamacao ou defeito.",
    "  Use o nome CURTO do modelo em maiusculas, como o cliente fala (ex: \"A15\", \"IPHONE 11\", \"MOTO G54\", \"REDMI NOTE 12\").",
    "  tipo: reclamacao = cliente insatisfeito com a qualidade do produto; defeito = produto com falha/nao funciona/tela ruim.",
    "  NUNCA liste: cotacao, orcamento, lista de preco, pedido normal, pergunta de disponibilidade, duvida simples, troca/devolucao sem reclamar de qualidade, envio errado/logistica, ou dano fisico causado pelo cliente (queda). Vazio se nenhum produto teve problema real.",
    "  Exemplos que DEVEM deixar produtos vazio: \"colocar preco do A15\"; \"adicionar 10 baterias de iPhone XR ao pedido\". Modelo citado em compra/cotacao nao e reclamacao do modelo.",
    "- \"reclamacoes_gerais\": reclamacoes do cliente que NAO sao sobre o produto em si: atendimento lento/ruim, vendedora rude ou mal educada, cobranca/preco errado, prazo de entrega, promessa nao cumprida, falta de resposta, comportamento inadequado de algum lado.",
    "  categoria: atendimento | vendedora | entrega | cobranca | outro.",
    "  vendedora: nome de quem atendeu do lado da equipe, se identificavel no transcript (campo EQUIPE); vazio se nao der para saber.",
    "  NUNCA liste reclamacao de produto aqui (essa vai em \"produtos\"). Vazio se nao houve reclamacao geral.",
    "",
    "Responda APENAS JSON valido neste formato:",
    "{\"conversas\":[{\"chave\":\"...\",\"resumo\":\"2 a 3 frases: o que aconteceu e como terminou\",\"sentimento\":0.0,\"atencao\":\"nenhum|baixo|medio|alto|critico\",\"motivo_atencao\":\"por que o gestor deve olhar (ou vazio)\",\"flags\":{\"reclamacao\":false,\"risco_perda\":false,\"urgente\":false,\"sem_resposta\":false,\"oportunidade\":false,\"elogio\":false,\"problema_entrega\":false,\"problema_produto\":false,\"problema_pagamento\":false},\"tema\":\"...\",\"citacoes\":[{\"autor\":\"...\",\"texto\":\"...\",\"tipo\":\"reclamacao|elogio|oportunidade|risco|outro\"}],\"acoes\":[\"...\"],\"produtos\":[{\"modelo\":\"A15\",\"tipo\":\"reclamacao|defeito\",\"detalhe\":\"1 frase: qual foi o problema e de quem\"}],\"reclamacoes_gerais\":[{\"categoria\":\"atendimento|vendedora|entrega|cobranca|outro\",\"vendedora\":\"...\",\"detalhe\":\"1 frase: o que o cliente reclamou\"}]}]}",
    "",
    "CONVERSAS:",
    JSON.stringify(conversations),
  ].join("\n");
}

export interface ParsedProductMention {
  modelo: string;
  modeloNormalizado: string;
  tipo: "reclamacao" | "defeito" | "troca" | "duvida" | "outro";
  detalhe: string;
}

export interface ParsedGeneralComplaint {
  categoria: "atendimento" | "vendedora" | "entrega" | "cobranca" | "outro";
  vendedora: string | null;
  detalhe: string;
}

export interface ParsedConversationAnalysis {
  resumo: string;
  sentimento: number;
  atencao: ConversationAttentionLevel;
  motivoAtencao: string | null;
  flags: Record<string, boolean>;
  topicos: string[];
  citacoes: ConversationInsightHighlight[];
  acoes: string[];
  produtos: ParsedProductMention[];
  reclamacoesGerais: ParsedGeneralComplaint[];
}

// A pedido do gestor, o backfill/analise so registra problema REAL de produto —
// "duvida" e "troca" nao entram (nao sao reclamacao/defeito). Se a IA devolver
// esses tipos, sao descartados.
const PRODUCT_MENTION_TYPES = new Set(["reclamacao", "defeito"]);

const GENERAL_COMPLAINT_CATEGORIES = new Set(["atendimento", "vendedora", "entrega", "cobranca", "outro"]);

/**
 * Chave de busca do modelo: maiusculas, sem acento, espacos colapsados.
 * "sm-a15 4g" e "A15" viram tokens comparaveis; a pagina busca por ILIKE
 * sobre esta coluna, entao a normalizacao so precisa ser estavel.
 */
export function normalizeProductModel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9+/ .-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeComplaintEvidence(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const PRODUCT_QUALITY_EVIDENCE_PATTERN =
  /\b(defeit\w*|problema\w*|falha\w*|nao (?:liga|funciona|acende|da imagem)|touch|trava\w*|mancha\w*|qualidade|ruim|quebra\w*|trinca\w*|devolu\w*|garantia|voltando|retorno\w*)\b/i;

const NORMAL_COMMERCIAL_INTENT_PATTERNS = [
  /\b(cotacao|orcamento|lista de precos?|colocar preco|preco por favor)\b/i,
  /\b(solicitou|solicita|pediu|pede)\b.{0,120}\b(adicao|adicionar|inclu(?:ir|sao)|colocar|acrescentar)\b/i,
];

/**
 * A IA ainda pode rotular uma simples citacao comercial como problema do
 * produto. Exige que pedidos/cotacoes tragam tambem evidencia explicita de
 * qualidade antes de deixa-los entrar no historico permanente.
 */
export function isProductComplaintEvidence(detail: string, quote = "") {
  const evidence = normalizeComplaintEvidence(`${detail} ${quote}`);
  const isNormalCommercialIntent = NORMAL_COMMERCIAL_INTENT_PATTERNS.some((pattern) => pattern.test(evidence));
  return !isNormalCommercialIntent || PRODUCT_QUALITY_EVIDENCE_PATTERN.test(evidence);
}

export function parseProductMentions(value: unknown): ParsedProductMention[] {
  return (Array.isArray(value) ? value : [])
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const record = entry as Record<string, unknown>;
      const modelo = readString(record.modelo, 80);
      if (!modelo) return null;
      const modeloNormalizado = normalizeProductModel(modelo);
      if (!modeloNormalizado || modeloNormalizado.length < 2) return null;
      const rawTipo = readString(record.tipo, 20)
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase();
      // Fora reclamacao/defeito/troca (ex.: duvida) nao vira reclamacao de produto.
      if (!PRODUCT_MENTION_TYPES.has(rawTipo)) return null;
      const detalhe = readString(record.detalhe, 300);
      if (!isProductComplaintEvidence(detalhe)) return null;
      return {
        modelo,
        modeloNormalizado,
        tipo: rawTipo as ParsedProductMention["tipo"],
        detalhe,
      };
    })
    .filter((mention): mention is ParsedProductMention => mention !== null)
    .slice(0, 8);
}

export function parseGeneralComplaints(value: unknown): ParsedGeneralComplaint[] {
  return (Array.isArray(value) ? value : [])
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const record = entry as Record<string, unknown>;
      const detalhe = readString(record.detalhe, 300);
      if (!detalhe) return null;
      const rawCategoria = readString(record.categoria, 20)
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase();
      const categoria = (GENERAL_COMPLAINT_CATEGORIES.has(rawCategoria) ? rawCategoria : "outro") as ParsedGeneralComplaint["categoria"];
      const vendedora = readString(record.vendedora, 80) || null;
      return { categoria, vendedora, detalhe };
    })
    .filter((complaint): complaint is ParsedGeneralComplaint => complaint !== null)
    .slice(0, 6);
}

function readString(value: unknown, maxLength = 800): string {
  if (typeof value !== "string") return "";
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}...` : trimmed;
}

function clampSentiment(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(-1, Math.min(1, numeric));
}

export function sentimentLabelFromScore(score: number) {
  if (score <= -0.6) return "muito negativo";
  if (score <= -0.2) return "negativo";
  if (score < 0.2) return "neutro";
  if (score < 0.6) return "positivo";
  return "muito positivo";
}

function normalizeAttention(value: unknown): ConversationAttentionLevel {
  const normalized = readString(value, 40)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return ATTENTION_FROM_AI[normalized] ?? "none";
}

export function parseConversationAnalyses(summary: Record<string, unknown>): Map<string, ParsedConversationAnalysis> {
  const parsed = new Map<string, ParsedConversationAnalysis>();
  const list = Array.isArray(summary.conversas) ? summary.conversas : [];

  for (const entry of list) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const key = readString(record.chave, 250);
    if (!key) continue;

    const flags: Record<string, boolean> = {};
    const rawFlags = record.flags && typeof record.flags === "object" && !Array.isArray(record.flags)
      ? record.flags as Record<string, unknown>
      : {};
    for (const flag of KNOWN_FLAGS) {
      flags[flag] = rawFlags[flag] === true;
    }

    // Um unico tema por conversa (pedido do gestor: o mesmo caso nao pode
    // virar 3 categorias). Aceita "topicos" antigo como fallback, mas so o 1o.
    const temaPrincipal = readString(record.tema, 40).toLowerCase();
    const topicos = (temaPrincipal
      ? [temaPrincipal]
      : (Array.isArray(record.topicos) ? record.topicos : [])
          .map((topic) => readString(topic, 40).toLowerCase())
          .slice(0, 1)
    ).filter(Boolean);

    const citacoes = (Array.isArray(record.citacoes) ? record.citacoes : [])
      .map((quote) => {
        if (!quote || typeof quote !== "object" || Array.isArray(quote)) return null;
        const quoteRecord = quote as Record<string, unknown>;
        const texto = readString(quoteRecord.texto, 220);
        if (!texto) return null;
        return {
          autor: readString(quoteRecord.autor, 80) || "Cliente",
          texto,
          tipo: readString(quoteRecord.tipo, 30) || "outro",
        };
      })
      .filter((quote): quote is ConversationInsightHighlight => quote !== null)
      .slice(0, 4);

    const acoes = (Array.isArray(record.acoes) ? record.acoes : [])
      .map((action) => readString(action, 180))
      .filter(Boolean)
      .slice(0, 4);

    parsed.set(key, {
      resumo: readString(record.resumo, 700),
      sentimento: clampSentiment(record.sentimento),
      atencao: normalizeAttention(record.atencao),
      motivoAtencao: readString(record.motivo_atencao, 300) || null,
      flags,
      topicos,
      citacoes,
      acoes,
      produtos: parseProductMentions(record.produtos),
      reclamacoesGerais: parseGeneralComplaints(record.reclamacoes_gerais),
    });
  }

  return parsed;
}

// ── Candidate selection & transcripts ───────────────────────

export interface ConversationCandidate {
  conversationKey: string;
  dealId: string;
  remoteJid: string | null;
  isGroup: boolean;
  chatName: string | null;
  agentName: string | null;
  firstMessageAt: Date;
  lastMessageAt: Date;
  messageCount: number;
  customerMessageCount: number;
  isVip: boolean;
}

async function selectConversationCandidates(
  windowStart: Date,
  windowEnd: Date,
  windowDate: string,
  limit: number,
  options: { includeAnalyzed?: boolean } = {},
): Promise<ConversationCandidate[]> {
  const result = await pool.query(`
    WITH convs AS (
      SELECT
        COALESCE(NULLIF(wmm.remote_jid, ''), wmm.deal_id::text) AS conversation_key,
        BOOL_OR(COALESCE(wmm.remote_jid, '') LIKE '%@g.us') AS is_group,
        MIN(wmm.created_at) AS first_message_at,
        MAX(wmm.created_at) AS last_message_at,
        MAX(wmm.remote_jid) AS remote_jid,
        COUNT(DISTINCT wmm.message_id)::int AS message_count,
        COUNT(DISTINCT wmm.message_id) FILTER (
          WHERE wmm.from_me = false
            AND COALESCE(wmm.sender_jid, '') <> ALL($3::text[])
            AND COALESCE(wmm.sender_name, '') <> ALL($4::text[])
        )::int AS customer_message_count,
        (ARRAY_AGG(wmm.deal_id ORDER BY wmm.created_at DESC))[1] AS deal_id
      FROM whatsapp_monitor_messages wmm
      WHERE wmm.created_at >= $1
        AND wmm.created_at < $2
        AND COALESCE(wmm.content, '') <> ''
        AND COALESCE(wmm.remote_jid, '') <> ALL($5::text[])
      GROUP BY 1
    )
    SELECT
      convs.*,
      COALESCE(c.display_name, d.title) AS chat_name,
      d.assigned_to_name AS agent_name,
      COALESCE(cs.total_spent > 5000 OR cs.total_orders > 10 OR cs.value_score > 80, false) AS is_vip,
      signals.signal_count
    FROM convs
    JOIN deals d ON d.id = convs.deal_id
    LEFT JOIN customers c ON c.id = d.customer_id
    LEFT JOIN customer_snapshot cs ON cs.customer_id = d.customer_id
    LEFT JOIN conversation_insights ci
      ON ci.conversation_key = convs.conversation_key
     AND ci.window_date = $6::date
    -- Orcamento de IA e curto: conversas onde o classificador por regra ja viu
    -- reclamacao/risco hoje furam a fila e sao analisadas primeiro.
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS signal_count
      FROM message_events me
      WHERE me.deal_id = convs.deal_id
        AND me.detected_at >= $1
        AND me.detected_at < $2
        AND (
          me.severity IN ('HIGH', 'CRITICAL')
          OR me.event_type IN ('COMPLAINT', 'CHURN_RISK', 'ESCALATION', 'RISK', 'NEGATIVE_FEEDBACK')
        )
    ) signals ON true
    WHERE convs.customer_message_count > 0
      -- includeAnalyzed=true (run manual): reanalisa o dia inteiro mesmo sem
      -- mensagem nova — o botao sempre produz uma leitura fresca.
      AND (ci.id IS NULL OR convs.last_message_at > ci.last_message_at OR $8::boolean)
    ORDER BY
      -- Fila justa: primeiro quem NUNCA foi lida, depois quem tem mensagem
      -- nova desde a ultima leitura; so entao releituras. Sem isso, o run
      -- forcado gastava o orcamento relendo sempre as mesmas conversas
      -- movimentadas e as pendentes nunca chegavam na vez.
      (ci.id IS NULL) DESC,
      (ci.id IS NOT NULL AND convs.last_message_at > ci.last_message_at) DESC,
      signals.signal_count DESC,
      convs.customer_message_count DESC,
      convs.last_message_at DESC
    LIMIT $7
  `, [
    windowStart,
    windowEnd,
    INTERNAL_SENDER_JID_LIST,
    INTERNAL_SENDER_NAME_LIST,
    INTERNAL_GROUP_JID_LIST,
    windowDate,
    limit,
    options.includeAnalyzed === true,
  ]);

  return result.rows.map((row) => ({
    conversationKey: String(row.conversation_key),
    dealId: String(row.deal_id),
    remoteJid: row.remote_jid ? String(row.remote_jid) : null,
    isGroup: Boolean(row.is_group),
    chatName: row.chat_name ? String(row.chat_name) : null,
    agentName: row.agent_name ? String(row.agent_name) : null,
    firstMessageAt: new Date(row.first_message_at),
    lastMessageAt: new Date(row.last_message_at),
    messageCount: Number(row.message_count ?? 0),
    customerMessageCount: Number(row.customer_message_count ?? 0),
    isVip: Boolean(row.is_vip),
  }));
}

async function fetchConversationMessages(
  candidate: ConversationCandidate,
  windowStart: Date,
  windowEnd: Date,
): Promise<TranscriptMessage[]> {
  // remote_jid = key usa indice; fallback por deal cobre privados sem remote_jid.
  const result = await pool.query(`
    SELECT DISTINCT ON (wmm.message_id)
      wmm.message_id,
      wmm.from_me,
      wmm.sender_name,
      wmm.sender_jid,
      wmm.content,
      wmm.created_at
    FROM whatsapp_monitor_messages wmm
    WHERE (wmm.remote_jid = $1 OR wmm.deal_id = $2)
      AND wmm.created_at >= $3
      AND wmm.created_at < $4
      AND COALESCE(wmm.content, '') <> ''
    ORDER BY wmm.message_id, wmm.created_at ASC
  `, [candidate.conversationKey, candidate.dealId, windowStart, windowEnd]);

  const messages = result.rows
    .map((row) => ({
      messageId: String(row.message_id),
      fromMe: Boolean(row.from_me),
      senderName: row.sender_name ? String(row.sender_name) : null,
      senderJid: row.sender_jid ? String(row.sender_jid) : null,
      content: String(row.content ?? ""),
      createdAt: new Date(row.created_at),
    }))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return dedupeDuplicateInstanceMessages(messages);
}

/**
 * Grupos de cliente costumam ter 3-5 instancias (vendedoras) da equipe como
 * membros; cada instancia recebe o webhook do MESMO texto do cliente e grava
 * com um message_id diferente — DISTINCT ON message_id acima nao pega isso.
 * Sem este passo a mesma fala aparece repetida 3-5x no transcript, inflando
 * o contexto e confundindo a analise (visto em transcritos reais 17/07/2026).
 * Colapsa mensagens com mesmo lado (from_me) + mesmo texto dentro de uma
 * janela curta, mantendo so a primeira.
 */
export function dedupeDuplicateInstanceMessages(messages: TranscriptMessage[], windowMs = 2 * 60 * 1000): TranscriptMessage[] {
  const kept: TranscriptMessage[] = [];
  const lastSeenAt = new Map<string, number>();

  for (const message of messages) {
    const key = `${message.fromMe ? "E" : "C"}::${message.content.trim()}`;
    const now = new Date(message.createdAt).getTime();
    const previous = lastSeenAt.get(key);
    if (previous !== undefined && now - previous <= windowMs) {
      lastSeenAt.set(key, now);
      continue;
    }
    lastSeenAt.set(key, now);
    kept.push(message);
  }

  return kept;
}

// ── Persistence ─────────────────────────────────────────────

async function upsertConversationInsight(
  candidate: ConversationCandidate,
  analysis: ParsedConversationAnalysis,
  context: { windowDate: string; provider: string; model: string },
) {
  const flags = { ...analysis.flags, vip: candidate.isVip };
  const sentimentLabel = sentimentLabelFromScore(analysis.sentimento);

  await pool.query(`
    INSERT INTO conversation_insights (
      conversation_key, deal_id, remote_jid, is_group, chat_name, agent_name, window_date,
      first_message_at, last_message_at, message_count, customer_message_count,
      analyzed_at, provider, model, summary, sentiment_score, sentiment_label,
      attention_level, attention_reason, flags, topics, highlights, action_items, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7::date,
      $8, $9, $10, $11,
      NOW(), $12, $13, $14, $15, $16,
      $17, $18, $19::jsonb, $20::text[], $21::jsonb, $22::jsonb, NOW()
    )
    ON CONFLICT (conversation_key, window_date) DO UPDATE SET
      deal_id = EXCLUDED.deal_id,
      remote_jid = EXCLUDED.remote_jid,
      is_group = EXCLUDED.is_group,
      chat_name = EXCLUDED.chat_name,
      agent_name = EXCLUDED.agent_name,
      first_message_at = EXCLUDED.first_message_at,
      last_message_at = EXCLUDED.last_message_at,
      message_count = EXCLUDED.message_count,
      customer_message_count = EXCLUDED.customer_message_count,
      analyzed_at = NOW(),
      provider = EXCLUDED.provider,
      model = EXCLUDED.model,
      summary = EXCLUDED.summary,
      sentiment_score = EXCLUDED.sentiment_score,
      sentiment_label = EXCLUDED.sentiment_label,
      attention_level = EXCLUDED.attention_level,
      attention_reason = EXCLUDED.attention_reason,
      flags = EXCLUDED.flags,
      topics = EXCLUDED.topics,
      highlights = EXCLUDED.highlights,
      action_items = EXCLUDED.action_items,
      -- Se a leitura PIOROU (ex.: de medio para critico), reabre o alerta
      -- mesmo que alguem ja tivesse marcado como visto.
      acknowledged_at = CASE
        WHEN ARRAY_POSITION(ARRAY['none','low','medium','high','critical'], EXCLUDED.attention_level)
           > ARRAY_POSITION(ARRAY['none','low','medium','high','critical'], conversation_insights.attention_level)
        THEN NULL
        ELSE conversation_insights.acknowledged_at
      END,
      updated_at = NOW()
  `, [
    candidate.conversationKey,
    candidate.dealId,
    candidate.remoteJid,
    candidate.isGroup,
    candidate.chatName,
    candidate.agentName,
    context.windowDate,
    candidate.firstMessageAt,
    candidate.lastMessageAt,
    candidate.messageCount,
    candidate.customerMessageCount,
    context.provider,
    context.model,
    analysis.resumo,
    analysis.sentimento,
    sentimentLabel,
    analysis.atencao,
    analysis.motivoAtencao,
    JSON.stringify(flags),
    analysis.topicos,
    JSON.stringify(analysis.citacoes),
    JSON.stringify(analysis.acoes),
  ]);
}

/**
 * Historico permanente de reclamacoes por produto: cada produto citado com
 * problema vira 1 linha em product_complaints (tabela FORA da retencao de 30
 * dias). Nunca pode derrubar a analise — falha aqui so loga.
 */
async function persistProductComplaints(
  candidate: ConversationCandidate,
  analysis: ParsedConversationAnalysis,
  windowDate: string,
) {
  if (analysis.produtos.length === 0) return;
  try {
    for (const mention of analysis.produtos) {
      await pool.query(`
        INSERT INTO product_complaints (
          conversation_key, window_date, deal_id, remote_jid, is_group, chat_name,
          agent_name, customer_name, model_raw, model_normalized, category, severity,
          detail, quote, source, occurred_at, updated_at
        ) VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'ai', $15, NOW())
        ON CONFLICT (conversation_key, window_date, model_normalized, category) DO UPDATE SET
          deal_id = EXCLUDED.deal_id,
          chat_name = EXCLUDED.chat_name,
          agent_name = EXCLUDED.agent_name,
          customer_name = EXCLUDED.customer_name,
          model_raw = EXCLUDED.model_raw,
          severity = EXCLUDED.severity,
          detail = EXCLUDED.detail,
          quote = EXCLUDED.quote,
          source = EXCLUDED.source,
          occurred_at = EXCLUDED.occurred_at,
          updated_at = NOW()
      `, [
        candidate.conversationKey,
        windowDate,
        candidate.dealId,
        candidate.remoteJid,
        candidate.isGroup,
        candidate.chatName,
        candidate.agentName,
        candidate.isGroup ? null : candidate.chatName,
        mention.modelo,
        mention.modeloNormalizado,
        mention.tipo,
        analysis.atencao,
        mention.detalhe,
        analysis.citacoes[0]?.texto ?? null,
        candidate.lastMessageAt,
      ]);
    }
  } catch (error) {
    logger.warn("failed to persist product complaints", {
      conversationKey: candidate.conversationKey,
      error: error instanceof Error ? error.message.slice(0, 300) : String(error),
    });
  }
}

/**
 * Historico permanente de reclamacoes GERAIS (nao ligadas a produto): atendimento,
 * vendedora, prazo, cobranca. Fica fora da retencao de 30 dias, igual product_complaints.
 * Nunca pode derrubar a analise — falha aqui so loga.
 */
async function persistGeneralComplaints(
  candidate: ConversationCandidate,
  analysis: ParsedConversationAnalysis,
  windowDate: string,
) {
  if (analysis.reclamacoesGerais.length === 0) return;
  try {
    for (const complaint of analysis.reclamacoesGerais) {
      await pool.query(`
        INSERT INTO general_complaints (
          conversation_key, window_date, deal_id, remote_jid, is_group, chat_name,
          customer_name, agent_name, category, severity, detail, quote, source, occurred_at, updated_at
        ) VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'ai', $13, NOW())
        ON CONFLICT (conversation_key, window_date, category) DO UPDATE SET
          deal_id = EXCLUDED.deal_id,
          chat_name = EXCLUDED.chat_name,
          customer_name = EXCLUDED.customer_name,
          agent_name = EXCLUDED.agent_name,
          severity = EXCLUDED.severity,
          detail = EXCLUDED.detail,
          quote = EXCLUDED.quote,
          source = EXCLUDED.source,
          occurred_at = EXCLUDED.occurred_at,
          updated_at = NOW()
      `, [
        candidate.conversationKey,
        windowDate,
        candidate.dealId,
        candidate.remoteJid,
        candidate.isGroup,
        candidate.chatName,
        candidate.isGroup ? null : candidate.chatName,
        complaint.vendedora ?? candidate.agentName,
        complaint.categoria,
        analysis.atencao,
        complaint.detalhe,
        analysis.citacoes[0]?.texto ?? null,
        candidate.lastMessageAt,
      ]);
    }
  } catch (error) {
    logger.warn("failed to persist general complaints", {
      conversationKey: candidate.conversationKey,
      error: error instanceof Error ? error.message.slice(0, 300) : String(error),
    });
  }
}

async function recordIntelligenceRun(input: {
  now: Date;
  kind: "conversations" | "briefing";
  runSource: "manual" | "automatic";
  provider: string;
  model: string;
  status: "SKIPPED" | "SUCCEEDED" | "FAILED";
  reason: string;
  periodFrom: Date;
  periodTo: Date;
  eventCount: number;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  errorMessage?: string | null;
}) {
  // Telemetria/orcamento nunca pode derrubar uma analise que ja funcionou:
  // se este INSERT falhar, loga e segue (o usuario ja tem os insights).
  try {
    await pool.query(`
      INSERT INTO event_ai_batches (
        batch_date, provider, model, run_source, status, status_reason, period_from, period_to,
        event_count, request_count, input_tokens_estimated, output_tokens_estimated,
        summary_json, error_message, started_at, finished_at, kind
      ) VALUES ($1::date, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NULL, $13, $14, NOW(), $15)
    `, [
      input.now.toISOString().slice(0, 10),
      input.provider,
      input.model,
      input.runSource,
      input.status,
      input.reason,
      input.periodFrom,
      input.periodTo,
      input.eventCount,
      input.requestCount,
      input.inputTokens,
      input.outputTokens,
      input.errorMessage ?? null,
      input.now,
      input.kind,
    ]);
  } catch (error) {
    logger.error("failed to record intelligence run", {
      kind: input.kind,
      status: input.status,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ── Briefing ────────────────────────────────────────────────

export function buildBriefingPrompt(input: {
  windowDate: string;
  stats: Record<string, unknown>;
  insights: Array<Record<string, unknown>>;
}) {
  return [
    "Voce e o braco direito do gestor comercial da XP Factory (distribuidora de pecas e telas de celular).",
    "O gestor NAO acompanhou o WhatsApp hoje. Com base nas analises de conversas abaixo (feitas por IA a partir dos transcritos reais), escreva o briefing do dia.",
    "",
    "Regras:",
    "- Direto e concreto: nomes de clientes/grupos e vendedoras quando relevante, nada de generico.",
    "- Priorize o que exige acao: reclamacoes fortes, risco de perder cliente, cliente sem resposta, problemas repetidos.",
    "- Aponte tambem o que foi bem (elogios, vendas encaminhadas).",
    "- Se um mesmo problema aparece em varias conversas (ex.: atraso de entrega), destaque como padrao do dia.",
    "- Nao invente nada que nao esteja nos dados.",
    "",
    "Responda APENAS JSON valido:",
    "{\"narrativa\":\"2 a 3 paragrafos objetivos contando o dia\",\"alertas\":[{\"titulo\":\"...\",\"detalhe\":\"...\"}],\"reclamacoes\":[{\"titulo\":\"...\",\"detalhe\":\"...\"}],\"oportunidades\":[{\"titulo\":\"...\",\"detalhe\":\"...\"}],\"elogios\":[{\"titulo\":\"...\",\"detalhe\":\"...\"}],\"vendedoras\":[{\"nome\":\"...\",\"observacao\":\"...\"}],\"pendencias\":[{\"titulo\":\"...\",\"detalhe\":\"...\"}]}",
    "",
    `DATA: ${input.windowDate}`,
    `NUMEROS DO DIA: ${JSON.stringify(input.stats)}`,
    "ANALISES DE CONVERSAS:",
    JSON.stringify(input.insights),
  ].join("\n");
}

/**
 * O briefing so e regenerado quando o atual esta "velho" o suficiente
 * (EVENTS_AI_BRIEFING_MIN_INTERVAL_MINUTES) — cada regeneracao custa uma
 * chamada de IA e o orcamento diario e apertado. Rodada manual ignora.
 */
async function briefingIsFresh(windowDate: string, now: Date): Promise<boolean> {
  const minIntervalMs = env.EVENTS_AI_BRIEFING_MIN_INTERVAL_MINUTES * 60 * 1000;
  if (minIntervalMs <= 0) return false;

  const result = await pool.query(
    `SELECT generated_at FROM daily_briefings WHERE briefing_date = $1::date`,
    [windowDate],
  );
  const generatedAt = result.rows[0]?.generated_at ? new Date(result.rows[0].generated_at) : null;
  return Boolean(generatedAt && now.getTime() - generatedAt.getTime() < minIntervalMs);
}

async function generateDailyBriefing(
  now: Date,
  config: EventsAiBatchConfig,
  windowDate: string,
  runSource: "manual" | "automatic",
): Promise<boolean> {
  const insightsResult = await pool.query(`
    SELECT
      chat_name, agent_name, is_group, attention_level, attention_reason,
      sentiment_label, summary, topics, flags, customer_message_count
    FROM conversation_insights
    WHERE window_date = $1::date
    ORDER BY
      ARRAY_POSITION(ARRAY['none','low','medium','high','critical'], attention_level) DESC,
      customer_message_count DESC
    LIMIT 120
  `, [windowDate]);

  if (insightsResult.rows.length === 0) {
    return false;
  }

  const statsResult = await pool.query(`
    SELECT
      COUNT(*)::int AS conversations,
      COUNT(*) FILTER (WHERE attention_level IN ('high', 'critical'))::int AS attention_high,
      COUNT(*) FILTER (WHERE (flags->>'reclamacao')::boolean)::int AS complaints,
      COUNT(*) FILTER (WHERE (flags->>'risco_perda')::boolean)::int AS churn_risks,
      COUNT(*) FILTER (WHERE (flags->>'sem_resposta')::boolean)::int AS unanswered,
      COUNT(*) FILTER (WHERE (flags->>'oportunidade')::boolean)::int AS opportunities,
      COUNT(*) FILTER (WHERE (flags->>'elogio')::boolean)::int AS praises,
      ROUND(AVG(sentiment_score)::numeric, 2) AS average_sentiment
    FROM conversation_insights
    WHERE window_date = $1::date
  `, [windowDate]);

  const stats = statsResult.rows[0] ?? {};
  const compactInsights = insightsResult.rows.map((row) => ({
    conversa: row.chat_name ?? "(sem nome)",
    tipo: row.is_group ? "grupo" : "privado",
    vendedora: row.agent_name ?? "sem vendedora",
    atencao: row.attention_level,
    motivo: row.attention_reason ?? undefined,
    sentimento: row.sentiment_label ?? undefined,
    resumo: row.summary,
    topicos: row.topics ?? [],
    flags: Object.entries(row.flags ?? {})
      .filter(([, value]) => value === true)
      .map(([key]) => key),
    mensagens_cliente: Number(row.customer_message_count ?? 0),
  }));

  const prompt = buildBriefingPrompt({ windowDate, stats, insights: compactInsights });
  const inputTokens = estimatePromptTokens(prompt);
  // Janela do dia do briefing (pode ser retroativo), nao do relogio de agora.
  const { windowStart, windowEnd } = getWindowForDate(windowDate, config.timezone);

  try {
    const result = await fetchAiJson(prompt, config, 4000);
    const narrative = readString(result.summary.narrativa, 4000);
    const { narrativa: _ignored, ...payload } = result.summary;

    await pool.query(`
      INSERT INTO daily_briefings (briefing_date, generated_at, provider, model, narrative, payload, stats)
      VALUES ($1::date, NOW(), $2, $3, $4, $5::jsonb, $6::jsonb)
      ON CONFLICT (briefing_date) DO UPDATE SET
        generated_at = NOW(),
        provider = EXCLUDED.provider,
        model = EXCLUDED.model,
        narrative = EXCLUDED.narrative,
        payload = EXCLUDED.payload,
        stats = EXCLUDED.stats
    `, [
      windowDate,
      result.provider,
      result.model,
      narrative,
      JSON.stringify(payload),
      JSON.stringify(stats),
    ]);

    await recordIntelligenceRun({
      now,
      kind: "briefing",
      runSource,
      provider: result.provider,
      model: result.model,
      status: "SUCCEEDED",
      reason: "ok",
      periodFrom: windowStart,
      periodTo: windowEnd,
      eventCount: insightsResult.rows.length,
      requestCount: 1,
      inputTokens,
      outputTokens: result.outputTokens,
    });

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("daily briefing generation failed", { error: message });
    await recordIntelligenceRun({
      now,
      kind: "briefing",
      runSource,
      provider: config.provider,
      model: config.model,
      status: "FAILED",
      reason: "provider_error",
      periodFrom: windowStart,
      periodTo: windowEnd,
      eventCount: insightsResult.rows.length,
      requestCount: 1,
      inputTokens,
      outputTokens: 0,
      errorMessage: message,
    });
    return false;
  }
}

// ── Main runner ─────────────────────────────────────────────

export async function runConversationIntelligence(
  now = new Date(),
  options: {
    manual?: boolean;
    force?: boolean;
    /** Analise retroativa: dia especifico (YYYY-MM-DD) — so em run manual. */
    targetDate?: string;
    onProgress?: (patch: Partial<EventsIntelligenceProgress>) => void;
  } = {},
): Promise<ConversationIntelligenceRunResult> {
  const config = getEventsAiBatchConfig();
  const runSource = options.manual === true ? "manual" as const : "automatic" as const;
  const onProgress = options.onProgress ?? (() => {});
  const usage = await getBatchUsage(now);
  // Cadencia propria baseada em started_at: o finished_at do run anterior cai
  // depois do tick seguinte do setInterval e faria o job pular execucoes.
  const decision = shouldRunEventsAiBatch({
    now,
    config,
    usage,
    ignoreCadence: true,
    ignoreBusinessHours: options.manual === true,
  });

  if (!decision.allowed) {
    logger.info("conversation intelligence skipped", { reason: decision.reason });
    return { status: "SKIPPED", reason: decision.reason };
  }

  if (options.manual !== true) {
    if (env.EVENTS_AI_SCHEDULE_MODE === "daily") {
      // Modo diario: uma unica rodada automatica por dia, a partir da hora
      // configurada (16h). Se o worker estava fora do ar as 16h, roda no
      // primeiro tick seguinte. Durante o dia, o botao manual cobre.
      const local = getLocalParts(now, config.timezone);
      if (local.hour < env.EVENTS_AI_DAILY_RUN_HOUR) {
        return { status: "SKIPPED", reason: "cadence_wait" };
      }
      const ranTodayResult = await pool.query(`
        SELECT 1
        FROM event_ai_batches
        WHERE kind = 'conversations'
          AND run_source = 'automatic'
          AND status IN ('SUCCEEDED', 'FAILED')
          AND batch_date = $1::date
        LIMIT 1
      `, [now.toISOString().slice(0, 10)]);
      if (ranTodayResult.rows.length > 0) {
        return { status: "SKIPPED", reason: "cadence_wait" };
      }
    } else {
      // Cadencia por started_at (o finished_at do run anterior cai depois do
      // tick seguinte do setInterval e faria o job pular execucoes).
      const lastStartResult = await pool.query(`
        SELECT MAX(started_at) AS last_started_at
        FROM event_ai_batches
        WHERE kind = 'conversations' AND status IN ('SUCCEEDED', 'FAILED')
      `);
      const lastStartedAt = lastStartResult.rows[0]?.last_started_at
        ? new Date(lastStartResult.rows[0].last_started_at)
        : null;
      const cadenceMs = Math.max(1, config.intervalMinutes - 1) * 60 * 1000;
      if (lastStartedAt && now.getTime() - lastStartedAt.getTime() < cadenceMs) {
        return { status: "SKIPPED", reason: "cadence_wait" };
      }
    }
  }

  const { windowStart, windowEnd, windowDate } = options.manual === true && options.targetDate
    ? getWindowForDate(options.targetDate, config.timezone)
    : getDayWindow(now, config.timezone);
  onProgress({ phase: "selecting", message: "Coletando as conversas do dia no monitor..." });
  const candidates = await selectConversationCandidates(
    windowStart,
    windowEnd,
    windowDate,
    env.EVENTS_AI_MAX_CONVERSATIONS_PER_RUN,
    { includeAnalyzed: options.force === true },
  );

  if (candidates.length === 0) {
    // Nada novo para analisar; ainda assim garante o briefing quando ha
    // analises do dia sem briefing (ex.: apos restart).
    let briefingUpdated = false;
    if (options.manual) {
      briefingUpdated = await generateDailyBriefing(now, config, windowDate, runSource).catch((error) => {
        logger.error("daily briefing step failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        return false;
      });
    }
    return { status: "SKIPPED", reason: "no_conversations", briefingUpdated };
  }

  onProgress({
    phase: "reading",
    totalConversations: candidates.length,
    message: `Montando o transcript de ${candidates.length} conversas...`,
  });

  const prepared: Array<{ candidate: ConversationCandidate; payload: ConversationForAi }> = [];
  for (const candidate of candidates) {
    const messages = await fetchConversationMessages(candidate, windowStart, windowEnd);
    const transcript = buildTranscriptText(messages, {
      timezone: config.timezone,
      maxMessages: env.EVENTS_AI_MAX_MESSAGES_PER_CONVERSATION,
    });
    if (!transcript) continue;

    prepared.push({
      candidate,
      payload: {
        chave: candidate.conversationKey,
        tipo: candidate.isGroup ? "grupo" : "privado",
        nome: candidate.chatName ?? "(sem nome)",
        vendedora: candidate.agentName ?? "sem vendedora",
        vip: candidate.isVip,
        mensagens: transcript,
      },
    });
  }

  const chunks = chunkArray(prepared, env.EVENTS_AI_CONVERSATIONS_PER_REQUEST);
  let requestCount = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let tokensSoFar = usage.tokenCount;
  let analyzed = 0;
  let provider = config.provider;
  let model = config.model;
  let budgetExhausted = false;
  const errors: string[] = [];

  // Compasso por provedor: o free tier limita por MINUTO (Cerebras ~60k
  // tokens/min). Cerebras espera 12s entre chamadas (lote de ~10k tokens),
  // Gemini 5s. O "slot" e reservado antes da espera para as duas esteiras
  // paralelas nao dispararem juntas no mesmo provedor.
  const lastProviderCallAt: Record<string, number> = {};
  const paceProvider = async (name: string) => {
    const minGapMs = name === "cerebras" ? 12_000 : 5_000;
    const readyAt = (lastProviderCallAt[name] ?? 0) + minGapMs;
    const waitMs = readyAt - Date.now();
    lastProviderCallAt[name] = Math.max(Date.now(), readyAt);
    if (waitMs > 0) await sleep(waitMs);
  };

  /**
   * Processa um lote com um provedor preferido; em falha (JSON cortado,
   * 503 de sobrecarga etc.):
   *  - lote > 1 conversa → DIVIDE ao meio e tenta as metades (resposta menor
   *    quase sempre completa);
   *  - lote de 1 conversa → tenta o OUTRO provedor antes de desistir.
   * Antes, um lote falho perdia 8 conversas de uma vez.
   */
  const analyzeBatch = async (
    batch: typeof prepared,
    primary: EventsAiProviderRuntime | undefined,
    fallback: EventsAiProviderRuntime | undefined,
  ): Promise<void> => {
    if (batch.length === 0 || budgetExhausted) return;

    if (usage.requestCount + requestCount >= config.dailyRequestLimit) {
      budgetExhausted = true;
      errors.push("daily_request_cap");
      return;
    }

    const prompt = buildConversationsPrompt(batch.map((item) => item.payload));
    const promptTokens = estimatePromptTokens(prompt);
    if (tokensSoFar + promptTokens >= config.dailyTokenLimit) {
      budgetExhausted = true;
      errors.push("daily_token_cap");
      return;
    }

    // 8000 tokens de saida: com 4000, lotes de 8 conversas estouravam e o
    // JSON vinha cortado ("Unterminated string").
    const callProvider = async (runtime: EventsAiProviderRuntime | undefined) => {
      // Compasso por provedor: o free tier do Cerebras limita tokens/minuto,
      // entao as chamadas precisam ser espacadas. Sem isso, o paralelo virava
      // chuva de 429 e queimava o orcamento diario com falhas.
      await paceProvider(runtime?.provider ?? "auto");
      return runtime ? fetchAiJsonWithProvider(prompt, runtime, 8000) : fetchAiJson(prompt, config, 8000);
    };

    const persistResult = async (result: Awaited<ReturnType<typeof fetchAiJson>>) => {
      inputTokens += promptTokens;
      outputTokens += result.outputTokens;
      tokensSoFar += result.totalTokens;
      provider = result.provider;
      model = result.model;

      const parsed = parseConversationAnalyses(result.summary);
      for (const item of batch) {
        const analysis = parsed.get(item.payload.chave);
        if (!analysis || !analysis.resumo) continue;
        await upsertConversationInsight(item.candidate, analysis, {
          windowDate,
          provider: result.provider,
          model: result.model,
        });
        await persistGeneralComplaints(item.candidate, analysis, windowDate);
        await persistProductComplaints(item.candidate, analysis, windowDate);
        analyzed += 1;
      }
      onProgress({ analyzedConversations: analyzed });
    };

    // Ate 3 tentativas com o provedor principal: 429 (cota/minuto) espera
    // 25s, 503 (sobrecarga) espera 10s. Dividir lote em cima de 429 e o
    // remedio errado — multiplica chamadas contra um limite de chamadas.
    let lastMessage = "";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const result = await callProvider(primary);
        requestCount += 1;
        await persistResult(result);
        return;
      } catch (error) {
        requestCount += 1;
        lastMessage = error instanceof Error ? error.message : String(error);
        if (isRateLimitError(lastMessage) && attempt < 2) {
          logger.warn("conversation intelligence rate limited, waiting", {
            provider: primary?.provider ?? "auto",
            attempt,
          });
          await sleep(25_000);
          continue;
        }
        if (isOverloadedError(lastMessage) && attempt < 2) {
          await sleep(10_000);
          continue;
        }
        break;
      }
    }

    // Falha persistente: se for resposta cortada/JSON invalido, dividir o
    // lote ajuda; se for cota, tenta direto o OUTRO provedor (sem dividir).
    if (batch.length > 1 && !isRateLimitError(lastMessage)) {
      logger.warn("conversation intelligence batch failed, splitting in half", {
        size: batch.length,
        provider: primary?.provider ?? "auto",
        error: lastMessage.slice(0, 200),
      });
      const middle = Math.ceil(batch.length / 2);
      await analyzeBatch(batch.slice(0, middle), primary, fallback);
      await analyzeBatch(batch.slice(middle), primary, fallback);
      return;
    }

    if (fallback && fallback.provider !== primary?.provider) {
      try {
        const result = await callProvider(fallback);
        requestCount += 1;
        await persistResult(result);
        return;
      } catch (fallbackError) {
        requestCount += 1;
        errors.push(fallbackError instanceof Error ? fallbackError.message : String(fallbackError));
        return;
      }
    }

    errors.push(lastMessage);
    logger.warn("conversation intelligence batch exhausted retries", { error: lastMessage.slice(0, 300) });
  };

  // Balanceamento: com as duas chaves configuradas, os lotes sao alternados
  // entre Cerebras e Gemini e processados em DUAS esteiras paralelas — dobra
  // a vazao e espalha a carga (menos 503/limite por provedor). Cada esteira
  // usa o outro provedor como reserva.
  const providers = selectEventsAiProviders(config);
  const parallel = providers.length >= 2;
  let completedChunks = 0;

  onProgress({
    phase: "analyzing",
    chunkCount: chunks.length,
    message: parallel
      ? `IA lendo ${prepared.length} conversas em ${chunks.length} lotes (${providers[0]!.provider} + ${providers[1]!.provider} em paralelo)...`
      : `IA lendo ${prepared.length} conversas em ${chunks.length} lote${chunks.length === 1 ? "" : "s"}...`,
  });

  const runLane = async (
    laneChunks: typeof chunks,
    primary: EventsAiProviderRuntime | undefined,
    fallback: EventsAiProviderRuntime | undefined,
  ) => {
    for (const chunk of laneChunks) {
      if (budgetExhausted) return;
      completedChunks += 1;
      onProgress({
        chunkIndex: completedChunks,
        analyzedConversations: analyzed,
        message: parallel
          ? `IA lendo em paralelo: lote ${completedChunks} de ${chunks.length} (${analyzed} conversas prontas)...`
          : `IA lendo lote ${completedChunks} de ${chunks.length} (${analyzed} conversas prontas)...`,
      });
      await analyzeBatch(chunk, primary, fallback);
    }
  };

  if (parallel) {
    await Promise.all([
      runLane(chunks.filter((_, index) => index % 2 === 0), providers[0], providers[1]),
      runLane(chunks.filter((_, index) => index % 2 === 1), providers[1], providers[0]),
    ]);
  } else {
    await runLane(chunks, providers[0], undefined);
  }

  const status = analyzed > 0 ? "SUCCEEDED" as const : "FAILED" as const;
  await recordIntelligenceRun({
    now,
    kind: "conversations",
    runSource,
    provider,
    model,
    status,
    reason: analyzed > 0 ? "ok" : (errors[0]?.slice(0, 80) || "no_results"),
    periodFrom: windowStart,
    periodTo: windowEnd,
    eventCount: analyzed,
    requestCount,
    inputTokens,
    outputTokens,
    errorMessage: errors.length ? errors.join(" | ").slice(0, 1500) : null,
  });

  onProgress({
    phase: "briefing",
    analyzedConversations: analyzed,
    message: "Gerando o briefing do dia...",
  });

  let briefingUpdated = false;
  try {
    if (analyzed > 0 && (options.manual === true || !(await briefingIsFresh(windowDate, now)))) {
      briefingUpdated = await generateDailyBriefing(now, config, windowDate, runSource);
    }
  } catch (error) {
    // O briefing e um extra: nunca pode transformar uma analise bem-sucedida
    // em erro para o usuario.
    logger.error("daily briefing step failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  logger.info("conversation intelligence finished", {
    analyzed,
    requestCount,
    briefingUpdated,
    errors: errors.length,
  });

  return {
    status,
    analyzedConversations: analyzed,
    briefingUpdated,
    ...(errors.length ? { error: errors.join(" | ").slice(0, 500) } : {}),
  };
}

// ── Read APIs ───────────────────────────────────────────────

function mapInsightRow(row: any): ConversationInsight {
  return {
    id: String(row.id),
    conversationKey: String(row.conversation_key),
    dealId: row.deal_id ? String(row.deal_id) : null,
    remoteJid: row.remote_jid ? String(row.remote_jid) : null,
    isGroup: Boolean(row.is_group),
    chatName: row.chat_name ? String(row.chat_name) : null,
    agentName: row.agent_name ? String(row.agent_name) : null,
    windowDate: row.window_date instanceof Date
      ? row.window_date.toISOString().slice(0, 10)
      : String(row.window_date),
    firstMessageAt: row.first_message_at ? new Date(row.first_message_at).toISOString() : null,
    lastMessageAt: row.last_message_at ? new Date(row.last_message_at).toISOString() : null,
    messageCount: Number(row.message_count ?? 0),
    customerMessageCount: Number(row.customer_message_count ?? 0),
    analyzedAt: new Date(row.analyzed_at).toISOString(),
    provider: row.provider ? String(row.provider) : null,
    model: row.model ? String(row.model) : null,
    summary: String(row.summary ?? ""),
    sentimentScore: row.sentiment_score === null || row.sentiment_score === undefined
      ? null
      : Number(row.sentiment_score),
    sentimentLabel: row.sentiment_label ? String(row.sentiment_label) : null,
    attentionLevel: (ATTENTION_LEVELS.includes(row.attention_level) ? row.attention_level : "none") as ConversationAttentionLevel,
    attentionReason: row.attention_reason ? String(row.attention_reason) : null,
    flags: row.flags && typeof row.flags === "object" ? row.flags : {},
    // Tema unico por conversa; corta leituras antigas que gravaram varios.
    topics: Array.isArray(row.topics) ? row.topics.slice(0, 1).map(String) : [],
    highlights: Array.isArray(row.highlights) ? row.highlights : [],
    actionItems: Array.isArray(row.action_items) ? row.action_items.map(String) : [],
    acknowledgedAt: row.acknowledged_at ? new Date(row.acknowledged_at).toISOString() : null,
    acknowledgedBy: row.acknowledged_by ? String(row.acknowledged_by) : null,
    ackNote: row.ack_note ? String(row.ack_note) : null,
  };
}

function mapBriefingRow(row: any): DailyBriefing {
  return {
    id: String(row.id),
    briefingDate: row.briefing_date instanceof Date
      ? row.briefing_date.toISOString().slice(0, 10)
      : String(row.briefing_date),
    generatedAt: new Date(row.generated_at).toISOString(),
    provider: row.provider ? String(row.provider) : null,
    model: row.model ? String(row.model) : null,
    narrative: String(row.narrative ?? ""),
    payload: row.payload && typeof row.payload === "object" ? row.payload : {},
    stats: row.stats && typeof row.stats === "object" ? row.stats : {},
  };
}

function sellerScope(user: JwtUser, params: any[]) {
  if (user.role !== "SELLER") return "";
  params.push(user.name);
  return ` AND ci.agent_name = $${params.length}`;
}

export interface ConversationInsightsFilters {
  dateFrom?: string;
  dateTo?: string;
  attention?: ConversationAttentionLevel[];
  flag?: string;
  topic?: string;
  search?: string;
  isGroup?: boolean;
  agentName?: string;
  onlyOpen?: boolean;
}

export async function listConversationInsights(
  user: JwtUser,
  filters: ConversationInsightsFilters,
  pagination: { page: number; pageSize: number },
): Promise<ConversationInsightsListResponse> {
  const params: any[] = [];
  const conditions: string[] = [];

  const from = filters.dateFrom || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = filters.dateTo || new Date().toISOString().slice(0, 10);
  params.push(from);
  conditions.push(`ci.window_date >= $${params.length}::date`);
  params.push(to);
  conditions.push(`ci.window_date <= $${params.length}::date`);

  if (filters.attention && filters.attention.length > 0) {
    params.push(filters.attention);
    conditions.push(`ci.attention_level = ANY($${params.length}::text[])`);
  }

  if (filters.flag && /^[a-z_]+$/.test(filters.flag)) {
    conditions.push(`COALESCE((ci.flags->>'${filters.flag}')::boolean, false) = true`);
  }

  if (filters.topic) {
    // Filtro exato pelo tema principal (clique na barra do grafico).
    params.push(filters.topic);
    conditions.push(`ci.topics[1] = $${params.length}`);
  }

  if (filters.isGroup !== undefined) {
    params.push(filters.isGroup);
    conditions.push(`ci.is_group = $${params.length}`);
  }

  if (filters.agentName) {
    params.push(filters.agentName);
    conditions.push(`ci.agent_name = $${params.length}`);
  }

  if (filters.onlyOpen) {
    conditions.push(`ci.acknowledged_at IS NULL AND ci.attention_level IN ('medium', 'high', 'critical')`);
  }

  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(`(
      ci.chat_name ILIKE $${params.length}
      OR ci.summary ILIKE $${params.length}
      OR ARRAY_TO_STRING(ci.topics, ' ') ILIKE $${params.length}
    )`);
  }

  let whereClause = `WHERE ${conditions.join(" AND ")}`;
  whereClause += sellerScope(user, params);

  const totalResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM conversation_insights ci ${whereClause}`,
    params,
  );

  params.push(pagination.pageSize, (pagination.page - 1) * pagination.pageSize);
  const listResult = await pool.query(`
    SELECT ci.*
    FROM conversation_insights ci
    ${whereClause}
    ORDER BY
      ARRAY_POSITION(ARRAY['none','low','medium','high','critical'], ci.attention_level) DESC,
      ci.last_message_at DESC NULLS LAST
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `, params);

  return {
    insights: listResult.rows.map(mapInsightRow),
    total: Number(totalResult.rows[0]?.total ?? 0),
    page: pagination.page,
    pageSize: pagination.pageSize,
  };
}

export async function acknowledgeConversationInsight(
  insightId: string,
  user: JwtUser,
  note?: string,
): Promise<ConversationInsight> {
  const existing = await pool.query(
    `SELECT * FROM conversation_insights WHERE id = $1`,
    [insightId],
  );

  if (existing.rows.length === 0) {
    throw new HttpError(404, "Analise de conversa nao encontrada.");
  }

  if (user.role === "SELLER" && existing.rows[0].agent_name !== user.name) {
    throw new HttpError(403, "Sem permissao para marcar esta conversa.");
  }

  const result = await pool.query(`
    UPDATE conversation_insights
    SET acknowledged_at = NOW(), acknowledged_by = $1, ack_note = $2, updated_at = NOW()
    WHERE id = $3
    RETURNING *
  `, [user.id, note?.trim() || null, insightId]);

  return mapInsightRow(result.rows[0]);
}

export async function getIntelligenceStatus(now = new Date()): Promise<EventsIntelligenceStatus> {
  const config = getEventsAiBatchConfig();
  const usage = await getBatchUsage(now);
  const manualDecision = shouldRunEventsAiBatch({
    now,
    config,
    usage,
    ignoreCadence: true,
    ignoreBusinessHours: true,
  });

  const { windowStart, windowEnd, windowDate } = getDayWindow(now, config.timezone);
  const [lastRunResult, analyzedTodayResult, lastErrorResult, messagesTodayResult] = await Promise.all([
    pool.query(`
      SELECT finished_at FROM event_ai_batches
      WHERE kind = 'conversations' AND status = 'SUCCEEDED'
      ORDER BY finished_at DESC NULLS LAST
      LIMIT 1
    `),
    pool.query(
      `SELECT COUNT(*)::int AS total FROM conversation_insights WHERE window_date = $1::date`,
      [windowDate],
    ),
    pool.query(`
      SELECT error_message FROM event_ai_batches
      WHERE kind IN ('conversations', 'briefing') AND status = 'FAILED' AND batch_date = $1::date
      ORDER BY finished_at DESC NULLS LAST
      LIMIT 1
    `, [now.toISOString().slice(0, 10)]),
    // Diagnostico: quantas mensagens o monitor capturou hoje (fora grupos
    // internos). Se isso for 0, o problema e na ingestao, nao na IA.
    pool.query(`
      SELECT COUNT(*)::int AS total
      FROM whatsapp_monitor_messages
      WHERE created_at >= $1 AND created_at < $2
        AND COALESCE(remote_jid, '') <> ALL($3::text[])
    `, [windowStart, windowEnd, INTERNAL_GROUP_JID_LIST]),
  ]);

  return {
    enabled: config.enabled,
    provider: config.provider,
    model: config.provider === "cerebras" ? config.cerebrasModel : config.model,
    lastAnalysisAt: lastRunResult.rows[0]?.finished_at
      ? new Date(lastRunResult.rows[0].finished_at).toISOString()
      : null,
    conversationsAnalyzedToday: Number(analyzedTodayResult.rows[0]?.total ?? 0),
    messagesToday: Number(messagesTodayResult.rows[0]?.total ?? 0),
    usage: {
      requestCount: usage.requestCount,
      tokenCount: usage.tokenCount,
      requestLimit: config.dailyRequestLimit,
      tokenLimit: config.dailyTokenLimit,
    },
    canRunManually: manualDecision.allowed,
    manualBlockedReason: manualDecision.allowed ? null : manualDecision.reason,
    retentionDays: env.EVENTS_INTELLIGENCE_RETENTION_DAYS,
    lastError: lastErrorResult.rows[0]?.error_message
      ? String(lastErrorResult.rows[0].error_message).slice(0, 300)
      : null,
    scheduleMode: env.EVENTS_AI_SCHEDULE_MODE,
    dailyRunHour: env.EVENTS_AI_DAILY_RUN_HOUR,
  };
}

export async function getEventsOverview(
  user: JwtUser,
  filters: { dateFrom?: string; dateTo?: string },
  now = new Date(),
): Promise<EventsOverviewResponse> {
  const from = filters.dateFrom || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = filters.dateTo || new Date().toISOString().slice(0, 10);

  const scopeParams: any[] = [from, to];
  const scope = sellerScope(user, scopeParams);

  const statsPromise = pool.query(`
    SELECT
      COUNT(*)::int AS conversations,
      COUNT(*) FILTER (WHERE attention_level = 'none')::int AS attention_none,
      COUNT(*) FILTER (WHERE attention_level = 'low')::int AS attention_low,
      COUNT(*) FILTER (WHERE attention_level = 'medium')::int AS attention_medium,
      COUNT(*) FILTER (WHERE attention_level = 'high')::int AS attention_high,
      COUNT(*) FILTER (WHERE attention_level = 'critical')::int AS attention_critical,
      COUNT(*) FILTER (WHERE COALESCE((flags->>'reclamacao')::boolean, false))::int AS complaints,
      COUNT(*) FILTER (WHERE COALESCE((flags->>'risco_perda')::boolean, false))::int AS churn_risks,
      COUNT(*) FILTER (WHERE COALESCE((flags->>'sem_resposta')::boolean, false))::int AS unanswered,
      COUNT(*) FILTER (WHERE COALESCE((flags->>'oportunidade')::boolean, false))::int AS opportunities,
      COUNT(*) FILTER (WHERE COALESCE((flags->>'elogio')::boolean, false))::int AS praises,
      COUNT(*) FILTER (WHERE is_group)::int AS groups,
      COUNT(*) FILTER (WHERE NOT is_group)::int AS privates,
      COUNT(*) FILTER (
        WHERE attention_level IN ('high', 'critical') AND acknowledged_at IS NULL
      )::int AS open_radar,
      AVG(sentiment_score)::float AS average_sentiment
    FROM conversation_insights ci
    WHERE ci.window_date >= $1::date AND ci.window_date <= $2::date${scope}
  `, scopeParams);

  const radarParams: any[] = [from, to];
  const radarScope = sellerScope(user, radarParams);
  const radarPromise = pool.query(`
    SELECT ci.*
    FROM conversation_insights ci
    WHERE ci.window_date >= $1::date AND ci.window_date <= $2::date
      AND ci.attention_level IN ('high', 'critical')
      AND ci.acknowledged_at IS NULL${radarScope}
    ORDER BY
      ARRAY_POSITION(ARRAY['none','low','medium','high','critical'], ci.attention_level) DESC,
      ci.last_message_at DESC NULLS LAST
    LIMIT 30
  `, radarParams);

  const topicsParams: any[] = [from, to];
  const topicsScope = sellerScope(user, topicsParams);
  const topicsPromise = pool.query(`
    SELECT
      topic,
      COUNT(*)::int AS count,
      COUNT(*) FILTER (WHERE ci.sentiment_score < -0.1)::int AS negative_count
    -- topics[1:1]: um unico tema por conversa, mesmo em leituras antigas que
    -- gravaram 3 temas (senao a mesma conversa infla 3 barras do grafico).
    FROM conversation_insights ci, UNNEST(ci.topics[1:1]) AS topic
    WHERE ci.window_date >= $1::date AND ci.window_date <= $2::date${topicsScope}
    GROUP BY topic
    ORDER BY count DESC, negative_count DESC
    LIMIT 24
  `, topicsParams);

  const agentsParams: any[] = [from, to];
  const agentsScope = sellerScope(user, agentsParams);
  const agentsPromise = pool.query(`
    SELECT
      ci.agent_name,
      COUNT(*)::int AS conversations,
      COUNT(*) FILTER (WHERE COALESCE((flags->>'reclamacao')::boolean, false))::int AS complaints,
      COUNT(*) FILTER (WHERE COALESCE((flags->>'oportunidade')::boolean, false))::int AS opportunities,
      COUNT(*) FILTER (WHERE COALESCE((flags->>'elogio')::boolean, false))::int AS praises,
      AVG(ci.sentiment_score)::float AS average_sentiment
    FROM conversation_insights ci
    WHERE ci.window_date >= $1::date AND ci.window_date <= $2::date
      AND ci.agent_name IS NOT NULL${agentsScope}
    GROUP BY ci.agent_name
    ORDER BY conversations DESC
    LIMIT 12
  `, agentsParams);

  const briefingPromise = user.role === "SELLER"
    ? Promise.resolve(null)
    : pool.query(`
        SELECT * FROM daily_briefings
        WHERE briefing_date <= $1::date
        ORDER BY briefing_date DESC
        LIMIT 1
      `, [to]).then((result) => (result.rows[0] ? mapBriefingRow(result.rows[0]) : null));

  // Prova de coleta: sempre do dia atual, independente do periodo filtrado —
  // e a resposta visual de "esta capturando e analisando certinho?".
  const config = getEventsAiBatchConfig();
  const { windowStart, windowEnd } = getDayWindow(now, config.timezone);
  const capturePromise = pool.query(`
    SELECT
      COUNT(*)::int AS messages_today,
      MAX(created_at) AS last_message_at,
      COUNT(DISTINCT COALESCE(NULLIF(remote_jid, ''), deal_id::text)) FILTER (
        WHERE COALESCE(remote_jid, '') LIKE '%@g.us'
      )::int AS group_conversations,
      COUNT(DISTINCT COALESCE(NULLIF(remote_jid, ''), deal_id::text)) FILTER (
        WHERE COALESCE(remote_jid, '') NOT LIKE '%@g.us'
      )::int AS private_conversations,
      COUNT(DISTINCT COALESCE(NULLIF(remote_jid, ''), deal_id::text)) FILTER (
        WHERE from_me = false
          AND COALESCE(sender_jid, '') <> ALL($3::text[])
          AND COALESCE(sender_name, '') <> ALL($4::text[])
      )::int AS conversations_with_customer
    FROM whatsapp_monitor_messages
    WHERE created_at >= $1 AND created_at < $2
      AND COALESCE(remote_jid, '') <> ALL($5::text[])
  `, [windowStart, windowEnd, INTERNAL_SENDER_JID_LIST, INTERNAL_SENDER_NAME_LIST, INTERNAL_GROUP_JID_LIST]);

  const hourlyPromise = pool.query(`
    SELECT
      EXTRACT(HOUR FROM created_at AT TIME ZONE $3)::int AS hour,
      COUNT(*)::int AS count
    FROM whatsapp_monitor_messages
    WHERE created_at >= $1 AND created_at < $2
      AND COALESCE(remote_jid, '') <> ALL($4::text[])
    GROUP BY 1
    ORDER BY 1
  `, [windowStart, windowEnd, config.timezone, INTERNAL_GROUP_JID_LIST]);

  // Diagnostico e um extra: se alguma dessas queries falhar (ex.: coluna
  // faltando por migracao parcial), o overview inteiro NAO pode cair.
  const runsPromise = pool.query(`
    SELECT kind, run_source, status, event_count, finished_at, error_message
    FROM event_ai_batches
    WHERE kind IN ('conversations', 'briefing')
    ORDER BY finished_at DESC NULLS LAST
    LIMIT 8
  `).catch((error) => {
    logger.warn("events overview: runs query failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { rows: [] as any[] };
  });

  const [statsResult, radarResult, topicsResult, agentsResult, briefing, status, captureResult, hourlyResult, runsResult] = await Promise.all([
    statsPromise,
    radarPromise,
    topicsPromise,
    agentsPromise,
    briefingPromise,
    getIntelligenceStatus(now),
    capturePromise,
    hourlyPromise,
    runsPromise,
  ]);

  const statsRow = statsResult.rows[0] ?? {};
  const captureRow = captureResult.rows[0] ?? {};
  const conversationsWithCustomer = Number(captureRow.conversations_with_customer ?? 0);
  const capture: EventsCaptureStats = {
    messagesToday: Number(captureRow.messages_today ?? 0),
    lastMessageAt: captureRow.last_message_at ? new Date(captureRow.last_message_at).toISOString() : null,
    groupConversations: Number(captureRow.group_conversations ?? 0),
    privateConversations: Number(captureRow.private_conversations ?? 0),
    conversationsWithCustomer,
    analyzedToday: status.conversationsAnalyzedToday,
    pendingToday: Math.max(0, conversationsWithCustomer - status.conversationsAnalyzedToday),
    hourly: hourlyResult.rows.map((row) => ({
      hour: Number(row.hour ?? 0),
      count: Number(row.count ?? 0),
    })),
  };

  const runs: EventsAiRunSummary[] = runsResult.rows.map((row) => ({
    kind: String(row.kind),
    runSource: String(row.run_source),
    status: String(row.status),
    eventCount: Number(row.event_count ?? 0),
    finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null,
    errorMessage: row.error_message ? String(row.error_message).slice(0, 200) : null,
  }));

  return {
    generatedAt: now.toISOString(),
    period: { from, to },
    briefing,
    status,
    capture,
    runs,
    stats: {
      conversations: Number(statsRow.conversations ?? 0),
      byAttention: {
        none: Number(statsRow.attention_none ?? 0),
        low: Number(statsRow.attention_low ?? 0),
        medium: Number(statsRow.attention_medium ?? 0),
        high: Number(statsRow.attention_high ?? 0),
        critical: Number(statsRow.attention_critical ?? 0),
      },
      complaints: Number(statsRow.complaints ?? 0),
      churnRisks: Number(statsRow.churn_risks ?? 0),
      unanswered: Number(statsRow.unanswered ?? 0),
      opportunities: Number(statsRow.opportunities ?? 0),
      praises: Number(statsRow.praises ?? 0),
      groups: Number(statsRow.groups ?? 0),
      privates: Number(statsRow.privates ?? 0),
      averageSentiment: statsRow.average_sentiment === null || statsRow.average_sentiment === undefined
        ? null
        : Number(statsRow.average_sentiment),
      openRadar: Number(statsRow.open_radar ?? 0),
    },
    radar: radarResult.rows.map(mapInsightRow),
    topics: topicsResult.rows.map((row): ConversationTopicStat => ({
      topic: String(row.topic),
      count: Number(row.count ?? 0),
      negativeCount: Number(row.negative_count ?? 0),
    })),
    agents: agentsResult.rows.map((row): ConversationAgentStat => ({
      agentName: String(row.agent_name),
      conversations: Number(row.conversations ?? 0),
      complaints: Number(row.complaints ?? 0),
      opportunities: Number(row.opportunities ?? 0),
      praises: Number(row.praises ?? 0),
      averageSentiment: row.average_sentiment === null || row.average_sentiment === undefined
        ? null
        : Number(row.average_sentiment),
    })),
  };
}

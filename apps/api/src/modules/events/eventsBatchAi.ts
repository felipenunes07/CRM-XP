import { env } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";
import { pool } from "../../db/client.js";

export type EventsAiBatchProvider = "gemini" | "cerebras" | "auto";
export type EventsAiRuntimeProvider = Exclude<EventsAiBatchProvider, "auto">;

export interface EventsAiBatchConfig {
  enabled: boolean;
  provider: EventsAiBatchProvider;
  model: string;
  apiKey: string;
  cerebrasApiKey: string;
  cerebrasModel: string;
  timezone: string;
  businessStartHour: number;
  businessEndHour: number;
  businessDays: number[];
  intervalMinutes: number;
  dailyRequestLimit: number;
  dailyTokenLimit: number;
  maxEventsPerBatch: number;
  lookbackHours: number;
}

export interface EventsAiBatchUsage {
  requestCount: number;
  tokenCount: number;
  lastRunAt: Date | null;
}

export interface EventsAiBatchDecision {
  allowed: boolean;
  reason:
    | "allowed"
    | "disabled"
    | "missing_api_key"
    | "outside_business_hours"
    | "cadence_wait"
    | "daily_request_cap"
    | "daily_token_cap";
  nextEligibleAt: Date | null;
}

interface EventForAi {
  id: string;
  content: string;
  eventType: string;
  severity: string;
  label: string;
  detectedAt: string;
  contactName?: string | null;
  agentName?: string | null;
  isGroup?: boolean | null;
}

interface EventsAiProviderRuntime {
  provider: EventsAiRuntimeProvider;
  model: string;
  apiKey: string;
}

interface AiSummaryResult {
  provider: EventsAiRuntimeProvider;
  model: string;
  summary: Record<string, unknown>;
  outputTokens: number;
  totalTokens: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function getLocalParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
  };
}

function zonedDateToUtc(
  timezone: string,
  local: { year: number; month: number; day: number; hour: number; minute?: number; second?: number },
) {
  const utcGuess = new Date(Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute ?? 0, local.second ?? 0));
  const actualLocal = getLocalParts(utcGuess, timezone);
  const deltaMinutes =
    (Date.UTC(actualLocal.year, actualLocal.month - 1, actualLocal.day, actualLocal.hour, actualLocal.minute, actualLocal.second) -
      Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute ?? 0, local.second ?? 0)) /
    60_000;

  return new Date(utcGuess.getTime() - deltaMinutes * 60_000);
}

function addLocalDays(local: { year: number; month: number; day: number; hour: number }, days: number) {
  const utc = new Date(Date.UTC(local.year, local.month - 1, local.day + days, local.hour, 0, 0));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
    hour: local.hour,
  };
}

export function parseBusinessDays(value: string) {
  const days = value
    .split(",")
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 6);

  return days.length > 0 ? days : [1, 2, 3, 4, 5];
}

export function getEventsAiBatchConfig(): EventsAiBatchConfig {
  return {
    enabled: env.EVENTS_AI_BATCH_ENABLED,
    provider: env.EVENTS_AI_PROVIDER,
    model: env.EVENTS_AI_MODEL,
    apiKey: env.GEMINI_API_KEY,
    cerebrasApiKey: env.CEREBRAS_API_KEY,
    cerebrasModel: env.CEREBRAS_MODEL,
    timezone: env.EVENTS_AI_TIMEZONE,
    businessStartHour: env.EVENTS_AI_BUSINESS_START_HOUR,
    businessEndHour: env.EVENTS_AI_BUSINESS_END_HOUR,
    businessDays: parseBusinessDays(env.EVENTS_AI_BUSINESS_DAYS),
    intervalMinutes: env.EVENTS_AI_BATCH_INTERVAL_MINUTES,
    dailyRequestLimit: env.EVENTS_AI_DAILY_REQUEST_LIMIT,
    dailyTokenLimit: env.EVENTS_AI_DAILY_TOKEN_LIMIT,
    maxEventsPerBatch: env.EVENTS_AI_MAX_EVENTS_PER_BATCH,
    lookbackHours: env.EVENTS_AI_LOOKBACK_HOURS,
  };
}

export function selectEventsAiProviders(config: EventsAiBatchConfig): EventsAiProviderRuntime[] {
  const providers: EventsAiProviderRuntime[] = [];
  const addCerebras = () => {
    if (config.cerebrasApiKey.trim()) {
      providers.push({
        provider: "cerebras",
        model: config.cerebrasModel,
        apiKey: config.cerebrasApiKey,
      });
    }
  };
  const addGemini = () => {
    if (config.apiKey.trim()) {
      providers.push({
        provider: "gemini",
        model: config.model,
        apiKey: config.apiKey,
      });
    }
  };

  if (config.provider === "cerebras") {
    addCerebras();
  } else if (config.provider === "gemini") {
    addGemini();
  } else {
    addCerebras();
    addGemini();
  }

  return providers;
}

function getConfiguredModelLabel(config: EventsAiBatchConfig) {
  if (config.provider === "cerebras") return config.cerebrasModel;
  if (config.provider === "gemini") return config.model;
  return [config.cerebrasApiKey.trim() ? config.cerebrasModel : null, config.apiKey.trim() ? config.model : null]
    .filter(Boolean)
    .join(",") || "auto";
}

export function isWithinBusinessWindow(now: Date, config: Pick<EventsAiBatchConfig, "timezone" | "businessDays" | "businessStartHour" | "businessEndHour">) {
  const local = getLocalParts(now, config.timezone);
  return (
    config.businessDays.includes(local.weekday) &&
    local.hour >= config.businessStartHour &&
    local.hour < config.businessEndHour
  );
}

export function getNextBusinessWindowStart(now: Date, config: Pick<EventsAiBatchConfig, "timezone" | "businessDays" | "businessStartHour" | "businessEndHour">) {
  const local = getLocalParts(now, config.timezone);

  for (let offset = 0; offset <= 10; offset += 1) {
    const candidate = addLocalDays({ ...local, hour: config.businessStartHour }, offset);
    const candidateUtc = zonedDateToUtc(config.timezone, candidate);
    const candidateParts = getLocalParts(candidateUtc, config.timezone);

    if (!config.businessDays.includes(candidateParts.weekday)) {
      continue;
    }

    if (candidateUtc > now && candidateParts.hour >= config.businessStartHour) {
      return candidateUtc;
    }
  }

  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}

export function shouldRunEventsAiBatch(input: {
  now: Date;
  config: EventsAiBatchConfig;
  usage: EventsAiBatchUsage;
  ignoreCadence?: boolean;
}): EventsAiBatchDecision {
  const { now, config, usage, ignoreCadence = false } = input;

  if (!config.enabled) {
    return { allowed: false, reason: "disabled", nextEligibleAt: null };
  }

  if (selectEventsAiProviders(config).length === 0) {
    return { allowed: false, reason: "missing_api_key", nextEligibleAt: null };
  }

  if (!isWithinBusinessWindow(now, config)) {
    return { allowed: false, reason: "outside_business_hours", nextEligibleAt: getNextBusinessWindowStart(now, config) };
  }

  if (!ignoreCadence && usage.lastRunAt) {
    const nextRunAt = new Date(usage.lastRunAt.getTime() + config.intervalMinutes * 60 * 1000);
    if (nextRunAt > now) {
      return { allowed: false, reason: "cadence_wait", nextEligibleAt: nextRunAt };
    }
  }

  if (usage.requestCount >= config.dailyRequestLimit) {
    return { allowed: false, reason: "daily_request_cap", nextEligibleAt: getNextBusinessWindowStart(now, config) };
  }

  if (usage.tokenCount >= config.dailyTokenLimit) {
    return { allowed: false, reason: "daily_token_cap", nextEligibleAt: getNextBusinessWindowStart(now, config) };
  }

  return { allowed: true, reason: "allowed", nextEligibleAt: null };
}

export function estimatePromptTokens(value: string) {
  return Math.max(1, Math.ceil(value.length / 4));
}

export function anonymizeMessageForAi(value: string) {
  return value
    .replace(/\b\d{5,20}@(?:s\.whatsapp\.net|g\.us|lid)\b/giu, "[jid]")
    .replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/giu, "[email]")
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/gu, "[cpf]")
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2}\b/gu, "[cnpj]")
    .replace(/\b(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}\b/gu, "[telefone]")
    .replace(/\b\p{Lu}\p{Ll}{2,}\b/gu, "[nome]")
    .replace(/\s+/g, " ")
    .trim();
}

function buildBatchPrompt(events: EventForAi[]) {
  const compactEvents = events.map((event) => ({
    id: event.id,
    tipo: event.eventType,
    severidade: event.severity,
    origem: event.isGroup ? "grupo" : "privado",
    texto: anonymizeMessageForAi(event.content).slice(0, 700),
  }));

  return [
    "Voce e um analista operacional da XP Factory.",
    "Resuma apenas padroes gerenciais, sem identificar clientes, telefones, atendentes ou grupos.",
    "Retorne JSON valido com: resumoExecutivo, noticiasBoas[], alertasCriticos[], temasEmAlta[], gargalos[], acoesRecomendadas[].",
    "Cada item deve ser curto, pratico e baseado nas mensagens abaixo.",
    JSON.stringify(compactEvents),
  ].join("\n");
}

async function fetchGeminiSummary(prompt: string, runtime: EventsAiProviderRuntime): Promise<AiSummaryResult> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(runtime.model)}:generateContent?key=${encodeURIComponent(runtime.apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1200,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Gemini batch failed with ${response.status}: ${text.slice(0, 300)}`);
  }

  const payload = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
  };

  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n").trim() ?? "";
  const summary = text ? JSON.parse(text) as Record<string, unknown> : {};

  return {
    provider: runtime.provider,
    model: runtime.model,
    summary,
    outputTokens: payload.usageMetadata?.candidatesTokenCount ?? estimatePromptTokens(text),
    totalTokens: payload.usageMetadata?.totalTokenCount ?? estimatePromptTokens(prompt) + estimatePromptTokens(text),
  };
}

async function fetchCerebrasSummary(prompt: string, runtime: EventsAiProviderRuntime): Promise<AiSummaryResult> {
  const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${runtime.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: runtime.model,
      messages: [
        { role: "system", content: "Voce retorna apenas JSON valido para analise operacional." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 1200,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Cerebras batch failed with ${response.status}: ${text.slice(0, 300)}`);
  }

  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const text = payload.choices?.[0]?.message?.content?.trim() ?? "";
  const summary = text ? JSON.parse(text) as Record<string, unknown> : {};

  return {
    provider: runtime.provider,
    model: runtime.model,
    summary,
    outputTokens: payload.usage?.completion_tokens ?? estimatePromptTokens(text),
    totalTokens: payload.usage?.total_tokens ?? estimatePromptTokens(prompt) + estimatePromptTokens(text),
  };
}

async function fetchAiSummary(prompt: string, config: EventsAiBatchConfig) {
  const providers = selectEventsAiProviders(config);
  const errors: string[] = [];

  for (const runtime of providers) {
    try {
      return runtime.provider === "cerebras"
        ? await fetchCerebrasSummary(prompt, runtime)
        : await fetchGeminiSummary(prompt, runtime);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${runtime.provider}: ${message}`);
      logger.warn("events AI provider failed, trying fallback if available", {
        provider: runtime.provider,
        model: runtime.model,
        error: message,
      });
    }
  }

  throw new Error(errors.join(" | ") || "No configured AI providers");
}

async function getBatchUsage(now: Date): Promise<EventsAiBatchUsage> {
  const result = await pool.query(`
    SELECT
      COALESCE(SUM(request_count), 0)::int as request_count,
      COALESCE(SUM(input_tokens_estimated + output_tokens_estimated), 0)::int as token_count,
      MAX(finished_at) FILTER (WHERE status = 'SUCCEEDED') as last_run_at
    FROM event_ai_batches
    WHERE batch_date = $1::date
  `, [now.toISOString().slice(0, 10)]);

  const row = result.rows[0] ?? {};
  return {
    requestCount: Number(row.request_count ?? 0),
    tokenCount: Number(row.token_count ?? 0),
    lastRunAt: row.last_run_at ? new Date(row.last_run_at) : null,
  };
}

async function fetchEventsForBatch(config: EventsAiBatchConfig): Promise<EventForAi[]> {
  const result = await pool.query(`
    SELECT
      me.id::text,
      me.content,
      me.event_type,
      me.severity,
      me.label,
      me.detected_at,
      d.title as contact_name,
      d.assigned_to_name as agent_name,
      COALESCE((me.metadata->>'isGroup')::boolean, d.whatsapp_jid LIKE '%@g.us') as is_group
    FROM message_events me
    JOIN deals d ON d.id = me.deal_id
    WHERE me.detected_at >= NOW() - ($1::int * INTERVAL '1 hour')
      AND me.event_type NOT IN ('GREETING', 'NEUTRAL')
      AND COALESCE((me.metadata->>'shouldCreateEvent')::boolean, true) = true
    ORDER BY me.detected_at DESC
    LIMIT $2
  `, [config.lookbackHours, config.maxEventsPerBatch]);

  return result.rows.map((row) => ({
    id: String(row.id),
    content: String(row.content ?? ""),
    eventType: String(row.event_type),
    severity: String(row.severity),
    label: String(row.label ?? ""),
    detectedAt: new Date(row.detected_at).toISOString(),
    contactName: row.contact_name,
    agentName: row.agent_name,
    isGroup: Boolean(row.is_group),
  }));
}

async function recordBatch(input: {
  now: Date;
  config: EventsAiBatchConfig;
  provider?: string;
  model?: string;
  status: "SKIPPED" | "SUCCEEDED" | "FAILED";
  reason: string;
  events: EventForAi[];
  inputTokens: number;
  outputTokens: number;
  summary: Record<string, unknown> | null;
  errorMessage?: string | null;
}) {
  await pool.query(`
    INSERT INTO event_ai_batches (
      batch_date, provider, model, status, status_reason, period_from, period_to,
      event_count, request_count, input_tokens_estimated, output_tokens_estimated,
      summary_json, error_message, started_at, finished_at
    ) VALUES (
      $1::date, $2, $3, $4, $5, NOW() - ($6::int * INTERVAL '1 hour'), NOW(),
      $7, $8, $9, $10, $11::jsonb, $12, $13, NOW()
    )
  `, [
    input.now.toISOString().slice(0, 10),
    input.provider ?? input.config.provider,
    input.model ?? getConfiguredModelLabel(input.config),
    input.status,
    input.reason,
    input.config.lookbackHours,
    input.events.length,
    input.status === "SUCCEEDED" ? 1 : 0,
    input.inputTokens,
    input.outputTokens,
    input.summary ? JSON.stringify(input.summary) : null,
    input.errorMessage ?? null,
    input.now,
  ]);
}

export async function getEventsAiBatchStatus(now = new Date()) {
  const config = getEventsAiBatchConfig();
  const usage = await getBatchUsage(now);
  const decision = shouldRunEventsAiBatch({ now, config, usage });
  const manualDecision = shouldRunEventsAiBatch({ now, config, usage, ignoreCadence: true });

  const latest = await pool.query(`
    SELECT status, status_reason, summary_json, event_count, finished_at, error_message
    FROM event_ai_batches
    ORDER BY finished_at DESC NULLS LAST, started_at DESC
    LIMIT 1
  `);

  return {
    enabled: config.enabled,
    provider: config.provider,
    model: getConfiguredModelLabel(config),
    businessHours: {
      timezone: config.timezone,
      startHour: config.businessStartHour,
      endHour: config.businessEndHour,
      days: config.businessDays,
    },
    dailyUsage: {
      requestCount: usage.requestCount,
      tokenCount: usage.tokenCount,
      lastRunAt: usage.lastRunAt?.toISOString() ?? null,
    },
    canRunNow: decision.allowed,
    blockedReason: decision.allowed ? null : decision.reason,
    nextEligibleAt: decision.nextEligibleAt?.toISOString() ?? null,
    canRunManually: manualDecision.allowed,
    manualBlockedReason: manualDecision.allowed ? null : manualDecision.reason,
    manualNextEligibleAt: manualDecision.nextEligibleAt?.toISOString() ?? null,
    latestBatch: latest.rows[0] ? {
      status: latest.rows[0].status,
      reason: latest.rows[0].status_reason,
      eventCount: Number(latest.rows[0].event_count ?? 0),
      finishedAt: latest.rows[0].finished_at ? new Date(latest.rows[0].finished_at).toISOString() : null,
      errorMessage: latest.rows[0].error_message,
      summary: latest.rows[0].summary_json ?? null,
    } : null,
  };
}

export async function runEventsAiBatch(now = new Date(), options: { manual?: boolean } = {}) {
  const config = getEventsAiBatchConfig();
  const usage = await getBatchUsage(now);
  const decision = shouldRunEventsAiBatch({ now, config, usage, ignoreCadence: options.manual === true });

  if (!decision.allowed) {
    logger.info("events AI batch skipped", { reason: decision.reason, nextEligibleAt: decision.nextEligibleAt?.toISOString() });
    return { status: "SKIPPED" as const, reason: decision.reason };
  }

  const events = await fetchEventsForBatch(config);
  if (events.length === 0) {
    await recordBatch({
      now,
      config,
      status: "SKIPPED",
      reason: "no_events",
      events,
      inputTokens: 0,
      outputTokens: 0,
      summary: null,
    });
    return { status: "SKIPPED" as const, reason: "no_events" };
  }

  const prompt = buildBatchPrompt(events);
  const inputTokens = estimatePromptTokens(prompt);

  if (usage.tokenCount + inputTokens >= config.dailyTokenLimit) {
    await recordBatch({
      now,
      config,
      status: "SKIPPED",
      reason: "daily_token_cap",
      events,
      inputTokens,
      outputTokens: 0,
      summary: null,
    });
    return { status: "SKIPPED" as const, reason: "daily_token_cap" };
  }

  try {
    const result = await fetchAiSummary(prompt, config);
    await recordBatch({
      now,
      config,
      provider: result.provider,
      model: result.model,
      status: "SUCCEEDED",
      reason: "ok",
      events,
      inputTokens,
      outputTokens: result.outputTokens,
      summary: result.summary,
    });
    return { status: "SUCCEEDED" as const, eventCount: events.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("events AI batch failed", { error: message });
    await recordBatch({
      now,
      config,
      status: "FAILED",
      reason: "provider_error",
      events,
      inputTokens,
      outputTokens: 0,
      summary: null,
      errorMessage: message,
    });
    return { status: "FAILED" as const, reason: "provider_error", error: message };
  }
}

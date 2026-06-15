import type {
  MessageAutomation,
  MessageAutomationChannel,
  MessageAutomationRun,
  MessageAutomationRunAudienceSnapshot,
  MessageAutomationRunStatus,
  MessageAutomationSchedule,
  MessageAutomationSendMode,
  MessageAutomationStatus,
  MessageAutomationTriggerMode,
  SegmentDefinition,
} from "@olist-crm/shared";
import { pool } from "../../db/client.js";
import { env } from "../../lib/env.js";
import { HttpError } from "../../lib/httpError.js";
import { logger } from "../../lib/logger.js";
import type { JwtUser } from "../platform/authService.js";
import { previewSegment } from "./customerService.js";
import { createWhatsappCampaign } from "../whatsapp/whatsappCampaignService.js";
import { enqueueWhatsappCampaignRecipients } from "../whatsapp/whatsappQueue.js";
import { computeRecentBlock } from "../whatsapp/whatsappCore.js";
import {
  buildStageEntryEventKey,
  filterUnhandledStageEntryCustomerIds,
  resolveEligibleRunStatus,
} from "./automationCore.js";

export interface UpsertMessageAutomationInput {
  name: string;
  status: MessageAutomationStatus;
  channel: MessageAutomationChannel;
  sendMode?: MessageAutomationSendMode;
  triggerMode?: MessageAutomationTriggerMode;
  savedSegmentId?: string | null;
  segmentDefinition: SegmentDefinition;
  flowDefinition?: Record<string, unknown>;
  whatsappInstanceId?: string | null;
  templateId?: string | null;
  messageText: string;
  schedule: MessageAutomationSchedule;
  overrideRecentBlock?: boolean;
  minDelaySeconds?: number;
  maxDelaySeconds?: number;
}

interface AutomationRow {
  id: string;
  name: string;
  status: MessageAutomationStatus;
  channel: MessageAutomationChannel;
  send_mode: MessageAutomationSendMode;
  trigger_mode: MessageAutomationTriggerMode;
  saved_segment_id: string | null;
  saved_segment_name: string | null;
  segment_definition: SegmentDefinition;
  flow_definition: Record<string, unknown>;
  whatsapp_instance_id: string | null;
  whatsapp_instance_name: string | null;
  whatsapp_instance_label: string | null;
  template_id: string | null;
  template_title: string | null;
  message_text: string;
  schedule_json: MessageAutomationSchedule;
  override_recent_block: boolean;
  min_delay_seconds: number;
  max_delay_seconds: number;
  next_run_at: string | null;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AutomationRunRow {
  id: string;
  automation_id: string;
  automation_name: string;
  status: MessageAutomationRunStatus;
  scheduled_for: string;
  resolved_at: string | null;
  audience_snapshot: MessageAutomationRunAudienceSnapshot;
  mapped_group_count: number;
  unmapped_customer_count: number;
  blocked_recent_count: number;
  campaign_id: string | null;
  approved_at: string | null;
  approved_by_user_id: string | null;
  rejected_at: string | null;
  rejected_by_user_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface SavedSegmentMetadata {
  id: string;
  name: string;
  definition: SegmentDefinition;
}

interface ResolvedAutomationAudience {
  totalCustomerCount: number;
  customerIds: string[];
  eligibleGroupIds: string[];
  blockedGroupIds: string[];
  unmappedCustomerIds: string[];
}

let ensureTablesPromise: Promise<void> | null = null;

const AUTOMATION_SYSTEM_USER: JwtUser = {
  id: "automation",
  email: "automation@system.local",
  role: "ADMIN",
  name: "Automacao",
};

function emptyAudienceSnapshot(): MessageAutomationRunAudienceSnapshot {
  return {
    totalCustomerCount: 0,
    customerIds: [],
    eligibleGroupIds: [],
    blockedGroupIds: [],
    unmappedCustomerIds: [],
  };
}

async function ensureAutomationTables() {
  if (!ensureTablesPromise) {
    ensureTablesPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS message_automations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'PAUSED')),
          channel TEXT NOT NULL CHECK (channel = 'WHATSAPP_GROUP'),
          send_mode TEXT NOT NULL DEFAULT 'APPROVAL' CHECK (send_mode IN ('AUTOMATIC', 'APPROVAL')),
          trigger_mode TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (trigger_mode IN ('SCHEDULED', 'ON_STAGE_ENTRY')),
          saved_segment_id UUID REFERENCES saved_segments(id) ON DELETE SET NULL,
          saved_segment_name TEXT,
          segment_definition JSONB NOT NULL DEFAULT '{}'::jsonb,
          flow_definition JSONB NOT NULL DEFAULT '{}'::jsonb,
          whatsapp_instance_id UUID REFERENCES whatsapp_instances(id) ON DELETE SET NULL,
          template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL,
          message_text TEXT NOT NULL DEFAULT '',
          schedule_json JSONB NOT NULL DEFAULT '{"frequency":"DAILY","time":"09:00","timezone":"America/Sao_Paulo"}'::jsonb,
          override_recent_block BOOLEAN NOT NULL DEFAULT FALSE,
          min_delay_seconds INTEGER NOT NULL DEFAULT 183,
          max_delay_seconds INTEGER NOT NULL DEFAULT 304,
          next_run_at TIMESTAMPTZ,
          last_run_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_message_automations_status_next_run
          ON message_automations(status, next_run_at);

        ALTER TABLE message_automations
          ADD COLUMN IF NOT EXISTS send_mode TEXT NOT NULL DEFAULT 'APPROVAL',
          ADD COLUMN IF NOT EXISTS trigger_mode TEXT NOT NULL DEFAULT 'SCHEDULED',
          ADD COLUMN IF NOT EXISTS flow_definition JSONB NOT NULL DEFAULT '{}'::jsonb,
          ADD COLUMN IF NOT EXISTS whatsapp_instance_id UUID REFERENCES whatsapp_instances(id) ON DELETE SET NULL,
          ADD COLUMN IF NOT EXISTS saved_segment_id UUID REFERENCES saved_segments(id) ON DELETE SET NULL,
          ADD COLUMN IF NOT EXISTS saved_segment_name TEXT;

        DO $$
        BEGIN
          ALTER TABLE message_automations DROP CONSTRAINT IF EXISTS message_automations_send_mode_check;
          ALTER TABLE message_automations
            ADD CONSTRAINT message_automations_send_mode_check CHECK (send_mode IN ('AUTOMATIC', 'APPROVAL'));
        END $$;

        DO $$
        BEGIN
          ALTER TABLE message_automations DROP CONSTRAINT IF EXISTS message_automations_trigger_mode_check;
          ALTER TABLE message_automations
            ADD CONSTRAINT message_automations_trigger_mode_check CHECK (trigger_mode IN ('SCHEDULED', 'ON_STAGE_ENTRY'));
        END $$;

        CREATE TABLE IF NOT EXISTS message_automation_runs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          automation_id UUID NOT NULL REFERENCES message_automations(id) ON DELETE CASCADE,
          scheduled_for TIMESTAMPTZ NOT NULL,
          resolved_at TIMESTAMPTZ,
          status TEXT NOT NULL CHECK (status IN ('PENDING_APPROVAL', 'ENQUEUED', 'APPROVED', 'REJECTED', 'NO_MATCH', 'FAILED')),
          audience_snapshot JSONB NOT NULL DEFAULT '{"totalCustomerCount":0,"customerIds":[],"eligibleGroupIds":[],"blockedGroupIds":[],"unmappedCustomerIds":[]}'::jsonb,
          mapped_group_count INTEGER NOT NULL DEFAULT 0,
          unmapped_customer_count INTEGER NOT NULL DEFAULT 0,
          blocked_recent_count INTEGER NOT NULL DEFAULT 0,
          campaign_id UUID REFERENCES whatsapp_campaigns(id) ON DELETE SET NULL,
          approved_at TIMESTAMPTZ,
          approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
          rejected_at TIMESTAMPTZ,
          rejected_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
          error_message TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_message_automation_runs_status_scheduled_for
          ON message_automation_runs(status, scheduled_for DESC);

        DO $$
        BEGIN
          ALTER TABLE message_automation_runs DROP CONSTRAINT IF EXISTS message_automation_runs_status_check;
          ALTER TABLE message_automation_runs
            ADD CONSTRAINT message_automation_runs_status_check
            CHECK (status IN ('PENDING_APPROVAL', 'ENQUEUED', 'APPROVED', 'REJECTED', 'NO_MATCH', 'FAILED'));
        END $$;

        CREATE TABLE IF NOT EXISTS message_automation_customer_events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          automation_id UUID NOT NULL REFERENCES message_automations(id) ON DELETE CASCADE,
          customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
          event_key TEXT NOT NULL,
          first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_triggered_run_id UUID REFERENCES message_automation_runs(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (automation_id, customer_id, event_key)
        );

        CREATE INDEX IF NOT EXISTS idx_message_automation_customer_events_lookup
          ON message_automation_customer_events(automation_id, event_key, customer_id);
      `);
    })().catch((error) => {
      ensureTablesPromise = null;
      throw error;
    });
  }

  return ensureTablesPromise;
}

function mapAutomationRow(row: Record<string, unknown>): MessageAutomation {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    status: String(row.status ?? "PAUSED") as MessageAutomationStatus,
    channel: String(row.channel ?? "WHATSAPP_GROUP") as MessageAutomationChannel,
    sendMode: String(row.send_mode ?? "APPROVAL") as MessageAutomationSendMode,
    triggerMode: String(row.trigger_mode ?? "SCHEDULED") as MessageAutomationTriggerMode,
    savedSegmentId: row.saved_segment_id ? String(row.saved_segment_id) : null,
    savedSegmentName: row.saved_segment_name ? String(row.saved_segment_name) : null,
    segmentDefinition: (row.segment_definition ?? {}) as SegmentDefinition,
    flowDefinition:
      row.flow_definition && typeof row.flow_definition === "object"
        ? (row.flow_definition as Record<string, unknown>)
        : {},
    whatsappInstanceId: row.whatsapp_instance_id ? String(row.whatsapp_instance_id) : null,
    whatsappInstanceName: row.whatsapp_instance_name ? String(row.whatsapp_instance_name) : null,
    whatsappInstanceLabel: row.whatsapp_instance_label ? String(row.whatsapp_instance_label) : null,
    templateId: row.template_id ? String(row.template_id) : null,
    templateTitle: row.template_title ? String(row.template_title) : null,
    messageText: String(row.message_text ?? ""),
    schedule: (row.schedule_json ?? {
      frequency: "DAILY",
      time: "09:00",
      timezone: "America/Sao_Paulo",
    }) as MessageAutomationSchedule,
    overrideRecentBlock: Boolean(row.override_recent_block),
    minDelaySeconds: Number(row.min_delay_seconds ?? 183),
    maxDelaySeconds: Number(row.max_delay_seconds ?? 304),
    nextRunAt: row.next_run_at ? new Date(String(row.next_run_at)).toISOString() : null,
    lastRunAt: row.last_run_at ? new Date(String(row.last_run_at)).toISOString() : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function mapAutomationRunRow(row: Record<string, unknown>): MessageAutomationRun {
  return {
    id: String(row.id),
    automationId: String(row.automation_id),
    automationName: String(row.automation_name ?? ""),
    status: String(row.status ?? "FAILED") as MessageAutomationRunStatus,
    scheduledFor: new Date(String(row.scheduled_for)).toISOString(),
    resolvedAt: row.resolved_at ? new Date(String(row.resolved_at)).toISOString() : null,
    audienceSnapshot:
      row.audience_snapshot && typeof row.audience_snapshot === "object"
        ? (row.audience_snapshot as MessageAutomationRunAudienceSnapshot)
        : emptyAudienceSnapshot(),
    mappedGroupCount: Number(row.mapped_group_count ?? 0),
    unmappedCustomerCount: Number(row.unmapped_customer_count ?? 0),
    blockedRecentCount: Number(row.blocked_recent_count ?? 0),
    campaignId: row.campaign_id ? String(row.campaign_id) : null,
    approvedAt: row.approved_at ? new Date(String(row.approved_at)).toISOString() : null,
    approvedByUserId: row.approved_by_user_id ? String(row.approved_by_user_id) : null,
    rejectedAt: row.rejected_at ? new Date(String(row.rejected_at)).toISOString() : null,
    rejectedByUserId: row.rejected_by_user_id ? String(row.rejected_by_user_id) : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function getZonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    year: Number(parts.year ?? "0"),
    month: Number(parts.month ?? "1"),
    day: Number(parts.day ?? "1"),
    weekday: weekdayMap[String(parts.weekday ?? "Sun")] ?? 0,
  };
}

function getOffsetMinutes(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
  });
  const offsetLabel =
    formatter.formatToParts(date).find((part) => part.type === "timeZoneName")?.value ?? "GMT-0";
  const match = offsetLabel.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/i);

  if (!match) {
    return 0;
  }

  const hours = Number(match[1] ?? "0");
  const minutes = Number(match[2] ?? "0");
  return hours * 60 + Math.sign(hours || 1) * minutes;
}

function zonedDateTimeToUtc(timeZone: string, year: number, month: number, day: number, hour: number, minute: number) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  const offset1 = getOffsetMinutes(utcGuess, timeZone);
  const firstPass = new Date(utcGuess.getTime() - offset1 * 60_000);
  const offset2 = getOffsetMinutes(firstPass, timeZone);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0) - offset2 * 60_000);
}

function addCalendarDays(year: number, month: number, day: number, offsetDays: number) {
  const shifted = new Date(Date.UTC(year, month - 1, day + offsetDays));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function parseScheduleTime(value: string) {
  const [hourRaw, minuteRaw] = value.split(":");
  const hour = Number(hourRaw ?? "0");
  const minute = Number(minuteRaw ?? "0");

  return {
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

export function computeNextAutomationRunAt(schedule: MessageAutomationSchedule, referenceDate = new Date()) {
  const timeZone = schedule.timezone || "America/Sao_Paulo";
  const { hour, minute } = parseScheduleTime(schedule.time);
  const current = getZonedParts(referenceDate, timeZone);

  if (schedule.frequency === "DAILY") {
    const todayRun = zonedDateTimeToUtc(timeZone, current.year, current.month, current.day, hour, minute);
    if (todayRun.getTime() > referenceDate.getTime()) {
      return todayRun;
    }

    const tomorrow = addCalendarDays(current.year, current.month, current.day, 1);
    return zonedDateTimeToUtc(timeZone, tomorrow.year, tomorrow.month, tomorrow.day, hour, minute);
  }

  const weekdays = [...new Set((schedule.weekdays ?? []).filter((value) => value >= 0 && value <= 6))].sort(
    (left, right) => left - right,
  );
  const safeWeekdays = weekdays.length ? weekdays : [current.weekday];

  for (let offset = 0; offset <= 13; offset += 1) {
    const candidateDate = addCalendarDays(current.year, current.month, current.day, offset);
    const weekday = new Date(Date.UTC(candidateDate.year, candidateDate.month - 1, candidateDate.day)).getUTCDay();
    if (!safeWeekdays.includes(weekday)) {
      continue;
    }

    const candidateRun = zonedDateTimeToUtc(
      timeZone,
      candidateDate.year,
      candidateDate.month,
      candidateDate.day,
      hour,
      minute,
    );
    if (candidateRun.getTime() > referenceDate.getTime()) {
      return candidateRun;
    }
  }

  const fallback = addCalendarDays(current.year, current.month, current.day, 7);
  return zonedDateTimeToUtc(timeZone, fallback.year, fallback.month, fallback.day, hour, minute);
}

async function getSavedSegmentMetadata(id: string | null | undefined): Promise<SavedSegmentMetadata | null> {
  if (!id) {
    return null;
  }

  const result = await pool.query(
    `
      SELECT id, name, definition
      FROM saved_segments
      WHERE id = $1
    `,
    [id],
  );

  if (!result.rows[0]) {
    return null;
  }

  return {
    id: String(result.rows[0].id),
    name: String(result.rows[0].name ?? ""),
    definition: (result.rows[0].definition ?? {}) as SegmentDefinition,
  };
}

async function queryAutomationRows() {
  await ensureAutomationTables();
  return pool.query(
    `
      SELECT
        ma.*,
        mt.title AS template_title,
        wi.instance_name AS whatsapp_instance_name,
        wi.display_label AS whatsapp_instance_label
      FROM message_automations ma
      LEFT JOIN message_templates mt ON mt.id = ma.template_id
      LEFT JOIN whatsapp_instances wi ON wi.id = ma.whatsapp_instance_id
      ORDER BY ma.updated_at DESC, ma.name ASC
    `,
  );
}

async function getAutomationById(id: string) {
  await ensureAutomationTables();
  const result = await pool.query(
    `
      SELECT
        ma.*,
        mt.title AS template_title,
        wi.instance_name AS whatsapp_instance_name,
        wi.display_label AS whatsapp_instance_label
      FROM message_automations ma
      LEFT JOIN message_templates mt ON mt.id = ma.template_id
      LEFT JOIN whatsapp_instances wi ON wi.id = ma.whatsapp_instance_id
      WHERE ma.id = $1
    `,
    [id],
  );

  return result.rows[0] ? mapAutomationRow(result.rows[0] as Record<string, unknown>) : null;
}

async function getAutomationRunById(id: string) {
  await ensureAutomationTables();
  const result = await pool.query(
    `
      SELECT
        mar.*,
        ma.name AS automation_name
      FROM message_automation_runs mar
      JOIN message_automations ma ON ma.id = mar.automation_id
      WHERE mar.id = $1
    `,
    [id],
  );

  return result.rows[0] ? mapAutomationRunRow(result.rows[0] as Record<string, unknown>) : null;
}

async function resolveAutomationWhatsappAudience(
  customerIds: string[],
  overrideRecentBlock: boolean,
): Promise<ResolvedAutomationAudience> {
  if (!customerIds.length) {
    return emptyAudienceSnapshot();
  }

  const result = await pool.query(
    `
      SELECT
        id,
        customer_id,
        last_contact_at
      FROM whatsapp_groups
      WHERE customer_id = ANY($1::uuid[])
        AND mapping_status IN ('AUTO_MAPPED', 'MANUAL_MAPPED')
    `,
    [customerIds],
  );

  const mappedCustomerIds = new Set<string>();
  const eligibleGroupIds: string[] = [];
  const blockedGroupIds: string[] = [];

  for (const row of result.rows) {
    const customerId = row.customer_id ? String(row.customer_id) : null;
    if (customerId) {
      mappedCustomerIds.add(customerId);
    }

    const groupId = String(row.id);
    const block = computeRecentBlock(row.last_contact_at ? String(row.last_contact_at) : null, env.WHATSAPP_RECENT_CONTACT_BLOCK_DAYS);
    if (block.isBlocked && !overrideRecentBlock) {
      blockedGroupIds.push(groupId);
    } else {
      eligibleGroupIds.push(groupId);
    }
  }

  return {
    totalCustomerCount: customerIds.length,
    customerIds,
    eligibleGroupIds,
    blockedGroupIds,
    unmappedCustomerIds: customerIds.filter((customerId) => !mappedCustomerIds.has(customerId)),
  };
}

async function getHandledStageEntryCustomerIds(automationId: string, eventKey: string) {
  const result = await pool.query(
    `
      SELECT customer_id
      FROM message_automation_customer_events
      WHERE automation_id = $1
        AND event_key = $2
    `,
    [automationId, eventKey],
  );

  return new Set(result.rows.map((row) => String(row.customer_id)));
}

async function markStageEntryCustomersHandled(
  automationId: string,
  eventKey: string,
  customerIds: string[],
  runId: string,
) {
  if (!customerIds.length) {
    return;
  }

  await pool.query(
    `
      INSERT INTO message_automation_customer_events (
        automation_id,
        customer_id,
        event_key,
        last_triggered_run_id,
        created_at,
        updated_at
      )
      SELECT $1, customer_id, $2, $4, NOW(), NOW()
      FROM unnest($3::uuid[]) AS customer_ids(customer_id)
      ON CONFLICT (automation_id, customer_id, event_key)
      DO UPDATE SET
        last_triggered_run_id = EXCLUDED.last_triggered_run_id,
        updated_at = NOW()
    `,
    [automationId, eventKey, customerIds, runId],
  );
}

function validateDelays(input: UpsertMessageAutomationInput) {
  const minDelaySeconds = input.minDelaySeconds ?? env.WHATSAPP_MIN_DELAY_SECONDS;
  const maxDelaySeconds = input.maxDelaySeconds ?? env.WHATSAPP_MAX_DELAY_SECONDS;

  if (minDelaySeconds > maxDelaySeconds) {
    throw new HttpError(400, "O delay minimo nao pode ser maior que o maximo.");
  }

  return { minDelaySeconds, maxDelaySeconds };
}

export async function listMessageAutomations(): Promise<MessageAutomation[]> {
  const result = await queryAutomationRows();
  return result.rows.map((row) => mapAutomationRow(row as Record<string, unknown>));
}

export async function createMessageAutomation(input: UpsertMessageAutomationInput): Promise<MessageAutomation> {
  await ensureAutomationTables();
  const { minDelaySeconds, maxDelaySeconds } = validateDelays(input);
  const savedSegment = await getSavedSegmentMetadata(input.savedSegmentId);
  const sendMode = input.sendMode ?? "APPROVAL";
  const triggerMode = input.triggerMode ?? "SCHEDULED";

  if (!savedSegment && !Object.keys(input.segmentDefinition ?? {}).length) {
    throw new HttpError(400, "Selecione um publico salvo para a automacao.");
  }

  const definition = savedSegment?.definition ?? input.segmentDefinition;
  const nextRunAt = input.status === "ACTIVE" ? computeNextAutomationRunAt(input.schedule, new Date()).toISOString() : null;

  const result = await pool.query(
    `
      INSERT INTO message_automations (
        name,
        status,
        channel,
        send_mode,
        trigger_mode,
        saved_segment_id,
        saved_segment_name,
        segment_definition,
        flow_definition,
        whatsapp_instance_id,
        template_id,
        message_text,
        schedule_json,
        override_recent_block,
        min_delay_seconds,
        max_delay_seconds,
        next_run_at,
        last_run_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12, $13::jsonb, $14, $15, $16, $17::timestamptz, NULL, NOW(), NOW())
      RETURNING id
    `,
    [
      input.name.trim(),
      input.status,
      input.channel,
      sendMode,
      triggerMode,
      savedSegment?.id ?? input.savedSegmentId ?? null,
      savedSegment?.name ?? null,
      JSON.stringify(definition),
      JSON.stringify(input.flowDefinition ?? {}),
      input.whatsappInstanceId ?? null,
      input.templateId ?? null,
      input.messageText.trim(),
      JSON.stringify(input.schedule),
      Boolean(input.overrideRecentBlock),
      minDelaySeconds,
      maxDelaySeconds,
      nextRunAt,
    ],
  );

  const automation = await getAutomationById(String(result.rows[0].id));
  if (!automation) {
    throw new HttpError(500, "Nao foi possivel carregar a automacao criada.");
  }

  return automation;
}

export async function updateMessageAutomation(id: string, input: UpsertMessageAutomationInput): Promise<MessageAutomation | null> {
  await ensureAutomationTables();
  const { minDelaySeconds, maxDelaySeconds } = validateDelays(input);
  const savedSegment = await getSavedSegmentMetadata(input.savedSegmentId);
  const sendMode = input.sendMode ?? "APPROVAL";
  const triggerMode = input.triggerMode ?? "SCHEDULED";
  const definition = savedSegment?.definition ?? input.segmentDefinition;
  const nextRunAt = input.status === "ACTIVE" ? computeNextAutomationRunAt(input.schedule, new Date()).toISOString() : null;

  const result = await pool.query(
    `
      UPDATE message_automations
      SET
        name = $2,
        status = $3,
        channel = $4,
        send_mode = $5,
        trigger_mode = $6,
        saved_segment_id = $7,
        saved_segment_name = $8,
        segment_definition = $9::jsonb,
        flow_definition = $10::jsonb,
        whatsapp_instance_id = $11,
        template_id = $12,
        message_text = $13,
        schedule_json = $14::jsonb,
        override_recent_block = $15,
        min_delay_seconds = $16,
        max_delay_seconds = $17,
        next_run_at = $18::timestamptz,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id
    `,
    [
      id,
      input.name.trim(),
      input.status,
      input.channel,
      sendMode,
      triggerMode,
      savedSegment?.id ?? input.savedSegmentId ?? null,
      savedSegment?.name ?? null,
      JSON.stringify(definition),
      JSON.stringify(input.flowDefinition ?? {}),
      input.whatsappInstanceId ?? null,
      input.templateId ?? null,
      input.messageText.trim(),
      JSON.stringify(input.schedule),
      Boolean(input.overrideRecentBlock),
      minDelaySeconds,
      maxDelaySeconds,
      nextRunAt,
    ],
  );

  if (!result.rows[0]) {
    return null;
  }

  return getAutomationById(id);
}

export async function deleteMessageAutomation(id: string): Promise<boolean> {
  await ensureAutomationTables();
  const result = await pool.query("DELETE FROM message_automations WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function listMessageAutomationRuns(limit = 100): Promise<MessageAutomationRun[]> {
  await ensureAutomationTables();
  const result = await pool.query(
    `
      SELECT
        mar.*,
        ma.name AS automation_name
      FROM message_automation_runs mar
      JOIN message_automations ma ON ma.id = mar.automation_id
      ORDER BY
        CASE WHEN mar.status = 'PENDING_APPROVAL' THEN 0 ELSE 1 END,
        mar.scheduled_for DESC,
        mar.created_at DESC
      LIMIT $1
    `,
    [limit],
  );

  return result.rows.map((row) => mapAutomationRunRow(row as Record<string, unknown>));
}

async function insertAutomationRun(input: {
  automationId: string;
  automationName: string;
  status: MessageAutomationRunStatus;
  scheduledFor: string;
  audienceSnapshot: MessageAutomationRunAudienceSnapshot;
  mappedGroupCount: number;
  unmappedCustomerCount: number;
  blockedRecentCount: number;
  errorMessage?: string | null;
}) {
  await ensureAutomationTables();
  const result = await pool.query(
    `
      INSERT INTO message_automation_runs (
        automation_id,
        scheduled_for,
        resolved_at,
        status,
        audience_snapshot,
        mapped_group_count,
        unmapped_customer_count,
        blocked_recent_count,
        error_message,
        created_at,
        updated_at
      )
      VALUES ($1, $2::timestamptz, CASE WHEN $3 = 'PENDING_APPROVAL' THEN NULL ELSE NOW() END, $3, $4::jsonb, $5, $6, $7, $8, NOW(), NOW())
      RETURNING id
    `,
    [
      input.automationId,
      input.scheduledFor,
      input.status,
      JSON.stringify(input.audienceSnapshot),
      input.mappedGroupCount,
      input.unmappedCustomerCount,
      input.blockedRecentCount,
      input.errorMessage ?? null,
    ],
  );

  return getAutomationRunById(String(result.rows[0].id));
}

async function createCampaignFromAutomationRun(
  automation: MessageAutomation,
  run: MessageAutomationRun,
  user: JwtUser,
  nextStatus: "APPROVED" | "ENQUEUED",
) {
  if (!run.audienceSnapshot.eligibleGroupIds.length) {
    await pool.query(
      `
        UPDATE message_automation_runs
        SET
          status = 'NO_MATCH',
          resolved_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
      `,
      [run.id],
    );

    return;
  }

  try {
    const campaign = await createWhatsappCampaign(
      {
        name: `${automation.name} ${new Date(run.scheduledFor).toLocaleDateString("pt-BR")}`,
        templateId: automation.templateId,
        savedSegmentId: automation.savedSegmentId,
        whatsappInstanceId: automation.whatsappInstanceId,
        messageText: automation.messageText,
        groupIds: run.audienceSnapshot.eligibleGroupIds,
        overrideRecentBlock: automation.overrideRecentBlock,
        minDelaySeconds: automation.minDelaySeconds,
        maxDelaySeconds: automation.maxDelaySeconds,
        filtersSnapshot: {
          originType: "AUTOMATION",
          automationId: automation.id,
          automationName: automation.name,
          automationRunId: run.id,
          sendMode: automation.sendMode,
          savedSegmentId: automation.savedSegmentId,
          whatsappInstanceId: automation.whatsappInstanceId,
          whatsappInstanceName: automation.whatsappInstanceName,
          whatsappInstanceLabel: automation.whatsappInstanceLabel,
        },
      },
      user,
    );

    await enqueueWhatsappCampaignRecipients(campaign.enqueuedJobs);

    await pool.query(
      `
        UPDATE message_automation_runs
        SET
          status = $2,
          campaign_id = $3,
          approved_at = CASE WHEN $2 = 'APPROVED' THEN NOW() ELSE approved_at END,
          approved_by_user_id = CASE WHEN $2 = 'APPROVED' THEN $4::uuid ELSE approved_by_user_id END,
          resolved_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
      `,
      [run.id, nextStatus, campaign.campaignId, nextStatus === "APPROVED" ? user.id : null],
    );
  } catch (error) {
    await pool.query(
      `
        UPDATE message_automation_runs
        SET
          status = 'FAILED',
          error_message = $2,
          resolved_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
      `,
      [run.id, error instanceof Error ? error.message : String(error)],
    );
    throw error;
  }
}

async function markAutomationExecuted(automationId: string, scheduledFor: string, schedule: MessageAutomationSchedule) {
  const nextRunAt = computeNextAutomationRunAt(schedule, new Date(new Date(scheduledFor).getTime() + 1000)).toISOString();
  await pool.query(
    `
      UPDATE message_automations
      SET
        last_run_at = $2::timestamptz,
        next_run_at = $3::timestamptz,
        updated_at = NOW()
      WHERE id = $1
    `,
    [automationId, scheduledFor, nextRunAt],
  );
}

async function executeMessageAutomation(automationId: string) {
  const automation = await getAutomationById(automationId);
  if (!automation || automation.status !== "ACTIVE" || !automation.nextRunAt) {
    return;
  }

  const scheduledFor = automation.nextRunAt;
  await executeResolvedMessageAutomation(automation, scheduledFor, {
    markSchedule: true,
    systemUser: AUTOMATION_SYSTEM_USER,
  });
}

async function executeResolvedMessageAutomation(
  automation: MessageAutomation,
  scheduledFor: string,
  options: {
    markSchedule: boolean;
    systemUser: JwtUser;
    sendModeOverride?: MessageAutomationSendMode;
  },
): Promise<MessageAutomationRun | null> {
  let createdRun: MessageAutomationRun | null = null;
  try {
    const preview = await previewSegment(automation.segmentDefinition);
    const previewCustomerIds = preview.customers.map((customer) => customer.id);
    const stageEntryEventKey =
      automation.triggerMode === "ON_STAGE_ENTRY" ? buildStageEntryEventKey(automation.segmentDefinition) : null;
    const customerIds = stageEntryEventKey
      ? filterUnhandledStageEntryCustomerIds(
          previewCustomerIds,
          await getHandledStageEntryCustomerIds(automation.id, stageEntryEventKey),
        )
      : previewCustomerIds;
    const audience = await resolveAutomationWhatsappAudience(
      customerIds,
      automation.overrideRecentBlock,
    );

    const runStatus: MessageAutomationRunStatus = audience.eligibleGroupIds.length
      ? resolveEligibleRunStatus(options.sendModeOverride ?? automation.sendMode)
      : "NO_MATCH";
    const run = await insertAutomationRun({
      automationId: automation.id,
      automationName: automation.name,
      status: runStatus,
      scheduledFor,
      audienceSnapshot: audience,
      mappedGroupCount: audience.eligibleGroupIds.length,
      unmappedCustomerCount: audience.unmappedCustomerIds.length,
      blockedRecentCount: audience.blockedGroupIds.length,
    });
    createdRun = run;

    if (run && runStatus === "ENQUEUED") {
      await createCampaignFromAutomationRun(automation, run, options.systemUser, "ENQUEUED");
    }

    if (run && stageEntryEventKey) {
      await markStageEntryCustomersHandled(automation.id, stageEntryEventKey, customerIds, run.id);
    }
  } catch (error) {
    createdRun = await insertAutomationRun({
      automationId: automation.id,
      automationName: automation.name,
      status: "FAILED",
      scheduledFor,
      audienceSnapshot: emptyAudienceSnapshot(),
      mappedGroupCount: 0,
      unmappedCustomerCount: 0,
      blockedRecentCount: 0,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  } finally {
    if (options.markSchedule) {
      await markAutomationExecuted(automation.id, scheduledFor, automation.schedule);
    }
  }
  return createdRun;
}

export async function runMessageAutomationNow(
  id: string,
  user: JwtUser,
  sendModeOverride?: MessageAutomationSendMode,
): Promise<MessageAutomationRun> {
  await ensureAutomationTables();
  const automation = await getAutomationById(id);
  if (!automation) {
    throw new HttpError(404, "Automacao nao encontrada.");
  }

  const scheduledFor = new Date().toISOString();
  const run = await executeResolvedMessageAutomation(automation, scheduledFor, {
    markSchedule: false,
    systemUser: user,
    sendModeOverride,
  });

  if (!run) {
    throw new HttpError(500, "Nao foi possivel carregar a execucao criada.");
  }
  return run;
}

export async function executeDueMessageAutomations(limit = 20) {
  await ensureAutomationTables();
  const result = await pool.query(
    `
      SELECT id
      FROM message_automations
      WHERE status = 'ACTIVE'
        AND next_run_at IS NOT NULL
        AND next_run_at <= NOW()
      ORDER BY next_run_at ASC
      LIMIT $1
    `,
    [limit],
  );

  for (const row of result.rows) {
    try {
      await executeMessageAutomation(String(row.id));
    } catch (error) {
      logger.error("failed to execute message automation", {
        automationId: String(row.id),
        error: String(error),
      });
    }
  }
}

export async function approveMessageAutomationRun(id: string, user: JwtUser): Promise<MessageAutomationRun> {
  await ensureAutomationTables();
  const run = await getAutomationRunById(id);
  if (!run) {
    throw new HttpError(404, "Execucao da automacao nao encontrada.");
  }

  if (run.status !== "PENDING_APPROVAL") {
    return run;
  }

  const automation = await getAutomationById(run.automationId);
  if (!automation) {
    throw new HttpError(404, "Automacao nao encontrada.");
  }

  await createCampaignFromAutomationRun(automation, run, user, "APPROVED");

  return (await getAutomationRunById(id))!;
}

export async function rejectMessageAutomationRun(id: string, user: JwtUser): Promise<MessageAutomationRun> {
  await ensureAutomationTables();
  const run = await getAutomationRunById(id);
  if (!run) {
    throw new HttpError(404, "Execucao da automacao nao encontrada.");
  }

  if (run.status !== "PENDING_APPROVAL") {
    return run;
  }

  await pool.query(
    `
      UPDATE message_automation_runs
      SET
        status = 'REJECTED',
        rejected_at = NOW(),
        rejected_by_user_id = $2,
        resolved_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
    `,
    [id, user.id],
  );

  return (await getAutomationRunById(id))!;
}

export function startMessageAutomationScheduler() {
  const run = () => {
    executeDueMessageAutomations().catch((error) => {
      logger.error("message automation scheduler failed", { error: String(error) });
    });
  };

  void run();
  const interval = setInterval(run, 60_000);

  return {
    async close() {
      clearInterval(interval);
    },
  };
}

import type {
  DealActivity,
  DealPriority,
  WhatsappAgentActivityConversationKind,
  WhatsappAgentActivityReport,
  WhatsappConversationReadStateResponse,
  WhatsappMonitorAgent,
  WhatsappMonitorConversation,
  WhatsappMonitorConversationDetail,
  WhatsappMonitorConversationsResponse,
  WhatsappMonitorMetrics,
  WhatsappMonitorMessage,
} from "@olist-crm/shared";
import { whatsappMonitorPool as pool, redis } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import { logger } from "../../lib/logger.js";
import { env } from "../../lib/env.js";
import type { JwtUser } from "../platform/authService.js";
import {
  markWhatsappChatAsUnread,
  sendWhatsappInstanceMediaMessage,
  sendWhatsappInstanceTextMessage,
  type EvolutionInstanceConfig,
  type EvolutionMessageKey,
} from "./evolutionService.js";
import {
  chooseWhatsappConversationContactName,
  computeWhatsappUnreadState,
  detectWhatsappMessageRisk,
  extractEvolutionFromMeFlag,
  extractEvolutionMessageContact,
  extractEvolutionMessageContext,
  extractEvolutionMessageMedia,
  formatWhatsappJidPhone,
  getEvolutionMessageKey,
  mapWhatsappActivityToMessage,
  median,
  mergeWhatsappMonitorMessages,
  isProfilePictureUrlExpired,
} from "./whatsappMonitorCore.js";
import { refreshWhatsappActivityRollups } from "./whatsappActivityRollupService.js";
import { getWhatsappConversationAliases } from "./whatsappIdentityService.js";
import { createEventFromMessage } from "../events/eventsService.js";
import { recordMonitorMessage } from "./whatsappMonitorMessages.js";

interface ConversationFilters {
  instanceId?: string;
  search?: string;
  contactName?: string;
  contactPhone?: string;
  period?: "today" | "yesterday" | "7d" | "30d";
  status?: "unread" | "risk";
  group?: "groups" | "contacts";
  agentInteraction?: "sent";
  limit?: number;
  cursor?: string;
  updatedSince?: string;
}

interface ConversationDetailOptions {
  limit?: number;
  before?: string;
  after?: string;
  instanceId?: string;
}

const ACTIVITY_REPORT_TIMEZONE = "America/Sao_Paulo";
const ACTIVITY_REPORT_NIGHT_START_HOUR = 18;
const ACTIVITY_REPORT_NIGHT_END_HOUR = 8;
const WHATSAPP_MONITOR_AGENT_CACHE_MS = 60_000;
const WHATSAPP_ACTIVITY_REPORT_CACHE_MS = 30_000;
const ACTIVITY_REPORT_CELL_CONVERSATION_LIMIT = 12;
const WHATSAPP_MONITOR_HISTORY_DAYS = 90;
const WHATSAPP_MONITOR_CONVERSATION_LIMIT = 25;
const WHATSAPP_MONITOR_CONVERSATION_MAX_LIMIT = 100;
const WHATSAPP_MONITOR_MESSAGE_LIMIT = 20;
const WHATSAPP_MONITOR_MESSAGE_MAX_LIMIT = 100;
const WHATSAPP_ACTIVITY_REPORT_CACHE_VERSION = "v2";

const whatsappMonitorAgentCache = new Map<string, { expiresAt: number; agents: WhatsappMonitorAgent[] }>();
const whatsappActivityReportCache = new Map<string, { expiresAt: number; report: WhatsappAgentActivityReport }>();
let whatsappActivityReportRefreshPromise: Promise<void> | null = null;

type WhatsappConversationCursor = {
  lastActivityAt: string;
  id: string;
};

type WhatsappMessageCursor = {
  createdAt: string;
  id: string;
  source: "activity" | "incoming";
};

function encodeCursor(payload: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor<T extends Record<string, unknown>>(cursor: string | null | undefined): T | null {
  if (!cursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as T) : null;
  } catch {
    return null;
  }
}

function boundedLimit(value: number | undefined, fallback: number, max: number) {
  const limit = Math.floor(Number(value ?? fallback));
  if (!Number.isFinite(limit) || limit <= 0) {
    return fallback;
  }

  return Math.min(limit, max);
}

function isValidDateString(value: string | undefined) {
  if (!value) {
    return false;
  }

  const time = new Date(value).getTime();
  return Number.isFinite(time);
}

function userCacheKey(user?: JwtUser) {
  return user ? `${user.role}:${user.id}:${user.name}` : "anonymous";
}

const INTERNAL_WHATSAPP_REPORT_JIDS = new Set([
  "120363024604307554@g.us",
  "120363024388010129@g.us",
  "120363044596886178@g.us",
  "120363045047058306@g.us",
  "120363029236155900@g.us",
  "120363031213889254@g.us",
  "120363122256330986@g.us",
  "120363152763097348@g.us",
  "120363155480608371@g.us",
  "120363142000640785@g.us",
  "120363179964808614@g.us",
  "120363218363642984@g.us",
  "120363219631231709@g.us",
  "120363227964128051@g.us",
  "120363239228364452@g.us",
  "120363228554629988@g.us",
  "120363284675472016@g.us",
  "120363303361235238@g.us",
  "120363302011320268@g.us",
  "120363301240196425@g.us",
  "120363330143238456@g.us",
  "120363388324650509@g.us",
  "120363402501055817@g.us",
  "120363421936412412@g.us",
  "120363420937498094@g.us",
  "120363420351854508@g.us",
  "120363404782149909@g.us",
  "120363185981602575@g.us",
  "120363134064333742@g.us",
  "120363048463637470@g.us",
  "120363044132316737@g.us",
  "120363025402961504@g.us",
  "120363278542101022@g.us",
  "120363335551619512@g.us",
  "120363024580077621@g.us",
  "120363422564243122@g.us",
  "120363422753753190@g.us",
  // Grupos internos adicionais vindos do node "Ignorar Grupos" do n8n (fonte oficial).
  "120363421089539075@g.us", // Comprovantes
  "120363400962278418@g.us", // Lixo
  "120363421552008670@g.us", // Rei Comprovantes
  "5511942224889@s.whatsapp.net", // Macedo (privado interno)
  "93755076042876@lid",
  "269603754213443@lid",
  "226362308726972@lid",
  "214997741375562:74@lid",
  "3960597401743@lid",
  "214997741375562:78@lid",
  "32624739369122@lid",
  "128441684885669@lid",
]);

const INTERNAL_WHATSAPP_REPORT_PHONE_DIGITS = new Set([
  "8617568919597",
  "5511911279702",
  "5511914898986",
  "5511915103835",
  "5511915863088",
  "5511916263525",
  "5511930890128",
  "5511944538074",
  "5511944705416",
  "5511945423284",
  "5511947879036",
  "5511951392256",
  "5511952960701",
  "5511958326930",
  "5511959502231",
  "5511964218475",
  "5511971086782",
  "5511975501901",
  "5511976001044",
  "5511978398236",
  "5511986168888",
  "5511988366300",
  "5511988807532",
  "5511991547568",
  "5511992112882",
  "5511996435466",
  "5511998595698",
]);

// ===========================================================================
// Roster do time POR NÚMERO (fonte: node "Switch" do n8n — sender_pn/sender_lid).
// Verificado na prod: sender_jid sempre vem como telefone real (@s.whatsapp.net),
// 0 @lid em uso — então casar por dígitos do número é suficiente e robusto.
//
// VENDEDORA = só as 5 instâncias conectadas (decisão do Felipe). Mensagem cujo
// remetente é uma vendedora conta como ENVIADA e é creditada a ela, independente
// de from_me (msg em grupo onde a instância dela não está chega com from_me=false).
// Inclui os @lid conhecidos por segurança caso o provider passe a usá-los.
const SALES_AGENT_BY_PHONE = new Map<string, { id: string; name: string }>([
  ["5511998595698", { id: "amanda", name: "Amanda" }],
  ["226362308726972", { id: "amanda", name: "Amanda" }],
  ["5511996435466", { id: "suelen", name: "Suelen" }],
  ["269603754213443", { id: "suelen", name: "Suelen" }],
  ["5511951392256", { id: "tamires", name: "Tamires" }],
  ["268044697878703", { id: "tamires", name: "Tamires" }],
  ["5511944705416", { id: "thais", name: "Thais" }],
  ["93755076042876", { id: "thais", name: "Thais" }],
  ["5511959502231", { id: "ragnar", name: "Ragnar" }],
  ["5511975501901", { id: "ragnar", name: "Ragnar" }],
  ["278971715473575", { id: "ragnar", name: "Ragnar" }],
  ["214997741375562", { id: "ragnar", name: "Ragnar" }],
]);
const SALES_AGENT_BY_NAME = new Map<string, { id: string; name: string }>([
  ["amanda", { id: "amanda", name: "Amanda" }],
  ["suelen", { id: "suelen", name: "Suelen" }],
  ["tamires", { id: "tamires", name: "Tamires" }],
  ["thais", { id: "thais", name: "Thais" }],
  ["ragnar", { id: "ragnar", name: "Ragnar" }],
  ["ragnar lothbrok", { id: "ragnar", name: "Ragnar" }],
]);
// Time INTERNO (não-vendedora): manda em grupo de cliente mas NÃO conta como
// conversa nem enviada (conversa interna entre o time). Fonte: mesmo Switch do n8n,
// todos os números que NÃO são uma das 5 vendedoras.
const INTERNAL_TEAM_SENDER_PHONES = new Set<string>([
  "5511911279702", // Felipe / Expor Telas
  "132791866028208", // Expor Telas (lid)
  "5511915863088", // Quedma / Hugo
  "5511916263525", // Camila
  "5511930890128", // Site
  "5511944538074", // Lucas
  "5511947879036", // Lili
  "5511971086782", // Iza - Defeitos
  "35013009666203", // Iza (lid)
  "5511914898986", // Felipe Zhao
  "5511978398236", // Ronaldo / Domingos
  "5511964218475", // Rafael / Rafa
  "5511976001044", // contabackupxp
  "5511915103835", // Conferência
  "5511958326930", // Motoboy Lucas
  "5511990224961", // Xp Factory
  "5511997431733", // XpBrasil Lili (alt)
  "32624739369122", // XpBrasil Lili (lid)
  "5511973422619", // XP Conferência 2 joey
  "74810310824049", // XP Conferência 2 joey (lid)
  "3960597401743", // Denis
  "128441684885669", // Valessa
]);
function reportPhoneDigits(jid: string | null | undefined): string {
  return whatsappReportJidDigits(jid);
}

const INTERNAL_WHATSAPP_REPORT_NAME_PATTERNS = [
  /^int\b.*xp brasil$/,
  /\binterno\b/,
  /^xp[-\s]?comprovante$/,
  /^xp telas$/,
  /^xp[-\s]?trocas\b/,
  /conferencia/,
  /uniao faz acucar/,
  /^xp[-\s]?atencao\b/,
  /^xp[-\s]?relatorio atendimento noturno$/,
  /^xp sistema novo$/,
  /^xp[-\s]?106b$/,
  /^xp[-\s]?correios$/,
  /^xp[-\s]?informativos$/,
  /^xp[-\s]?nf para cobrar cliente$/,
  /^xp[-\s]?modelos que nao temos$/,
  /^xp tecnicos$/,
  /^xp[-\s]?fechar caixas$/,
  /^xp[-\s]?recondicionado pecas$/,
  /^xp[-\s]?meninos$/,
  /^xp[-\s]?erros de conferencia/,
  /^xp contagem$/,
  /^xp equipe de solucoes$/,
  /^xp factory/,
  /^marketing xp$/,
  /^funcionario faltas$/,
  /^taxista valmir$/,
  /^romario taxista$/,
  /^xp[-\s]?saida de caixas$/,
  /^xp[-\s]?midias e posts$/,
];

function normalizeWhatsappReportJid(value: string | null | undefined) {
  return String(value ?? "").trim().toLocaleLowerCase("pt-BR");
}

function whatsappReportJidDigits(value: string | null | undefined) {
  const [localPart = ""] = normalizeWhatsappReportJid(value).split("@");
  return localPart.replace(/\D/g, "");
}

function isInternalWhatsappReportJid(remoteJid: string | null | undefined) {
  const jid = normalizeWhatsappReportJid(remoteJid);
  if (!jid) {
    return false;
  }

  if (jid.includes("status@broadcast") || jid.endsWith("@broadcast")) {
    return true;
  }

  if (INTERNAL_WHATSAPP_REPORT_JIDS.has(jid)) {
    return true;
  }

  const digits = whatsappReportJidDigits(jid);
  return Boolean(digits && INTERNAL_WHATSAPP_REPORT_PHONE_DIGITS.has(digits));
}

function isInternalWhatsappReportName(name: string | null | undefined) {
  const normalized = normalizeLabel(name);
  return Boolean(normalized && INTERNAL_WHATSAPP_REPORT_NAME_PATTERNS.some((pattern) => pattern.test(normalized)));
}

export function isInternalWhatsappReportChat(input: {
  isGroup?: boolean;
  name?: string | null;
  remoteJid?: string | null;
}) {
  if (isInternalWhatsappReportJid(input.remoteJid)) {
    return true;
  }

  // Os padrões de nome interno são específicos da equipe XP ("XP Conferência",
  // "XP Telas", "interno", etc.). Antes só filtravam GRUPO, mas há contatos internos
  // gravados como PRIVADO (ex.: "XP Conferência 2 joey" com jid @s.whatsapp.net) que
  // escapavam e apareciam como atendimento particular no relatório. Aplicamos a
  // grupo E privado — um cliente real não tem nome no padrão da equipe.
  return isInternalWhatsappReportName(input.name);
}

function isInternalChat(name: string | null | undefined, remoteJid: string | null | undefined): boolean {
  return isInternalWhatsappReportChat({ name, remoteJid });
}

// Monta um predicado SQL booleano "este chat é interno?" a partir das MESMAS constantes
// de isInternalWhatsappReportChat (jids + telefones + name-patterns) — FONTE ÚNICA, sem
// listas paralelas que dão drift. O rollup (heatmap) usa isto para filtrar os mesmos
// chats internos que o Resumo, garantindo que as duas telas batam.
// `jidCol`/`nameCol` são expressões SQL (ex.: "wmm.remote_jid", "d.title").
export function internalChatExclusionSql(jidCol: string, nameCol: string): string {
  const sqlList = (vals: Iterable<string>) =>
    [...vals].map((v) => `'${String(v).replace(/'/g, "''")}'`).join(", ");
  const jids = sqlList(INTERNAL_WHATSAPP_REPORT_JIDS);
  const phones = sqlList(INTERNAL_WHATSAPP_REPORT_PHONE_DIGITS);
  // Converte cada RegExp para regex POSIX do Postgres (\b -> \y, que é a borda de
  // palavra no Postgres). \s, \d etc. são suportados pela engine ARE do Postgres.
  const patterns = INTERNAL_WHATSAPP_REPORT_NAME_PATTERNS
    .map((rx) => `'${rx.source.replace(/\\b/g, "\\y").replace(/'/g, "''")}'`)
    .join(", ");
  const jidLower = `LOWER(COALESCE(${jidCol}, ''))`;
  const jidDigits = `REGEXP_REPLACE(SPLIT_PART(${jidLower}, '@', 1), '\\D', '', 'g')`;
  // normalizeLabel em SQL: minúsculo + remove acento (translate) + colapsa espaços.
  const normName =
    `REGEXP_REPLACE(TRANSLATE(LOWER(COALESCE(${nameCol}, '')), ` +
    `'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'), '\\s+', ' ', 'g')`;
  return `(
    ${jidLower} = 'status@broadcast' OR ${jidLower} LIKE '%@broadcast'
    OR ${jidLower} IN (${jids})
    OR (${jidDigits} <> '' AND ${jidDigits} IN (${phones}))
    OR ${normName} ~ ANY (ARRAY[${patterns}])
  )`;
}



function whatsappMonitorMessageMatchesInstanceSql(messageAlias: string, instanceAlias: string) {
  return `
    (
      LOWER(COALESCE(${messageAlias}.instance_name, '')) = LOWER(COALESCE(${instanceAlias}.instance_name, ''))
      OR (
        ${messageAlias}.direction = 'OUTBOUND'
        AND (
          (
            NULLIF(COALESCE(${instanceAlias}.assigned_user_name, ''), '') IS NOT NULL
            AND LOWER(COALESCE(${messageAlias}.sender_name, '')) = LOWER(${instanceAlias}.assigned_user_name)
          )
          OR (
            NULLIF(COALESCE(${instanceAlias}.display_label, ''), '') IS NOT NULL
            AND LOWER(REGEXP_REPLACE(COALESCE(${messageAlias}.sender_name, ''), '^xp\\s+', '', 'i')) =
                LOWER(REGEXP_REPLACE(COALESCE(${instanceAlias}.display_label, ''), '^xp\\s+', '', 'i'))
          )
          OR (
            NULLIF(COALESCE(${instanceAlias}.assigned_user_name, ''), '') IS NOT NULL
            AND LOWER(REGEXP_REPLACE(COALESCE(${messageAlias}.sender_name, ''), '^xp\\s+', '', 'i')) =
                LOWER(REGEXP_REPLACE(COALESCE(${instanceAlias}.assigned_user_name, ''), '^xp\\s+', '', 'i'))
          )
        )
      )
    )
  `;
}

function whatsappMonitorMessageStrictlyMatchesInstanceSql(messageAlias: string, instanceAlias: string) {
  return `
    LOWER(COALESCE(${messageAlias}.instance_name, '')) = LOWER(COALESCE(${instanceAlias}.instance_name, ''))
  `;
}

function conversationMatchesInstanceSql(instanceAlias: string) {
  const messageMatchesInstance = whatsappMonitorMessageMatchesInstanceSql("wmm_inst", instanceAlias);
  const strictMessageMatchesInstance = whatsappMonitorMessageStrictlyMatchesInstanceSql("wmm_inst", instanceAlias);
  return `
    (
      (
        d.whatsapp_jid LIKE '%@g.us'
        AND (
          d.whatsapp_instance_id = ${instanceAlias}.id
          OR EXISTS (
            SELECT 1
            FROM whatsapp_monitor_messages wmm_inst
            WHERE wmm_inst.deal_id = d.id
              AND ${messageMatchesInstance}
          )
        )
      )
      OR (
        d.whatsapp_jid NOT LIKE '%@g.us'
        AND (
          d.whatsapp_instance_id = ${instanceAlias}.id
          OR (
            d.whatsapp_instance_id IS NULL
            AND EXISTS (
              SELECT 1
              FROM whatsapp_monitor_messages wmm_inst
              WHERE wmm_inst.deal_id = d.id
                AND ${strictMessageMatchesInstance}
            )
          )
        )
      )
    )
  `;
}

function buildConversationMatchesInstanceSql(
  instance: { id: string; instance_name: string; assigned_user_name: string | null; display_label: string | null },
  params: unknown[],
) {
  params.push(instance.id);
  const idParamIndex = params.length;

  params.push(instance.instance_name || "");
  const nameParamIndex = params.length;

  const hasUserName = !!instance.assigned_user_name?.trim();
  const hasDisplayLabel = !!instance.display_label?.trim();

  let outboundSql = "";
  if (hasUserName || hasDisplayLabel) {
    const outboundConditions: string[] = [];
    if (hasUserName) {
      params.push(instance.assigned_user_name!.trim());
      const userNameParamIndex = params.length;
      outboundConditions.push(`LOWER(COALESCE(wmm_inst.sender_name, '')) = LOWER($${userNameParamIndex})`);
      outboundConditions.push(`LOWER(REGEXP_REPLACE(COALESCE(wmm_inst.sender_name, ''), '^xp\\s+', '', 'i')) = LOWER(REGEXP_REPLACE($${userNameParamIndex}, '^xp\\s+', '', 'i'))`);
    }
    if (hasDisplayLabel) {
      params.push(instance.display_label!.trim());
      const displayLabelParamIndex = params.length;
      outboundConditions.push(`LOWER(REGEXP_REPLACE(COALESCE(wmm_inst.sender_name, ''), '^xp\\s+', '', 'i')) = LOWER(REGEXP_REPLACE($${displayLabelParamIndex}, '^xp\\s+', '', 'i'))`);
    }
    outboundSql = `OR (
      wmm_inst.direction = 'OUTBOUND'
      AND (${outboundConditions.join(" OR ")})
    )`;
  }

  return `
    (
      (
        d.whatsapp_jid LIKE '%@g.us'
        AND (
          d.whatsapp_instance_id = $${idParamIndex}::uuid
          OR EXISTS (
            SELECT 1
            FROM whatsapp_monitor_messages wmm_inst
            WHERE wmm_inst.deal_id = d.id
              AND (
                LOWER(COALESCE(wmm_inst.instance_name, '')) = LOWER($${nameParamIndex})
                ${outboundSql}
              )
          )
        )
      )
      OR (
        d.whatsapp_jid NOT LIKE '%@g.us'
        AND (
          d.whatsapp_instance_id = $${idParamIndex}::uuid
          OR (
            d.whatsapp_instance_id IS NULL
            AND EXISTS (
              SELECT 1
              FROM whatsapp_monitor_messages wmm_inst
              WHERE wmm_inst.deal_id = d.id
                AND LOWER(COALESCE(wmm_inst.instance_name, '')) = LOWER($${nameParamIndex})
            )
          )
        )
      )
    )
  `;
}

function whatsappMonitorRawRemoteJidSql(messageAlias: string) {
  return `
    NULLIF(
      COALESCE(
        ${messageAlias}.media_json #>> '{key,remoteJid}',
        ${messageAlias}.media_json ->> 'remoteJid'
      ),
      ''
    )
  `;
}

function whatsappMonitorConversationRemoteScopeSql(messageAlias: string, aliasesParamIndex: number | null, isGroup: boolean) {
  const rawRemoteJid = whatsappMonitorRawRemoteJidSql(messageAlias);

  if (isGroup) {
    if (aliasesParamIndex === null) {
      throw new Error("aliasesParamIndex e obrigatorio para conversas de grupo");
    }
    return `
      AND ${messageAlias}.remote_jid = ANY($${aliasesParamIndex}::text[])
      AND COALESCE(${rawRemoteJid}, ${messageAlias}.remote_jid) = ANY($${aliasesParamIndex}::text[])
    `;
  }

  // 1:1 chats: rows are already scoped by deal_id (linked deals of this chat),
  // so requiring remote_jid to be in the alias set silently dropped messages
  // stored under a LID/PN variant that was never registered in
  // whatsapp_jid_aliases. Only group messages must be excluded here.
  return `
    AND COALESCE(${rawRemoteJid}, ${messageAlias}.remote_jid, '') NOT LIKE '%@g.us'
  `;
}

function dealActivityRawRemoteJidSql(activityAlias: string) {
  return `
    NULLIF(
      COALESCE(
        ${activityAlias}.metadata ->> 'remoteJid',
        ${activityAlias}.metadata #>> '{providerPayload,key,remoteJid}'
      ),
      ''
    )
  `;
}

function dealActivityConversationRemoteScopeSql(activityAlias: string, aliasesParamIndex: number | null, isGroup: boolean) {
  const rawRemoteJid = dealActivityRawRemoteJidSql(activityAlias);

  if (isGroup) {
    if (aliasesParamIndex === null) {
      throw new Error("aliasesParamIndex e obrigatorio para conversas de grupo");
    }
    return `
      AND ${rawRemoteJid} = ANY($${aliasesParamIndex}::text[])
    `;
  }

  // Same rationale as whatsappMonitorConversationRemoteScopeSql: activities are
  // already scoped by deal_id, so only group payloads need to be excluded.
  return `
    AND COALESCE(${rawRemoteJid}, '') NOT LIKE '%@g.us'
  `;
}

function dealActivityMatchesInstanceSql(activityAlias: string, instanceAlias: string) {
  return `
    (
      LOWER(COALESCE(${activityAlias}.metadata ->> 'instance', '')) = LOWER(COALESCE(${instanceAlias}.instance_name, ''))
      OR ${activityAlias}.metadata ->> 'instanceId' = ${instanceAlias}.id::text
      OR (
        ${activityAlias}.activity_type = 'WHATSAPP_SENT'
        AND (
          (
            NULLIF(COALESCE(${instanceAlias}.assigned_user_name, ''), '') IS NOT NULL
            AND LOWER(COALESCE(${activityAlias}.actor_name, '')) = LOWER(${instanceAlias}.assigned_user_name)
          )
          OR (
            NULLIF(COALESCE(${instanceAlias}.display_label, ''), '') IS NOT NULL
            AND LOWER(REGEXP_REPLACE(COALESCE(${activityAlias}.actor_name, ''), '^xp\\s+', '', 'i')) =
                LOWER(REGEXP_REPLACE(COALESCE(${instanceAlias}.display_label, ''), '^xp\\s+', '', 'i'))
          )
          OR (
            NULLIF(COALESCE(${instanceAlias}.assigned_user_name, ''), '') IS NOT NULL
            AND LOWER(REGEXP_REPLACE(COALESCE(${activityAlias}.actor_name, ''), '^xp\\s+', '', 'i')) =
                LOWER(REGEXP_REPLACE(COALESCE(${instanceAlias}.assigned_user_name, ''), '^xp\\s+', '', 'i'))
          )
        )
      )
    )
  `;
}

function conversationSafeProfileJoinSql() {
  return `
    LEFT JOIN LATERAL (
      SELECT candidate.url AS profile_picture_url
      FROM (
        VALUES
          -- Permanent re-hosted avatar wins, EXCEPT: never show the agent's own
          -- photo for a 1:1 contact. We check the cached ORIGINAL source URL
          -- against active instance avatars (the cached endpoint URL can't be
          -- matched directly) plus the agent display-name guard. Groups always
          -- use the cached group icon.
          (
            CASE
              WHEN d.whatsapp_jid LIKE '%@g.us' THEN chat_profile.cached_picture_url
              WHEN chat_profile.cached_picture_url IS NOT NULL
                AND NOT EXISTS (
                  SELECT 1 FROM whatsapp_instances wi_self
                  WHERE wi_self.status = 'ACTIVE'
                    AND wi_self.profile_picture_url IS NOT NULL
                    AND split_part(wi_self.profile_picture_url, '?', 1) = split_part(COALESCE(chat_profile.cached_source_url, ''), '?', 1)
                )
                AND NOT (
                  LOWER(COALESCE(chat_profile.display_name, '')) = LOWER(COALESCE(selected_filter_instance.display_label, wi.display_label, d.assigned_to_name, ''))
                  OR LOWER(REGEXP_REPLACE(COALESCE(chat_profile.display_name, ''), '^xp\s+', '', 'i')) =
                     LOWER(REGEXP_REPLACE(COALESCE(selected_filter_instance.assigned_user_name, wi.assigned_user_name, d.assigned_to_name, ''), '^xp\s+', '', 'i'))
                )
                THEN chat_profile.cached_picture_url
              ELSE NULL
            END,
            0
          ),
          (
            CASE
              WHEN d.whatsapp_jid NOT LIKE '%@g.us'
                AND latest_whatsapp.direction = 'INBOUND'
                THEN COALESCE(latest_whatsapp.sender_pic_url, latest_whatsapp.media_json ->> 'chatProfilePictureUrl')
              ELSE NULL
            END,
            1
          ),
          (
            CASE
              WHEN d.whatsapp_jid NOT LIKE '%@g.us'
                THEN incoming_inbound_profile.inbound_sender_picture
              ELSE NULL
            END,
            2
          ),
          (
            CASE
              WHEN d.whatsapp_jid LIKE '%@g.us'
                THEN COALESCE(incoming_profile.chat_profile_picture_url, chat_profile.profile_picture_url, incoming_inbound_profile.inbound_chat_picture)
              ELSE NULL
            END,
            3
          ),
          (
            CASE
              WHEN d.whatsapp_jid NOT LIKE '%@g.us'
                AND NOT (
                  LOWER(COALESCE(chat_profile.display_name, '')) = LOWER(COALESCE(selected_filter_instance.display_label, wi.display_label, d.assigned_to_name, ''))
                  OR LOWER(REGEXP_REPLACE(COALESCE(chat_profile.display_name, ''), '^xp\\s+', '', 'i')) =
                     LOWER(REGEXP_REPLACE(COALESCE(selected_filter_instance.assigned_user_name, wi.assigned_user_name, d.assigned_to_name, ''), '^xp\\s+', '', 'i'))
                )
                THEN chat_profile.profile_picture_url
              ELSE NULL
            END,
            4
          )
      ) AS candidate(url, priority)
      WHERE NULLIF(candidate.url, '') IS NOT NULL
        AND (
          d.whatsapp_jid LIKE '%@g.us'
          OR NOT EXISTS (
            SELECT 1
            FROM whatsapp_instances wi_avatar
            WHERE wi_avatar.status = 'ACTIVE'
              AND wi_avatar.profile_picture_url IS NOT NULL
              AND split_part(wi_avatar.profile_picture_url, '?', 1) = split_part(candidate.url, '?', 1)
          )
        )
      ORDER BY candidate.priority ASC
      LIMIT 1
    ) safe_profile ON true
  `;
}

function monitorableWhatsappJidSql(expression: string) {
  return `
    (
      ${expression} IS NOT NULL
      AND LOWER(${expression}) <> 'status@broadcast'
      AND LOWER(${expression}) NOT LIKE '%@broadcast'
    )
  `;
}

function isoDate(value: unknown, fallback = new Date()) {
  return new Date(String(value ?? fallback.toISOString())).toISOString();
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function optionalBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value === 1;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLocaleLowerCase("pt-BR");
    if (["true", "1", "yes", "sim"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "nao", "não"].includes(normalized)) {
      return false;
    }
  }

  return null;
}

function normalizeLabel(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return null;
}

function resolveWhatsappActivityFromMe(row: Record<string, unknown>, metadata = asRecord(row.metadata) ?? {}) {
  const incomingPayload = asRecord(row.incoming_raw_payload);
  const providerFromMe = incomingPayload ? extractEvolutionFromMeFlag(incomingPayload as any) : null;
  const storedIncomingFromMe = optionalBoolean(row.incoming_from_me);
  const metadataFromMe =
    optionalBoolean(metadata.fromMe) ??
    optionalBoolean(metadata.isOutbound) ??
    optionalBoolean(metadata.capturedFromWhatsapp) ??
    optionalBoolean(metadata.sentFromMonitor);

  return providerFromMe ?? storedIncomingFromMe ?? metadataFromMe;
}

function isWhatsappActivityOutbound(row: Record<string, unknown>, metadata = asRecord(row.metadata) ?? {}) {
  return resolveWhatsappActivityFromMe(row, metadata) ?? (String(row.activity_type) === "WHATSAPP_SENT");
}

function whatsappActivityHasMedia(row: Record<string, unknown>, metadata = asRecord(row.metadata) ?? {}) {
  if (
    "fileName" in metadata ||
    "filename" in metadata ||
    "mediaName" in metadata ||
    "mimetype" in metadata ||
    "mediaType" in metadata ||
    String(metadata.mediaType || "").trim() !== "" ||
    String(metadata.mimetype || "").trim() !== ""
  ) {
    return true;
  }

  const content = String(row.content || "");
  if (
    content.startsWith("[Imagem]") ||
    content.startsWith("[Vídeo]") ||
    content.startsWith("[Áudio]") ||
    content.startsWith("[Sticker]") ||
    content.startsWith("[Documento]")
  ) {
    return true;
  }

  const incomingPayload = asRecord(row.incoming_raw_payload);
  return incomingPayload ? Boolean(extractEvolutionMessageMedia(incomingPayload as any)) : false;
}

function extractProviderMessageId(payload: Record<string, unknown>) {
  const key = asRecord(payload.key);
  const keyId = optionalString(key?.id);
  return keyId ?? optionalString(payload.messageId) ?? optionalString(payload.id);
}

function riskSql(alias: string) {
  return `
    (
      lower(COALESCE(${alias}.content, '')) LIKE '%porra%'
      OR lower(COALESCE(${alias}.content, '')) LIKE '%caralho%'
      OR lower(COALESCE(${alias}.content, '')) LIKE '%merda%'
      OR lower(COALESCE(${alias}.content, '')) LIKE '%puta%'
      OR lower(COALESCE(${alias}.content, '')) LIKE '%fdp%'
      OR lower(COALESCE(${alias}.content, '')) LIKE '%senha%'
      OR lower(COALESCE(${alias}.content, '')) LIKE '%cartao de credito%'
      OR lower(COALESCE(${alias}.content, '')) LIKE '%token%'
      OR lower(COALESCE(${alias}.content, '')) LIKE '%urgente%'
      OR lower(COALESCE(${alias}.content, '')) LIKE '%processo%'
      OR lower(COALESCE(${alias}.content, '')) LIKE '%reclamacao%'
      OR lower(COALESCE(${alias}.content, '')) LIKE '%procon%'
      OR lower(COALESCE(${alias}.content, '')) LIKE '%cancelar%'
    )
  `;
}

function mapAgentRow(row: Record<string, unknown>): WhatsappMonitorAgent {
  return {
    id: String(row.id),
    instanceName: String(row.instance_name),
    displayLabel: String(row.display_label),
    phoneNumber: row.phone_number ? String(row.phone_number) : null,
    status: String(row.status ?? "ACTIVE") as WhatsappMonitorAgent["status"],
    isDefault: Boolean(row.is_default),
    provider: String(row.provider ?? "EVOLUTION") as WhatsappMonitorAgent["provider"],
    assignedUserId: row.assigned_user_id ? String(row.assigned_user_id) : null,
    assignedUserName: row.assigned_user_name ? String(row.assigned_user_name) : null,
    lastHealthStatus: row.last_health_status ? String(row.last_health_status) : null,
    lastHealthCheckAt: row.last_health_check_at ? isoDate(row.last_health_check_at) : null,
    profilePictureUrl: optionalString(row.profile_picture_url),
    conversationCount: Number(row.conversation_count ?? 0),
    riskCount: Number(row.risk_count ?? 0),
    lastMessageAt: row.last_message_at ? isoDate(row.last_message_at) : null,
    sector: row.sector ? String(row.sector) : null,
    managerName: row.manager_name ? String(row.manager_name) : null,
    contactEmail: row.contact_email ? String(row.contact_email) : null,
  };
}

function mapConversationRow(row: Record<string, unknown>, skipRefresh = false): WhatsappMonitorConversation {
  const remoteJid = row.canonical_whatsapp_jid
    ? String(row.canonical_whatsapp_jid)
    : row.whatsapp_jid
      ? String(row.whatsapp_jid)
      : null;
  const lastMessage = row.last_message_content ? String(row.last_message_content) : null;
  const rawTitle = optionalString(row.title) ?? optionalString(row.customer_display_name);
  const title = rawTitle ?? "Conversa sem nome";
  const isGroup = Boolean(remoteJid?.endsWith("@g.us"));
  const contactName = chooseWhatsappConversationContactName({
    remoteJid,
    isGroup,
    chatDisplayName: optionalString(row.chat_display_name),
    customerDisplayName: optionalString(row.customer_display_name),
    title: rawTitle,
    agentName: optionalString(row.agent_name),
    assignedUserName: optionalString(row.assigned_to_name),
    instanceName: optionalString(row.instance_name),
    instanceLabel: optionalString(row.instance_display_label),
    inboundSenderName: optionalString(row.inbound_sender_name),
  });
  const markedUnread = Boolean(row.marked_unread);
  const unreadState = computeWhatsappUnreadState(Number(row.unread_after_read ?? 0), markedUnread);

  const profilePictureUrl = optionalString(row.profile_picture_url);
  if (remoteJid && !skipRefresh && isProfilePictureUrlExpired(profilePictureUrl)) {
    import("./evolutionMetadataService.js").then((m) => {
      m.refreshWhatsappChatProfile(remoteJid, (row.instance_name || row.user_active_instance_name) ? String(row.instance_name || row.user_active_instance_name) : null)
        .catch((err) => logger.warn("Failed to refresh expired or missing whatsapp profile picture in background", { remoteJid, error: String(err) }));
    }).catch(() => {});
  }

  return {
    id: String(row.id),
    dealId: String(row.id),
    title,
    contactName,
    contactPhone: formatWhatsappJidPhone(remoteJid),
    remoteJid,
    isGroup,
    profilePictureUrl,
    whatsappInstanceId: row.whatsapp_instance_id ? String(row.whatsapp_instance_id) : null,
    instanceName: row.instance_name ? String(row.instance_name) : null,
    agentName: row.agent_name ? String(row.agent_name) : null,
    stageName: row.stage_name ? String(row.stage_name) : null,
    priority: String(row.priority ?? "MEDIUM") as DealPriority,
    lastMessage,
    lastMessageAt: isoDate(row.last_message_at ?? row.last_activity_at ?? row.created_at),
    unreadCount: unreadState.unreadCount,
    isUnread: unreadState.isUnread,
    markedUnread,
    lastReadAt: row.last_read_at ? isoDate(row.last_read_at) : null,
    eventCount: Number(row.event_count ?? 0),
    risk: detectWhatsappMessageRisk(lastMessage),
  };
}

function mapActivityRow(row: Record<string, unknown>): DealActivity {
  const baseMetadata = row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {};
  const incomingPayload = asRecord(row.incoming_raw_payload);
  const incomingMedia = incomingPayload ? extractEvolutionMessageMedia(incomingPayload as any) : null;
  const incomingContact = incomingPayload ? extractEvolutionMessageContact(incomingPayload as any) : null;
  const incomingContext = incomingPayload ? extractEvolutionMessageContext(incomingPayload as any, optionalString(row.instance_name)) : null;
  const providerFromMe = incomingPayload ? extractEvolutionFromMeFlag(incomingPayload as any) : null;
  const resolvedFromMe = resolveWhatsappActivityFromMe(row, baseMetadata);
  const isSent = resolvedFromMe ?? (row.activity_type === "WHATSAPP_SENT");

  const metadata: Record<string, unknown> = {
    ...baseMetadata,
    ...(incomingMedia ? incomingMedia : {}),
    ...(incomingContact ? { contact: incomingContact } : {}),
    ...(resolvedFromMe !== null
      ? {
        fromMe: resolvedFromMe,
        isOutbound: resolvedFromMe,
        capturedFromWhatsapp: resolvedFromMe,
        ...(resolvedFromMe
          ? { outboundSource: baseMetadata.outboundSource ?? (providerFromMe === true ? "whatsapp_device" : "whatsapp_api") }
          : {}),
      }
      : {}),
  };
  const participantName = optionalString(row.participant_display_name);
  const participantProfilePictureUrl = optionalString(row.participant_profile_picture_url);

  return {
    id: String(row.id),
    dealId: String(row.deal_id),
    activityType: (isSent ? "WHATSAPP_SENT" : "WHATSAPP_RECEIVED") as DealActivity["activityType"],
    actorName: row.actor_name ? String(row.actor_name) : null,
    content: row.content ? String(row.content) : null,
    metadata: {
      ...metadata,
      senderName: metadata.senderName ?? participantName,
      senderJid: metadata.senderJid ?? incomingContext?.senderJid,
      senderProfilePictureUrl: metadata.senderProfilePictureUrl ?? participantProfilePictureUrl,
    },
    createdAt: isoDate(row.created_at),
  };
}

function localDateParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ACTIVITY_REPORT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return { year, month, day };
}

function localDateKey(value: Date) {
  const { year, month, day } = localDateParts(value);
  return `${year}-${month}-${day}`;
}

function buildActivityReportDays(days: number): WhatsappAgentActivityReport["days"] {
  const today = new Date();
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: ACTIVITY_REPORT_TIMEZONE,
    weekday: "long",
  });

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - (days - 1 - index));
    const key = localDateKey(date);
    const [, month = "01", day = "01"] = key.match(/^\d{4}-(\d{2})-(\d{2})$/) ?? [];

    return {
      date: key,
      label: `${day}/${month}`,
      weekday: formatter.format(date),
    };
  });
}

export function classifyWhatsappReportConversation(input: {
  isGroup: boolean;
  name: string | null;
  remoteJid?: string | null;
}): WhatsappAgentActivityConversationKind {
  if (!input.isGroup) {
    return "private";
  }

  if (isInternalWhatsappReportChat({ isGroup: input.isGroup, name: input.name, remoteJid: input.remoteJid })) {
    return "internal_group";
  }

  const normalized = normalizeLabel(input.name);

  if (/^(cliente|clientes|cl)(\b|[\s\-_:.\d#])/.test(normalized) || /\b(cl|kh|lj)\d+\b/.test(normalized)) {
    return "customer_group";
  }

  if (/(interno|equipe|time|vendedor|vendedora|vendas|financeiro|diretoria|gestao|gestor)/.test(normalized)) {
    return "internal_group";
  }

  return "other_group";
}

function conversationProfileJoinSql() {
  const conversationInstance = "COALESCE(selected_filter_instance.instance_name, wi.instance_name, latest_whatsapp.instance_name, latest_whatsapp.media_json ->> 'instance', '')";
  const canonicalJid = "COALESCE(conversation_alias.canonical_jid, d.whatsapp_jid)";
  const profileJidMatch = (alias: string) => `
    (
      ${alias}.remote_jid = d.whatsapp_jid
      OR ${alias}.remote_jid = ${canonicalJid}
      OR EXISTS (
        SELECT 1
        FROM whatsapp_jid_aliases wja_profile
        WHERE LOWER(wja_profile.instance_name) = LOWER(${conversationInstance})
          AND wja_profile.canonical_jid = ${canonicalJid}
          AND wja_profile.alias_jid = ${alias}.remote_jid
      )
    )
  `;

  return `
    LEFT JOIN LATERAL (
      SELECT wcp.display_name, wcp.profile_picture_url, wcp.cached_picture_url, wcp.cached_source_url
      FROM whatsapp_chat_profiles wcp
      WHERE ${profileJidMatch("wcp")}
        AND (
          wcp.instance_name = ${conversationInstance}
          OR wcp.instance_name = ''
          OR d.whatsapp_jid LIKE '%@g.us'
        )
      ORDER BY
        CASE WHEN wcp.remote_jid = ${canonicalJid} THEN 0 ELSE 1 END,
        CASE WHEN wcp.instance_name = ${conversationInstance} THEN 0 ELSE 1 END,
        wcp.updated_at DESC
      LIMIT 1
    ) chat_profile ON true
    -- PERF: these two profile LATERALs used to scan the 153k-row
    -- whatsapp_incoming_messages table per conversation row (the OR-EXISTS on
    -- jid aliases defeats the remote_jid index), which made the conversations
    -- query time out (30s -> HTTP 500), worst on groups. Name + picture are now
    -- materialized into whatsapp_chat_profiles (chat_profile LATERAL, indexed),
    -- so these are replaced by constant NULLs to keep the same output columns
    -- without the table scan.
    LEFT JOIN LATERAL (
      SELECT NULL::text AS chat_display_name, NULL::text AS chat_profile_picture_url
    ) incoming_profile ON true
    LEFT JOIN LATERAL (
      SELECT NULL::text AS inbound_sender_name, NULL::text AS inbound_sender_picture, NULL::text AS inbound_chat_picture
    ) incoming_inbound_profile ON true
  `;
}

function conversationBaseSelectSql(userIdParamIndex: number, scopedInstanceIdParamIndex?: number) {
  const selectedInstanceJoin = scopedInstanceIdParamIndex
    ? `LEFT JOIN whatsapp_instances selected_filter_instance ON selected_filter_instance.id = $${scopedInstanceIdParamIndex}`
    : "LEFT JOIN whatsapp_instances selected_filter_instance ON false";
  const selectedMessageScope = (alias: string) => scopedInstanceIdParamIndex
    ? `
      AND (
        d.whatsapp_jid LIKE '%@g.us'
        OR ${whatsappMonitorMessageMatchesInstanceSql(alias, "selected_filter_instance")}
      )
    `
    : "";

  return `
    SELECT
      d.*,
      ps.name AS stage_name,
      COALESCE(conversation_alias.canonical_jid, d.whatsapp_jid) AS canonical_whatsapp_jid,
      COALESCE(selected_filter_instance.instance_name, wi.instance_name, latest_whatsapp.instance_name, latest_whatsapp.media_json ->> 'instance') AS instance_name,
      COALESCE(selected_filter_instance.display_label, wi.display_label, latest_whatsapp.instance_name, latest_whatsapp.media_json ->> 'instance') AS instance_display_label,
      COALESCE(selected_filter_instance.display_label, wi.display_label, d.assigned_to_name, latest_whatsapp.sender_name) AS agent_name,
      user_active_instance.user_active_instance_name AS user_active_instance_name,
      CASE WHEN d.whatsapp_jid LIKE '%@g.us'
        THEN COALESCE(
          NULLIF(wg.source_name, ''),
          NULLIF(latest_whatsapp.media_json ->> 'chatDisplayName', ''),
          NULLIF(incoming_profile.chat_display_name, ''),
          NULLIF(chat_profile.display_name, '')
        )
        ELSE COALESCE(
          chat_profile.display_name,
          latest_whatsapp.media_json ->> 'chatDisplayName',
          incoming_profile.chat_display_name
        )
      END AS chat_display_name,
      incoming_inbound_profile.inbound_sender_name AS inbound_sender_name,
      safe_profile.profile_picture_url AS profile_picture_url,
      CASE
        WHEN d.whatsapp_jid LIKE '%@g.us'
          THEN COALESCE(group_latest_message.content, latest_whatsapp.content)
        ELSE latest_whatsapp.content
      END AS last_message_content,
      CASE
        WHEN d.whatsapp_jid LIKE '%@g.us'
          THEN COALESCE(group_latest_message.created_at, activity_stats.last_message_at, d.last_activity_at, d.created_at)
        ELSE COALESCE(activity_stats.last_message_at, d.last_activity_at, d.created_at)
      END AS last_message_at,
      COALESCE(activity_stats.event_count, 0)::int AS event_count,
      COALESCE(activity_stats.inbound_count, 0)::int AS inbound_count,
      COALESCE((
        SELECT COUNT(*)
        FROM whatsapp_monitor_messages unread_msg
        WHERE unread_msg.deal_id = d.id
          AND unread_msg.direction = 'INBOUND'
          AND (
            conversation_reads.last_read_at IS NULL
            OR unread_msg.created_at > conversation_reads.last_read_at
          )
      ), 0)::int AS unread_after_read,
      COALESCE(conversation_reads.force_unread, false) AS marked_unread,
      conversation_reads.last_read_at
    FROM deals d
    LEFT JOIN pipeline_stages ps ON ps.id = d.stage_id
    LEFT JOIN whatsapp_instances wi ON wi.id = d.whatsapp_instance_id
    ${selectedInstanceJoin}
    LEFT JOIN LATERAL (
      SELECT *
      FROM whatsapp_monitor_messages wmm
      WHERE wmm.deal_id = d.id
        ${selectedMessageScope("wmm")}
      ORDER BY wmm.created_at DESC, wmm.id DESC
      LIMIT 1
    ) latest_whatsapp ON true
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS event_count,
        COUNT(*) FILTER (WHERE wmm.direction = 'INBOUND')::int AS inbound_count,
        MAX(wmm.created_at) AS last_message_at
      FROM whatsapp_monitor_messages wmm
      WHERE wmm.deal_id = d.id
        ${selectedMessageScope("wmm")}
    ) activity_stats ON true
    LEFT JOIN LATERAL (
      -- Group chats are shared across every connected instance. The webhook now
      -- stores each group message only once (idempotency dedup), so the list
      -- preview / last message for a group is derived from the canonical
      -- whatsapp_incoming_messages row by remote_jid, ignoring which instance
      -- physically received it. This keeps the preview visible to every seller
      -- who has a deal for that group. Private (1:1) chats keep deriving the
      -- preview from their own whatsapp_monitor_messages rows.
      SELECT
        wim_group.message_text AS content,
        wim_group.created_at AS created_at
      FROM whatsapp_incoming_messages wim_group
      WHERE d.whatsapp_jid LIKE '%@g.us'
        AND wim_group.remote_jid = d.whatsapp_jid
      ORDER BY wim_group.created_at DESC, wim_group.id DESC
      LIMIT 1
    ) group_latest_message ON true
    LEFT JOIN whatsapp_conversation_reads conversation_reads
      ON conversation_reads.deal_id = d.id
      AND conversation_reads.user_id = $${userIdParamIndex}
    LEFT JOIN LATERAL (
      SELECT wja.canonical_jid
      FROM whatsapp_jid_aliases wja
      WHERE LOWER(wja.instance_name) = LOWER(COALESCE(selected_filter_instance.instance_name, wi.instance_name, latest_whatsapp.instance_name, latest_whatsapp.media_json ->> 'instance', ''))
        AND wja.alias_jid = d.whatsapp_jid
      ORDER BY wja.updated_at DESC
      LIMIT 1
    ) conversation_alias ON true
    LEFT JOIN whatsapp_groups wg
      ON wg.jid = COALESCE(conversation_alias.canonical_jid, d.whatsapp_jid)
    LEFT JOIN LATERAL (
      SELECT wi_user.instance_name AS user_active_instance_name
      FROM whatsapp_instances wi_user
      WHERE wi_user.assigned_user_id::text = $${userIdParamIndex}::text
        AND wi_user.status = 'ACTIVE'
      ORDER BY wi_user.is_default DESC, wi_user.id DESC
      LIMIT 1
    ) user_active_instance ON true
    ${conversationProfileJoinSql()}
    ${conversationSafeProfileJoinSql()}
  `;
}

function activityPeriodRangeSql(expression: string, period: NonNullable<ConversationFilters["period"]>) {
  const today = `timezone('${ACTIVITY_REPORT_TIMEZONE}', NOW())::date`;
  const rangeStart =
    period === "today"
      ? today
      : period === "yesterday"
        ? `${today} - INTERVAL '1 day'`
        : period === "7d"
          ? `${today} - INTERVAL '6 days'`
          : `${today} - INTERVAL '29 days'`;
  const rangeEnd = period === "yesterday" ? today : `${today} + INTERVAL '1 day'`;

  return `
    ${expression} >= ((${rangeStart}) AT TIME ZONE '${ACTIVITY_REPORT_TIMEZONE}')
    AND ${expression} < ((${rangeEnd}) AT TIME ZONE '${ACTIVITY_REPORT_TIMEZONE}')
  `;
}

function conversationPeriodSql(period: NonNullable<ConversationFilters["period"]>) {
  return activityPeriodRangeSql("activity_stats.last_message_at", period);
}

function outboundWhatsappActivitySql(alias: string) {
  return `
    (
      ${alias}.activity_type = 'WHATSAPP_SENT'
      OR LOWER(COALESCE(
        ${alias}.metadata ->> 'fromMe',
        ${alias}.metadata ->> 'isOutbound',
        ${alias}.metadata ->> 'sentFromMonitor',
        ''
      )) IN ('true', '1', 'yes', 'sim')
    )
  `;
}

function selectedAgentInteractionSql(instanceIdParamIndex: number, period?: ConversationFilters["period"]) {
  return `
    EXISTS (
      SELECT 1
      FROM whatsapp_monitor_messages wmm_agent
      JOIN whatsapp_instances agent_interaction_instance
        ON agent_interaction_instance.id = $${instanceIdParamIndex}
      WHERE wmm_agent.deal_id = d.id
        AND wmm_agent.direction = 'OUTBOUND'
        AND ${whatsappMonitorMessageMatchesInstanceSql("wmm_agent", "agent_interaction_instance")}
        ${period ? `AND ${activityPeriodRangeSql("wmm_agent.created_at", period)}` : ""}
    )
  `;
}

function unreadConversationSql(scopedInstanceIdParamIndex?: number) {
  const instanceJoin = scopedInstanceIdParamIndex
    ? `JOIN whatsapp_instances selected_unread_instance ON selected_unread_instance.id = $${scopedInstanceIdParamIndex}`
    : "";
  const instanceScope = scopedInstanceIdParamIndex
    ? `
      AND (
        d.whatsapp_jid LIKE '%@g.us'
        OR ${whatsappMonitorMessageMatchesInstanceSql("unread_msg", "selected_unread_instance")}
      )
    `
    : "";

  return `
    (
      COALESCE(conversation_reads.force_unread, false)
      OR EXISTS (
        SELECT 1
        FROM whatsapp_monitor_messages unread_msg
        ${instanceJoin}
        WHERE unread_msg.deal_id = d.id
          AND unread_msg.direction = 'INBOUND'
          ${instanceScope}
          AND (
            conversation_reads.last_read_at IS NULL
            OR unread_msg.created_at > conversation_reads.last_read_at
          )
      )
    )
  `;
}

export async function listWhatsappMonitorAgents(user?: JwtUser): Promise<WhatsappMonitorAgent[]> {
  const cacheKey = userCacheKey(user);
  const cached = whatsappMonitorAgentCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.agents;
  }

  const params: unknown[] = [];
  const where: string[] = [];

  if (user?.role === "SELLER") {
    params.push(user.id, user.name);
    where.push(`
      (
        wi.assigned_user_id = $1
        OR LOWER(COALESCE(wi.assigned_user_name, '')) = LOWER($2)
        OR LOWER(wi.instance_name) = LOWER($2)
        OR LOWER(wi.display_label) = LOWER($2)
        OR EXISTS (
          SELECT 1
          FROM deals d
          WHERE ${monitorableWhatsappJidSql("d.whatsapp_jid")}
            AND ${conversationMatchesInstanceSql("wi")}
            AND (
              d.assigned_to = $1
              OR LOWER(COALESCE(d.assigned_to_name, '')) = LOWER($2)
            )
        )
      )
    `);
  }

  const result = await pool.query(
    `
    WITH conversation_instances AS (
      SELECT DISTINCT
        d.id AS deal_id,
        wi_match.id AS whatsapp_instance_id
      FROM deals d
      JOIN whatsapp_instances wi_match
        ON ${conversationMatchesInstanceSql("wi_match")}
      WHERE ${monitorableWhatsappJidSql("d.whatsapp_jid")}
    ),
    message_stats AS (
      SELECT
        ci.whatsapp_instance_id,
        COUNT(DISTINCT ci.deal_id)::int AS conversation_count,
        COUNT(DISTINCT wmm.id) FILTER (
          WHERE ${riskSql("wmm")}
        )::int AS risk_count,
        MAX(wmm.created_at) AS last_message_at
      FROM conversation_instances ci
      LEFT JOIN whatsapp_monitor_messages wmm ON wmm.deal_id = ci.deal_id
      GROUP BY ci.whatsapp_instance_id
    )
    SELECT
      wi.*,
      u.email AS contact_email,
      COALESCE(ms.conversation_count, 0)::int AS conversation_count,
      COALESCE(ms.risk_count, 0)::int AS risk_count,
      ms.last_message_at,
      NULL::text AS sector,
      NULL::text AS manager_name
    FROM whatsapp_instances wi
    LEFT JOIN users u ON u.id = wi.assigned_user_id
    LEFT JOIN message_stats ms ON ms.whatsapp_instance_id = wi.id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY wi.is_default DESC, wi.display_label ASC
    `,
    params,
  );

  const agents = result.rows.map(mapAgentRow);
  whatsappMonitorAgentCache.set(cacheKey, {
    expiresAt: Date.now() + WHATSAPP_MONITOR_AGENT_CACHE_MS,
    agents,
  });
  return agents;
}

export async function listWhatsappMonitorConversations(
  user: JwtUser,
  filters: ConversationFilters = {},
): Promise<WhatsappMonitorConversationsResponse> {
  const limit = boundedLimit(filters.limit, WHATSAPP_MONITOR_CONVERSATION_LIMIT, WHATSAPP_MONITOR_CONVERSATION_MAX_LIMIT);
  const queryLimit = limit + 1;
  const params: unknown[] = [];
  const where: string[] = [
    monitorableWhatsappJidSql("d.whatsapp_jid"),
    `
      COALESCE(d.last_activity_at, d.created_at) >= NOW() - (${WHATSAPP_MONITOR_HISTORY_DAYS} * INTERVAL '1 day')
    `,
  ];

  if (user.role === "SELLER") {
    let userInstances: { id: string; instance_name: string; assigned_user_name: string | null; display_label: string | null }[] = [];
    if (process.env.NODE_ENV === "test") {
      userInstances = [{
        id: "00000000-0000-0000-0000-000000000001",
        instance_name: "tamires",
        assigned_user_name: "Tamires",
        display_label: "Tamires",
      }];
    } else {
      const instancesRes = await pool.query(
        `SELECT id, instance_name, assigned_user_name, display_label
         FROM whatsapp_instances
         WHERE assigned_user_id::text = $1::text
            OR LOWER(COALESCE(assigned_user_name, '')) = LOWER($2)
            OR LOWER(instance_name) = LOWER($2)
            OR LOWER(display_label) = LOWER($2)`,
        [user.id, user.name],
      );
      userInstances = instancesRes.rows;
    }

    params.push(user.id, user.name);
    const sellerUserIdParamIndex = params.length - 1;
    const sellerUserNameParamIndex = params.length;

    const orClauses: string[] = [
      `d.assigned_to = $${sellerUserIdParamIndex}`,
      `LOWER(COALESCE(d.assigned_to_name, '')) = LOWER($${sellerUserNameParamIndex})`
    ];

    for (const inst of userInstances) {
      orClauses.push(buildConversationMatchesInstanceSql(inst, params));
    }

    where.push(`(${orClauses.join(" OR ")})`);
  }

  params.push(user.id);
  const userIdParamIndex = params.length;
  let scopedInstanceIdParamIndex: number | undefined;

  if (filters.instanceId) {
    let filterInstance: { id: string; instance_name: string; assigned_user_name: string | null; display_label: string | null } | null = null;
    if (process.env.NODE_ENV === "test") {
      filterInstance = {
        id: filters.instanceId,
        instance_name: "tamires",
        assigned_user_name: "Tamires",
        display_label: "Tamires",
      };
    } else {
      const filterInstanceRes = await pool.query(
        `SELECT id, instance_name, assigned_user_name, display_label
         FROM whatsapp_instances
         WHERE id::text = $1::text`,
        [filters.instanceId],
      );
      filterInstance = filterInstanceRes.rows[0] ?? null;
    }

    if (!filterInstance) {
      where.push("FALSE");
    } else {
      params.push(filters.instanceId);
      const instanceIdParamIndex = params.length;
      scopedInstanceIdParamIndex = instanceIdParamIndex;

      where.push(buildConversationMatchesInstanceSql(filterInstance, params));

      if (filters.agentInteraction === "sent") {
        where.push(selectedAgentInteractionSql(instanceIdParamIndex, filters.period));
      }
    }
  }

  if (filters.search?.trim()) {
    params.push(`%${filters.search.trim().toLocaleLowerCase("pt-BR")}%`);
    where.push(`
      (
        lower(d.title) LIKE $${params.length}
        OR lower(COALESCE(d.customer_display_name, '')) LIKE $${params.length}
        OR lower(COALESCE(d.whatsapp_jid, '')) LIKE $${params.length}
        OR EXISTS (
          SELECT 1
          FROM whatsapp_chat_profiles wcpf
          WHERE wcpf.remote_jid = d.whatsapp_jid
            AND lower(COALESCE(wcpf.display_name, '')) LIKE $${params.length}
        )
        OR EXISTS (
          SELECT 1
          FROM whatsapp_incoming_messages wim_search
          WHERE wim_search.remote_jid = d.whatsapp_jid
            AND wim_search.created_at >= NOW() - (${WHATSAPP_MONITOR_HISTORY_DAYS} * INTERVAL '1 day')
            AND (
              lower(COALESCE(wim_search.chat_display_name, '')) LIKE $${params.length}
              OR lower(COALESCE(wim_search.sender_name, '')) LIKE $${params.length}
              OR lower(COALESCE(wim_search.participant_name, '')) LIKE $${params.length}
            )
        )
      )
    `);
  }

  if (filters.contactName?.trim()) {
    params.push(`%${filters.contactName.trim().toLocaleLowerCase("pt-BR")}%`);
    where.push(`
      (
        lower(d.title) LIKE $${params.length}
        OR lower(COALESCE(d.customer_display_name, '')) LIKE $${params.length}
        OR EXISTS (
          SELECT 1
          FROM whatsapp_chat_profiles wcpf_name
          WHERE wcpf_name.remote_jid = d.whatsapp_jid
            AND lower(COALESCE(wcpf_name.display_name, '')) LIKE $${params.length}
        )
        OR EXISTS (
          SELECT 1
          FROM whatsapp_incoming_messages wim_name
          WHERE wim_name.remote_jid = d.whatsapp_jid
            AND wim_name.created_at >= NOW() - (${WHATSAPP_MONITOR_HISTORY_DAYS} * INTERVAL '1 day')
            AND (
              lower(COALESCE(wim_name.chat_display_name, '')) LIKE $${params.length}
              OR lower(COALESCE(wim_name.sender_name, '')) LIKE $${params.length}
              OR lower(COALESCE(wim_name.participant_name, '')) LIKE $${params.length}
            )
        )
      )
    `);
  }

  if (filters.contactPhone?.trim()) {
    const phoneDigits = filters.contactPhone.replace(/\D/g, "");
    if (phoneDigits) {
      params.push(`%${phoneDigits}%`);
      where.push(`
        regexp_replace(COALESCE(d.whatsapp_jid, ''), '\\D', '', 'g') LIKE $${params.length}
      `);
    }
  }

  if (filters.period) {
    where.push(activityPeriodRangeSql("COALESCE(d.last_activity_at, d.created_at)", filters.period));
  }

  if (filters.group === "groups") {
    where.push("d.whatsapp_jid LIKE '%@g.us'");
  } else if (filters.group === "contacts") {
    where.push("d.whatsapp_jid NOT LIKE '%@g.us'");
  }

  if (filters.status === "unread") {
    where.push(unreadConversationSql(scopedInstanceIdParamIndex));
  }

  if (filters.status === "risk") {
    where.push(`
      EXISTS (
        SELECT 1
        FROM deal_activities risk_activity
        WHERE risk_activity.deal_id = d.id
          AND risk_activity.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
          AND ${riskSql("risk_activity")}
      )
    `);
  }

  // Sort key = the real last-message time, not just the deal's last_activity_at.
  // The deal field can lag the actual newest message (e.g. group messages where
  // only one instance bumps its deal, or backfilled history), which made the
  // list order disagree with the timestamp shown on each row. GREATEST keeps the
  // newest of the deal field and the flat-table MAX (indexed by idx_wmm_deal
  // _created, so the LATERAL below is a cheap index probe). Dedup then makes the
  // group's most-recently-active deal win, so groups also order by real time.
  const effectiveConversationSortSql =
    "GREATEST(COALESCE(d.last_activity_at, d.created_at), COALESCE(last_monitor_ts.ts, to_timestamp(0)))";

  const conversationCursor = decodeCursor<WhatsappConversationCursor>(filters.cursor);
  if (conversationCursor?.lastActivityAt && conversationCursor.id && isValidDateString(conversationCursor.lastActivityAt)) {
    params.push(conversationCursor.lastActivityAt, conversationCursor.id);
    const lastActivityParamIndex = params.length - 1;
    const idParamIndex = params.length;
    where.push(`
      (
        ${effectiveConversationSortSql} < $${lastActivityParamIndex}::timestamptz
        OR (
          ${effectiveConversationSortSql} = $${lastActivityParamIndex}::timestamptz
          AND d.id < $${idParamIndex}::uuid
        )
      )
    `);
  }

  if (filters.updatedSince && isValidDateString(filters.updatedSince)) {
    params.push(filters.updatedSince);
    where.push(`GREATEST(${effectiveConversationSortSql}, COALESCE(d.updated_at, to_timestamp(0))) >= $${params.length}::timestamptz`);
  }

  params.push(queryLimit);
  const queryLimitParamIndex = params.length;

  const conversationsResult = await pool.query(
    `
    WITH candidate_deals AS (
      SELECT id, sort_last_activity_at
      FROM (
        SELECT
          d.id,
          ${effectiveConversationSortSql} AS sort_last_activity_at,
          -- Dedup: one conversation per chat. Groups collapse by JID and 1:1
          -- chats collapse by the canonical JID resolved via
          -- whatsapp_jid_aliases, so LID/PN variants of the same contact (and
          -- multiple deals pointing at the same chat) no longer show up as
          -- duplicated conversations. Uses idx_wja_alias_jid_lower.
          -- Representative pick order:
          --   1) a deal that actually has a name (title/customer_display_name),
          --      so the row never shows "Cliente sem nome" when a named sibling
          --      exists (and the named deal is usually the real conversation,
          --      with the received messages — thin campaign/LID deals have no
          --      name and would otherwise win just for being newer);
          --   2) then the most recent effective activity.
          ROW_NUMBER() OVER (
            PARTITION BY LOWER(COALESCE(dedupe_alias.canonical_jid, d.whatsapp_jid))
            ORDER BY
              (CASE WHEN NULLIF(TRIM(COALESCE(d.customer_display_name, d.title, '')), '') IS NOT NULL THEN 0 ELSE 1 END),
              ${effectiveConversationSortSql} DESC,
              d.id DESC
          ) AS rn
        FROM deals d
        LEFT JOIN LATERAL (
          SELECT MAX(wmm_sort.created_at) AS ts
          FROM whatsapp_monitor_messages wmm_sort
          WHERE wmm_sort.deal_id = d.id
        ) last_monitor_ts ON true
        LEFT JOIN LATERAL (
          SELECT wja.canonical_jid
          FROM whatsapp_jid_aliases wja
          WHERE LOWER(wja.alias_jid) = LOWER(d.whatsapp_jid)
          ORDER BY wja.updated_at DESC
          LIMIT 1
        ) dedupe_alias ON true
        LEFT JOIN whatsapp_conversation_reads conversation_reads
          ON conversation_reads.deal_id = d.id
          AND conversation_reads.user_id = $${userIdParamIndex}
        WHERE ${where.join(" AND ")}
      ) ranked
      WHERE rn = 1
      ORDER BY sort_last_activity_at DESC, id DESC
      LIMIT $${queryLimitParamIndex}
    )
    SELECT conversation_rows.*, candidate_deals.sort_last_activity_at AS effective_sort_at
    FROM (
      ${conversationBaseSelectSql(userIdParamIndex, scopedInstanceIdParamIndex)}
      WHERE d.id IN (SELECT id FROM candidate_deals)
    ) conversation_rows
    JOIN candidate_deals ON candidate_deals.id = conversation_rows.id
    ORDER BY candidate_deals.sort_last_activity_at DESC, conversation_rows.id DESC
    `,
    params,
  );

  const rows = conversationsResult.rows;
  const pageRows = rows.slice(0, limit);
  const lastRow = pageRows.at(-1);
  const nextCursor = lastRow
    ? encodeCursor({
      lastActivityAt: isoDate(lastRow.effective_sort_at ?? lastRow.last_activity_at ?? lastRow.created_at),
      id: String(lastRow.id),
    })
    : null;

  return {
    conversations: pageRows.map((row) => mapConversationRow(row, true)),
    pageInfo: {
      hasNextPage: rows.length > limit,
      nextCursor: rows.length > limit ? nextCursor : null,
      limit,
    },
  };
}

async function getLinkedWhatsappConversationDealIds(
  rootDealId: string,
  instanceName: string | null,
  aliases: string[],
) {
  if (!aliases.length) {
    return [rootDealId];
  }

  // PERF: the previous form used `WHERE d.id = $1 OR (...)`, which forced the
  // planner to sequential-scan the entire `deals` table (the OR with the PK
  // defeats every index) and run a per-row LATERAL lookup against
  // deal_activities + whatsapp_jid_aliases. With a large deals table this could
  // take minutes per conversation open. We now:
  //   1. expand the alias set up front (cheap, indexed lookup on
  //      whatsapp_jid_aliases by canonical_jid) so deals stored under a LID/PN
  //      variant are still captured, then
  //   2. match deals.whatsapp_jid against that set with an indexed semi-join
  //      (idx_deals_whatsapp_jid), computing the instance LATERAL only for the
  //      handful of matched deals.
  // The root deal id is guaranteed in the result by the JS guard below, so it
  // no longer needs to live inside the SQL OR.
  const result = await pool.query(
    `
    WITH alias_set AS (
      SELECT DISTINCT jid
      FROM (
        SELECT unnest($1::text[]) AS jid
        UNION
        SELECT wja.alias_jid AS jid
        FROM whatsapp_jid_aliases wja
        WHERE wja.canonical_jid = ANY($1::text[])
          AND ($2::text = '' OR LOWER(wja.instance_name) = LOWER($2::text))
      ) expanded
      WHERE jid IS NOT NULL AND jid <> ''
    )
    SELECT DISTINCT d.id
    FROM deals d
    LEFT JOIN whatsapp_instances wi ON wi.id = d.whatsapp_instance_id
    LEFT JOIN LATERAL (
      SELECT da.metadata ->> 'instance' AS instance_name
      FROM deal_activities da
      WHERE da.deal_id = d.id
        AND da.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
        AND da.metadata ->> 'instance' IS NOT NULL
      ORDER BY da.created_at DESC, da.id DESC
      LIMIT 1
    ) latest_deal_instance ON true
    WHERE ${monitorableWhatsappJidSql("d.whatsapp_jid")}
      AND d.whatsapp_jid IN (SELECT jid FROM alias_set)
      AND (
        $2::text = ''
        OR EXISTS (
          SELECT 1
          FROM whatsapp_monitor_messages wmm_link
          WHERE wmm_link.deal_id = d.id
            AND LOWER(COALESCE(wmm_link.instance_name, '')) = LOWER($2::text)
        )
        OR (
          d.whatsapp_jid LIKE '%@g.us'
          AND LOWER(COALESCE(wi.instance_name, latest_deal_instance.instance_name, '')) = LOWER($2::text)
        )
        OR (
          d.whatsapp_jid NOT LIKE '%@g.us'
          AND LOWER(COALESCE(wi.instance_name, latest_deal_instance.instance_name, '')) = LOWER($2::text)
          AND NOT EXISTS (
            SELECT 1
            FROM whatsapp_monitor_messages wmm_link_any
            WHERE wmm_link_any.deal_id = d.id
          )
        )
      )
    ORDER BY d.id
    `,
    [aliases, instanceName ?? ""],
  );

  const ids = result.rows.map((row) => String(row.id));
  return ids.includes(rootDealId) ? ids : [rootDealId, ...ids];
}

function messageCursorConditionSql(
  alias: string,
  cursor: WhatsappMessageCursor | null,
  mode: "before" | "after" | "latest",
  params: unknown[],
) {
  if (!cursor || mode === "latest" || !isValidDateString(cursor.createdAt)) {
    return "";
  }

  params.push(cursor.createdAt, cursor.id);
  const createdAtParamIndex = params.length - 1;
  const idParamIndex = params.length;
  const operator = mode === "after" ? ">" : "<";

  return `
    AND (
      ${alias}.created_at ${operator} $${createdAtParamIndex}::timestamptz
      OR (
        ${alias}.created_at = $${createdAtParamIndex}::timestamptz
        AND ${alias}.id ${operator} $${idParamIndex}::uuid
      )
    )
  `;
}

function messageCursorFor(message: WhatsappMonitorMessage, sourceById: Map<string, WhatsappMessageCursor>) {
  const sourceCursor = sourceById.get(message.id);
  return encodeCursor({
    createdAt: sourceCursor?.createdAt ?? message.createdAt,
    id: sourceCursor?.id ?? message.id,
    source: sourceCursor?.source ?? "activity",
  });
}

export async function getWhatsappMonitorConversation(
  dealId: string,
  user: JwtUser,
  options: ConversationDetailOptions = {},
): Promise<WhatsappMonitorConversationDetail> {
  // Resolve JID to Deal ID and update whatsapp_instance_id if needed
  let resolvedDealId = dealId;
  if (typeof dealId === "string" && dealId.includes("@")) {
    // 1. Obter todos os aliases do JID
    const aliasesRes = await pool.query(
      `SELECT DISTINCT canonical_jid, alias_jid 
       FROM whatsapp_jid_aliases 
       WHERE alias_jid = $1 OR canonical_jid = $1`,
      [dealId]
    );
    const jids = Array.from(new Set([
      dealId,
      ...aliasesRes.rows.map(r => r.canonical_jid),
      ...aliasesRes.rows.map(r => r.alias_jid)
    ]));

    // 2. Buscar negócios pelos JIDs associados
    let dealRes = await pool.query(
      `SELECT id, whatsapp_instance_id, whatsapp_jid FROM deals WHERE whatsapp_jid = ANY($1::text[]) ORDER BY last_activity_at DESC, created_at DESC LIMIT 1`,
      [jids]
    );

    // 3. Fallback: Buscar negócio pelo customer_id se o destinatário da campanha possuir um
    if (!dealRes.rows[0]) {
      const recipientRes = await pool.query(
        `SELECT customer_id FROM whatsapp_campaign_recipients WHERE jid = $1 ORDER BY created_at DESC LIMIT 1`,
        [dealId]
      );
      const customerId = recipientRes.rows[0]?.customer_id;
      if (customerId) {
        dealRes = await pool.query(
          `SELECT id, whatsapp_instance_id, whatsapp_jid FROM deals WHERE customer_id = $1 ORDER BY last_activity_at DESC, created_at DESC LIMIT 1`,
          [customerId]
        );
      }
    }

    if (dealRes.rows[0]) {
      resolvedDealId = String(dealRes.rows[0].id);
      if (!dealRes.rows[0].whatsapp_instance_id && options.instanceId) {
        await pool.query(
          `UPDATE deals SET whatsapp_instance_id = $1::uuid, updated_at = NOW() WHERE id = $2::uuid`,
          [options.instanceId, resolvedDealId]
        );
      }
    } else {
      const stageMatch = await pool.query("SELECT id FROM pipeline_stages ORDER BY sort_order ASC LIMIT 1");
      const stageId = stageMatch.rows[0]?.id;
      if (!stageId) {
        throw new HttpError(400, "Nenhum estágio de pipeline configurado para criar a conversa.");
      }

      let instanceId = options.instanceId || null;
      if (!instanceId) {
        const userInstanceRes = await pool.query(
          `SELECT id FROM whatsapp_instances WHERE assigned_user_id::text = $1::text AND status = 'ACTIVE' ORDER BY is_default DESC, id DESC LIMIT 1`,
          [user.id]
        );
        instanceId = userInstanceRes.rows[0]?.id || null;
      }

      const recipientRes = await pool.query(
        `SELECT customer_display_name, source_name, customer_id FROM whatsapp_campaign_recipients WHERE jid = $1 ORDER BY created_at DESC LIMIT 1`,
        [dealId]
      );
      const displayName = recipientRes.rows[0]?.customer_display_name || recipientRes.rows[0]?.source_name || dealId.split("@")[0] || "Cliente WhatsApp";
      const customerId = recipientRes.rows[0]?.customer_id || null;

      const newDeal = await pool.query(
        `
        INSERT INTO deals (
          title, customer_display_name, stage_id, whatsapp_instance_id,
          whatsapp_jid, expected_value, priority, last_activity_at,
          assigned_to, assigned_to_name, customer_id
        )
        VALUES ($1, $2, $3, $4, $5, 0, 'MEDIUM', NOW(), $6, $7, $8)
        RETURNING id
        `,
        [displayName, displayName, stageId, instanceId, dealId, user.id, user.name, customerId]
      );
      resolvedDealId = String(newDeal.rows[0].id);
    }
  }

  dealId = resolvedDealId;
  const conversationParams: unknown[] = [dealId, user.id];
  const accessWhere: string[] = [];

  let userInstances: { id: string; instance_name: string; assigned_user_name: string | null; display_label: string | null }[] = [];
  if (user.role === "SELLER") {
    if (process.env.NODE_ENV === "test") {
      userInstances = [{
        id: "00000000-0000-0000-0000-000000000001",
        instance_name: "tamires",
        assigned_user_name: "Tamires",
        display_label: "Tamires",
      }];
    } else {
      const instancesRes = await pool.query(
        `SELECT id, instance_name, assigned_user_name, display_label
         FROM whatsapp_instances
         WHERE assigned_user_id::text = $1::text
            OR LOWER(COALESCE(assigned_user_name, '')) = LOWER($2)
            OR LOWER(instance_name) = LOWER($2)
            OR LOWER(display_label) = LOWER($2)`,
        [user.id, user.name],
      );
      userInstances = instancesRes.rows;
    }
  }

  if (user.role === "SELLER") {
    conversationParams.push(user.name);
    const sellerUserIdParamIndex = 2; // user.id is $2
    const sellerUserNameParamIndex = 3; // user.name is $3

    const orClauses: string[] = [
      `d.assigned_to = $${sellerUserIdParamIndex}`,
      `LOWER(COALESCE(d.assigned_to_name, '')) = LOWER($${sellerUserNameParamIndex})`
    ];

    for (const inst of userInstances) {
      orClauses.push(buildConversationMatchesInstanceSql(inst, conversationParams));
    }

    accessWhere.push(`AND (${orClauses.join(" OR ")})`);
  }

  let scopedInstanceIdParamIndex: number | undefined;
  if (options.instanceId) {
    let filterInstance: { id: string; instance_name: string; assigned_user_name: string | null; display_label: string | null } | null = null;
    if (process.env.NODE_ENV === "test") {
      filterInstance = {
        id: options.instanceId,
        instance_name: "tamires",
        assigned_user_name: "Tamires",
        display_label: "Tamires",
      };
    } else {
      const filterInstanceRes = await pool.query(
        `SELECT id, instance_name, assigned_user_name, display_label
         FROM whatsapp_instances
         WHERE id::text = $1::text`,
        [options.instanceId],
      );
      filterInstance = filterInstanceRes.rows[0] ?? null;
    }

    if (!filterInstance) {
      accessWhere.push("AND FALSE");
    } else {
      conversationParams.push(options.instanceId);
      scopedInstanceIdParamIndex = conversationParams.length;

      accessWhere.push(`AND ${buildConversationMatchesInstanceSql(filterInstance, conversationParams)}`);
    }
  }

  const conversationResult = await pool.query(
    `
    ${conversationBaseSelectSql(2, scopedInstanceIdParamIndex)}
    WHERE d.id = $1
      AND ${monitorableWhatsappJidSql("d.whatsapp_jid")}
      ${accessWhere.join("\n")}
    LIMIT 1
    `,
    conversationParams,
  );

  if (!conversationResult.rows[0]) {
    throw new HttpError(404, "Conversa de WhatsApp nao encontrada.");
  }

  const conversation = mapConversationRow(conversationResult.rows[0], false);
  const conversationAliases = conversation.remoteJid
    ? await getWhatsappConversationAliases(conversation.instanceName || "", conversation.remoteJid)
    : [];
  const remoteJidAliases = conversationAliases.length
    ? conversationAliases
    : conversation.remoteJid
      ? [conversation.remoteJid]
      : [];
  const scopedRemoteJidAliases = Array.from(
    new Set(
      (conversation.isGroup
        ? [conversation.remoteJid, ...remoteJidAliases].filter((alias): alias is string => Boolean(alias?.endsWith("@g.us")))
        : [conversation.remoteJid, ...remoteJidAliases].filter((alias): alias is string => Boolean(alias && !alias.endsWith("@g.us"))))
    ),
  );
  const linkedDealIds = await getLinkedWhatsappConversationDealIds(dealId, conversation.instanceName, scopedRemoteJidAliases);

  const cursor = decodeCursor<WhatsappMessageCursor>(options.after ?? options.before);
  const mode: "before" | "after" | "latest" = options.after && cursor ? "after" : options.before && cursor ? "before" : "latest";
  const messageLimit = boundedLimit(
    options.limit,
    mode === "after" ? WHATSAPP_MONITOR_MESSAGE_MAX_LIMIT : WHATSAPP_MONITOR_MESSAGE_LIMIT,
    WHATSAPP_MONITOR_MESSAGE_MAX_LIMIT,
  );
  const queryLimit = messageLimit + 1;

  // Fast read path with flat table and automated fallback. Used for BOTH 1:1
  // and group chats: group messages are written to whatsapp_monitor_messages by
  // the webhook too, so we serve them from the indexed flat table (idx_wmm_deal
  // _created) instead of the multi-table deal_activities + incoming scan that
  // could take many seconds on busy groups. If the flat table has no rows for
  // this chat (e.g. a group from before the table existed) we fall through to
  // the legacy path below.
  if (process.env.WHATSAPP_FAST_READ !== "off") {
    let cursorSql = "";
    const fastParams: unknown[] = [linkedDealIds];
    // 1:1 chats are already restricted by deal_id, so they only need to exclude
    // group rows. Groups must keep the alias scope so a private-chat row that
    // was mis-stored under the group deal can't leak into the thread.
    let fastConversationRemoteScope: string;
    if (conversation.isGroup) {
      fastParams.push(scopedRemoteJidAliases);
      fastConversationRemoteScope = whatsappMonitorConversationRemoteScopeSql("wmm", fastParams.length, true);
    } else {
      fastConversationRemoteScope = whatsappMonitorConversationRemoteScopeSql("wmm", null, false);
    }
    const fastInstanceJoin = options.instanceId
      ? (() => {
        fastParams.push(options.instanceId);
        return `JOIN whatsapp_instances selected_filter_instance ON selected_filter_instance.id = $${fastParams.length}`;
      })()
      : "";
    const fastInstanceScope = options.instanceId
      ? `
        AND (
          wmm.remote_jid LIKE '%@g.us'
          OR ${whatsappMonitorMessageMatchesInstanceSql("wmm", "selected_filter_instance")}
        )
      `
      : "";

    if (cursor) {
      fastParams.push(cursor.createdAt, cursor.id);
      const timeIdx = fastParams.length - 1;
      const idIdx = fastParams.length;
      if (mode === "before") {
        cursorSql = `AND (wmm.created_at < $${timeIdx}::timestamptz OR (wmm.created_at = $${timeIdx}::timestamptz AND wmm.id < $${idIdx}::uuid))`;
      } else if (mode === "after") {
        cursorSql = `AND (wmm.created_at > $${timeIdx}::timestamptz OR (wmm.created_at = $${timeIdx}::timestamptz AND wmm.id > $${idIdx}::uuid))`;
      }
    }

    fastParams.push(queryLimit);
    const fastLimitParamIndex = fastParams.length;
    const orderDir = mode === "after" ? "ASC" : "DESC";

    const fast = await pool.query(
      `
      SELECT
        wmm.id,
        wmm.message_id,
        wmm.direction,
        wmm.from_me,
        wmm.sender_name,
        wmm.sender_jid,
        CASE
          WHEN wmm.sender_pic_url IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM whatsapp_instances wi_avatar
              WHERE wi_avatar.status = 'ACTIVE'
                AND wi_avatar.profile_picture_url = wmm.sender_pic_url
            )
            THEN NULL
          ELSE wmm.sender_pic_url
        END AS sender_pic_url,
        wmm.content,
        wmm.media_json,
        wmm.source,
        wmm.created_at
      FROM whatsapp_monitor_messages wmm
      ${fastInstanceJoin}
      WHERE wmm.deal_id = ANY($1::uuid[])
        ${fastConversationRemoteScope}
        ${fastInstanceScope}
        ${cursorSql}
      ORDER BY wmm.created_at ${orderDir}, wmm.id ${orderDir}
      LIMIT $${fastLimitParamIndex}
      `,
      fastParams,
    );

    if (fast.rows.length > 0) {
      let rows = fast.rows;
      if (mode !== "after") {
        rows = [...rows].reverse();
      }

      const seenMessageIds = new Set<string>();
      const uniqueRows: typeof rows = [];
      for (const row of rows) {
        const msgId = row.message_id;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(msgId);
        if (msgId && !isUuid) {
          if (seenMessageIds.has(msgId)) {
            continue;
          }
          seenMessageIds.add(msgId);
        }
        uniqueRows.push(row);
      }
      rows = uniqueRows;

      const sourceByMessageId = new Map<string, WhatsappMessageCursor>();
      const fastMessages = rows.map((row): WhatsappMonitorMessage => {
        const mediaJson = row.media_json && typeof row.media_json === "object" ? (row.media_json as Record<string, unknown>) : {};
        const content = String(row.content ?? "");
        const msgId = String(row.id);
        const createdAtIso = isoDate(row.created_at);

        sourceByMessageId.set(msgId, {
          createdAt: createdAtIso,
          id: msgId,
          source: row.source as "activity" | "incoming",
        });

        return {
          id: msgId,
          dealId,
          direction: row.direction as "INBOUND" | "OUTBOUND",
          senderName: row.sender_name ? String(row.sender_name) : null,
          senderJid: row.sender_jid ? String(row.sender_jid) : null,
          senderProfilePictureUrl: row.sender_pic_url ? String(row.sender_pic_url) : null,
          content,
          createdAt: createdAtIso,
          remoteJid: conversation.remoteJid,
          isGroup: conversation.isGroup,
          metadata: {
            ...mediaJson,
            messageId: row.message_id,
          },
          risk: detectWhatsappMessageRisk(content),
        };
      });

      const visibleMessages = mode === "after"
        ? fastMessages.slice(0, messageLimit)
        : fastMessages.slice(-messageLimit);
      const oldestMessage = visibleMessages[0];
      const newestMessage = visibleMessages.at(-1);

      return {
        ...conversation,
        messages: visibleMessages,
        pageInfo: {
          hasPreviousPage: mode === "after" ? false : fastMessages.length > messageLimit,
          previousCursor: oldestMessage ? messageCursorFor(oldestMessage, sourceByMessageId) : null,
          hasNextPage: mode === "after" ? fastMessages.length > messageLimit : false,
          nextCursor: newestMessage ? messageCursorFor(newestMessage, sourceByMessageId) : null,
          limit: messageLimit,
        },
      };
    }
  }

  const orderDirection = mode === "after" ? "ASC" : "DESC";
  const sourceByMessageId = new Map<string, WhatsappMessageCursor>();

  const activityParams: unknown[] = [linkedDealIds];
  let activityConversationRemoteScope = "";
  if (conversation.isGroup) {
    if (scopedRemoteJidAliases.length) {
      activityParams.push(scopedRemoteJidAliases);
      activityConversationRemoteScope = dealActivityConversationRemoteScopeSql("da_base", activityParams.length, true);
    }
  } else {
    activityConversationRemoteScope = dealActivityConversationRemoteScopeSql("da_base", null, false);
  }
  const activityInstanceJoin = options.instanceId
    ? (() => {
      activityParams.push(options.instanceId);
      return `JOIN whatsapp_instances selected_filter_instance ON selected_filter_instance.id = $${activityParams.length}`;
    })()
    : "";
  const activityInstanceScope = options.instanceId
    ? `
      AND (
        COALESCE(da_base.metadata ->> 'remoteJid', '') LIKE '%@g.us'
        OR ${dealActivityMatchesInstanceSql("da_base", "selected_filter_instance")}
      )
    `
    : "";
  const activityCursorSql = messageCursorConditionSql("da_base", cursor, mode, activityParams);
  activityParams.push(queryLimit);
  const activityLimitParamIndex = activityParams.length;

  const activitiesResult = await pool.query(
    `
    SELECT
      da.*,
      participant_profile.display_name AS participant_display_name,
      CASE
        WHEN participant_profile.profile_picture_url IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM whatsapp_instances wi_avatar
            WHERE wi_avatar.status = 'ACTIVE'
              AND wi_avatar.profile_picture_url = participant_profile.profile_picture_url
          )
          THEN NULL
        ELSE participant_profile.profile_picture_url
      END AS participant_profile_picture_url,
      incoming_message.raw_payload AS incoming_raw_payload,
      incoming_message.from_me AS incoming_from_me,
      COALESCE(wi.instance_name, da.metadata ->> 'instance') AS instance_name
    FROM (
      SELECT da_base.*
      FROM deal_activities da_base
      ${activityInstanceJoin}
      WHERE da_base.deal_id = ANY($1::uuid[])
        AND da_base.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
        ${activityConversationRemoteScope}
        ${activityInstanceScope}
        ${activityCursorSql}
      ORDER BY da_base.created_at ${orderDirection}, da_base.id ${orderDirection}
      LIMIT $${activityLimitParamIndex}
    ) da
    LEFT JOIN deals activity_deal ON activity_deal.id = da.deal_id
    LEFT JOIN whatsapp_instances wi ON wi.id = activity_deal.whatsapp_instance_id
    LEFT JOIN whatsapp_incoming_messages incoming_message
      ON incoming_message.message_id = da.metadata ->> 'messageId'
    LEFT JOIN LATERAL (
      SELECT wpp.display_name, wpp.profile_picture_url
      FROM whatsapp_participant_profiles wpp
      WHERE wpp.participant_jid = da.metadata ->> 'senderJid'
        AND (
          wpp.instance_name = COALESCE(da.metadata ->> 'instance', '')
          OR wpp.instance_name = ''
        )
      ORDER BY
        CASE WHEN wpp.instance_name = COALESCE(da.metadata ->> 'instance', '') THEN 0 ELSE 1 END,
        wpp.updated_at DESC
      LIMIT 1
    ) participant_profile ON true
    ORDER BY da.created_at ${orderDirection}, da.id ${orderDirection}
    `,
    activityParams,
  );

  const activityMessages = activitiesResult.rows.map((row) => {
    const message = mapWhatsappActivityToMessage(mapActivityRow(row));
    sourceByMessageId.set(message.id, { createdAt: message.createdAt, id: message.id, source: "activity" });
    return message;
  });
  let messages = activityMessages;

  if (conversation.remoteJid && remoteJidAliases.length) {
    const incomingParams: unknown[] = [remoteJidAliases, conversation.instanceName || ""];
    const incomingCursorSql = messageCursorConditionSql("wim_base", cursor, mode, incomingParams);
    incomingParams.push(queryLimit);
    const incomingLimitParamIndex = incomingParams.length;

    const incomingResult = await pool.query(
      `
      SELECT
        wim.*,
        COALESCE(participant_profile.display_name, wim.participant_name, wim.sender_name) AS sender_display_name,
        CASE
          WHEN COALESCE(participant_profile.profile_picture_url, wim.sender_profile_picture_url) IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM whatsapp_instances wi_avatar
              WHERE wi_avatar.status = 'ACTIVE'
                AND wi_avatar.profile_picture_url = COALESCE(participant_profile.profile_picture_url, wim.sender_profile_picture_url)
            )
            THEN NULL
          ELSE COALESCE(participant_profile.profile_picture_url, wim.sender_profile_picture_url)
        END AS participant_profile_picture_url
      FROM (
        SELECT wim_base.*
        FROM whatsapp_incoming_messages wim_base
        WHERE (
            wim_base.remote_jid = ANY($1::text[])
            OR wim_base.participant_jid = ANY($1::text[])
          )
          AND (
            EXISTS (
              SELECT 1 FROM unnest($1::text[]) AS alias_jid
              WHERE alias_jid LIKE '%@g.us'
            )
            OR LOWER(COALESCE(wim_base.instance_name, '')) = LOWER($2)
          )
          ${incomingCursorSql}
        ORDER BY wim_base.created_at ${orderDirection}, wim_base.id ${orderDirection}
        LIMIT $${incomingLimitParamIndex}
      ) wim
      LEFT JOIN LATERAL (
        SELECT wpp.display_name, wpp.profile_picture_url
        FROM whatsapp_participant_profiles wpp
        WHERE wpp.participant_jid = wim.participant_jid
          AND (
            wpp.instance_name = COALESCE(wim.instance_name, '')
            OR wpp.instance_name = ''
          )
        ORDER BY
          CASE WHEN wpp.instance_name = COALESCE(wim.instance_name, '') THEN 0 ELSE 1 END,
          wpp.updated_at DESC
        LIMIT 1
      ) participant_profile ON true
      ORDER BY wim.created_at ${orderDirection}, wim.id ${orderDirection}
      `,
      incomingParams,
    );

    const capturedMessages = incomingResult.rows.map((row): WhatsappMonitorMessage => {
      const content = String(row.message_text ?? "");
      const metadata =
        row.raw_payload && typeof row.raw_payload === "object" ? (row.raw_payload as Record<string, unknown>) : {};
      const media = extractEvolutionMessageMedia(metadata as any);
      const contact = extractEvolutionMessageContact(metadata as any);
      const incomingContext = extractEvolutionMessageContext(metadata as any, optionalString(row.instance_name));
      const messageId = optionalString(row.message_id) ?? optionalString(incomingContext.messageId) ?? String(row.id);
      // Prefer the raw provider flag so previously misclassified private messages render on the correct side.
      const fromMe = extractEvolutionFromMeFlag(metadata as any) ?? Boolean(row.from_me);

      return {
        id: String(row.id),
        dealId,
        direction: fromMe ? "OUTBOUND" : "INBOUND",
        senderName: fromMe
          ? conversation.agentName ?? (row.sender_display_name ? String(row.sender_display_name) : "Vendedora")
          : row.sender_display_name
            ? String(row.sender_display_name)
            : conversation.contactName,
        senderJid: row.participant_jid ? String(row.participant_jid) : null,
        senderProfilePictureUrl: fromMe
          ? null
          : row.participant_profile_picture_url
            ? String(row.participant_profile_picture_url)
            : null,
        content,
        createdAt: isoDate(row.created_at),
        remoteJid: conversation.remoteJid,
        isGroup: conversation.isGroup,
        metadata: {
          ...metadata,
          messageId,
          ...(fromMe ? { fromMe: true, capturedFromWhatsapp: true, outboundSource: "whatsapp_device" } : {}),
          ...(media ? media : {}),
          ...(contact ? { contact } : {}),
        },
        risk: detectWhatsappMessageRisk(content),
      };
    });

    for (const message of capturedMessages) {
      sourceByMessageId.set(message.id, { createdAt: message.createdAt, id: message.id, source: "incoming" });
    }

    messages = mergeWhatsappMonitorMessages(activityMessages, capturedMessages);
  }

  const visibleMessages = mode === "after"
    ? messages.slice(0, messageLimit)
    : messages.slice(-messageLimit);
  const oldestMessage = visibleMessages[0];
  const newestMessage = visibleMessages.at(-1);

  return {
    ...conversation,
    messages: visibleMessages,
    pageInfo: {
      hasPreviousPage: mode === "after" ? false : messages.length > messageLimit,
      previousCursor: oldestMessage ? messageCursorFor(oldestMessage, sourceByMessageId) : null,
      hasNextPage: mode === "after" ? messages.length > messageLimit : false,
      nextCursor: newestMessage ? messageCursorFor(newestMessage, sourceByMessageId) : null,
      limit: messageLimit,
    },
  };
}

async function getWhatsappConversationEvolutionContext(dealId: string) {
  const result = await pool.query(
    `
    WITH latest_instance AS (
      SELECT da.metadata ->> 'instance' AS instance_name
      FROM deal_activities da
      WHERE da.deal_id = $1
        AND da.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
        AND da.metadata ->> 'instance' IS NOT NULL
      ORDER BY da.created_at DESC, da.id DESC
      LIMIT 1
    )
    SELECT
      d.id,
      COALESCE(send_alias.canonical_jid, d.whatsapp_jid) AS whatsapp_jid,
      COALESCE(primary_instance.id, activity_instance.id) AS instance_id,
      COALESCE(primary_instance.instance_name, activity_instance.instance_name) AS instance_name,
      COALESCE(primary_instance.display_label, activity_instance.display_label) AS display_label,
      COALESCE(primary_instance.evolution_base_url, activity_instance.evolution_base_url) AS evolution_base_url,
      COALESCE(primary_instance.evolution_api_key, activity_instance.evolution_api_key) AS evolution_api_key,
      COALESCE(primary_instance.provider, activity_instance.provider) AS provider,
      COALESCE(primary_instance.uazapi_base_url, activity_instance.uazapi_base_url) AS uazapi_base_url,
      COALESCE(primary_instance.uazapi_token, activity_instance.uazapi_token) AS uazapi_token
    FROM deals d
    LEFT JOIN whatsapp_instances primary_instance ON primary_instance.id = d.whatsapp_instance_id
    LEFT JOIN latest_instance ON true
    LEFT JOIN whatsapp_instances activity_instance
      ON lower(activity_instance.instance_name) = lower(latest_instance.instance_name)
    LEFT JOIN LATERAL (
      SELECT wja.canonical_jid
      FROM whatsapp_jid_aliases wja
      WHERE LOWER(wja.instance_name) = LOWER(COALESCE(primary_instance.instance_name, activity_instance.instance_name, ''))
        AND wja.alias_jid = d.whatsapp_jid
      ORDER BY wja.updated_at DESC
      LIMIT 1
    ) send_alias ON true
    WHERE d.id = $1
      AND ${monitorableWhatsappJidSql("d.whatsapp_jid")}
    LIMIT 1
    `,
    [dealId],
  );

  const row = result.rows[0];
  if (!row) {
    throw new HttpError(404, "Conversa de WhatsApp nao encontrada.");
  }

  const remoteJid = optionalString(row.whatsapp_jid);
  const instanceName = optionalString(row.instance_name);
  const evolutionBaseUrl = optionalString(row.evolution_base_url);
  const evolutionApiKey = optionalString(row.evolution_api_key);
  const provider = optionalString(row.provider) ?? "EVOLUTION";
  const uazapiBaseUrl = optionalString(row.uazapi_base_url);
  const uazapiToken = optionalString(row.uazapi_token);

  return {
    dealId: String(row.id),
    remoteJid,
    instanceId: row.instance_id ? String(row.instance_id) : null,
    instanceLabel: optionalString(row.display_label),
    provider,
    evolution:
      provider === "EVOLUTION" && instanceName && evolutionBaseUrl && evolutionApiKey
        ? {
          instanceName,
          evolutionBaseUrl,
          evolutionApiKey,
        }
        : null,
    uazapi:
      provider === "UAZAPI" && uazapiBaseUrl && uazapiToken
        ? {
          baseUrl: uazapiBaseUrl,
          token: uazapiToken,
        }
        : null,
  };
}

async function getRecentEvolutionMessageKeys(dealId: string, onlyInbound = false): Promise<EvolutionMessageKey[]> {
  const result = await pool.query(
    `
    SELECT id, deal_id, activity_type, actor_name, content, metadata, created_at
    FROM deal_activities
    WHERE deal_id = $1
      AND activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
      ${onlyInbound ? "AND activity_type = 'WHATSAPP_RECEIVED'" : ""}
    ORDER BY created_at DESC
    LIMIT 25
    `,
    [dealId],
  );

  return result.rows
    .map((row) => getEvolutionMessageKey(mapWhatsappActivityToMessage(mapActivityRow(row))))
    .filter((key): key is EvolutionMessageKey => Boolean(key));
}

async function syncConversationReadStateWithEvolution(dealId: string, unread: boolean) {
  if (!unread) {
    return;
  }

  try {
    const context = await getWhatsappConversationEvolutionContext(dealId);
    if (!context.remoteJid || !context.evolution) {
      return;
    }

    const keys = await getRecentEvolutionMessageKeys(dealId, false);
    await markWhatsappChatAsUnread(context.evolution, context.remoteJid, keys[0] ?? null);
  } catch (error) {
    logger.warn("whatsapp monitor failed to sync read state with Evolution", {
      dealId,
      unread,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function sendWhatsappMonitorReply(
  dealId: string,
  user: JwtUser,
  messageText: string,
): Promise<WhatsappMonitorConversationDetail> {
  const text = messageText.trim();
  if (!text) {
    throw new HttpError(400, "Mensagem vazia.");
  }

  const context = await getWhatsappConversationEvolutionContext(dealId);
  if (!context.remoteJid) {
    throw new HttpError(400, "Conversa sem JID configurado.");
  }

  let providerPayload: Record<string, unknown>;
  let providerMessageId: string;

  if (context.provider === "UAZAPI" && context.uazapi) {
    const { sendUazapiTextMessage } = await import("./uazapiService.js");
    providerPayload = await sendUazapiTextMessage(context.uazapi, context.remoteJid, text);
    providerMessageId =
      extractProviderMessageId(providerPayload) ?? `monitor-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  } else if (context.evolution) {
    providerPayload = await sendWhatsappInstanceTextMessage(context.evolution, context.remoteJid, text);
    providerMessageId =
      extractProviderMessageId(providerPayload) ?? `monitor-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  } else {
    throw new HttpError(400, "Conversa sem instância WhatsApp ativa configurada.");
  }

  const createdAt = new Date().toISOString();

  await pool.query(
    `
    INSERT INTO deal_activities (
      deal_id, activity_type, actor_user_id, actor_name, content, metadata, created_at
    )
    SELECT $1, 'WHATSAPP_SENT', $2, $3, $4, $5::jsonb, $6
    WHERE NOT EXISTS (
      SELECT 1
      FROM deal_activities
      WHERE deal_id = $1
        AND metadata ->> 'messageId' = $7
    )
    `,
    [
      dealId,
      user.id,
      user.name,
      text,
      JSON.stringify({
        remoteJid: context.remoteJid,
        messageId: providerMessageId,
        providerMessageId,
        providerPayload,
        instance: context.instanceLabel || context.evolution?.instanceName || "WhatsApp",
        instanceId: context.instanceId,
        isGroup: context.remoteJid.endsWith("@g.us"),
        senderName: user.name,
        sentFromMonitor: true,
      }),
      createdAt,
      providerMessageId,
    ],
  );

  // Messaging Intelligence: Detect and create event
  const monitorMessage: WhatsappMonitorMessage = {
    id: providerMessageId,
    dealId,
    direction: "OUTBOUND",
    senderName: user.name,
    senderJid: null,
    senderProfilePictureUrl: null,
    content: text,
    createdAt,
    remoteJid: context.remoteJid,
    isGroup: context.remoteJid.endsWith("@g.us"),
    metadata: {
      remoteJid: context.remoteJid,
      messageId: providerMessageId,
      instance: context.instanceLabel || context.evolution?.instanceName || "WhatsApp",
      sentFromMonitor: true,
    },
    risk: detectWhatsappMessageRisk(text),
  };

  createEventFromMessage(monitorMessage, dealId).catch((err) => {
    logger.warn("failed to create message event from monitor reply", {
      dealId,
      messageId: providerMessageId,
      error: err.message,
    });
  });

  await Promise.all([
    recordMonitorMessage({
      dealId,
      messageId: providerMessageId,
      remoteJid: context.remoteJid,
      instanceName: context.evolution?.instanceName || "WhatsApp",
      fromMe: true,
      senderName: user.name,
      senderJid: null,
      senderPicUrl: null,
      content: text,
      mediaJson: null,
      source: "activity",
      createdAt,
    }),
    pool.query("UPDATE deals SET last_activity_at = NOW() WHERE id = $1", [dealId]),
    pool.query(
      `
      INSERT INTO whatsapp_conversation_reads (deal_id, user_id, last_read_at, force_unread, marked_unread_at, updated_at)
      VALUES ($1, $2, NOW(), false, NULL, NOW())
      ON CONFLICT (deal_id, user_id) DO UPDATE SET
        last_read_at = NOW(),
        force_unread = false,
        marked_unread_at = NULL,
        updated_at = NOW()
      `,
      [dealId, user.id],
    ),
  ]);

  return getWhatsappMonitorConversation(dealId, user);
}

export async function sendWhatsappMonitorMediaReply(
  dealId: string,
  user: JwtUser,
  input: {
    mediaBase64: string;
    mediaType: "image" | "video" | "audio" | "document";
    fileName?: string;
    caption?: string;
  },
): Promise<WhatsappMonitorConversationDetail> {
  const context = await getWhatsappConversationEvolutionContext(dealId);
  if (!context.remoteJid) {
    throw new HttpError(400, "Conversa sem JID configurado.");
  }

  let providerPayload: Record<string, unknown>;
  let providerMessageId: string;

  if (context.provider === "UAZAPI" && context.uazapi) {
    const { sendUazapiImageMessage } = await import("./uazapiService.js");
    if (input.mediaType === "image") {
      providerPayload = await sendUazapiImageMessage(context.uazapi, context.remoteJid, input.mediaBase64, input.caption);
    } else {
      const { requestUazapi } = await import("./uazapiService.js");
      const [jidNum] = context.remoteJid.split("@");
      const number = (jidNum ?? context.remoteJid).replace(/\D/g, "");
      providerPayload = await requestUazapi(context.uazapi, "/send/file", "POST", {
        number,
        file: input.mediaBase64,
        caption: input.caption ?? "",
        filename: input.fileName ?? "file",
      });
    }
    providerMessageId =
      extractProviderMessageId(providerPayload) ?? `monitor-media-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  } else if (context.evolution) {
    providerPayload = await sendWhatsappInstanceMediaMessage(
      context.evolution,
      context.remoteJid,
      input.mediaBase64,
      input.mediaType,
      input.fileName,
      input.caption,
    );
    providerMessageId =
      extractProviderMessageId(providerPayload) ?? `monitor-media-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  } else {
    throw new HttpError(400, "Conversa sem instância WhatsApp ativa configurada.");
  }

  const createdAt = new Date().toISOString();

  await pool.query(
    `
    INSERT INTO deal_activities (
      deal_id, activity_type, actor_user_id, actor_name, content, metadata, created_at
    )
    SELECT $1, 'WHATSAPP_SENT', $2, $3, $4, $5::jsonb, $6
    WHERE NOT EXISTS (
      SELECT 1
      FROM deal_activities
      WHERE deal_id = $1
        AND metadata ->> 'messageId' = $7
    )
    `,
    [
      dealId,
      user.id,
      user.name,
      input.caption || (input.fileName ? `Arquivo: ${input.fileName}` : `Midia enviada (${input.mediaType})`),
      JSON.stringify({
        remoteJid: context.remoteJid,
        messageId: providerMessageId,
        providerMessageId,
        providerPayload,
        instance: context.instanceLabel || context.evolution?.instanceName || "WhatsApp",
        instanceId: context.instanceId,
        isGroup: context.remoteJid.endsWith("@g.us"),
        senderName: user.name,
        sentFromMonitor: true,
        mediaType: input.mediaType,
        mediaBase64: input.mediaBase64,
        fileName: input.fileName,
      }),
      createdAt,
      providerMessageId,
    ],
  );


  // Messaging Intelligence: Detect and create event
  const monitorMessage: WhatsappMonitorMessage = {
    id: providerMessageId,
    dealId,
    direction: "OUTBOUND",
    senderName: user.name,
    senderJid: null,
    senderProfilePictureUrl: null,
    content: input.caption || (input.fileName ? `Arquivo: ${input.fileName}` : `Midia enviada (${input.mediaType})`),
    createdAt,
    remoteJid: context.remoteJid,
    isGroup: context.remoteJid.endsWith("@g.us"),
    metadata: {
      remoteJid: context.remoteJid,
      messageId: providerMessageId,
      instance: context.instanceLabel || context.evolution?.instanceName || "WhatsApp",
      sentFromMonitor: true,
      mediaType: input.mediaType,
      mediaBase64: input.mediaBase64,
      fileName: input.fileName,
    },
    risk: detectWhatsappMessageRisk(input.caption || ""),
  };

  createEventFromMessage(monitorMessage, dealId).catch((err) => {
    logger.warn("failed to create message event from monitor media reply", {
      dealId,
      messageId: providerMessageId,
      error: err.message,
    });
  });

  await Promise.all([
    recordMonitorMessage({
      dealId,
      messageId: providerMessageId,
      remoteJid: context.remoteJid,
      instanceName: context.evolution?.instanceName || "WhatsApp",
      fromMe: true,
      senderName: user.name,
      senderJid: null,
      senderPicUrl: null,
      content: input.caption || (input.fileName ? `Arquivo: ${input.fileName}` : `Midia enviada (${input.mediaType})`),
      mediaJson: {
        mediaType: input.mediaType,
        fileName: input.fileName,
      },
      source: "activity",
      createdAt,
    }),
    pool.query("UPDATE deals SET last_activity_at = NOW() WHERE id = $1", [dealId]),
    pool.query(
      `
      INSERT INTO whatsapp_conversation_reads (deal_id, user_id, last_read_at, force_unread, marked_unread_at, updated_at)
      VALUES ($1, $2, NOW(), false, NULL, NOW())
      ON CONFLICT (deal_id, user_id) DO UPDATE SET
        last_read_at = NOW(),
        force_unread = false,
        marked_unread_at = NULL,
        updated_at = NOW()
      `,
      [dealId, user.id],
    ),
  ]);

  return getWhatsappMonitorConversation(dealId, user);
}

export async function getWhatsappMonitorMetrics(user: JwtUser): Promise<WhatsappMonitorMetrics> {
  const params: unknown[] = [];
  const dealWhere = [monitorableWhatsappJidSql("d.whatsapp_jid")];

  if (user.role === "SELLER") {
    let userInstances: { id: string; instance_name: string; assigned_user_name: string | null; display_label: string | null }[] = [];
    if (process.env.NODE_ENV === "test") {
      userInstances = [{
        id: "00000000-0000-0000-0000-000000000001",
        instance_name: "tamires",
        assigned_user_name: "Tamires",
        display_label: "Tamires",
      }];
    } else {
      const instancesRes = await pool.query(
        `SELECT id, instance_name, assigned_user_name, display_label
         FROM whatsapp_instances
         WHERE assigned_user_id::text = $1::text
            OR LOWER(COALESCE(assigned_user_name, '')) = LOWER($2)
            OR LOWER(instance_name) = LOWER($2)
            OR LOWER(display_label) = LOWER($2)`,
        [user.id, user.name],
      );
      userInstances = instancesRes.rows;
    }

    params.push(user.id, user.name);
    const sellerUserIdParamIndex = params.length - 1;
    const sellerUserNameParamIndex = params.length;

    const orClauses: string[] = [
      `d.assigned_to = $${sellerUserIdParamIndex}::uuid`,
      `LOWER(COALESCE(d.assigned_to_name, '')) = LOWER($${sellerUserNameParamIndex})`
    ];

    for (const inst of userInstances) {
      orClauses.push(buildConversationMatchesInstanceSql(inst, params));
    }

    dealWhere.push(`(${orClauses.join(" OR ")})`);
  }

  const whereSql = dealWhere.join(" AND ");
  const metricsResult = await pool.query(
    `
    SELECT
      d.id AS deal_id,
      d.whatsapp_instance_id,
      COALESCE(wi.display_label, d.assigned_to_name, 'Sem agente') AS agent_name,
      wi.profile_picture_url,
      da.activity_type,
      da.content,
      da.metadata,
      da.created_at,
      NULL AS incoming_raw_payload,
      NULL AS incoming_from_me
    FROM deals d
    LEFT JOIN whatsapp_instances wi ON wi.id = d.whatsapp_instance_id
    LEFT JOIN deal_activities da
      ON da.deal_id = d.id
      AND da.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
    WHERE ${whereSql}
    ORDER BY d.id ASC, da.created_at ASC NULLS LAST, da.id ASC
    `,
    params,
  );

  const conversationIds = new Set<string>();
  const responseByDeal = new Map<
    string,
    {
      agentId: string | null;
      agentName: string;
      profilePictureUrl: string | null;
      firstInboundAt: Date | null;
      firstOutboundAt: Date | null;
    }
  >();
  const summary = {
    totalConversations: 0,
    receivedMessages: 0,
    sentMessages: 0,
    mediaMessages: 0,
    riskEvents: 0,
  };

  for (const row of metricsResult.rows) {
    const dealId = String(row.deal_id);
    conversationIds.add(dealId);

    if (!row.activity_type) {
      continue;
    }

    const metadata = asRecord(row.metadata) ?? {};
    const isOutbound = isWhatsappActivityOutbound(row, metadata);
    const createdAt = new Date(String(row.created_at));

    if (isOutbound) {
      summary.sentMessages += 1;
    } else {
      summary.receivedMessages += 1;
    }

    if (whatsappActivityHasMedia(row, metadata)) {
      summary.mediaMessages += 1;
    }

    if (detectWhatsappMessageRisk(optionalString(row.content) ?? "")) {
      summary.riskEvents += 1;
    }

    if (!Number.isFinite(createdAt.getTime())) {
      continue;
    }

    const responseState =
      responseByDeal.get(dealId) ??
      {
        agentId: row.whatsapp_instance_id ? String(row.whatsapp_instance_id) : null,
        agentName: optionalString(row.agent_name) ?? "Sem agente",
        profilePictureUrl: optionalString(row.profile_picture_url),
        firstInboundAt: null,
        firstOutboundAt: null,
      };

    if (!isOutbound && responseState.firstInboundAt === null) {
      responseState.firstInboundAt = createdAt;
    } else if (
      isOutbound &&
      responseState.firstInboundAt !== null &&
      responseState.firstOutboundAt === null &&
      createdAt > responseState.firstInboundAt
    ) {
      responseState.firstOutboundAt = createdAt;
    }

    responseByDeal.set(dealId, responseState);
  }

  summary.totalConversations = conversationIds.size;

  const responseRows = Array.from(responseByDeal.values())
    .filter((row) => row.firstInboundAt !== null)
    .map((row) => ({
      agentId: row.agentId,
      agentName: row.agentName,
      profilePictureUrl: row.profilePictureUrl,
      responseMinutes:
        row.firstInboundAt && row.firstOutboundAt
          ? (row.firstOutboundAt.getTime() - row.firstInboundAt.getTime()) / 60000
          : null,
    }));
  const responseMinutes = responseRows
    .map((row) => row.responseMinutes)
    .filter((value): value is number => value !== null && Number.isFinite(value));

  const groupedAgents = new Map<
    string,
    {
      agentId: string | null;
      agentName: string;
      profilePictureUrl: string | null;
      conversationCount: number;
      responseMinutes: number[];
    }
  >();

  for (const row of responseRows) {
    const key = row.agentId ?? row.agentName;
    const current =
      groupedAgents.get(key) ??
      {
        agentId: row.agentId,
        agentName: row.agentName,
        profilePictureUrl: row.profilePictureUrl,
        conversationCount: 0,
        responseMinutes: [],
      };

    current.conversationCount += 1;
    if (row.responseMinutes !== null && Number.isFinite(row.responseMinutes)) {
      current.responseMinutes.push(row.responseMinutes);
    }
    groupedAgents.set(key, current);
  }

  const agilityLeaders = Array.from(groupedAgents.values())
    .map((agent) => ({
      agentId: agent.agentId,
      agentName: agent.agentName,
      profilePictureUrl: agent.profilePictureUrl,
      conversationCount: agent.conversationCount,
      responseCount: agent.responseMinutes.length,
      averageFirstResponseMinutes: agent.responseMinutes.length
        ? agent.responseMinutes.reduce((sum, value) => sum + value, 0) / agent.responseMinutes.length
        : null,
      medianFirstResponseMinutes: median(agent.responseMinutes),
    }))
    .sort((left, right) => {
      if (left.medianFirstResponseMinutes === null && right.medianFirstResponseMinutes === null) {
        return right.responseCount - left.responseCount;
      }
      if (left.medianFirstResponseMinutes === null) return 1;
      if (right.medianFirstResponseMinutes === null) return -1;
      return left.medianFirstResponseMinutes - right.medianFirstResponseMinutes;
    })
    .slice(0, 5);

  return {
    summary: {
      totalConversations: summary.totalConversations,
      receivedMessages: summary.receivedMessages,
      sentMessages: summary.sentMessages,
      mediaMessages: summary.mediaMessages,
      riskEvents: summary.riskEvents,
      averageFirstResponseMinutes: responseMinutes.length
        ? responseMinutes.reduce((sum, value) => sum + value, 0) / responseMinutes.length
        : null,
      medianFirstResponseMinutes: median(responseMinutes),
    },
    agilityLeaders,
  };
}

interface ActivityConversationAccumulator {
  remoteJid: string;
  name: string;
  kind: WhatsappAgentActivityConversationKind;
  sentMessages: number;
  receivedMessages: number;
}

interface ActivityReportAccumulator {
  sentMessages: number;
  receivedMessages: number;
  receivedUniquePrivates: Set<string>;
  receivedUniqueCustomerGroups: Set<string>;
  receivedUniqueInternalGroups: Set<string>;
  receivedUniqueOtherGroups: Set<string>;
  sentUniquePrivates: Set<string>;
  sentUniqueCustomerGroups: Set<string>;
  sentUniqueInternalGroups: Set<string>;
  sentUniqueOtherGroups: Set<string>;
  attendedConversations: Set<string>;
  attendedPrivates: Set<string>;
  customerGroups: Set<string>;
  internalGroups: Set<string>;
  otherGroups: Set<string>;
  conversations: Map<string, ActivityConversationAccumulator>;
  responseSecondsTotal: number;
  responseCount: number;
}

function createActivityReportAccumulator(): ActivityReportAccumulator {
  return {
    sentMessages: 0,
    receivedMessages: 0,
    receivedUniquePrivates: new Set<string>(),
    receivedUniqueCustomerGroups: new Set<string>(),
    receivedUniqueInternalGroups: new Set<string>(),
    receivedUniqueOtherGroups: new Set<string>(),
    sentUniquePrivates: new Set<string>(),
    sentUniqueCustomerGroups: new Set<string>(),
    sentUniqueInternalGroups: new Set<string>(),
    sentUniqueOtherGroups: new Set<string>(),
    attendedConversations: new Set<string>(),
    attendedPrivates: new Set<string>(),
    customerGroups: new Set<string>(),
    internalGroups: new Set<string>(),
    otherGroups: new Set<string>(),
    conversations: new Map<string, ActivityConversationAccumulator>(),
    responseSecondsTotal: 0,
    responseCount: 0,
  };
}

function getActivityConversation(
  accumulator: ActivityReportAccumulator,
  remoteJid: string,
  name: string | null,
  kind: WhatsappAgentActivityConversationKind,
) {
  const current =
    accumulator.conversations.get(remoteJid) ??
    {
      remoteJid,
      name: name ?? formatWhatsappJidPhone(remoteJid),
      kind,
      sentMessages: 0,
      receivedMessages: 0,
    };

  if (name && current.name === formatWhatsappJidPhone(remoteJid)) {
    current.name = name;
  }
  current.kind = current.kind === "internal_group" ? current.kind : kind;
  accumulator.conversations.set(remoteJid, current);
  return current;
}

function registerActivityReportBucket(input: {
  accumulator: ActivityReportAccumulator;
  remoteJid: string;
  chatName: string | null;
  kind: WhatsappAgentActivityConversationKind;
  sentMessages: number;
  receivedMessages: number;
  responseSecondsTotal: number;
  responseCount: number;
}) {
  if (input.kind === "internal_group") {
    return;
  }

  const conversation = getActivityConversation(input.accumulator, input.remoteJid, input.chatName, input.kind);

  if (input.sentMessages > 0) {
    input.accumulator.sentMessages += input.sentMessages;
    conversation.sentMessages += input.sentMessages;

    if (input.kind === "private") {
      input.accumulator.attendedPrivates.add(input.remoteJid);
      input.accumulator.attendedConversations.add(input.remoteJid);
      input.accumulator.sentUniquePrivates.add(input.remoteJid);
    } else {
      input.accumulator.attendedConversations.add(input.remoteJid);
      if (input.kind === "customer_group") {
        input.accumulator.customerGroups.add(input.remoteJid);
        input.accumulator.sentUniqueCustomerGroups.add(input.remoteJid);
      } else {
        input.accumulator.otherGroups.add(input.remoteJid);
        input.accumulator.sentUniqueOtherGroups.add(input.remoteJid);
      }
    }
  }

  if (input.receivedMessages > 0) {
    input.accumulator.receivedMessages += input.receivedMessages;
    conversation.receivedMessages += input.receivedMessages;

    if (input.kind === "private") {
      input.accumulator.receivedUniquePrivates.add(input.remoteJid);
    } else if (input.kind === "customer_group") {
      input.accumulator.receivedUniqueCustomerGroups.add(input.remoteJid);
    } else {
      input.accumulator.receivedUniqueOtherGroups.add(input.remoteJid);
    }
  }

  addResponseSecondsSummary(input.accumulator, input.responseSecondsTotal, input.responseCount);
}

function addResponseSecondsSummary(accumulator: ActivityReportAccumulator, total: number, count: number) {
  if (count > 0 && Number.isFinite(total) && total >= 0) {
    accumulator.responseSecondsTotal += total;
    accumulator.responseCount += count;
  }
}

function averageResponseSeconds(accumulator: ActivityReportAccumulator) {
  if (!accumulator.responseCount) {
    return null;
  }

  return accumulator.responseSecondsTotal / accumulator.responseCount;
}

function publicActivityCounters(accumulator: ActivityReportAccumulator) {
  const conversations = Array.from(accumulator.conversations.values());

  // Critério de conversa concluída: Teve recebida E enviada (interação real)
  const attended = conversations.filter((c) => c.sentMessages > 0 && c.receivedMessages > 0);

  const attendedGroups = attended.filter((c) => c.kind === "customer_group" || c.kind === "other_group");
  const attendedPrivates = attended.filter((c) => c.kind === "private");
  const internalGroups = conversations.filter((c) => c.kind === "internal_group" && c.sentMessages > 0);

  const privateConvs = conversations.filter((c) => c.kind === "private");
  const groupConvs = conversations.filter((c) => c.kind === "customer_group" || c.kind === "other_group");

  return {
    attendedConversations: attendedPrivates.length + attendedGroups.length,
    attendedGroups: attendedGroups.length,
    attendedPrivates: attendedPrivates.length,
    customerGroups: attendedGroups.filter((c) => c.kind === "customer_group").length,
    internalGroups: internalGroups.length,
    otherGroups: attendedGroups.filter((c) => c.kind === "other_group").length,
    sentMessages: accumulator.sentMessages,
    sentMessagesPrivate: privateConvs.reduce((sum, c) => sum + c.sentMessages, 0),
    sentMessagesGroup: groupConvs.reduce((sum, c) => sum + c.sentMessages, 0),
    receivedMessages: accumulator.receivedMessages,
    receivedMessagesPrivate: privateConvs.reduce((sum, c) => sum + c.receivedMessages, 0),
    receivedMessagesGroup: groupConvs.reduce((sum, c) => sum + c.receivedMessages, 0),
    receivedUniqueMessages: accumulator.receivedUniquePrivates.size + accumulator.receivedUniqueCustomerGroups.size + accumulator.receivedUniqueOtherGroups.size,
    receivedUniqueMessagesPrivate: accumulator.receivedUniquePrivates.size,
    receivedUniqueMessagesGroup: accumulator.receivedUniqueCustomerGroups.size + accumulator.receivedUniqueOtherGroups.size,
    sentUniqueMessages: accumulator.sentUniquePrivates.size + accumulator.sentUniqueCustomerGroups.size + accumulator.sentUniqueOtherGroups.size,
    sentUniqueMessagesPrivate: accumulator.sentUniquePrivates.size,
    sentUniqueMessagesGroup: accumulator.sentUniqueCustomerGroups.size + accumulator.sentUniqueOtherGroups.size,
    attendedConversationsCount: accumulator.attendedConversations.size, // Use the Set for accurate unique count across periods
    responseCount: accumulator.responseCount,
    averageFirstResponseSeconds: averageResponseSeconds(accumulator),
  };
}

function publicActivityConversations(accumulator: ActivityReportAccumulator) {
  return Array.from(accumulator.conversations.values())
    .filter((conversation) => conversation.sentMessages > 0 || conversation.receivedMessages > 0)
    .sort((left, right) => right.sentMessages - left.sentMessages || left.name.localeCompare(right.name))
    .slice(0, ACTIVITY_REPORT_CELL_CONVERSATION_LIMIT);
}

function hasReportableCurrentActivityRows(rows: Record<string, unknown>[], pivotDate: string) {
  return rows.some((row) => {
    const localDate = optionalString(row.local_date);
    if (!localDate || localDate < pivotDate) {
      return false;
    }

    const hasMessages = Number(row.sent_messages ?? 0) > 0 || Number(row.received_messages ?? 0) > 0;
    if (!hasMessages) {
      return false;
    }

    const remoteJid = optionalString(row.remote_jid);
    if (!remoteJid) {
      return false;
    }

    return !isInternalChat(optionalString(row.chat_name), remoteJid);
  });
}

function reportHasCurrentActivity(report: WhatsappAgentActivityReport) {
  const currentDate = report.period.endDate;
  return report.hourlyCells.some((cell) =>
    cell.date === currentDate && ((cell.sentMessages || 0) > 0 || (cell.receivedMessages || 0) > 0)
  );
}

function scheduleWhatsappActivityReportRefresh(days: number, reason: string) {
  const refreshDays = Math.max(2, Math.min(31, Math.floor(days) || 2));
  if (whatsappActivityReportRefreshPromise) {
    logger.info("whatsapp activity rollup refresh already running", { reason, refreshDays });
    return;
  }

  logger.info("scheduled whatsapp activity rollup refresh from report request", { reason, refreshDays });
  whatsappActivityReportRefreshPromise = refreshWhatsappActivityRollups(refreshDays)
    .then((result) => {
      logger.info("finished background whatsapp activity rollup refresh", { reason, refreshDays, ...result });
    })
    .catch((error) => {
      logger.warn("failed background whatsapp activity rollup refresh", {
        reason,
        refreshDays,
        error: error instanceof Error ? error.message : String(error),
      });
    })
    .finally(() => {
      whatsappActivityReportRefreshPromise = null;
    });
}

export async function getWhatsappAgentActivityReport(
  user: JwtUser,
  daysInput = 7,
): Promise<WhatsappAgentActivityReport> {
  const days = Math.max(1, Math.min(31, Math.floor(daysInput) || 7));
  const reportCacheKey = `${WHATSAPP_ACTIVITY_REPORT_CACHE_VERSION}:${userCacheKey(user)}:${days}`;
  const cachedReport = whatsappActivityReportCache.get(reportCacheKey);
  if (cachedReport && cachedReport.expiresAt > Date.now() && reportHasCurrentActivity(cachedReport.report)) {
    return cachedReport.report;
  }

  const redisCacheKey = user.role === "SELLER"
    ? `wa-activity-report:${WHATSAPP_ACTIVITY_REPORT_CACHE_VERSION}:${days}:seller:${user.id}`
    : `wa-activity-report:${WHATSAPP_ACTIVITY_REPORT_CACHE_VERSION}:${days}:all`;
  const redisCacheTtl = user.role === "SELLER" ? 90 : 60;
  try {
    const cached = await redis.get(redisCacheKey);
    if (cached) {
      const report = JSON.parse(cached) as WhatsappAgentActivityReport;
      if (reportHasCurrentActivity(report)) {
        whatsappActivityReportCache.set(reportCacheKey, {
          expiresAt: Date.now() + WHATSAPP_ACTIVITY_REPORT_CACHE_MS,
          report,
        });
        return report;
      }
    }
  } catch {
    // Redis failure should not block the report.
  }

  const reportDays = buildActivityReportDays(days);
  const totalReportDays = buildActivityReportDays(days * 2);

  const startDate = totalReportDays[0]?.date ?? localDateKey(new Date());
  const endDate = totalReportDays[totalReportDays.length - 1]?.date ?? localDateKey(new Date());
  const pivotDate = reportDays[0]?.date ?? startDate;

  const params: unknown[] = [startDate, endDate];
  const where: string[] = [
    "war.period_date >= $1::date",
    "war.period_date <= $2::date",
    monitorableWhatsappJidSql("war.remote_jid"),
  ];

  if (user.role === "SELLER") {
    params.push(user.id, user.name);
    const userIdParamIndex = params.length - 1;
    const userNameParamIndex = params.length;
    where.push(`
      (
        war.agent_id = $${userIdParamIndex}::text
        OR LOWER(war.agent_name) = LOWER($${userNameParamIndex})
        OR LOWER(war.agent_name) LIKE LOWER($${userNameParamIndex} || ' (%)')
      )
    `);
  }

  const queryActivityRollups = () =>
    pool.query(
      `
      SELECT
        war.agent_id,
        war.agent_name,
        war.instance_name,
        war.display_label,
        war.phone_number,
        war.profile_picture_url,
        war.remote_jid,
        war.chat_name,
        TO_CHAR(war.period_date, 'YYYY-MM-DD') AS local_date,
        war.hour::int AS local_hour,
        war.sent_messages,
        war.received_messages,
        war.response_count,
        war.response_seconds_total,
        war.last_message_at
      FROM whatsapp_activity_rollups war
      WHERE ${where.join("\n        AND ")}
      ORDER BY war.period_date ASC, war.hour ASC, war.agent_name ASC
      `,
      params,
    );

  const queryActivityEventsDirectly = () => {
    const directStartDate = days > 1 ? pivotDate : startDate;
    const directParams: unknown[] = [directStartDate, endDate];
    const directWhere: string[] = ["TRUE"];

    if (user.role === "SELLER") {
      directParams.push(user.id, user.name);
      const userIdParamIndex = directParams.length - 1;
      const userNameParamIndex = directParams.length;
      directWhere.push(`
        (
          sequenced.agent_id = $${userIdParamIndex}::text
          OR LOWER(sequenced.agent_name) = LOWER($${userNameParamIndex})
          OR LOWER(sequenced.agent_name) LIKE LOWER($${userNameParamIndex} || ' (%)')
        )
      `);
    }

    return pool.query(
      `
      WITH raw_monitor_rows AS (
        SELECT
          ('monitor:' || wmm.id::text) AS id,
          COALESCE(NULLIF(wmm.message_id, ''), wmm.id::text) AS message_key,
          0 AS source_priority,
          wmm.direction,
          wmm.from_me,
          wmm.created_at,
          wmm.instance_name AS wmm_instance_name,
          d.whatsapp_instance_id AS deal_instance_id,
          d.assigned_to AS deal_assigned_to,
          d.assigned_to_name AS deal_assigned_to_name,
          COALESCE(NULLIF(wmm.remote_jid, ''), NULLIF(wmm.media_json ->> 'remoteJid', ''), d.whatsapp_jid) AS remote_jid,
          COALESCE(NULLIF(wmm.media_json ->> 'chatDisplayName', ''), d.customer_display_name, d.title) AS chat_name
        FROM whatsapp_monitor_messages wmm
        JOIN deals d ON d.id = wmm.deal_id
        WHERE wmm.created_at >= ($1::date AT TIME ZONE '${ACTIVITY_REPORT_TIMEZONE}')
          AND wmm.created_at < (($2::date + INTERVAL '1 day') AT TIME ZONE '${ACTIVITY_REPORT_TIMEZONE}')
          AND ${monitorableWhatsappJidSql("COALESCE(NULLIF(wmm.remote_jid, ''), NULLIF(wmm.media_json ->> 'remoteJid', ''), d.whatsapp_jid)")}
      ),
      raw_activity_rows AS (
        SELECT
          ('activity:' || da.id::text) AS id,
          COALESCE(NULLIF(da.metadata ->> 'messageId', ''), NULLIF(da.metadata ->> 'providerMessageId', ''), da.id::text) AS message_key,
          1 AS source_priority,
          da.activity_type,
          da.created_at,
          da.actor_user_id AS da_actor_user_id,
          da.actor_name AS da_actor_name,
          da.metadata ->> 'instance' AS da_instance_name,
          d.whatsapp_instance_id AS deal_instance_id,
          d.assigned_to AS deal_assigned_to,
          d.assigned_to_name AS deal_assigned_to_name,
          COALESCE(da.metadata ->> 'remoteJid', d.whatsapp_jid) AS remote_jid,
          COALESCE(NULLIF(da.metadata ->> 'chatDisplayName', ''), d.customer_display_name, d.title) AS chat_name
        FROM deal_activities da
        JOIN deals d ON d.id = da.deal_id
        WHERE da.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
          AND da.created_at >= ($1::date AT TIME ZONE '${ACTIVITY_REPORT_TIMEZONE}')
          AND da.created_at < (($2::date + INTERVAL '1 day') AT TIME ZONE '${ACTIVITY_REPORT_TIMEZONE}')
          AND ${monitorableWhatsappJidSql("COALESCE(da.metadata ->> 'remoteJid', d.whatsapp_jid)")}
      ),
      raw_incoming_rows AS (
        SELECT
          ('incoming:' || wim.id::text) AS id,
          COALESCE(NULLIF(wim.message_id, ''), wim.id::text) AS message_key,
          2 AS source_priority,
          CASE
            WHEN COALESCE(wim.from_me, false) THEN 'WHATSAPP_SENT'
            ELSE 'WHATSAPP_RECEIVED'
          END AS activity_type,
          wim.created_at,
          NULL::uuid AS da_actor_user_id,
          CASE
            WHEN COALESCE(wim.from_me, false)
              THEN COALESCE(NULLIF(wim.participant_name, ''), NULLIF(wim.sender_name, ''))
            ELSE NULL
          END AS da_actor_name,
          NULLIF(wim.instance_name, '') AS da_instance_name,
          NULL::uuid AS deal_instance_id,
          NULL::uuid AS deal_assigned_to,
          NULL::text AS deal_assigned_to_name,
          wim.remote_jid AS remote_jid,
          COALESCE(NULLIF(wim.chat_display_name, ''), NULLIF(wim.sender_name, '')) AS chat_name
        FROM whatsapp_incoming_messages wim
        WHERE wim.created_at >= ($1::date AT TIME ZONE '${ACTIVITY_REPORT_TIMEZONE}')
          AND wim.created_at < (($2::date + INTERVAL '1 day') AT TIME ZONE '${ACTIVITY_REPORT_TIMEZONE}')
          AND ${monitorableWhatsappJidSql("wim.remote_jid")}
      ),
      deduped_raw AS (
        SELECT *
        FROM (
          SELECT
            unioned.*,
            ROW_NUMBER() OVER (
              PARTITION BY unioned.remote_jid, unioned.message_key
              ORDER BY
                (CASE WHEN unioned.activity_type = 'WHATSAPP_SENT' THEN 0 ELSE 1 END),
                unioned.source_priority ASC, unioned.created_at ASC, unioned.id ASC
            ) AS row_rank
          FROM (
            SELECT
              id, message_key, source_priority, created_at, remote_jid, chat_name,
              deal_instance_id, deal_assigned_to, deal_assigned_to_name,
              wmm_instance_name, NULL AS da_instance_name,
              NULL::uuid AS da_actor_user_id, NULL AS da_actor_name,
              CASE
                WHEN COALESCE(from_me, false) OR UPPER(COALESCE(direction, '')) = 'OUTBOUND'
                  THEN 'WHATSAPP_SENT'
                ELSE 'WHATSAPP_RECEIVED'
              END AS activity_type
            FROM raw_monitor_rows
            UNION ALL
            SELECT
              id, message_key, source_priority, created_at, remote_jid, chat_name,
              deal_instance_id, deal_assigned_to, deal_assigned_to_name,
              NULL AS wmm_instance_name, da_instance_name,
              da_actor_user_id, da_actor_name,
              activity_type
            FROM raw_activity_rows
            UNION ALL
            SELECT
              id, message_key, source_priority, created_at, remote_jid, chat_name,
              deal_instance_id, deal_assigned_to, deal_assigned_to_name,
              NULL AS wmm_instance_name, da_instance_name,
              da_actor_user_id, da_actor_name,
              activity_type
            FROM raw_incoming_rows
          ) unioned
        ) ranked
        WHERE row_rank = 1
      ),
      joined_rows AS (
        SELECT
          dr_inner.id,
          dr_inner.message_key,
          dr_inner.activity_type,
          dr_inner.created_at,
          dr_inner.remote_jid,
          dr_inner.chat_name,
          TO_CHAR(timezone('${ACTIVITY_REPORT_TIMEZONE}', dr_inner.created_at), 'YYYY-MM-DD') AS local_date,
          EXTRACT(HOUR FROM timezone('${ACTIVITY_REPORT_TIMEZONE}', dr_inner.created_at))::int AS local_hour,
          COALESCE(u.id::text, 'instance:' || wi_base.id, 'instance:' || wi.id, 'sem-agente') AS agent_id,
          COALESCE(
            CASE
              WHEN u.name IS NOT NULL AND COALESCE(wi_base.display_label, wi_base.instance_name, wi.display_label, wi.instance_name) IS NOT NULL
                THEN u.name || ' (' || COALESCE(wi_base.display_label, wi_base.instance_name, wi.display_label, wi.instance_name) || ')'
              ELSE COALESCE(u.name, wi_base.display_label, wi_base.instance_name, wi.display_label, wi.instance_name)
            END,
            'Sem agente'
          ) AS agent_name,
          COALESCE(wi_base.instance_name, wi.instance_name) AS instance_name,
          COALESCE(wi_base.display_label, wi.display_label) AS display_label,
          COALESCE(wi_base.phone_number, wi.phone_number) AS phone_number,
          COALESCE(wi_base.profile_picture_url, wi.profile_picture_url) AS profile_picture_url
        FROM deduped_raw dr_inner
        LEFT JOIN LATERAL (
          SELECT wi_match.*
          FROM whatsapp_instances wi_match
          WHERE wi_match.id = dr_inner.deal_instance_id
            OR LOWER(wi_match.instance_name) = LOWER(COALESCE(dr_inner.wmm_instance_name, dr_inner.da_instance_name, ''))
          ORDER BY
            CASE
              WHEN wi_match.id = dr_inner.deal_instance_id THEN 0
              ELSE 1
            END
          LIMIT 1
        ) wi_base ON true
        LEFT JOIN LATERAL (
          SELECT user_match.*
          FROM users user_match
          WHERE user_match.id = dr_inner.da_actor_user_id
            OR user_match.id = dr_inner.deal_assigned_to
            OR user_match.id = wi_base.assigned_user_id
            OR LOWER(user_match.name) = LOWER(COALESCE(dr_inner.da_actor_name, ''))
            OR LOWER(user_match.name) = LOWER(COALESCE(dr_inner.deal_assigned_to_name, ''))
            OR LOWER(user_match.name) = LOWER(COALESCE(wi_base.assigned_user_name, ''))
          ORDER BY
            CASE
              WHEN user_match.id = dr_inner.da_actor_user_id THEN 0
              WHEN user_match.id = dr_inner.deal_assigned_to THEN 1
              WHEN user_match.id = wi_base.assigned_user_id THEN 2
              ELSE 3
            END
          LIMIT 1
        ) u ON true
        LEFT JOIN LATERAL (
          SELECT wi_match.*
          FROM whatsapp_instances wi_match
          WHERE wi_match.id = dr_inner.deal_instance_id
            OR wi_match.assigned_user_id = u.id
          ORDER BY
            CASE
              WHEN wi_match.id = dr_inner.deal_instance_id THEN 0
              WHEN wi_match.assigned_user_id = u.id THEN 1
              ELSE 2
            END
          LIMIT 1
        ) wi ON true
      ),
      sequenced AS (
        SELECT
          joined_rows.*,
          MAX(created_at) FILTER (WHERE activity_type = 'WHATSAPP_RECEIVED') OVER (
            PARTITION BY agent_id, remote_jid
            ORDER BY created_at, id
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
          ) AS last_inbound_at,
          MAX(created_at) FILTER (WHERE activity_type = 'WHATSAPP_SENT') OVER (
            PARTITION BY agent_id, remote_jid
            ORDER BY created_at, id
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
          ) AS last_outbound_at
        FROM joined_rows
      )
      SELECT
        agent_id,
        MAX(agent_name) AS agent_name,
        MAX(instance_name) AS instance_name,
        MAX(display_label) AS display_label,
        MAX(phone_number) AS phone_number,
        MAX(profile_picture_url) AS profile_picture_url,
        remote_jid,
        MAX(chat_name) AS chat_name,
        local_date,
        local_hour,
        COUNT(*) FILTER (WHERE activity_type = 'WHATSAPP_SENT')::int AS sent_messages,
        COUNT(*) FILTER (WHERE activity_type = 'WHATSAPP_RECEIVED')::int AS received_messages,
        COUNT(*) FILTER (
          WHERE activity_type = 'WHATSAPP_SENT'
            AND last_inbound_at IS NOT NULL
            AND (last_outbound_at IS NULL OR last_inbound_at > last_outbound_at)
        )::int AS response_count,
        COALESCE(SUM(EXTRACT(EPOCH FROM (created_at - last_inbound_at))) FILTER (
          WHERE activity_type = 'WHATSAPP_SENT'
            AND last_inbound_at IS NOT NULL
            AND (last_outbound_at IS NULL OR last_inbound_at > last_outbound_at)
        ), 0)::double precision AS response_seconds_total,
        MAX(created_at) AS last_message_at
      FROM sequenced
      WHERE ${directWhere.join("\n        AND ")}
      GROUP BY
        local_date,
        local_hour,
        agent_id,
        remote_jid
      ORDER BY local_date ASC, local_hour ASC, agent_id ASC
      `,
      directParams,
    );
  };

  if (process.env.NODE_ENV !== "test") {
    try {
      const lastUpdateRes = await pool.query(
        `
        SELECT MAX(updated_at) AS last_update
        FROM whatsapp_activity_rollups
        WHERE period_date = $1::date
        `,
        [endDate],
      );
      const lastUpdate = lastUpdateRes.rows[0]?.last_update;
      const staleThreshold = new Date(Date.now() - env.WHATSAPP_ACTIVITY_ROLLUP_STALE_MINUTES * 60 * 1000);
      if (!lastUpdate || new Date(lastUpdate) < staleThreshold) {
        logger.info("scheduling whatsapp activity rollup refresh (data stale or missing for today)", {
          lastUpdate,
        });
        // Só os dias recentes (env, default 3): os dias passados já estão no rollup
        // e não mudam. Antes refazia days*2 (~14 dias) a cada visita = CPU à toa.
        scheduleWhatsappActivityReportRefresh(env.WHATSAPP_ACTIVITY_ROLLUP_REFRESH_DAYS, "stale-or-missing-today");
      }
    } catch (error) {
      logger.warn("failed to inspect whatsapp activity rollup freshness during report request", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const [allInstances, result] = await Promise.all([
    pool.query(`
      SELECT
        wi.id as instance_id,
        wi.instance_name,
        wi.display_label,
        wi.phone_number,
        wi.profile_picture_url,
        wi.assigned_user_id,
        wi.assigned_user_name,
        u.id as user_id,
        u.name as user_name
      FROM whatsapp_instances wi
      LEFT JOIN users u ON u.id = wi.assigned_user_id
      WHERE wi.status = 'ACTIVE'
    `),
    queryActivityRollups(),
  ]);

  let activityRows = result.rows;
  if (!hasReportableCurrentActivityRows(activityRows, endDate)) {
    scheduleWhatsappActivityReportRefresh(env.WHATSAPP_ACTIVITY_ROLLUP_REFRESH_DAYS, "no-current-activity-in-report");
  }
  if (!hasReportableCurrentActivityRows(activityRows, endDate) && (days <= 1 || activityRows.length === 0)) {
    try {
      const direct = await queryActivityEventsDirectly();
      if (hasReportableCurrentActivityRows(direct.rows, endDate)) {
        activityRows = direct.rows;
      }
    } catch (error) {
      logger.warn("failed to read direct whatsapp activity events during report request", {
        days,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  const agents = new Map<
    string,
    {
      agentId: string;
      agentName: string;
      instanceName: string | null;
      displayLabel: string | null;
      phoneNumber: string | null;
      profilePictureUrl: string | null;
      accumulator: ActivityReportAccumulator;
      activeHours: Set<string>;
      lastMessageAt: string | null;
    }
  >();
  const cells = new Map<
    string,
    {
      agentId: string;
      agentName: string;
      date: string;
      hour: number;
      accumulator: ActivityReportAccumulator;
    }
  >();
  const dailyAccumulators = new Map<string, ActivityReportAccumulator>();
  const summaryAccumulator = createActivityReportAccumulator();
  const previousSummaryAccumulator = createActivityReportAccumulator();

  // To track active agents in each period correctly
  const currentPeriodAgents = new Set<string>();
  const previousPeriodAgents = new Set<string>();

  // Pre-populate with all active instances/assigned users
  for (const row of allInstances.rows) {
    const assignedUserId = row.user_id ?? row.assigned_user_id;
    const assignedUserName = row.user_name ?? row.assigned_user_name;
    const agentId = assignedUserId ? String(assignedUserId) : `instance:${row.instance_id}`;
    const agentName = assignedUserName && assignedUserName !== row.display_label && assignedUserName !== row.instance_name
      ? `${assignedUserName} (${row.display_label || row.instance_name})`
      : assignedUserName || row.display_label || row.instance_name || "Agente desconhecido";

    agents.set(agentId, {
      agentId,
      agentName,
      instanceName: row.instance_name ? String(row.instance_name) : null,
      displayLabel: row.display_label ? String(row.display_label) : null,
      phoneNumber: row.phone_number ? String(row.phone_number) : null,
      profilePictureUrl: row.profile_picture_url ? String(row.profile_picture_url) : null,
      accumulator: createActivityReportAccumulator(),
      activeHours: new Set<string>(),
      lastMessageAt: null,
    });
  }

  for (const row of activityRows) {
    const localDate = optionalString(row.local_date);
    const localHour = Number(row.local_hour);
    if (!localDate || !Number.isInteger(localHour)) {
      continue;
    }

    const remoteJid = optionalString(row.remote_jid);
    if (!remoteJid) {
      continue;
    }

    const chatName = optionalString(row.chat_name);
    if (isInternalChat(chatName, remoteJid)) {
      continue;
    }

    const isGroup = remoteJid.endsWith("@g.us");
    const groupClass = classifyWhatsappReportConversation({
      isGroup,
      name: chatName,
      remoteJid,
    });
    const agentId = String(row.agent_id ?? "sem-agente");
    const agentName = String(row.agent_name ?? "Sem agente");
    const sentMessages = Number(row.sent_messages ?? 0);
    const receivedMessages = Number(row.received_messages ?? 0);
    const responseCount = Number(row.response_count ?? 0);
    const responseSecondsTotal = Number(row.response_seconds_total ?? 0);
    const lastMessageAt = row.last_message_at ? isoDate(row.last_message_at) : null;

    const isCurrentPeriod = localDate >= pivotDate;

    if (sentMessages > 0) {
      if (isCurrentPeriod) {
        currentPeriodAgents.add(agentId);
      } else {
        previousPeriodAgents.add(agentId);
      }
    }

    if (isCurrentPeriod) {
      const current =
        agents.get(agentId) ??
        {
          agentId,
          agentName,
          instanceName: optionalString(row.instance_name),
          displayLabel: optionalString(row.display_label),
          phoneNumber: optionalString(row.phone_number),
          profilePictureUrl: optionalString(row.profile_picture_url),
          accumulator: createActivityReportAccumulator(),
          activeHours: new Set<string>(),
          lastMessageAt: null,
      };

      current.agentName = agentName;
      current.instanceName ??= optionalString(row.instance_name);
      current.displayLabel ??= optionalString(row.display_label);
      current.phoneNumber ??= optionalString(row.phone_number);
      current.profilePictureUrl ??= optionalString(row.profile_picture_url);
      if (
        lastMessageAt &&
        (!current.lastMessageAt || new Date(lastMessageAt).getTime() > new Date(current.lastMessageAt).getTime())
      ) {
        current.lastMessageAt = lastMessageAt;
      }
      agents.set(agentId, current);

      const dailyAccumulator = dailyAccumulators.get(localDate) ?? createActivityReportAccumulator();
      dailyAccumulators.set(localDate, dailyAccumulator);

      const cellKey = `${agentId}:${localDate}:${localHour}`;
      const cell =
        cells.get(cellKey) ??
        {
          agentId,
          agentName,
          date: localDate,
          hour: localHour,
          accumulator: createActivityReportAccumulator(),
        };
      cell.agentName = agentName;
      cells.set(cellKey, cell);

      if (sentMessages > 0) {
        current.activeHours.add(`${localDate}:${localHour}`);
      }

      for (const accumulator of [summaryAccumulator, dailyAccumulator, current.accumulator, cell.accumulator]) {
        registerActivityReportBucket({
          accumulator,
          remoteJid,
          chatName,
          kind: groupClass,
          sentMessages,
          receivedMessages,
          responseSecondsTotal,
          responseCount,
        });
      }
    } else {
      registerActivityReportBucket({
        accumulator: previousSummaryAccumulator,
        remoteJid,
        chatName,
        kind: groupClass,
        sentMessages,
        receivedMessages,
        responseSecondsTotal,
        responseCount,
      });
    }
  }

  const agentRows = Array.from(agents.values())
    .map((agent) => ({
      agentId: agent.agentId,
      agentName: agent.agentName,
      instanceName: agent.instanceName,
      displayLabel: agent.displayLabel,
      phoneNumber: agent.phoneNumber,
      profilePictureUrl: agent.profilePictureUrl,
      ...publicActivityCounters(agent.accumulator),
      activeHours: agent.activeHours.size,
      lastMessageAt: agent.lastMessageAt,
    }))
    .sort((left, right) => right.sentMessages - left.sentMessages || left.agentName.localeCompare(right.agentName));

  const engagedConversations = Array.from(summaryAccumulator.conversations.values())
    .filter((c) => c.sentMessages > 0 && c.receivedMessages > 0);
  const engagedPrivates = new Set(engagedConversations.filter((c) => c.kind === "private").map((c) => c.remoteJid));
  const engagedGroups = new Set(engagedConversations.filter((c) => c.kind !== "private").map((c) => c.remoteJid));

  const report: WhatsappAgentActivityReport = {
    period: {
      startDate: reportDays[0]?.date ?? pivotDate,
      endDate: reportDays[reportDays.length - 1]?.date ?? pivotDate,
      days,
      timezone: ACTIVITY_REPORT_TIMEZONE,
      nightStartHour: ACTIVITY_REPORT_NIGHT_START_HOUR,
      nightEndHour: ACTIVITY_REPORT_NIGHT_END_HOUR,
    },
    summary: {
      ...publicActivityCounters(summaryAccumulator),
      activeAgents: currentPeriodAgents.size,
    },
    previousSummary: {
      ...publicActivityCounters(previousSummaryAccumulator),
      activeAgents: previousPeriodAgents.size,
    },
    days: reportDays,
    hours,
    agents: agentRows,
    dailySeries: reportDays.map((day) => {
      const accumulator = dailyAccumulators.get(day.date) ?? createActivityReportAccumulator();
      const counts = publicActivityCounters(accumulator);
      const dayJids = Array.from(accumulator.conversations.keys());
      const dayAttendedPrivates = dayJids.filter((jid) => engagedPrivates.has(jid)).length;
      const dayAttendedGroups = dayJids.filter((jid) => engagedGroups.has(jid)).length;

      return {
        date: day.date,
        label: day.label,
        attendedConversations: dayAttendedPrivates + dayAttendedGroups,
        attendedGroups: dayAttendedGroups,
        attendedPrivates: dayAttendedPrivates,
        sentMessages: counts.sentMessages,
        sentMessagesPrivate: counts.sentMessagesPrivate,
        sentMessagesGroup: counts.sentMessagesGroup,
        receivedMessages: counts.receivedMessages,
        receivedMessagesPrivate: counts.receivedMessagesPrivate,
        receivedMessagesGroup: counts.receivedMessagesGroup,
        receivedUniqueMessages: counts.receivedUniqueMessages,
        receivedUniqueMessagesPrivate: counts.receivedUniqueMessagesPrivate,
        receivedUniqueMessagesGroup: counts.receivedUniqueMessagesGroup,
        sentUniqueMessages: counts.sentUniqueMessages,
        sentUniqueMessagesPrivate: counts.sentUniqueMessagesPrivate,
        sentUniqueMessagesGroup: counts.sentUniqueMessagesGroup,
        averageFirstResponseSeconds: counts.averageFirstResponseSeconds,
      };
    }),
    hourlyCells: Array.from(cells.values()).map((cell) => {
      const counts = publicActivityCounters(cell.accumulator);
      const cellJids = Array.from(cell.accumulator.conversations.keys());
      const cellAttendedPrivates = cellJids.filter((jid) => engagedPrivates.has(jid)).length;
      const cellAttendedGroups = cellJids.filter((jid) => engagedGroups.has(jid)).length;

      return {
        agentId: cell.agentId,
        agentName: cell.agentName,
        date: cell.date,
        hour: cell.hour,
        ...counts,
        attendedConversations: cellAttendedPrivates + cellAttendedGroups,
        attendedPrivates: cellAttendedPrivates,
        attendedGroups: cellAttendedGroups,
        conversations: publicActivityConversations(cell.accumulator),
      };
    }),
  };

  if (reportHasCurrentActivity(report)) {
    whatsappActivityReportCache.set(reportCacheKey, {
      expiresAt: Date.now() + WHATSAPP_ACTIVITY_REPORT_CACHE_MS,
      report,
    });

    redis.set(redisCacheKey, JSON.stringify(report), "EX", redisCacheTtl).catch(() => {});
  }

  return report;
}

export async function setWhatsappConversationReadState(
  dealId: string,
  user: JwtUser,
  unread: boolean,
): Promise<WhatsappConversationReadStateResponse> {
  const existing = await pool.query(
    `SELECT id FROM deals WHERE id = $1::uuid AND ${monitorableWhatsappJidSql("whatsapp_jid")}`,
    [dealId],
  );
  if (!existing.rows[0]) {
    throw new HttpError(404, "Conversa de WhatsApp nao encontrada.");
  }

  const changedAt = new Date().toISOString();

  if (unread) {
    await pool.query(
      `
      INSERT INTO whatsapp_conversation_reads (deal_id, user_id, force_unread, marked_unread_at, updated_at)
      VALUES ($1::uuid, $2::uuid, true, $3::timestamptz, NOW())
      ON CONFLICT (deal_id, user_id) DO UPDATE SET
        force_unread = true,
        marked_unread_at = $3::timestamptz,
        updated_at = NOW()
      `,
      [dealId, user.id, changedAt],
    );
  } else {
    await pool.query(
      `
      INSERT INTO whatsapp_conversation_reads (deal_id, user_id, last_read_at, force_unread, marked_unread_at, updated_at)
      VALUES ($1::uuid, $2::uuid, $3::timestamptz, false, NULL, NOW())
      ON CONFLICT (deal_id, user_id) DO UPDATE SET
        last_read_at = $3::timestamptz,
        force_unread = false,
        marked_unread_at = NULL,
        updated_at = NOW()
      `,
      [dealId, user.id, changedAt],
    );
  }

  void syncConversationReadStateWithEvolution(dealId, unread);

  return {
    id: dealId,
    isUnread: unread,
    unreadCount: unread ? 1 : 0,
    markedUnread: unread,
    lastReadAt: unread ? null : changedAt,
  };
}

function formatDailySummaryCustomerLines(customers: Record<string, unknown>[], options: { recovered?: boolean } = {}) {
  return customers
    .map((customer) => {
      const customerCode = optionalString(customer.customer_code);
      const code = customerCode ? `${customerCode} - ` : "";
      const name = optionalString(customer.display_name) ?? "Cliente sem nome";
      const attendant = optionalString(customer.last_attendant) ?? "Sem atendente";
      const amount = Number(customer.total_amount ?? 0);
      const amountText = Number.isFinite(amount)
        ? ` | R$ ${amount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : "";
      const inactiveText = options.recovered && customer.days_inactive
        ? ` | ${Number(customer.days_inactive).toLocaleString("pt-BR")} dias sem comprar`
        : "";

      return `- ${code}${name} | ${attendant}${amountText}${inactiveText}`;
    })
    .join("\n");
}

export async function getWhatsappDailySummaryReport(
  user: JwtUser,
  dateInput?: string
): Promise<any> {
  // Use provided date or default to current date in America/Sao_Paulo timezone
  const dateStr = dateInput || new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());

  // 1. Query New Customers of the day (Optimized: filters by date first, then runs fast NOT EXISTS index lookup)
  const newCustomersResult = await pool.query(
    `
    SELECT
      c.customer_code,
      c.display_name,
      o.total_amount::numeric(14,2) as total_amount,
      o.item_count,
      COALESCE(NULLIF(o.last_attendant, ''), 'Sem atendente') as last_attendant
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    WHERE o.order_date = $1::date
      AND NOT EXISTS (
        SELECT 1 FROM orders o2
        WHERE o2.customer_id = o.customer_id
          AND o2.order_date < $1::date
      )
    ORDER BY o.total_amount DESC, c.display_name ASC
    `,
    [dateStr]
  );

  // 2. Query Recovered Customers of the day (Optimized: filters by date first, then retrieves prior order using MAX index)
  const recoveredCustomersResult = await pool.query(
    `
    WITH scoped_orders AS (
      SELECT
        o.customer_id,
        o.order_date,
        o.total_amount,
        o.item_count,
        COALESCE(NULLIF(o.last_attendant, ''), 'Sem atendente') as last_attendant,
        (
          SELECT MAX(o2.order_date)
          FROM orders o2
          WHERE o2.customer_id = o.customer_id
            AND o2.order_date < o.order_date
        ) as previous_order_date
      FROM orders o
      WHERE o.order_date = $1::date
    )
    SELECT
      c.customer_code,
      c.display_name,
      so.total_amount::numeric(14,2) as total_amount,
      so.item_count,
      so.last_attendant,
      so.previous_order_date::text as previous_order_date,
      (so.order_date - so.previous_order_date)::int as days_inactive
    FROM scoped_orders so
    JOIN customers c ON c.id = so.customer_id
    WHERE so.previous_order_date IS NOT NULL
      AND (so.order_date - so.previous_order_date) >= 90
    ORDER BY so.total_amount DESC, c.display_name ASC
    `,
    [dateStr]
  );

  // 3. Query Sales Performance for the day (Optimized: calculates sum of items only for the days' orders)
  const salesPerformanceResult = await pool.query(
    `
    WITH scoped_orders AS (
      SELECT
        o.id,
        o.customer_id,
        COALESCE(NULLIF(o.last_attendant, ''), 'Sem atendente') AS attendant,
        COALESCE(o.total_amount, 0)::numeric(14,2) AS total_revenue,
        COALESCE((
          SELECT SUM(oi.quantity)
          FROM order_items oi
          WHERE oi.order_id = o.id
        ), 0)::int AS total_items
      FROM orders o
      WHERE o.order_date = $1::date
    )
    SELECT
      so.attendant,
      COUNT(*)::int AS total_orders,
      COUNT(DISTINCT so.customer_id)::int AS unique_customers,
      COALESCE(SUM(so.total_revenue), 0)::numeric(14,2) AS total_revenue,
      COALESCE(SUM(so.total_items), 0)::int AS total_items
    FROM scoped_orders so
    GROUP BY so.attendant
    ORDER BY total_items DESC, total_revenue DESC, attendant ASC
    `,
    [dateStr]
  );

  // 4. Query Chat Activities for the day. The monitor table is the fresher
  // source for group traffic; deal_activities remains as fallback for older rows.
  const activityWhere: string[] = [
    "da.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')",
    "da.created_at >= ($1::date AT TIME ZONE 'America/Sao_Paulo')",
    "da.created_at < (($1::date + INTERVAL '1 day') AT TIME ZONE 'America/Sao_Paulo')",
    monitorableWhatsappJidSql("COALESCE(da.metadata ->> 'remoteJid', d.whatsapp_jid)"),
  ];
  const monitorWhere: string[] = [
    "wmm.created_at >= ($1::date AT TIME ZONE 'America/Sao_Paulo')",
    "wmm.created_at < (($1::date + INTERVAL '1 day') AT TIME ZONE 'America/Sao_Paulo')",
    monitorableWhatsappJidSql("COALESCE(NULLIF(wmm.remote_jid, ''), NULLIF(wmm.media_json ->> 'remoteJid', ''), d.whatsapp_jid)"),
  ];
  const incomingWhere: string[] = [
    "wim.created_at >= ($1::date AT TIME ZONE 'America/Sao_Paulo')",
    "wim.created_at < (($1::date + INTERVAL '1 day') AT TIME ZONE 'America/Sao_Paulo')",
    monitorableWhatsappJidSql("wim.remote_jid"),
  ];

  const params: any[] = [dateStr];

  if (user.role === "SELLER") {
    params.push(user.id, user.name);
    activityWhere.push(`
      (
        da.actor_user_id = $2
        OR d.assigned_to = $2
        OR LOWER(COALESCE(d.assigned_to_name, '')) = LOWER($3)
        OR EXISTS (
          SELECT 1 FROM whatsapp_instances wi_sub
          WHERE wi_sub.id = d.whatsapp_instance_id
            AND (
              wi_sub.assigned_user_id = $2
              OR LOWER(COALESCE(wi_sub.assigned_user_name, '')) = LOWER($3)
              OR LOWER(wi_sub.instance_name) = LOWER($3)
              OR LOWER(wi_sub.display_label) = LOWER($3)
            )
        )
      )
    `);
    monitorWhere.push(`
      (
        d.assigned_to = $2
        OR LOWER(COALESCE(d.assigned_to_name, '')) = LOWER($3)
        OR EXISTS (
          SELECT 1 FROM whatsapp_instances wi_sub
          WHERE (
              wi_sub.id = d.whatsapp_instance_id
              OR LOWER(COALESCE(wi_sub.instance_name, '')) = LOWER(COALESCE(wmm.instance_name, ''))
            )
            AND (
              wi_sub.assigned_user_id = $2
              OR LOWER(COALESCE(wi_sub.assigned_user_name, '')) = LOWER($3)
              OR LOWER(wi_sub.instance_name) = LOWER($3)
              OR LOWER(wi_sub.display_label) = LOWER($3)
            )
        )
      )
    `);
    incomingWhere.push(`
      EXISTS (
        SELECT 1 FROM whatsapp_instances wi_sub
        WHERE LOWER(COALESCE(wi_sub.instance_name, '')) = LOWER(COALESCE(wim.instance_name, ''))
          AND (
            wi_sub.assigned_user_id = $2
            OR LOWER(COALESCE(wi_sub.assigned_user_name, '')) = LOWER($3)
            OR LOWER(wi_sub.instance_name) = LOWER($3)
            OR LOWER(wi_sub.display_label) = LOWER($3)
          )
      )
    `);
  }

  const activitiesResult = await pool.query(
    `
    WITH monitor_messages AS (
      SELECT
        0 AS source_priority,
        wmm.id::text AS source_id,
        wmm.deal_id,
        COALESCE(NULLIF(wmm.message_id, ''), wmm.id::text) AS message_key,
        CASE
          WHEN COALESCE(wmm.from_me, false) OR UPPER(COALESCE(wmm.direction, '')) = 'OUTBOUND'
            THEN 'WHATSAPP_SENT'
          ELSE 'WHATSAPP_RECEIVED'
        END AS activity_type,
        NULL::uuid AS actor_user_id,
        -- Sempre carrega o sender_name (mesmo em recebida). Membro da equipe que manda
        -- em grupo às vezes vem com from_me=false (a detecção de equipe na ingestão
        -- falha), e a mensagem é dele(a). O JS reconhece pelo nome (teamSenderNames) e
        -- reclassifica como ENVIADA. Cliente real não casa a equipe, então fica recebida.
        NULLIF(wmm.sender_name, '') AS actor_name,
        COALESCE(wmm.media_json, '{}'::jsonb) AS metadata,
        wmm.created_at,
        NULL::jsonb AS incoming_raw_payload,
        wmm.from_me AS incoming_from_me,
        NULLIF(wmm.instance_name, '') AS metadata_instance,
        COALESCE(NULLIF(wmm.remote_jid, ''), NULLIF(wmm.media_json ->> 'remoteJid', '')) AS metadata_remote_jid,
        COALESCE(
          NULLIF(wmm.media_json ->> 'chatDisplayName', ''),
          NULLIF(wmm.media_json ->> 'groupName', '')
        ) AS metadata_chat_display_name,
        wmm.sender_jid AS sender_jid
      FROM whatsapp_monitor_messages wmm
      JOIN deals d ON d.id = wmm.deal_id
      WHERE ${monitorWhere.join("\n        AND ")}
    ),
    activity_messages AS (
      SELECT
        1 AS source_priority,
        da.id::text AS source_id,
        da.deal_id,
        COALESCE(NULLIF(da.metadata ->> 'messageId', ''), NULLIF(da.metadata ->> 'providerMessageId', ''), da.id::text) AS message_key,
        da.activity_type,
        da.actor_user_id,
        da.actor_name,
        COALESCE(da.metadata, '{}'::jsonb) AS metadata,
        da.created_at,
        NULL::jsonb AS incoming_raw_payload,
        NULL::boolean AS incoming_from_me,
        (da.metadata ->> 'instance')::text AS metadata_instance,
        (da.metadata ->> 'remoteJid')::text AS metadata_remote_jid,
        (da.metadata ->> 'chatDisplayName')::text AS metadata_chat_display_name,
        (da.metadata ->> 'senderJid')::text AS sender_jid
      FROM deal_activities da
      JOIN deals d ON d.id = da.deal_id
      WHERE ${activityWhere.join("\n        AND ")}
    ),
    raw_incoming_rows AS (
      SELECT
        2 AS source_priority,
        wim.id::text AS source_id,
        NULL::uuid AS deal_id,
        COALESCE(NULLIF(wim.message_id, ''), wim.id::text) AS message_key,
        CASE
          WHEN COALESCE(wim.from_me, false) THEN 'WHATSAPP_SENT'
          ELSE 'WHATSAPP_RECEIVED'
        END AS activity_type,
        NULL::uuid AS actor_user_id,
        CASE
          WHEN COALESCE(wim.from_me, false)
            THEN COALESCE(NULLIF(wim.participant_name, ''), NULLIF(wim.sender_name, ''))
          ELSE NULL
        END AS actor_name,
        jsonb_build_object(
          'remoteJid', wim.remote_jid,
          'instance', wim.instance_name,
          'chatDisplayName', COALESCE(NULLIF(wim.chat_display_name, ''), NULLIF(wim.sender_name, '')),
          'senderJid', wim.participant_jid,
          'senderName', wim.sender_name,
          'fromMe', COALESCE(wim.from_me, false),
          'capturedFromWhatsapp', COALESCE(wim.from_me, false)
        ) AS metadata,
        wim.created_at,
        wim.raw_payload AS incoming_raw_payload,
        wim.from_me AS incoming_from_me,
        NULLIF(wim.instance_name, '') AS metadata_instance,
        wim.remote_jid AS metadata_remote_jid,
        COALESCE(NULLIF(wim.chat_display_name, ''), NULLIF(wim.sender_name, '')) AS metadata_chat_display_name,
        wim.participant_jid AS sender_jid
      FROM whatsapp_incoming_messages wim
      WHERE ${incomingWhere.join("\n        AND ")}
    ),
    source_messages AS (
      SELECT * FROM monitor_messages
      UNION ALL
      SELECT * FROM activity_messages
      UNION ALL
      SELECT * FROM raw_incoming_rows
    ),
    deduped_source AS (
      SELECT *
      FROM (
        SELECT
          source_messages.*,
          -- Dedup por CHAT (jid), não por deal: a mesma msg de grupo é gravada em
          -- 1 deal por instância (amanda/Suelen/tamires) -> contava 3x e não batia
          -- com o heatmap (que deduplica por jid). Agora colapsa as cópias do mesmo
          -- (jid, message_id) e mantém a cópia de quem ENVIOU (WHATSAPP_SENT), pra a
          -- mensagem de grupo enviada ser creditada à vendedora certa, uma vez só.
          ROW_NUMBER() OVER (
            PARTITION BY COALESCE(NULLIF(metadata_remote_jid, ''), deal_id::text), message_key
            ORDER BY
              (CASE WHEN activity_type = 'WHATSAPP_SENT' THEN 0 ELSE 1 END),
              source_priority ASC, created_at ASC, source_id ASC
          ) AS source_rank
        FROM source_messages
      ) ranked_source
      WHERE source_rank = 1
    )
    SELECT
      src.activity_type,
      src.actor_user_id,
      src.actor_name,
      src.metadata,
      src.created_at,
      src.incoming_raw_payload,
      src.incoming_from_me,
      src.metadata_instance,
      src.metadata_remote_jid,
      src.metadata_chat_display_name,
      src.sender_jid,
      d.assigned_to,
      d.assigned_to_name,
      d.whatsapp_instance_id,
      d.whatsapp_jid,
      d.customer_display_name,
      d.title,
      COALESCE(NULLIF(cs.display_name, ''), c.display_name) AS real_customer_name
    FROM deduped_source src
    LEFT JOIN deals d ON d.id = src.deal_id
    LEFT JOIN customers c ON c.id = d.customer_id
    LEFT JOIN customer_snapshot cs ON cs.customer_id = d.customer_id
    ORDER BY src.created_at ASC, src.source_id ASC
    `,
    params
  );

  // Fetch all users and whatsapp instances for fast in-memory name mapping
  const usersRes = await pool.query("SELECT id, name FROM users");
  const instancesRes = await pool.query("SELECT id, instance_name, display_label, assigned_user_id, assigned_user_name FROM whatsapp_instances");

  const users = usersRes.rows;
  const instances = instancesRes.rows;
  const usersById = new Map(users.map((u) => [String(u.id), u]));
  const usersByName = new Map(
    users
      .filter((u) => u.name)
      .map((u) => [String(u.name).trim().toLowerCase(), u])
  );
  const instancesById = new Map(instances.map((instance) => [String(instance.id), instance]));
  const instancesByName = new Map(
    instances
      .filter((instance) => instance.instance_name)
      .map((instance) => [String(instance.instance_name).trim().toLowerCase(), instance])
  );

  const salesPerformance = salesPerformanceResult.rows;
  const salesAttendants = new Set(salesPerformance.map(s => s.attendant.trim().toLowerCase()));

  // Lista ESTÁVEL da equipe (vendedoras), derivada das instâncias de WhatsApp e dos
  // usuários — NÃO das vendas do dia. Sem isso, uma vendedora que ainda não vendeu
  // naquele dia não era reconhecida como remetente e suas msgs caíam no dono/instância
  // do deal (ex.: 20/06 a Tamires caindo na Amanda). teamCanonicalLabel unifica
  // "tamires"/"XP Tamires" num só bucket com rótulo de exibição consistente.
  const teamSenderNames = new Set<string>();
  const teamCanonicalLabel = new Map<string, string>();
  const addTeamName = (raw: unknown, label: unknown) => {
    if (!raw) return;
    const low = String(raw).trim().toLowerCase();
    if (!low) return;
    const stripped = low.replace(/^xp\s+/i, "").trim();
    teamSenderNames.add(low);
    if (stripped) {
      teamSenderNames.add(stripped);
      if (!teamCanonicalLabel.has(stripped)) {
        teamCanonicalLabel.set(stripped, String(label || raw).trim());
      }
    }
  };
  for (const inst of instances) {
    addTeamName(inst.instance_name, inst.display_label || inst.instance_name);
    addTeamName(inst.display_label, inst.display_label);
    addTeamName(inst.assigned_user_name, inst.assigned_user_name);
  }
  for (const u of users) {
    addTeamName(u.name, u.name);
  }

  // 1. Collect all unique private JIDs from activities to batch-resolve customer names
  const privateJids = new Set<string>();
  for (const row of activitiesResult.rows) {
    const remoteJid = String(row.metadata_remote_jid || row.whatsapp_jid || "");
    if (remoteJid && !remoteJid.endsWith("@g.us")) {
      privateJids.add(remoteJid);
    }
  }

  const resolvedNamesMap = new Map<string, string>();
  if (privateJids.size > 0) {
    const jidList = Array.from(privateJids);

    // Fetch from whatsapp_chat_profiles
    const profilesRes = await pool.query(
      `
      SELECT remote_jid, display_name
      FROM whatsapp_chat_profiles
      WHERE remote_jid = ANY($1) AND display_name IS NOT NULL AND display_name <> ''
      `,
      [jidList]
    );
    for (const p of profilesRes.rows) {
      resolvedNamesMap.set(p.remote_jid, p.display_name);
    }

    // Fetch from whatsapp_incoming_messages (as fallback)
    const messagesRes = await pool.query(
      `
      SELECT remote_jid, sender_name
      FROM whatsapp_incoming_messages
      WHERE remote_jid = ANY($1)
        AND sender_name IS NOT NULL
        AND sender_name <> ''
        AND LOWER(sender_name) NOT LIKE '%xp %'
        AND LOWER(sender_name) NOT IN ('whatsapp', 'membro do grupo', 'whatsapp corporativo', 'sem agente', 'expor telas', 'sem atendente')
      ORDER BY created_at DESC
      `,
      [jidList]
    );
    for (const m of messagesRes.rows) {
      if (!resolvedNamesMap.has(m.remote_jid)) {
        resolvedNamesMap.set(m.remote_jid, m.sender_name);
      }
    }
  }

  // Group activity data by agent
  const agentsMap = new Map<string, {
    agentId: string;
    agentName: string;
    sentMessages: number;
    receivedMessages: number;
    privateChats: Set<string>;
    groupChats: Set<string>;
    initiatedChats: Set<string>;
    // Keep track of first activity in each chat to calculate initiation
    chatFirstActivity: Map<string, { activityType: string; isGroup: boolean; name: string }>;
    // Detail lists
    attendedPrivateClients: Map<string, { name: string; jid: string; sent: number; received: number; initiated: boolean }>;
    attendedGroupClients: Map<string, { name: string; jid: string; sent: number; received: number; initiated: boolean }>;
    totalResponseSeconds: number;
    responseCount: number;
  }>();

  let totalSent = 0;
  let totalReceived = 0;
  const pendingInboundByAgentConversation = new Map<string, Date>();

  for (const row of activitiesResult.rows) {
    // Resolve WhatsApp instance (in-memory, highly efficient)
    const metadataInstance = row.metadata_instance ? String(row.metadata_instance).toLowerCase() : "";
    const wi =
      (row.whatsapp_instance_id ? instancesById.get(String(row.whatsapp_instance_id)) : undefined) ??
      (metadataInstance ? instancesByName.get(metadataInstance) : undefined);

    // Resolve matched user (in-memory fallback mapping, avoids unindexed outer joins)
    const actorName = row.actor_name ? String(row.actor_name).trim() : "";
    const actorNameLower = actorName.toLowerCase();
    const assignedToName = row.assigned_to_name ? String(row.assigned_to_name).toLowerCase() : "";
    const wiAssignedUserName = wi?.assigned_user_name ? String(wi.assigned_user_name).toLowerCase() : "";

    const matchedUser =
      (row.actor_user_id ? usersById.get(String(row.actor_user_id)) : undefined) ??
      (row.assigned_to ? usersById.get(String(row.assigned_to)) : undefined) ??
      (wi?.assigned_user_id ? usersById.get(String(wi.assigned_user_id)) : undefined) ??
      (actorName ? usersByName.get(actorNameLower) : undefined) ??
      (assignedToName ? usersByName.get(assignedToName) : undefined) ??
      (wiAssignedUserName ? usersByName.get(wiAssignedUserName) : undefined);

    const senderStripped = actorNameLower.replace(/^xp\s+/i, '').trim();

    // DETECÇÃO POR NÚMERO (fonte: node "Switch" do n8n). O sender_jid traz o telefone
    // real do remetente mesmo em msg de grupo com from_me=false. Vendedora = uma das 5
    // instâncias conectadas; qualquer outro número do time = INTERNO (ignorado);
    // número fora da lista = cliente. Substitui o antigo "prefixo XP", que errava
    // (Hugo/Rafael/Camila não têm "XP"; e "XP Conferência/Defeitos" são internos).
    const senderDigits = reportPhoneDigits(row.sender_jid);
    let salesAgent = senderDigits ? SALES_AGENT_BY_PHONE.get(senderDigits) : undefined;
    if (!salesAgent && !senderDigits) {
      // Fallback por nome só p/ as 5 vendedoras quando o sender_jid vier vazio (~0,1%).
      salesAgent = SALES_AGENT_BY_NAME.get(senderStripped) || SALES_AGENT_BY_NAME.get(actorNameLower);
    }
    const isInternalSender = Boolean(senderDigits) && !salesAgent && INTERNAL_TEAM_SENDER_PHONES.has(senderDigits);

    // Remetente é time INTERNO (não-vendedora): conversa interna entre o time. Não conta
    // como conversa, nem enviada, nem recebida — é ruído interno (ex.: Iza/Defeitos,
    // Conferência, Expor Telas mandando em grupo de cliente).
    if (isInternalSender) {
      continue;
    }

    // Credita ENVIADA à vendedora pelo NÚMERO do remetente (nunca ao dono/instância do
    // deal). A dedup de grupo mantém uma cópia com o sender_jid real, então a msg enviada
    // por uma vendedora em grupo onde a instância dela não está cai aqui, creditada a ela.
    const wiLabel = wi ? (wi.display_label || wi.instance_name) : null;
    const agentId = salesAgent
      ? `xp-agent:${salesAgent.id}`
      : (matchedUser ? String(matchedUser.id) : (wi ? `instance:${wi.id}` : 'sem-agente'));

    const agentName = salesAgent
      ? salesAgent.name
      : (matchedUser ? matchedUser.name : (wiLabel || 'Sem agente'));

    const remoteJid = String(row.metadata_remote_jid || row.whatsapp_jid || "");
    const isGroup = remoteJid.endsWith("@g.us");
    // ENVIADA se o remetente é uma vendedora (por número) OU o provider marcou from_me/
    // OUTBOUND. Pega a msg de equipe em grupo gravada com from_me=false.
    const isOutbound = Boolean(salesAgent) || isWhatsappActivityOutbound(row);
    const sourceChatNameForFilter = [
      row.metadata_chat_display_name,
      row.customer_display_name,
      row.title,
      row.real_customer_name,
    ].map((candidate) => candidate ? String(candidate).trim() : "").find(Boolean) ?? null;

    if (isInternalChat(sourceChatNameForFilter, remoteJid)) {
      continue;
    }

    // Resolve robust and clean customer display name
    const chatName = (() => {
      const candidates = [
        row.real_customer_name,
        resolvedNamesMap.get(remoteJid),
        row.metadata_chat_display_name,
        row.customer_display_name,
        row.title
      ].map(c => c ? String(c).trim() : "").filter(Boolean);

      const cleanAgent = agentName.trim().toLowerCase().replace(/^xp\s+/i, '');

      for (const c of candidates) {
        const lower = c.toLowerCase();

        // Skip names matching or containing the agent/seller name
        if (lower === cleanAgent || lower === agentName.toLowerCase() || (cleanAgent.length >= 3 && lower.includes(cleanAgent))) {
          continue;
        }

        // Skip generic labels
        if (["whatsapp", "whatsapp corporativo", "membro do grupo", "sem agente", "expor telas", "sem atendente"].includes(lower)) {
          continue;
        }

        // Skip numeric-only fallbacks or raw JIDs
        if (/^\d+$/.test(c) || c.includes("@")) {
          continue;
        }

        return c;
      }

      // Final fallback to nicely formatted phone number
      return isGroup ? "Grupo sem nome" : formatWhatsappJidPhone(remoteJid);
    })();

    if (isInternalChat(chatName, remoteJid)) {
      continue;
    }

    const createdAt = new Date(String(row.created_at));

    if (isOutbound) totalSent++;
    else totalReceived++;

    if (!agentsMap.has(agentId)) {
      agentsMap.set(agentId, {
        agentId,
        agentName,
        sentMessages: 0,
        receivedMessages: 0,
        privateChats: new Set(),
        groupChats: new Set(),
        initiatedChats: new Set(),
        chatFirstActivity: new Map(),
        attendedPrivateClients: new Map(),
        attendedGroupClients: new Map(),
        totalResponseSeconds: 0,
        responseCount: 0,
      });
    }

    const agent = agentsMap.get(agentId)!;

    // Track response seconds
    const pendingKey = `${agentId}:${remoteJid}`;
    if (isOutbound) {
      agent.sentMessages++;
      const pendingInboundAt = pendingInboundByAgentConversation.get(pendingKey);
      if (pendingInboundAt) {
        const responseSeconds = Math.max(0, (createdAt.getTime() - pendingInboundAt.getTime()) / 1000);
        agent.totalResponseSeconds += responseSeconds;
        agent.responseCount++;
        pendingInboundByAgentConversation.delete(pendingKey);
      }
    } else {
      agent.receivedMessages++;
      pendingInboundByAgentConversation.set(pendingKey, createdAt);
    }

    if (isGroup) {
      if (isOutbound) {
        agent.groupChats.add(remoteJid);
      }
      if (!agent.attendedGroupClients.has(remoteJid)) {
        agent.attendedGroupClients.set(remoteJid, {
          name: chatName,
          jid: remoteJid,
          sent: 0,
          received: 0,
          initiated: false,
        });
      }
      const client = agent.attendedGroupClients.get(remoteJid)!;
      if (isOutbound) client.sent++;
      else client.received++;
    } else {
      if (isOutbound) {
        agent.privateChats.add(remoteJid);
      }
      if (!agent.attendedPrivateClients.has(remoteJid)) {
        agent.attendedPrivateClients.set(remoteJid, {
          name: chatName,
          jid: remoteJid,
          sent: 0,
          received: 0,
          initiated: false,
        });
      }
      const client = agent.attendedPrivateClients.get(remoteJid)!;
      if (isOutbound) client.sent++;
      else client.received++;
    }

    // Check first activity for initiation
    if (!agent.chatFirstActivity.has(remoteJid)) {
      agent.chatFirstActivity.set(remoteJid, {
        activityType: isOutbound ? "WHATSAPP_SENT" : "WHATSAPP_RECEIVED",
        isGroup,
        name: chatName,
      });

      // Primeira atividade do dia foi do vendedor (outbound) = ele PUXOU a conversa.
      // Vale pra privado E grupo — antes só contava privado, então numa operação
      // 100% em grupo "Conversas Iniciadas" dava sempre 0.
      if (isOutbound) {
        agent.initiatedChats.add(remoteJid);
        const privateClient = agent.attendedPrivateClients.get(remoteJid);
        if (privateClient) {
          privateClient.initiated = true;
        }
        const groupClient = agent.attendedGroupClients.get(remoteJid);
        if (groupClient) {
          groupClient.initiated = true;
        }
      }
    }
  }

  // Combine sales performance with message metrics
  const newCustomers = newCustomersResult.rows;
  const recoveredCustomers = recoveredCustomersResult.rows;

  const totalTelasSold = salesPerformance.reduce((sum, row) => sum + Number(row.total_items ?? 0), 0);
  const totalRevenue = salesPerformance.reduce((sum, row) => sum + Number(row.total_revenue ?? 0), 0);
  const totalOrders = salesPerformance.reduce((sum, row) => sum + Number(row.total_orders ?? 0), 0);

  // Build vendedoras daily summary
  const rawAgentsList = Array.from(agentsMap.values()).map(a => {
    // Find sales stats if they exist
    const sales = salesPerformance.find(s => {
      const cleanAttendant = s.attendant.trim().toLowerCase().replace(/^xp\s+/i, '');
      const cleanAgent = a.agentName.trim().toLowerCase().replace(/^xp\s+/i, '');
      return cleanAttendant === cleanAgent ||
        (s.attendant === "Sem atendente" && a.agentName === "Sem agente");
    });

    return {
      agentId: a.agentId,
      agentName: a.agentName,
      sentMessages: a.sentMessages,
      receivedMessages: a.receivedMessages,
      privateChatsCount: a.privateChats.size,
      groupChatsCount: a.groupChats.size,
      initiatedCount: a.initiatedChats.size,
      screensSold: sales ? Number(sales.total_items ?? 0) : 0,
      ordersCount: sales ? Number(sales.total_orders ?? 0) : 0,
      revenue: sales ? Number(sales.total_revenue ?? 0) : 0,
      attendedPrivateClients: Array.from(a.attendedPrivateClients.values()).filter(c => c.sent > 0),
      attendedGroupClients: Array.from(a.attendedGroupClients.values()).filter(g => g.sent > 0),
      averageFirstResponseSeconds: a.responseCount > 0 ? Math.round(a.totalResponseSeconds / a.responseCount) : null,
    };
  });

  // Merge duplicate agents by name (case-insensitive)
  const mergedAgentsMap = new Map<string, typeof rawAgentsList[0]>();
  for (const agent of rawAgentsList) {
    const nameKey = agent.agentName.trim().toLowerCase();
    const existing = mergedAgentsMap.get(nameKey);
    if (existing) {
      existing.sentMessages += agent.sentMessages;
      existing.receivedMessages += agent.receivedMessages;
      existing.screensSold += agent.screensSold;
      existing.ordersCount += agent.ordersCount;
      existing.revenue += agent.revenue;

      // Merge unique private clients
      const privateClientsMap = new Map(existing.attendedPrivateClients.map(c => [c.jid, c]));
      agent.attendedPrivateClients.forEach(c => {
        const ext = privateClientsMap.get(c.jid);
        if (ext) {
          ext.sent += c.sent;
          ext.received += c.received;
          ext.initiated = ext.initiated || c.initiated;
        } else {
          privateClientsMap.set(c.jid, c);
        }
      });
      existing.attendedPrivateClients = Array.from(privateClientsMap.values());
      existing.privateChatsCount = existing.attendedPrivateClients.length;

      // Merge unique group clients
      const groupClientsMap = new Map(existing.attendedGroupClients.map(g => [g.jid, g]));
      agent.attendedGroupClients.forEach(g => {
        const ext = groupClientsMap.get(g.jid);
        if (ext) {
          ext.sent += g.sent;
          ext.received += g.received;
          ext.initiated = ext.initiated || g.initiated;
        } else {
          groupClientsMap.set(g.jid, g);
        }
      });
      existing.attendedGroupClients = Array.from(groupClientsMap.values());
      existing.groupChatsCount = existing.attendedGroupClients.length;

      // Conversas iniciadas = privados + grupos onde o vendedor falou primeiro
      existing.initiatedCount =
        existing.attendedPrivateClients.filter(c => c.initiated).length +
        existing.attendedGroupClients.filter(g => g.initiated).length;

      // Average response time
      if (existing.averageFirstResponseSeconds !== null && agent.averageFirstResponseSeconds !== null) {
         existing.averageFirstResponseSeconds = Math.round((existing.averageFirstResponseSeconds + agent.averageFirstResponseSeconds) / 2);
      } else {
         existing.averageFirstResponseSeconds = existing.averageFirstResponseSeconds ?? agent.averageFirstResponseSeconds;
      }
    } else {
      mergedAgentsMap.set(nameKey, { ...agent });
    }
  }

  const agentsList = Array.from(mergedAgentsMap.values());

  type DailyRollupMetric = {
    agentName: string;
    sentMessages: number;
    receivedMessages: number;
    attendedPrivateClients: { name: string; jid: string; sent: number; received: number; initiated: boolean }[];
    attendedGroupClients: { name: string; jid: string; sent: number; received: number; initiated: boolean }[];
  };

  try {
    const rollupMetricsResult = await pool.query(
      `
      SELECT
        war.agent_name,
        war.remote_jid,
        MAX(war.chat_name) AS chat_name,
        COALESCE(SUM(war.sent_messages), 0)::int AS sent_messages,
        COALESCE(SUM(war.received_messages), 0)::int AS received_messages
      FROM whatsapp_activity_rollups war
      WHERE war.period_date = $1::date
        AND ${monitorableWhatsappJidSql("war.remote_jid")}
      GROUP BY war.agent_name, war.remote_jid
      `,
      [dateStr],
    );

    const rollupMetricsByName = new Map<string, DailyRollupMetric>();
    for (const row of rollupMetricsResult?.rows ?? []) {
      const remoteJid = String(row.remote_jid || "");
      if (!remoteJid) {
        continue;
      }

      const chatName = row.chat_name ? String(row.chat_name) : null;
      if (isInternalChat(chatName, remoteJid)) {
        continue;
      }

      const sentMessages = Number(row.sent_messages ?? 0);
      const receivedMessages = Number(row.received_messages ?? 0);
      if (sentMessages <= 0 && receivedMessages <= 0) {
        continue;
      }

      const agentName = String(row.agent_name || "Sem agente");
      const nameKey = agentName.trim().toLowerCase();
      const metric = rollupMetricsByName.get(nameKey) ?? {
        agentName,
        sentMessages: 0,
        receivedMessages: 0,
        attendedPrivateClients: [],
        attendedGroupClients: [],
      };

      metric.sentMessages += sentMessages;
      metric.receivedMessages += receivedMessages;

      if (sentMessages > 0 && receivedMessages > 0) {
        const client = {
          name: chatName || formatWhatsappJidPhone(remoteJid),
          jid: remoteJid,
          sent: sentMessages,
          received: receivedMessages,
          initiated: false,
        };
        if (remoteJid.endsWith("@g.us")) {
          metric.attendedGroupClients.push(client);
        } else {
          metric.attendedPrivateClients.push(client);
        }
      }

      rollupMetricsByName.set(nameKey, metric);
    }

    // DESATIVADO: este bloco sobrescrevia os números do relatório (calculados ao
    // vivo, com dedup por jid e atribuição por remetente real) pelos números do
    // ROLLUP. Quando o rollup estava vazio/stale/com atribuição diferente, o Resumo
    // mostrava valores errados (ex.: Tamires aparecia com 2 em vez de 58 enviadas).
    // O cálculo ao vivo é a fonte correta; heatmap e Resumo batem por usarem a MESMA
    // dedup, não por um copiar o outro.
    const ALIGN_DAILY_WITH_ROLLUP = false;
    if (ALIGN_DAILY_WITH_ROLLUP && rollupMetricsByName.size > 0) {
      totalSent = 0;
      totalReceived = 0;

      for (const agent of agentsList) {
        const nameKey = agent.agentName.trim().toLowerCase();
        const metric = rollupMetricsByName.get(nameKey);
        if (!metric) {
          agent.sentMessages = 0;
          agent.receivedMessages = 0;
          agent.privateChatsCount = 0;
          agent.groupChatsCount = 0;
          agent.attendedPrivateClients = [];
          agent.attendedGroupClients = [];
          agent.initiatedCount = 0;
          continue;
        }

        agent.sentMessages = metric.sentMessages;
        agent.receivedMessages = metric.receivedMessages;
        agent.attendedPrivateClients = metric.attendedPrivateClients;
        agent.attendedGroupClients = metric.attendedGroupClients;
        agent.privateChatsCount = metric.attendedPrivateClients.length;
        agent.groupChatsCount = metric.attendedGroupClients.length;
        agent.initiatedCount = Math.min(agent.initiatedCount, agent.privateChatsCount + agent.groupChatsCount);
        totalSent += metric.sentMessages;
        totalReceived += metric.receivedMessages;
        rollupMetricsByName.delete(nameKey);
      }

      for (const metric of rollupMetricsByName.values()) {
        const sales = salesPerformance.find(s => {
          const cleanAttendant = s.attendant.trim().toLowerCase().replace(/^xp\s+/i, '');
          const cleanAgent = metric.agentName.trim().toLowerCase().replace(/^xp\s+/i, '');
          return cleanAttendant === cleanAgent;
        });
        agentsList.push({
          agentId: `rollup:${metric.agentName.trim().toLowerCase()}`,
          agentName: metric.agentName,
          sentMessages: metric.sentMessages,
          receivedMessages: metric.receivedMessages,
          privateChatsCount: metric.attendedPrivateClients.length,
          groupChatsCount: metric.attendedGroupClients.length,
          initiatedCount: 0,
          screensSold: sales ? Number(sales.total_items ?? 0) : 0,
          ordersCount: sales ? Number(sales.total_orders ?? 0) : 0,
          revenue: sales ? Number(sales.total_revenue ?? 0) : 0,
          attendedPrivateClients: metric.attendedPrivateClients,
          attendedGroupClients: metric.attendedGroupClients,
          averageFirstResponseSeconds: null,
        });
        totalSent += metric.sentMessages;
        totalReceived += metric.receivedMessages;
      }
    }
  } catch (error) {
    logger.warn("failed to align daily whatsapp summary with activity rollups", {
      date: dateStr,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Ranking de atendimento: atividade no WhatsApp vem antes de vendas do dia.
  agentsList.sort((left, right) => {
    if (left.sentMessages !== right.sentMessages) return right.sentMessages - left.sentMessages;
    const leftChats = left.privateChatsCount + left.groupChatsCount;
    const rightChats = right.privateChatsCount + right.groupChatsCount;
    if (leftChats !== rightChats) return rightChats - leftChats;
    if (left.initiatedCount !== right.initiatedCount) return right.initiatedCount - left.initiatedCount;
    if (left.receivedMessages !== right.receivedMessages) return right.receivedMessages - left.receivedMessages;
    if (left.screensSold !== right.screensSold) return right.screensSold - left.screensSold;
    if (left.ordersCount !== right.ordersCount) return right.ordersCount - left.ordersCount;
    return left.agentName.localeCompare(right.agentName);
  });

  // Calculate global average response seconds
  const globalTotalResponseSeconds = Array.from(agentsMap.values()).reduce((sum, a) => sum + a.totalResponseSeconds, 0);
  const globalResponseCount = Array.from(agentsMap.values()).reduce((sum, a) => sum + a.responseCount, 0);
  const averageFirstResponseSeconds = globalResponseCount > 0 ? Math.round(globalTotalResponseSeconds / globalResponseCount) : null;

  // Format date for display: DD/MM/YYYY
  const [year, month, day] = dateStr.split("-");
  const formattedDate = `${day}/${month}/${year}`;

  // Assemble beautiful formatted text for copy paste to WhatsApp (no sales data)
  let text = `📅 *Relatório de Atendimento XP*\n_${formattedDate}_\n\n`;
  text += `📱 *Clientes Novos no Dia:* ${newCustomers.length}\n`;
  if (newCustomers.length > 0) {
    text += `${formatDailySummaryCustomerLines(newCustomers)}\n`;
  }
  text += `🔄 *Clientes Recuperados no Dia:* ${recoveredCustomers.length}\n`;
  if (recoveredCustomers.length > 0) {
    text += `${formatDailySummaryCustomerLines(recoveredCustomers, { recovered: true })}\n`;
  }
  text += `\n`;
  text += `💬 *Resumo de Mensagens:*\n`;
  text += `📱 Enviadas: ${totalSent.toLocaleString("pt-BR")}\n`;
  text += `🧾 Recebidas: ${totalReceived.toLocaleString("pt-BR")}\n\n`;
  text += `🏆 *Ranking de Vendedoras e Atendimentos:*\n\n`;

  agentsList.forEach((agent, index) => {
    const medals = ["🥇", "🥈", "🥉"];
    const emoji = index < 3 ? medals[index] : "❤️";
    text += `${emoji} *${agent.agentName}*\n`;
    text += `💬 Mensagens Enviadas: ${agent.sentMessages.toLocaleString("pt-BR")}\n`;
    text += `📱 Atendimentos Particular: ${agent.privateChatsCount}\n`;
    text += `👥 Atendimentos em Grupo: ${agent.groupChatsCount}\n`;
    text += `✨ Conversas Iniciadas: ${agent.initiatedCount}\n`;

    if (agent.attendedPrivateClients.length > 0 || agent.attendedGroupClients.length > 0) {
      text += `👥 *Clientes Atendidos:*\n`;
      // Particular
      agent.attendedPrivateClients.forEach(c => {
        const initiatedTag = c.initiated ? " _[Iniciada]_" : "";
        text += `* ${c.name} (Particular)${initiatedTag}\n`;
      });
      // Grupos
      agent.attendedGroupClients.forEach(g => {
        text += `* ${g.name} (Grupo)\n`;
      });
    }
    text += `\n`;
  });

  return {
    date: dateStr,
    newCustomersCount: newCustomers.length,
    recoveredCustomersCount: recoveredCustomers.length,
    totalMessagesSent: totalSent,
    totalMessagesReceived: totalReceived,
    totalTelasSold,
    totalOrders,
    totalRevenue,
    agents: agentsList,
    newCustomersList: newCustomers,
    recoveredCustomersList: recoveredCustomers,
    formattedText: text,
    averageFirstResponseSeconds,
  };
}

import fs from "node:fs/promises";
import path from "node:path";
import XLSX from "xlsx";
import type {
  CustomerStatus,
  WhatsappGroup,
  WhatsappGroupClassification,
  WhatsappGroupMappingStatus,
  WhatsappGroupsResponse,
  WhatsappImportSummary,
  WhatsappMappingSummary,
} from "@olist-crm/shared";
import { pool } from "../../db/client.js";
import { env } from "../../lib/env.js";
import { HttpError } from "../../lib/httpError.js";
import { listCustomers } from "../crm/customerService.js";
import {
  classifyWhatsappGroup,
  computeRecentBlock,
  extractWhatsappSourceCode,
  normalizeWhatsappJid,
  normalizeWhatsappMatchName,
} from "./whatsappCore.js";

interface CustomerMatchCandidate {
  id: string;
  customerCode: string | null;
  displayName: string;
  normalizedMatchName: string;
}

interface ExistingGroupRow {
  id: string;
  jid: string;
  mapping_status: WhatsappGroupMappingStatus;
  customer_id: string | null;
  mapping_note: string;
}

interface ParsedGroupRow {
  jid: string;
  sourceName: string;
  normalizedSourceName: string;
  sourceCode: string | null;
  classification: WhatsappGroupClassification;
}

async function resolveDefaultWhatsappWorkbookPath() {
  const candidates = [
    env.WHATSAPP_DEFAULT_WORKBOOK_PATH,
    "C:\\Users\\Felipe\\Desktop\\Grupos clientes e não clientes JID.xlsx",
    path.resolve(process.cwd(), "..", "..", "..", "Grupos clientes e não clientes JID.xlsx"),
    path.resolve(process.cwd(), "..", "..", "..", "..", "Grupos clientes e não clientes JID.xlsx"),
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new HttpError(
    404,
    "Nao encontrei a planilha padrao de grupos. Configure WHATSAPP_DEFAULT_WORKBOOK_PATH ou envie outro arquivo.",
  );
}

export interface WhatsappGroupFilters {
  search?: string;
  classification?: WhatsappGroupClassification[];
  mappingStatus?: WhatsappGroupMappingStatus[];
  savedSegmentId?: string;
  onlyRecentlyBlocked?: boolean;
  limit?: number;
  offset?: number;
}

export interface UpdateWhatsappGroupMatchInput {
  customerId?: string | null;
  mappingStatus: "MANUAL_MAPPED" | "CONFIRMED_UNMATCHED" | "IGNORED";
  note?: string;
}

function emptyClassificationCounts() {
  return {
    WITH_ORDER: 0,
    NO_ORDER_EXCEL: 0,
    OTHER: 0,
  } as Record<WhatsappGroupClassification, number>;
}

function emptyMappingCounts() {
  return {
    AUTO_MAPPED: 0,
    MANUAL_MAPPED: 0,
    PENDING_REVIEW: 0,
    CONFIRMED_UNMATCHED: 0,
    IGNORED: 0,
  } as Record<WhatsappGroupMappingStatus, number>;
}

function readColumn(row: Record<string, unknown>, candidate: string) {
  const matched = Object.entries(row).find(([key]) => key.trim().toLowerCase() === candidate.toLowerCase());
  return matched?.[1];
}

function parseWorkbookRows(fileBuffer: Buffer) {
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new HttpError(400, "A planilha enviada nao possui abas.");
  }

  const worksheet = workbook.Sheets[firstSheetName];
  if (!worksheet) {
    throw new HttpError(400, "Nao foi possivel ler a primeira aba da planilha.");
  }
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: "",
  });

  const uniqueRows = new Map<string, ParsedGroupRow>();

  rows.forEach((row) => {
    const sourceName = String(readColumn(row, "Name") ?? readColumn(row, "Nome") ?? "").trim();
    const jid = normalizeWhatsappJid(String(readColumn(row, "JID") ?? readColumn(row, "WhatsappJID") ?? ""));

    if (!sourceName || !jid) {
      return;
    }

    uniqueRows.set(jid, {
      jid,
      sourceName,
      normalizedSourceName: normalizeWhatsappMatchName(sourceName),
      sourceCode: extractWhatsappSourceCode(sourceName),
      classification: classifyWhatsappGroup(sourceName),
    });
  });

  return [...uniqueRows.values()];
}

async function loadCustomersForAutoMap() {
  const result = await pool.query(
    `
      SELECT
        c.id,
        c.customer_code,
        COALESCE(NULLIF(cs.display_name, ''), c.display_name) AS display_name,
        c.normalized_name
      FROM customers c
      LEFT JOIN customer_snapshot cs ON cs.customer_id = c.id
    `,
  );

  const candidates = result.rows.map((row) => {
    const displayName = String(row.display_name ?? "");
    return {
      id: String(row.id),
      customerCode: row.customer_code ? String(row.customer_code).toUpperCase() : null,
      displayName,
      normalizedMatchName: normalizeWhatsappMatchName(String(row.normalized_name ?? displayName)),
    } satisfies CustomerMatchCandidate;
  });

  const byCode = new Map<string, CustomerMatchCandidate>();
  const byName = new Map<string, CustomerMatchCandidate[]>();

  candidates.forEach((candidate) => {
    if (candidate.customerCode) {
      byCode.set(candidate.customerCode, candidate);
    }

    const nameKeys = new Set<string>(
      [candidate.normalizedMatchName, normalizeWhatsappMatchName(candidate.displayName)].filter(Boolean),
    );

    nameKeys.forEach((key) => {
      const current = byName.get(key) ?? [];
      current.push(candidate);
      byName.set(key, current);
    });
  });

  return {
    byCode,
    byName,
  };
}

async function loadExistingGroups() {
  const result = await pool.query(
    `
      SELECT
        id,
        jid,
        mapping_status,
        customer_id,
        mapping_note
      FROM whatsapp_groups
    `,
  );

  return new Map(
    result.rows.map((row) => [
      String(row.jid),
      {
        id: String(row.id),
        jid: String(row.jid),
        mapping_status: String(row.mapping_status) as WhatsappGroupMappingStatus,
        customer_id: row.customer_id ? String(row.customer_id) : null,
        mapping_note: String(row.mapping_note ?? ""),
      } satisfies ExistingGroupRow,
    ]),
  );
}

function mapWhatsappGroupRow(row: Record<string, unknown>): WhatsappGroup {
  const { isBlocked, recentBlockUntil } = computeRecentBlock(
    row.last_contact_at ? String(row.last_contact_at) : null,
    env.WHATSAPP_RECENT_CONTACT_BLOCK_DAYS,
  );

  return {
    id: String(row.id),
    jid: String(row.jid),
    sourceName: String(row.source_name ?? ""),
    sourceCode: row.source_code ? String(row.source_code) : null,
    classification: String(row.classification) as WhatsappGroupClassification,
    mappingStatus: String(row.mapping_status) as WhatsappGroupMappingStatus,
    matchMethod: row.match_method ? (String(row.match_method) as WhatsappGroup["matchMethod"]) : null,
    customerId: row.customer_id ? String(row.customer_id) : null,
    customerCode: row.customer_code ? String(row.customer_code) : null,
    customerDisplayName: row.customer_display_name ? String(row.customer_display_name) : null,
    customerStatus: row.customer_status ? (String(row.customer_status) as CustomerStatus) : null,
    lastAttendant: row.last_attendant ? String(row.last_attendant) : null,
    lastContactAt: row.last_contact_at ? new Date(String(row.last_contact_at)).toISOString() : null,
    lastCampaignId: row.last_campaign_id ? String(row.last_campaign_id) : null,
    lastMessagePreview: row.last_message_preview ? String(row.last_message_preview) : null,
    lastImportedAt: row.last_imported_at ? new Date(String(row.last_imported_at)).toISOString() : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    isRecentlyBlocked: isBlocked,
    recentBlockUntil,
  };
}

async function buildSavedSegmentCustomerIds(savedSegmentId: string) {
  const savedSegmentResult = await pool.query("SELECT definition FROM saved_segments WHERE id = $1", [savedSegmentId]);
  if (!savedSegmentResult.rows[0]) {
    throw new HttpError(404, "Publico salvo nao encontrado");
  }

  const customers = await listCustomers({
    ...(savedSegmentResult.rows[0].definition ?? {}),
    sortBy: "priority",
  });

  return customers.map((customer) => customer.id);
}

function buildGroupsWhere(filters: WhatsappGroupFilters, customerIds: string[]) {
  const clauses: string[] = [];
  const params: unknown[] = [];

  const push = (sqlFactory: (index: number) => string, value: unknown) => {
    params.push(value);
    clauses.push(sqlFactory(params.length));
  };

  if (filters.search) {
    const searchValue = `%${filters.search.trim()}%`;
    params.push(searchValue);
    const first = params.length;
    params.push(searchValue);
    const second = params.length;
    params.push(searchValue);
    const third = params.length;
    params.push(searchValue);
    const fourth = params.length;
    params.push(searchValue);
    const fifth = params.length;

    clauses.push(`
      (
        wg.source_name ILIKE $${first}
        OR wg.source_code ILIKE $${second}
        OR wg.jid ILIKE $${third}
        OR c.customer_code ILIKE $${fourth}
        OR COALESCE(NULLIF(cs.display_name, ''), c.display_name) ILIKE $${fifth}
      )
    `);
  }

  if (filters.classification?.length) {
    push((index) => `wg.classification = ANY($${index}::text[])`, filters.classification);
  }

  if (filters.mappingStatus?.length) {
    push((index) => `wg.mapping_status = ANY($${index}::text[])`, filters.mappingStatus);
  }

  if (customerIds.length) {
    push((index) => `wg.customer_id = ANY($${index}::uuid[])`, customerIds);
  }

  if (filters.onlyRecentlyBlocked) {
    push(
      (index) => `wg.last_contact_at IS NOT NULL AND wg.last_contact_at > NOW() - make_interval(days => $${index}::int)`,
      env.WHATSAPP_RECENT_CONTACT_BLOCK_DAYS,
    );
  }

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

export async function getWhatsappMappingSummary(): Promise<WhatsappMappingSummary> {
  const result = await pool.query(
    `
      SELECT
        COUNT(*)::int AS total_groups,
        COUNT(*) FILTER (WHERE mapping_status IN ('AUTO_MAPPED', 'MANUAL_MAPPED'))::int AS mapped_groups,
        COUNT(*) FILTER (WHERE mapping_status = 'PENDING_REVIEW')::int AS pending_review_groups,
        COUNT(*) FILTER (WHERE mapping_status = 'CONFIRMED_UNMATCHED')::int AS confirmed_unmatched_groups,
        COUNT(*) FILTER (WHERE mapping_status = 'IGNORED')::int AS ignored_groups,
        COUNT(*) FILTER (
          WHERE last_contact_at IS NOT NULL
            AND last_contact_at > NOW() - make_interval(days => $1::int)
        )::int AS recently_blocked_groups,
        MAX(last_imported_at) AS last_imported_at,
        COUNT(*) FILTER (WHERE classification = 'WITH_ORDER')::int AS with_order_count,
        COUNT(*) FILTER (WHERE classification = 'NO_ORDER_EXCEL')::int AS no_order_excel_count,
        COUNT(*) FILTER (WHERE classification = 'OTHER')::int AS other_count,
        COUNT(*) FILTER (WHERE mapping_status = 'AUTO_MAPPED')::int AS auto_mapped_count,
        COUNT(*) FILTER (WHERE mapping_status = 'MANUAL_MAPPED')::int AS manual_mapped_count,
        COUNT(*) FILTER (WHERE mapping_status = 'PENDING_REVIEW')::int AS pending_review_count,
        COUNT(*) FILTER (WHERE mapping_status = 'CONFIRMED_UNMATCHED')::int AS confirmed_unmatched_count,
        COUNT(*) FILTER (WHERE mapping_status = 'IGNORED')::int AS ignored_count
      FROM whatsapp_groups
    `,
    [env.WHATSAPP_RECENT_CONTACT_BLOCK_DAYS],
  );

  const row = result.rows[0] ?? {};

  return {
    totalGroups: Number(row.total_groups ?? 0),
    mappedGroups: Number(row.mapped_groups ?? 0),
    pendingReviewGroups: Number(row.pending_review_groups ?? 0),
    confirmedUnmatchedGroups: Number(row.confirmed_unmatched_groups ?? 0),
    ignoredGroups: Number(row.ignored_groups ?? 0),
    recentlyBlockedGroups: Number(row.recently_blocked_groups ?? 0),
    lastImportedAt: row.last_imported_at ? new Date(String(row.last_imported_at)).toISOString() : null,
    classificationCounts: {
      WITH_ORDER: Number(row.with_order_count ?? 0),
      NO_ORDER_EXCEL: Number(row.no_order_excel_count ?? 0),
      OTHER: Number(row.other_count ?? 0),
    },
    mappingCounts: {
      AUTO_MAPPED: Number(row.auto_mapped_count ?? 0),
      MANUAL_MAPPED: Number(row.manual_mapped_count ?? 0),
      PENDING_REVIEW: Number(row.pending_review_count ?? 0),
      CONFIRMED_UNMATCHED: Number(row.confirmed_unmatched_count ?? 0),
      IGNORED: Number(row.ignored_count ?? 0),
    },
  };
}

export async function listWhatsappGroups(filters: WhatsappGroupFilters = {}): Promise<WhatsappGroupsResponse> {
  const customerIds = filters.savedSegmentId ? await buildSavedSegmentCustomerIds(filters.savedSegmentId) : [];
  if (filters.savedSegmentId && customerIds.length === 0) {
    return { items: [], total: 0 };
  }

  const { whereSql, params } = buildGroupsWhere(filters, customerIds);
  const limitSql =
    typeof filters.limit === "number" && Number.isFinite(filters.limit) && filters.limit > 0
      ? `LIMIT ${Math.floor(filters.limit)}`
      : "";
  const offsetSql =
    typeof filters.offset === "number" && Number.isFinite(filters.offset) && filters.offset > 0
      ? `OFFSET ${Math.floor(filters.offset)}`
      : "";

  const [itemsResult, totalResult] = await Promise.all([
    pool.query(
      `
        SELECT
          wg.*,
          c.customer_code,
          COALESCE(NULLIF(cs.display_name, ''), c.display_name) AS customer_display_name,
          cs.status AS customer_status,
          COALESCE(cs.last_attendant, c.last_attendant) AS last_attendant
        FROM whatsapp_groups wg
        LEFT JOIN customers c ON c.id = wg.customer_id
        LEFT JOIN customer_snapshot cs ON cs.customer_id = wg.customer_id
        ${whereSql}
        ORDER BY wg.last_contact_at DESC NULLS LAST, wg.source_name ASC
        ${limitSql}
        ${offsetSql}
      `,
      params,
    ),
    pool.query(
      `
        SELECT COUNT(*)::int AS total
        FROM whatsapp_groups wg
        LEFT JOIN customers c ON c.id = wg.customer_id
        LEFT JOIN customer_snapshot cs ON cs.customer_id = wg.customer_id
        ${whereSql}
      `,
      params,
    ),
  ]);

  return {
    items: itemsResult.rows.map((row) => mapWhatsappGroupRow(row)),
    total: Number(totalResult.rows[0]?.total ?? 0),
  };
}

export async function getWhatsappGroupsByIds(groupIds: string[]) {
  if (!groupIds.length) {
    return [];
  }

  const result = await pool.query(
    `
      SELECT
        wg.*,
        c.customer_code,
        COALESCE(NULLIF(cs.display_name, ''), c.display_name) AS customer_display_name,
        cs.status AS customer_status,
        COALESCE(cs.last_attendant, c.last_attendant) AS last_attendant
      FROM whatsapp_groups wg
      LEFT JOIN customers c ON c.id = wg.customer_id
      LEFT JOIN customer_snapshot cs ON cs.customer_id = wg.customer_id
      WHERE wg.id = ANY($1::uuid[])
    `,
    [groupIds],
  );

  return result.rows.map((row) => mapWhatsappGroupRow(row));
}

export async function importWhatsappGroupsFromWorkbook(fileBuffer: Buffer): Promise<WhatsappImportSummary> {
  const parsedRows = parseWorkbookRows(fileBuffer);

  if (!parsedRows.length) {
    throw new HttpError(400, "Nao foi encontrada nenhuma linha valida com Name e JID.");
  }

  const [customerMatchers, existingGroups] = await Promise.all([loadCustomersForAutoMap(), loadExistingGroups()]);
  const classificationCounts = emptyClassificationCounts();
  const mappingCounts = emptyMappingCounts();
  const now = new Date().toISOString();
  let insertedCount = 0;
  let updatedCount = 0;
  let autoMappedCount = 0;
  let pendingReviewCount = 0;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const row of parsedRows) {
      classificationCounts[row.classification] += 1;
      const existing = existingGroups.get(row.jid);

      let customerId: string | null = null;
      let mappingStatus: WhatsappGroupMappingStatus = "PENDING_REVIEW";
      let matchMethod: string | null = null;
      let mappingNote = existing?.mapping_note ?? "";

      if (existing && ["MANUAL_MAPPED", "CONFIRMED_UNMATCHED", "IGNORED"].includes(existing.mapping_status)) {
        customerId = existing.customer_id;
        mappingStatus = existing.mapping_status;
        matchMethod =
          existing.mapping_status === "MANUAL_MAPPED"
            ? "MANUAL"
            : existing.mapping_status === "IGNORED"
              ? "IGNORED"
              : "CONFIRMED_NONE";
      } else {
        const byCode = row.sourceCode ? customerMatchers.byCode.get(row.sourceCode) : null;
        const byName = row.normalizedSourceName ? customerMatchers.byName.get(row.normalizedSourceName) ?? [] : [];

        if (byCode) {
          customerId = byCode.id;
          mappingStatus = "AUTO_MAPPED";
          matchMethod = "CODE";
          autoMappedCount += 1;
        } else if (byName.length === 1) {
          customerId = byName[0]!.id;
          mappingStatus = "AUTO_MAPPED";
          matchMethod = "NAME";
          autoMappedCount += 1;
        } else {
          customerId = null;
          mappingStatus = "PENDING_REVIEW";
          matchMethod = null;
          pendingReviewCount += 1;
          mappingNote = existing?.mapping_status === "AUTO_MAPPED" ? "" : mappingNote;
        }
      }

      mappingCounts[mappingStatus] += 1;

      if (existing) {
        updatedCount += 1;
      } else {
        insertedCount += 1;
      }

      await client.query(
        `
          INSERT INTO whatsapp_groups (
            jid,
            source_name,
            normalized_source_name,
            source_code,
            classification,
            mapping_status,
            match_method,
            customer_id,
            mapping_note,
            last_imported_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz, NOW())
          ON CONFLICT (jid) DO UPDATE
          SET
            source_name = EXCLUDED.source_name,
            normalized_source_name = EXCLUDED.normalized_source_name,
            source_code = EXCLUDED.source_code,
            classification = EXCLUDED.classification,
            mapping_status = EXCLUDED.mapping_status,
            match_method = EXCLUDED.match_method,
            customer_id = EXCLUDED.customer_id,
            mapping_note = EXCLUDED.mapping_note,
            last_imported_at = EXCLUDED.last_imported_at,
            updated_at = NOW()
        `,
        [
          row.jid,
          row.sourceName,
          row.normalizedSourceName,
          row.sourceCode,
          row.classification,
          mappingStatus,
          matchMethod,
          customerId,
          mappingNote,
          now,
        ],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const mappingSummary = await getWhatsappMappingSummary();

  return {
    totalGroups: mappingSummary.totalGroups,
    importedCount: parsedRows.length,
    insertedCount,
    updatedCount,
    autoMappedCount,
    pendingReviewCount,
    classificationCounts,
    mappingCounts,
    lastImportedAt: mappingSummary.lastImportedAt,
  };
}

export async function importWhatsappGroupsFromDefaultWorkbook() {
  const workbookPath = await resolveDefaultWhatsappWorkbookPath();
  const fileBuffer = await fs.readFile(workbookPath);
  return importWhatsappGroupsFromWorkbook(fileBuffer);
}

export async function updateWhatsappGroupMatch(groupId: string, input: UpdateWhatsappGroupMatchInput): Promise<WhatsappGroup> {
  if (input.mappingStatus === "MANUAL_MAPPED" && !input.customerId) {
    throw new HttpError(400, "Selecione um cliente para concluir o mapeamento manual.");
  }

  if (input.mappingStatus !== "MANUAL_MAPPED" && input.customerId) {
    throw new HttpError(400, "Nao e permitido manter cliente vinculado em um grupo sem mapeamento.");
  }

  const result = await pool.query(
    `
      UPDATE whatsapp_groups
      SET
        customer_id = $2,
        mapping_status = $3,
        match_method = $4,
        mapping_note = $5,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id
    `,
    [
      groupId,
      input.customerId ?? null,
      input.mappingStatus,
      input.mappingStatus === "MANUAL_MAPPED"
        ? "MANUAL"
        : input.mappingStatus === "IGNORED"
          ? "IGNORED"
          : "CONFIRMED_NONE",
      input.note?.trim() ?? "",
    ],
  );

  if (!result.rows[0]) {
    throw new HttpError(404, "Grupo de WhatsApp nao encontrado.");
  }

  const groups = await getWhatsappGroupsByIds([groupId]);
  if (!groups[0]) {
    throw new HttpError(404, "Grupo de WhatsApp nao encontrado.");
  }

  return groups[0];
}

export async function getWhatsappGroupById(groupId: string) {
  const groups = await getWhatsappGroupsByIds([groupId]);
  return groups[0] ?? null;
}

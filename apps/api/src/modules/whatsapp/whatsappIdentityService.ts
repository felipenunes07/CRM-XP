import { pool } from "../../db/client.js";
import { logger } from "../../lib/logger.js";
import {
  chooseCanonicalWhatsappJid,
  isMonitorableWhatsappJid,
  isWhatsappLidJid,
  isWhatsappPhoneJid,
  normalizeWhatsappJidForStorage,
  type EvolutionMessageContext,
} from "./whatsappMonitorCore.js";

export interface WhatsappConversationIdentity {
  canonicalJid: string | null;
  aliases: string[];
}

function normalizeInstanceName(value: string | null | undefined) {
  return String(value ?? "").trim().toLocaleLowerCase("pt-BR");
}

function uniqueJids(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const normalized = normalizeWhatsappJidForStorage(value);
    if (!normalized || !isMonitorableWhatsappJid(normalized) || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
  }

  return output;
}

function aliasKind(jid: string) {
  if (jid.endsWith("@g.us")) return "GROUP";
  if (isWhatsappLidJid(jid)) return "LID";
  if (isWhatsappPhoneJid(jid)) return "PN";
  return "UNKNOWN";
}

async function readKnownAliasRows(instanceName: string, aliases: string[]) {
  if (!aliases.length) {
    return [];
  }

  const result = await pool.query(
    `
    SELECT alias_jid, canonical_jid
    FROM whatsapp_jid_aliases
    WHERE LOWER(instance_name) = LOWER($1)
      AND (
        alias_jid = ANY($2::text[])
        OR canonical_jid = ANY($2::text[])
      )
    ORDER BY updated_at DESC
    `,
    [instanceName, aliases],
  );

  return result.rows.map((row) => ({
    aliasJid: String(row.alias_jid),
    canonicalJid: String(row.canonical_jid),
  }));
}

export async function upsertWhatsappJidAliases(input: {
  instanceName: string | null | undefined;
  canonicalJid: string | null | undefined;
  aliases: Array<string | null | undefined>;
  source?: string;
}) {
  const instanceName = normalizeInstanceName(input.instanceName);
  const aliases = uniqueJids([input.canonicalJid, ...input.aliases]);
  const canonicalJid = chooseCanonicalWhatsappJid(aliases, input.canonicalJid);

  if (!canonicalJid || aliases.length < 2) {
    return;
  }

  await pool.query(
    `
    INSERT INTO whatsapp_jid_aliases (
      instance_name, alias_jid, canonical_jid, alias_type, source,
      first_seen_at, last_seen_at, created_at, updated_at
    )
    SELECT
      $1,
      alias_jid,
      $2,
      CASE
        WHEN alias_jid LIKE '%@g.us' THEN 'GROUP'
        WHEN alias_jid LIKE '%@lid' OR (alias_jid NOT LIKE '%@%' AND length(regexp_replace(alias_jid, '\\D', '', 'g')) > 13) THEN 'LID'
        WHEN alias_jid LIKE '%@s.whatsapp.net' THEN 'PN'
        ELSE 'UNKNOWN'
      END,
      $4,
      NOW(),
      NOW(),
      NOW(),
      NOW()
    FROM unnest($3::text[]) AS alias_jid
    WHERE alias_jid <> ''
    ON CONFLICT (instance_name, alias_jid) DO UPDATE SET
      canonical_jid = EXCLUDED.canonical_jid,
      alias_type = EXCLUDED.alias_type,
      source = COALESCE(EXCLUDED.source, whatsapp_jid_aliases.source),
      last_seen_at = NOW(),
      updated_at = NOW()
    `,
    [instanceName, canonicalJid, aliases, input.source ?? "webhook"],
  );
}

export async function resolveWhatsappConversationIdentity(
  instanceNameInput: string | null | undefined,
  context: EvolutionMessageContext,
): Promise<WhatsappConversationIdentity> {
  const instanceName = normalizeInstanceName(instanceNameInput ?? context.instanceName);
  let aliases = uniqueJids([
    context.remoteJid,
    context.providerRemoteJid,
    context.remoteJidAlt,
    ...context.remoteJidAliases,
  ]);
  let canonicalJid = chooseCanonicalWhatsappJid(aliases, context.remoteJid);

  try {
    const knownRows = await readKnownAliasRows(instanceName, aliases);
    if (knownRows.length) {
      aliases = uniqueJids([
        ...aliases,
        ...knownRows.map((row) => row.aliasJid),
        ...knownRows.map((row) => row.canonicalJid),
      ]);
      canonicalJid = chooseCanonicalWhatsappJid(
        [...aliases, ...knownRows.map((row) => row.canonicalJid)],
        canonicalJid,
      );
    }

    await upsertWhatsappJidAliases({
      instanceName,
      canonicalJid,
      aliases,
      source: "messages.upsert",
    });
  } catch (error) {
    logger.warn("failed to resolve WhatsApp JID aliases", {
      instanceName,
      remoteJid: context.remoteJid,
      aliases,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return {
    canonicalJid,
    aliases,
  };
}

export async function getWhatsappConversationAliases(
  instanceNameInput: string | null | undefined,
  remoteJidInput: string | null | undefined,
) {
  const instanceName = normalizeInstanceName(instanceNameInput);
  const remoteJid = normalizeWhatsappJidForStorage(remoteJidInput);
  if (!remoteJid) {
    return [];
  }

  const knownRows = await readKnownAliasRows(instanceName, [remoteJid]);
  const aliases = uniqueJids([
    remoteJid,
    ...knownRows.map((row) => row.aliasJid),
    ...knownRows.map((row) => row.canonicalJid),
  ]);
  const canonicalJid = chooseCanonicalWhatsappJid(aliases, remoteJid) ?? remoteJid;

  await upsertWhatsappJidAliases({
    instanceName,
    canonicalJid,
    aliases,
    source: "conversation-lookup",
  });

  return uniqueJids([canonicalJid, ...aliases]).sort((left, right) => {
    const leftKind = aliasKind(left);
    const rightKind = aliasKind(right);
    if (leftKind === rightKind) return left.localeCompare(right);
    if (leftKind === "PN") return -1;
    if (rightKind === "PN") return 1;
    return left.localeCompare(right);
  });
}

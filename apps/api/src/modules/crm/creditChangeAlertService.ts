/**
 * Aviso de alteracao de credito: quando alguem muda CREDITO, CREDITO INTERNO
 * ou PRAZO de um cliente pelo CRM, o grupo do financeiro recebe o antes/depois,
 * quem alterou e quanto o cliente deve hoje. A vendedora do cliente e marcada
 * (@) para saber do novo limite. Toda alteracao fica registrada em
 * customer_credit_change_log, tenha ou nao saido o aviso.
 */
import type { CustomerCreditRow } from "@olist-crm/shared";
import { pool } from "../../db/client.js";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";
import type { JwtUser } from "../platform/authService.js";
import { formatBrl, normalizeSellerName, type BillingOutgoingMessage } from "./billingAlertMessages.js";
import { loadSellerPhoneDirectory } from "./billingAlertService.js";
import { sendToGroup } from "./offboardingAlertService.js";

export interface CreditValues {
  creditLimit: number | null;
  internalCreditLimit: number | null;
  paymentTerm: number | null;
}

export interface CreditChangeInput {
  customerCode: string;
  displayName: string;
  debtAmount: number;
  seller: string | null;
  sellerPhone: string | null;
  before: CreditValues;
  after: CreditValues;
  changedByName: string;
  changedAt: Date;
  timeZone?: string;
}

function positive(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function creditValuesFromRow(row: CustomerCreditRow | null): CreditValues {
  return {
    creditLimit: positive(row?.creditLimit),
    internalCreditLimit: positive(row?.internalCreditLimit ?? null),
    paymentTerm: positive(row?.paymentTerm),
  };
}

export function hasCreditChange(before: CreditValues, after: CreditValues) {
  return (
    before.creditLimit !== after.creditLimit ||
    before.internalCreditLimit !== after.internalCreditLimit ||
    before.paymentTerm !== after.paymentTerm
  );
}

function money(value: number | null) {
  return value === null ? "sem crédito" : formatBrl(value);
}

function days(value: number | null) {
  return value === null ? "sem prazo" : `${value} dias`;
}

function changeLine(label: string, before: string, after: string) {
  return before === after ? `${label}: ${after} (sem mudança)` : `${label}: ${before} → *${after}*`;
}

function formatWhen(date: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone,
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.day}/${parts.month} às ${parts.hour}:${parts.minute}`;
}

export function buildCreditChangeMessage(input: CreditChangeInput): BillingOutgoingMessage {
  const { before, after } = input;
  const referenceLimit = after.creditLimit ?? after.internalCreditLimit;
  const usage = referenceLimit ? ` (${Math.round((input.debtAmount / referenceLimit) * 100)}% do novo crédito)` : "";
  const sellerLine = input.seller
    ? input.sellerPhone
      ? `👤 Vendedor(a): @${input.sellerPhone} *${input.seller}*`
      : `👤 Vendedor(a): *${input.seller}*`
    : null;

  const text = [
    "💳 *Crédito alterado no CRM*",
    `*${input.customerCode} · ${input.displayName}*`,
    sellerLine,
    "",
    changeLine("Crédito", money(before.creditLimit), money(after.creditLimit)),
    changeLine("Crédito interno", money(before.internalCreditLimit), money(after.internalCreditLimit)),
    changeLine("Prazo", days(before.paymentTerm), days(after.paymentTerm)),
    "",
    `Deve hoje: ${formatBrl(input.debtAmount)}${usage}`,
    `✏️ Alterado por ${input.changedByName} em ${formatWhen(input.changedAt, input.timeZone ?? "America/Sao_Paulo")}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return { text, mentions: input.sellerPhone ? [input.sellerPhone] : [] };
}

/** Vendedora do cliente: VENDEDOR do pedido mais recente na planilha, ou a ultima atendente do CRM. */
async function findCustomerSeller(customerId: string): Promise<string | null> {
  const result = await pool.query(
    `
      SELECT COALESCE(
        (
          SELECT NULLIF(BTRIM(order_entry.seller), '')
          FROM customer_credit_order_entries order_entry
          JOIN customer_credit_snapshots snapshot ON snapshot.id = order_entry.snapshot_id AND snapshot.is_active = TRUE
          WHERE order_entry.customer_id = $1
            AND NULLIF(BTRIM(order_entry.seller), '') IS NOT NULL
            AND LOWER(BTRIM(order_entry.seller)) <> 'resumo'
          ORDER BY order_entry.order_date DESC NULLS LAST
          LIMIT 1
        ),
        (SELECT NULLIF(BTRIM(last_attendant), '') FROM customers WHERE id = $1)
      ) AS seller
    `,
    [customerId],
  );
  return result.rows[0]?.seller ? String(result.rows[0].seller) : null;
}

function alertGroupJid() {
  return (env.CREDIT_CHANGE_ALERT_GROUP_JID.trim() || env.BILLING_ALERT_GROUP_JID.trim()) || null;
}

/**
 * Registra a alteracao e avisa o grupo. Nunca derruba o salvamento do credito:
 * qualquer falha no aviso so vai para o log.
 */
export async function notifyCustomerCreditChange(input: {
  customerId: string;
  before: CustomerCreditRow | null;
  after: CustomerCreditRow | null;
  user: JwtUser;
}): Promise<{ changed: boolean; notified: boolean }> {
  const before = creditValuesFromRow(input.before);
  const after = creditValuesFromRow(input.after);
  if (!hasCreditChange(before, after)) {
    return { changed: false, notified: false };
  }

  const row = input.after ?? input.before;
  let logId: string | null = null;
  try {
    const logResult = await pool.query(
      `
        INSERT INTO customer_credit_change_log (
          customer_id, customer_code, before_values, after_values, changed_by_user_id, changed_by_name
        )
        VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6)
        RETURNING id
      `,
      [input.customerId, row?.customerCode ?? null, JSON.stringify(before), JSON.stringify(after), input.user.id, input.user.name],
    );
    logId = logResult.rows[0]?.id ? String(logResult.rows[0].id) : null;
  } catch (error) {
    logger.error("failed to log customer credit change", { error: String(error), customerId: input.customerId });
  }

  const groupJid = alertGroupJid();
  if (!env.CREDIT_CHANGE_ALERT_ENABLED || !groupJid) {
    logger.info("credit change alert skipped", { enabled: env.CREDIT_CHANGE_ALERT_ENABLED, hasGroup: Boolean(groupJid) });
    return { changed: true, notified: false };
  }

  try {
    const seller = await findCustomerSeller(input.customerId);
    const phones = seller ? await loadSellerPhoneDirectory() : new Map<string, string>();
    const message = buildCreditChangeMessage({
      customerCode: row?.customerCode ?? "",
      displayName: row?.customerDisplayName ?? "",
      debtAmount: row?.debtAmount ?? 0,
      seller,
      sellerPhone: seller ? phones.get(normalizeSellerName(seller)) ?? null : null,
      before,
      after,
      changedByName: input.user.name,
      changedAt: new Date(),
      timeZone: env.BILLING_ALERT_TIMEZONE,
    });
    await sendToGroup(groupJid, message.text, env.BILLING_ALERT_INSTANCE_ID, message.mentions);
    if (logId) {
      await pool.query(`UPDATE customer_credit_change_log SET notified_at = NOW() WHERE id = $1`, [logId]);
    }
    return { changed: true, notified: true };
  } catch (error) {
    logger.error("failed to send credit change alert", { error: String(error), customerId: input.customerId });
    return { changed: true, notified: false };
  }
}

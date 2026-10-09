import { pool } from "../../db/client.js";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";
import { safeNumber } from "../../lib/normalize.js";
import { loadSellerPhoneDirectory } from "./billingAlertService.js";
import { formatBrl, normalizeSellerName } from "./billingAlertMessages.js";
import { sendToGroup } from "./offboardingAlertService.js";

const ALERT_CURSOR_PREFIX = "olist_order_credit_alert:";

export interface OlistOrderCreditInput {
  orderId: string;
  orderNumber: string;
  customerCode: string;
  customerName: string;
  orderStatus: string;
  orderTotal: number;
  attendantName: string | null;
}

export interface OrderCreditEvaluation {
  shouldAlert: boolean;
  effectiveLimit: number;
  availableBeforeOrder: number;
  projectedExposure: number;
  requiredPayment: number;
}

function normalizeStatus(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

/** Situacoes em que o pedido ainda representa uma proposta que pode ser segurada. */
export function isCommercialProposalStatus(value: string) {
  const status = normalizeStatus(value);
  return status.includes("PROPOSTA") || status.includes("ORCAMENTO") || status.includes("ABERTO");
}

export function evaluateOrderCredit(params: {
  debtAmount: number;
  creditLimit: number | null;
  internalCreditLimit: number | null;
  otherOpenProposals: number;
  orderTotal: number;
}): OrderCreditEvaluation {
  const credit = Math.max(0, params.creditLimit ?? 0);
  const internal = Math.max(0, params.internalCreditLimit ?? 0);
  const effectiveLimit = Math.max(credit, internal);
  const exposureBeforeOrder = Math.max(0, params.debtAmount) + Math.max(0, params.otherOpenProposals);
  const projectedExposure = exposureBeforeOrder + Math.max(0, params.orderTotal);
  const requiredPayment = Math.max(0, projectedExposure - effectiveLimit);

  return {
    shouldAlert: params.orderTotal > 0 && requiredPayment >= 0.01,
    effectiveLimit,
    availableBeforeOrder: Math.max(0, effectiveLimit - exposureBeforeOrder),
    projectedExposure,
    requiredPayment,
  };
}

function formatSnapshotTime(value: Date | string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: env.BILLING_ALERT_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function buildOrderCreditAlertMessage(params: {
  order: OlistOrderCreditInput;
  debtAmount: number;
  otherOpenProposals: number;
  evaluation: OrderCreditEvaluation;
  snapshotImportedAt: Date | string;
  sellerPhone?: string | null;
}) {
  const { order, debtAmount, otherOpenProposals, evaluation } = params;
  const seller = order.attendantName?.trim() || "Sem vendedora definida";
  const sellerLine = params.sellerPhone
    ? `Vendedora: @${params.sellerPhone} *${seller}*`
    : `Vendedora: *${seller}*`;

  return [
    "🚨 *NÃO LIBERAR PEDIDO — CRÉDITO INSUFICIENTE*",
    "",
    `Cliente: *${order.customerCode} · ${order.customerName}*`,
    sellerLine,
    `Pedido/proposta: *${order.orderNumber || order.orderId}* · ${formatBrl(order.orderTotal)}`,
    `Situação na Olist: ${order.orderStatus}`,
    "",
    `Dívida atual: ${formatBrl(debtAmount)}`,
    otherOpenProposals > 0 ? `Outras propostas abertas: ${formatBrl(otherOpenProposals)}` : null,
    `Limite disponível antes deste pedido: ${formatBrl(evaluation.availableBeforeOrder)}`,
    `Limite total aprovado: ${formatBrl(evaluation.effectiveLimit)}`,
    `Total projetado: *${formatBrl(evaluation.projectedExposure)}*`,
    `Excede o limite em: *${formatBrl(evaluation.requiredPayment)}*`,
    "",
    `👉 Exigir pagamento mínimo de *${formatBrl(evaluation.requiredPayment)}* antes da liberação.`,
    `_Saldo financeiro atualizado em ${formatSnapshotTime(params.snapshotImportedAt)}._`,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

async function clearAlertClaim(orderId: string) {
  await pool.query("DELETE FROM sync_cursors WHERE key = $1", [`${ALERT_CURSOR_PREFIX}${orderId}`]);
}

async function claimAlert(orderId: string, signature: string) {
  const result = await pool.query(
    `
      INSERT INTO sync_cursors (key, cursor_value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key) DO UPDATE
      SET cursor_value = EXCLUDED.cursor_value, updated_at = NOW()
      WHERE sync_cursors.cursor_value IS DISTINCT FROM EXCLUDED.cursor_value
      RETURNING key
    `,
    [`${ALERT_CURSOR_PREFIX}${orderId}`, signature],
  );
  return Boolean(result.rowCount);
}

export async function checkOlistOrderCreditRisk(order: OlistOrderCreditInput) {
  if (!env.BILLING_ALERT_ENABLED || !env.BILLING_ALERT_GROUP_JID.trim()) {
    return { sent: false, reason: "billing-alert-disabled" } as const;
  }
  if (!isCommercialProposalStatus(order.orderStatus)) {
    await clearAlertClaim(order.orderId);
    return { sent: false, reason: "not-commercial-proposal" } as const;
  }
  if (!order.customerCode.trim()) {
    return { sent: false, reason: "missing-customer-code" } as const;
  }

  const creditResult = await pool.query(
    `
      SELECT
        snapshot.id AS snapshot_id,
        snapshot.imported_at,
        row.customer_code,
        COALESCE(row.customer_display_name, row.source_display_name, row.customer_code) AS display_name,
        GREATEST(0, -row.balance_amount) AS debt_amount,
        COALESCE(override.credit_limit, row.credit_limit) AS credit_limit,
        COALESCE(
          override.internal_credit_limit::text,
          (
            SELECT entry.value
            FROM jsonb_each_text(row.raw_payload) AS entry
            WHERE UPPER(BTRIM(entry.key)) = 'CREDITO INTERNO'
            LIMIT 1
          )
        ) AS internal_credit_limit
      FROM customer_credit_snapshots snapshot
      JOIN customer_credit_snapshot_rows row ON row.snapshot_id = snapshot.id
      LEFT JOIN customer_credit_overrides override ON override.customer_id = row.customer_id
      WHERE snapshot.is_active = TRUE
        AND UPPER(row.customer_code) = UPPER($1)
      ORDER BY snapshot.imported_at DESC
      LIMIT 1
    `,
    [order.customerCode],
  );
  const credit = creditResult.rows[0];
  if (!credit) {
    return { sent: false, reason: "customer-not-in-credit-snapshot" } as const;
  }

  const alreadyInFinancialResult = await pool.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM customer_credit_order_entries
        WHERE snapshot_id = $1
          AND UPPER(customer_code) = UPPER($2)
          AND NULLIF(BTRIM(order_number), '') = NULLIF(BTRIM($3), '')
      ) AS found
    `,
    [credit.snapshot_id, order.customerCode, order.orderNumber],
  );
  if (alreadyInFinancialResult.rows[0]?.found) {
    await clearAlertClaim(order.orderId);
    return { sent: false, reason: "order-already-in-financial-balance" } as const;
  }

  const proposalsResult = await pool.query(
    `
      WITH proposals AS (
        SELECT
          sr.external_order_id,
          MAX(sr.order_number) AS order_number,
          SUM(sr.line_total) AS total_amount
        FROM sales_raw sr
        WHERE sr.source_system = 'olist_v2'
          AND UPPER(sr.customer_code) = UPPER($1)
          AND sr.external_order_id IS DISTINCT FROM $2
          AND (
            UPPER(sr.order_status) LIKE '%PROPOSTA%'
            OR UPPER(sr.order_status) LIKE '%ORCAMENTO%'
            OR UPPER(sr.order_status) LIKE '%ORÇAMENTO%'
            OR UPPER(sr.order_status) LIKE '%ABERTO%'
          )
        GROUP BY sr.external_order_id
      )
      SELECT COALESCE(SUM(proposals.total_amount), 0) AS total_amount
      FROM proposals
      WHERE NOT EXISTS (
        SELECT 1
        FROM customer_credit_order_entries entry
        WHERE entry.snapshot_id = $3
          AND UPPER(entry.customer_code) = UPPER($1)
          AND NULLIF(BTRIM(entry.order_number), '') = NULLIF(BTRIM(proposals.order_number), '')
      )
    `,
    [order.customerCode, order.orderId, credit.snapshot_id],
  );

  const debtAmount = safeNumber(credit.debt_amount);
  const otherOpenProposals = safeNumber(proposalsResult.rows[0]?.total_amount);
  const evaluation = evaluateOrderCredit({
    debtAmount,
    creditLimit: credit.credit_limit === null ? null : safeNumber(credit.credit_limit),
    internalCreditLimit: credit.internal_credit_limit === null ? null : safeNumber(credit.internal_credit_limit),
    otherOpenProposals,
    orderTotal: order.orderTotal,
  });

  if (!evaluation.shouldAlert) {
    await clearAlertClaim(order.orderId);
    return { sent: false, reason: "within-credit-limit", evaluation } as const;
  }

  const signature = JSON.stringify({
    status: normalizeStatus(order.orderStatus),
    orderTotal: Math.round(order.orderTotal * 100),
    debtAmount: Math.round(debtAmount * 100),
    otherOpenProposals: Math.round(otherOpenProposals * 100),
    effectiveLimit: Math.round(evaluation.effectiveLimit * 100),
  });
  if (!(await claimAlert(order.orderId, signature))) {
    return { sent: false, reason: "duplicate-alert", evaluation } as const;
  }

  const phones = await loadSellerPhoneDirectory();
  const sellerPhone = phones.get(normalizeSellerName(order.attendantName)) ?? null;
  const text = buildOrderCreditAlertMessage({
    order: {
      ...order,
      customerName: order.customerName || String(credit.display_name ?? order.customerCode),
    },
    debtAmount,
    otherOpenProposals,
    evaluation,
    snapshotImportedAt: credit.imported_at,
    sellerPhone,
  });

  try {
    await sendToGroup(
      env.BILLING_ALERT_GROUP_JID.trim(),
      text,
      env.BILLING_ALERT_INSTANCE_ID,
      sellerPhone ? [sellerPhone] : [],
    );
  } catch (error) {
    await clearAlertClaim(order.orderId).catch(() => undefined);
    throw error;
  }

  logger.info("olist order credit alert sent", {
    orderId: order.orderId,
    orderNumber: order.orderNumber,
    customerCode: order.customerCode,
    projectedExposure: evaluation.projectedExposure,
    effectiveLimit: evaluation.effectiveLimit,
    requiredPayment: evaluation.requiredPayment,
  });
  return { sent: true, evaluation } as const;
}

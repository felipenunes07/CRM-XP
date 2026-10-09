import type {
  CustomerStatus,
  CustomerOpportunityQueueItem,
  DecisionCenterCreditDecision,
  DecisionCenterRecoveryItem,
  DecisionCenterResponse,
} from "@olist-crm/shared";
import { pool } from "../../db/client.js";
import { getCustomerCreditOverview } from "./customerCreditService.js";
import { isOpportunityEligibleCreditRow } from "./opportunityService.js";

const CACHE_TTL_MS = 60_000;
const MAX_DECISIONS = 40;
const MAX_SALES_OPPORTUNITIES = 30;
const MAX_RECOVERY_OPPORTUNITIES = 30;

let cached: { expiresAt: number; value: DecisionCenterResponse } | null = null;
let inFlight: Promise<DecisionCenterResponse> | null = null;

type ProposalRow = {
  order_id: string;
  order_number: string | null;
  order_status: string | null;
  order_total: string | number | null;
  order_updated_at: string | Date | null;
  customer_code: string;
  customer_name: string | null;
  seller: string | null;
};

type RecoveryRow = {
  customer_id: string;
  customer_code: string | null;
  customer_name: string;
  status: CustomerStatus;
  last_purchase_at: string | Date | null;
  days_since_last_purchase: string | number | null;
  avg_ticket: string | number | null;
  total_spent: string | number | null;
  priority_score: string | number | null;
  seller: string | null;
};

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
function isoValue(value: string | Date | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

export function recoverySuggestedAction(status: CustomerStatus, daysSinceLastPurchase: number | null) {
  if (status === "INACTIVE") {
    return daysSinceLastPurchase !== null && daysSinceLastPurchase >= 90
      ? "Retomar com oferta forte baseada no histórico"
      : "Fazer contato de reativação hoje";
  }
  return "Antecipar a próxima compra antes de perder o cliente";
}

async function loadOpenProposals() {
  return pool.query<ProposalRow>(
    `
      WITH proposal_orders AS (
        SELECT
          sr.external_order_id AS order_id,
          MAX(NULLIF(BTRIM(sr.order_number), '')) AS order_number,
          MAX(NULLIF(BTRIM(sr.order_status), '')) AS order_status,
          SUM(sr.line_total) AS order_total,
          MAX(COALESCE(sr.order_updated_at, sr.created_at)) AS order_updated_at,
          UPPER(BTRIM(sr.customer_code)) AS customer_code_key,
          MAX(BTRIM(sr.customer_code)) AS customer_code,
          MAX(NULLIF(BTRIM(sr.customer_label), '')) AS customer_name,
          MAX(NULLIF(BTRIM(sr.attendant_name), '')) AS seller
        FROM sales_raw sr
        WHERE sr.source_system = 'olist_v2'
          AND NULLIF(BTRIM(sr.external_order_id), '') IS NOT NULL
          AND (
            UPPER(COALESCE(sr.order_status, '')) LIKE '%PROPOSTA%'
            OR UPPER(COALESCE(sr.order_status, '')) LIKE '%ORCAMENTO%'
            OR UPPER(COALESCE(sr.order_status, '')) LIKE '%ORÇAMENTO%'
            OR UPPER(COALESCE(sr.order_status, '')) LIKE '%ABERTO%'
          )
        GROUP BY sr.external_order_id, UPPER(BTRIM(sr.customer_code))
      ), active_snapshot AS (
        SELECT id
        FROM customer_credit_snapshots
        WHERE is_active = TRUE
        ORDER BY imported_at DESC
        LIMIT 1
      )
      SELECT
        proposal.order_id,
        proposal.order_number,
        proposal.order_status,
        proposal.order_total,
        proposal.order_updated_at,
        proposal.customer_code,
        proposal.customer_name,
        proposal.seller
      FROM proposal_orders proposal
      WHERE NOT EXISTS (
        SELECT 1
        FROM customer_credit_order_entries entry
        JOIN active_snapshot snapshot ON snapshot.id = entry.snapshot_id
        WHERE UPPER(BTRIM(entry.customer_code)) = proposal.customer_code_key
          AND NULLIF(BTRIM(entry.order_number), '') = proposal.order_number
      )
      ORDER BY proposal.order_updated_at DESC NULLS LAST, proposal.order_total DESC
    `,
  );
}

async function loadRecoveryOpportunities(): Promise<DecisionCenterRecoveryItem[]> {
  const result = await pool.query<RecoveryRow>(
    `
      SELECT
        customer.id AS customer_id,
        customer.customer_code,
        snapshot.display_name AS customer_name,
        snapshot.status,
        snapshot.last_purchase_at,
        snapshot.days_since_last_purchase,
        snapshot.avg_ticket,
        snapshot.total_spent,
        snapshot.priority_score,
        COALESCE(NULLIF(BTRIM(snapshot.last_attendant), ''), NULLIF(BTRIM(customer.last_attendant), '')) AS seller
      FROM customer_snapshot snapshot
      JOIN customers customer ON customer.id = snapshot.customer_id
      WHERE snapshot.status IN ('ATTENTION', 'INACTIVE')
        AND snapshot.last_purchase_at IS NOT NULL
      ORDER BY
        CASE snapshot.status WHEN 'ATTENTION' THEN 0 ELSE 1 END,
        snapshot.priority_score DESC,
        snapshot.avg_ticket DESC,
        snapshot.days_since_last_purchase DESC
      LIMIT $1
    `,
    [MAX_RECOVERY_OPPORTUNITIES],
  );

  return result.rows.map((row) => {
    const daysSinceLastPurchase = row.days_since_last_purchase === null
      ? null
      : Math.max(0, Math.round(numberValue(row.days_since_last_purchase)));
    return {
      customerId: String(row.customer_id),
      customerCode: row.customer_code ? String(row.customer_code) : null,
      customerName: String(row.customer_name),
      status: row.status,
      lastPurchaseAt: isoValue(row.last_purchase_at),
      daysSinceLastPurchase,
      averageTicket: numberValue(row.avg_ticket),
      totalSpent: numberValue(row.total_spent),
      priorityScore: numberValue(row.priority_score),
      seller: row.seller ? String(row.seller) : null,
      suggestedAction: recoverySuggestedAction(row.status, daysSinceLastPurchase),
    };
  });
}

async function buildDecisionCenter(): Promise<DecisionCenterResponse> {
  const [creditOverview, proposalsResult, recoveryOpportunities] = await Promise.all([
    getCustomerCreditOverview(),
    loadOpenProposals(),
    loadRecoveryOpportunities(),
  ]);

  const creditByCode = new Map(
    creditOverview.linkedRows.map((row) => [row.customerCode.trim().toUpperCase(), row] as const),
  );
  const openTotalByCustomer = new Map<string, number>();
  for (const proposal of proposalsResult.rows) {
    const key = proposal.customer_code.trim().toUpperCase();
    openTotalByCustomer.set(key, (openTotalByCustomer.get(key) ?? 0) + numberValue(proposal.order_total));
  }

  const creditDecisions = proposalsResult.rows
    .map((proposal): DecisionCenterCreditDecision | null => {
      const key = proposal.customer_code.trim().toUpperCase();
      const credit = creditByCode.get(key);
      if (!credit) return null;

      const effectiveLimit = Math.max(credit.creditLimit, credit.internalCreditLimit ?? 0);
      if (effectiveLimit <= 0) return null;

      const openProposalsAmount = openTotalByCustomer.get(key) ?? 0;
      const projectedExposure = credit.debtAmount + openProposalsAmount;
      if (projectedExposure <= effectiveLimit) return null;

      return {
        orderId: String(proposal.order_id),
        orderNumber: String(proposal.order_number ?? proposal.order_id),
        orderStatus: String(proposal.order_status ?? "Proposta comercial"),
        orderTotal: numberValue(proposal.order_total),
        orderUpdatedAt: isoValue(proposal.order_updated_at),
        customerId: credit.customerId,
        customerCode: credit.customerCode,
        customerName: credit.customerDisplayName || String(proposal.customer_name ?? credit.customerCode),
        seller: proposal.seller || credit.assignedSeller || credit.lastOrderSeller || null,
        debtAmount: credit.debtAmount,
        openProposalsAmount,
        projectedExposure,
        effectiveLimit,
        requiredPayment: Math.max(0, projectedExposure - effectiveLimit),
      };
    })
    .filter((item): item is DecisionCenterCreditDecision => Boolean(item))
    .sort((left, right) => right.requiredPayment - left.requiredPayment || right.orderTotal - left.orderTotal)
    .slice(0, MAX_DECISIONS);

  // A Central precisa abrir em poucos segundos. O cruzamento completo com
  // estoque e historico de produtos continua disponivel na tela de
  // oportunidades, mas pode varrer centenas de milhares de itens. Aqui a fila
  // executiva usa apenas o snapshot financeiro ja materializado: mostra quem
  // tem saldo ou credito livre e deixa a investigacao detalhada para o clique.
  const salesOpportunities = creditOverview.linkedRows
    .filter((row) => Boolean(row.customerId) && isOpportunityEligibleCreditRow(row))
    .map((row): CustomerOpportunityQueueItem => {
      const primarySource = row.creditBalanceAmount > 0 ? "CREDIT_BALANCE" : "AVAILABLE_CREDIT";
      const targetAmount = primarySource === "CREDIT_BALANCE"
        ? row.creditBalanceAmount
        : Math.max(0, row.availableCreditAmount);
      return {
        customerId: row.customerId!,
        customerCode: row.customerCode,
        customerDisplayName: row.customerDisplayName,
        primarySource,
        targetAmount,
        creditBalanceAmount: row.creditBalanceAmount,
        availableCreditAmount: row.availableCreditAmount,
        suggestedAmount: targetAmount,
        remainingGapAmount: 0,
        coverageRatio: targetAmount > 0 ? 1 : 0,
        matchedProductCount: 0,
        suggestedLineCount: 0,
        topModelsInStock: [],
        lastPurchaseAt: row.lastOrderDate,
        daysSinceLastPurchase: row.daysSinceLastOrder,
        lastAttendant: row.assignedSeller || row.lastOrderSeller || null,
      };
    })
    .sort(
      (left, right) =>
        Number(right.primarySource === "CREDIT_BALANCE") - Number(left.primarySource === "CREDIT_BALANCE") ||
        right.targetAmount - left.targetAmount ||
        left.customerDisplayName.localeCompare(right.customerDisplayName, "pt-BR"),
    )
    .slice(0, MAX_SALES_OPPORTUNITIES);

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      decisionsCount: creditDecisions.length,
      decisionsValue: creditDecisions.reduce((sum, item) => sum + item.orderTotal, 0),
      requiredPaymentTotal: creditDecisions.reduce((sum, item) => sum + item.requiredPayment, 0),
      salesCount: salesOpportunities.length,
      salesPotential: salesOpportunities.reduce((sum, item) => sum + item.suggestedAmount, 0),
      recoveryCount: recoveryOpportunities.length,
    },
    creditDecisions,
    salesOpportunities,
    recoveryOpportunities,
  };
}

export async function getDecisionCenter(): Promise<DecisionCenterResponse> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (inFlight) return inFlight;

  inFlight = buildDecisionCenter()
    .then((value) => {
      cached = { value, expiresAt: Date.now() + CACHE_TTL_MS };
      return value;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}


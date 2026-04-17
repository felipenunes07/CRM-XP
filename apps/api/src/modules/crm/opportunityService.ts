import type {
  CustomerCreditRow,
  CustomerOpportunityDetail,
  CustomerOpportunityQueueItem,
  CustomerOpportunityQueueResponse,
  InventoryItem,
  InventorySnapshotMeta,
  MessageTemplate,
  OpportunityMessagePreview,
  OpportunityPrimarySource,
  OpportunitySuggestedLine,
  TopProduct,
} from "@olist-crm/shared";
import { pool } from "../../db/client.js";
import { normalizeText } from "../../lib/normalize.js";
import { getCustomerCreditDetail, getCustomerCreditOverview } from "./customerCreditService.js";
import { getCustomerDetail } from "./customerService.js";
import { getInventorySnapshotWithItems } from "./inventoryService.js";
import { listMessageTemplates } from "./messageService.js";

const OPPORTUNITY_STOPWORDS = new Set([
  "doc",
  "de",
  "carga",
  "premier",
  "outlet",
  "conector",
  "lcd",
  "oled",
  "ori",
  "original",
  "com",
  "aro",
  "destaque",
  "preto",
  "branco",
  "azul",
  "verde",
  "rosa",
  "roxo",
  "roxa",
  "prata",
  "cinza",
  "dourado",
  "gold",
  "black",
  "white",
  "versao",
  "versão",
  "troca",
  "borda",
  "fina",
  "grossa",
]);

function removeDiacritics(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeOpportunityText(value: string) {
  return removeDiacritics(normalizeText(value))
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[.,;:*"'`´~^()[\]{}|\\/_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeOpportunityText(value: string) {
  return normalizeOpportunityText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .filter((token) => !OPPORTUNITY_STOPWORDS.has(token));
}

function primarySourceForRow(row: CustomerCreditRow): OpportunityPrimarySource {
  if (row.creditBalanceAmount > 0) {
    return "CREDIT_BALANCE";
  }

  return "AVAILABLE_CREDIT";
}

function targetAmountForRow(row: CustomerCreditRow) {
  if (row.creditBalanceAmount > 0) {
    return row.creditBalanceAmount;
  }

  return Math.max(0, row.availableCreditAmount);
}

export function isOpportunityEligibleCreditRow(row: CustomerCreditRow) {
  const hasOpportunityFunds =
    row.creditBalanceAmount > 0 || (row.operationalState === "UNUSED_CREDIT" && row.availableCreditAmount > 0);

  if (!hasOpportunityFunds) {
    return false;
  }

  if (row.operationalState === "OVER_CREDIT" || row.hasOverCredit) {
    return false;
  }

  if (row.debtAmount > 0) {
    return false;
  }

  if (row.hasOverduePayment || row.hasSeverelyOverduePayment || row.hasNoPayment || row.hasDebtWithoutCredit) {
    return false;
  }

  if (row.riskLevel === "CRITICO") {
    return false;
  }

  return true;
}

function prettifyModelLabel(value: string) {
  return normalizeText(value)
    .replace(/\[[^\]]*\]\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type InventoryMatch = {
  inventoryItem: InventoryItem;
  matchType: "SKU" | "MODEL";
};

function candidateScore(targetTokens: string[], candidateTokens: string[]) {
  const candidateSet = new Set(candidateTokens);
  const overlap = targetTokens.filter((token) => candidateSet.has(token));
  if (!overlap.length) {
    return 0;
  }

  if (targetTokens.length === 1) {
    return overlap.length === 1 ? 100 : 0;
  }

  if (targetTokens.every((token) => candidateSet.has(token))) {
    return 150 + overlap.length;
  }

  const coverage = overlap.length / targetTokens.length;
  if (coverage < 0.6 || overlap.length < 2) {
    return 0;
  }

  return Math.round(coverage * 100);
}

export function matchTopProductToInventory(topProduct: TopProduct, inventoryItems: InventoryItem[]): InventoryMatch | null {
  const inStockItems = inventoryItems.filter((item) => item.stockQuantity > 0 && item.price > 0);
  if (!inStockItems.length) {
    return null;
  }

  const normalizedSku = normalizeText(topProduct.sku ?? "").toUpperCase();
  if (normalizedSku) {
    const skuMatches = inStockItems
      .filter((item) => item.sku.toUpperCase() === normalizedSku)
      .sort((left, right) => right.stockQuantity - left.stockQuantity || left.price - right.price);

    if (skuMatches[0]) {
      return {
        inventoryItem: skuMatches[0],
        matchType: "SKU",
      };
    }
  }

  const targetTokens = tokenizeOpportunityText(topProduct.itemDescription);
  if (!targetTokens.length) {
    return null;
  }

  const rankedMatches = inStockItems
    .map((item) => {
      const score = candidateScore(targetTokens, tokenizeOpportunityText(item.model));
      return {
        inventoryItem: item,
        matchType: "MODEL" as const,
        score,
      };
    })
    .filter((entry) => entry.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.inventoryItem.stockQuantity - left.inventoryItem.stockQuantity ||
        left.inventoryItem.price - right.inventoryItem.price ||
        left.inventoryItem.model.localeCompare(right.inventoryItem.model, "pt-BR"),
    );

  if (!rankedMatches[0]) {
    return null;
  }

  return {
    inventoryItem: rankedMatches[0].inventoryItem,
    matchType: "MODEL",
  };
}

function createOpportunityLine(topProduct: TopProduct, match: InventoryMatch): OpportunitySuggestedLine {
  return {
    inventoryItemId: match.inventoryItem.id,
    matchType: match.matchType,
    sku: match.inventoryItem.sku,
    model: match.inventoryItem.model,
    color: match.inventoryItem.color,
    quality: match.inventoryItem.quality,
    promotionLabel: match.inventoryItem.promotionLabel,
    unitPrice: match.inventoryItem.price,
    availableStock: match.inventoryItem.stockQuantity,
    historicalTotalQuantity: topProduct.totalQuantity,
    historicalOrderCount: topProduct.orderCount,
    historicalLastBoughtAt: topProduct.lastBoughtAt,
    suggestedQuantity: 0,
    lineSubtotal: 0,
  };
}

function baseQuantityForLine(line: OpportunitySuggestedLine) {
  if (line.historicalOrderCount <= 0) {
    return 1;
  }

  return Math.max(1, Math.round(line.historicalTotalQuantity / line.historicalOrderCount));
}

export function buildSuggestedOpportunityLines(lines: OpportunitySuggestedLine[], targetAmount: number) {
  const draft = lines.map((line) => ({ ...line }));
  let remaining = targetAmount;

  for (const line of draft) {
    if (remaining < line.unitPrice || line.availableStock <= 0 || line.unitPrice <= 0) {
      continue;
    }

    const maxAffordable = Math.floor(remaining / line.unitPrice);
    const quantity = Math.min(baseQuantityForLine(line), line.availableStock, maxAffordable);
    if (quantity <= 0) {
      continue;
    }

    line.suggestedQuantity = quantity;
    line.lineSubtotal = quantity * line.unitPrice;
    remaining -= line.lineSubtotal;
  }

  const cheapestPrice = draft
    .filter((line) => line.availableStock > line.suggestedQuantity && line.unitPrice > 0)
    .reduce((lowest, line) => Math.min(lowest, line.unitPrice), Number.POSITIVE_INFINITY);

  while (remaining >= cheapestPrice) {
    let progressed = false;

    for (const line of draft) {
      if (remaining < line.unitPrice) {
        continue;
      }

      if (line.suggestedQuantity >= line.availableStock) {
        continue;
      }

      line.suggestedQuantity += 1;
      line.lineSubtotal = line.suggestedQuantity * line.unitPrice;
      remaining -= line.unitPrice;
      progressed = true;
    }

    if (!progressed) {
      break;
    }
  }

  return draft.filter((line) => line.suggestedQuantity > 0);
}

function formatCurrencyBr(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value);
}

function buildItemsSummary(lines: OpportunitySuggestedLine[]) {
  return lines
    .map((line) => `${prettifyModelLabel(line.model)} (${line.suggestedQuantity}x)`)
    .join(", ");
}

function buildModelList(lines: OpportunitySuggestedLine[]) {
  return Array.from(new Set(lines.map((line) => prettifyModelLabel(line.model))))
    .slice(0, 7)
    .join(", ");
}

function replaceTemplatePlaceholders(template: string, placeholders: Record<string, string>) {
  return Object.entries(placeholders).reduce(
    (current, [key, value]) => current.replace(new RegExp(`{{\\s*${key}\\s*}}`, "g"), value),
    template,
  );
}

function buildFallbackMessage(input: {
  customerName: string;
  primarySource: OpportunityPrimarySource;
  targetAmount: number;
  creditBalanceAmount: number;
  availableCreditAmount: number;
  modelList: string;
  itemsSummary: string;
}) {
  const lines = [
    `Olá, ${input.customerName} 😊`,
    "",
    input.primarySource === "CREDIT_BALANCE"
      ? `Você tem um saldo disponível para compras no valor de ${formatCurrencyBr(input.targetAmount)}.`
      : `Você tem crédito disponível para compras no valor de ${formatCurrencyBr(input.targetAmount)}.`,
    input.availableCreditAmount > 0 && input.creditBalanceAmount > 0
      ? `Além disso, você ainda tem crédito disponível de ${formatCurrencyBr(input.availableCreditAmount)}.`
      : null,
    input.modelList
      ? `Puxando pelo seu histórico, os modelos que você mais compra e temos disponíveis agora são: ${input.modelList}.`
      : null,
    input.itemsSummary ? `Montei uma sugestão inicial assim: ${input.itemsSummary}.` : null,
    "",
    "Quer aproveitar esse saldo? É só me passar as quantidades que eu já monto seu pedido!",
  ];

  return lines.filter(Boolean).join("\n");
}

function buildOpportunityMessagePreview(input: {
  customerDisplayName: string;
  primarySource: OpportunityPrimarySource;
  targetAmount: number;
  creditBalanceAmount: number;
  availableCreditAmount: number;
  suggestedAmount: number;
  remainingGapAmount: number;
  suggestedLines: OpportunitySuggestedLine[];
  template: MessageTemplate | null;
}): OpportunityMessagePreview {
  const itemsSummary = buildItemsSummary(input.suggestedLines);
  const modelList = buildModelList(input.suggestedLines);

  const placeholders = {
    customerName: input.customerDisplayName,
    targetAmount: formatCurrencyBr(input.targetAmount),
    creditBalanceAmount: formatCurrencyBr(input.creditBalanceAmount),
    availableCreditAmount: formatCurrencyBr(input.availableCreditAmount),
    suggestedAmount: formatCurrencyBr(input.suggestedAmount),
    remainingGapAmount: formatCurrencyBr(input.remainingGapAmount),
    modelList,
    itemsSummary,
    primarySource: input.primarySource === "CREDIT_BALANCE" ? "saldo a favor" : "crédito disponível",
  };

  if (!input.template) {
    return {
      templateId: null,
      templateTitle: null,
      itemsSummary,
      usedFallback: true,
      messageText: buildFallbackMessage({
        customerName: input.customerDisplayName,
        primarySource: input.primarySource,
        targetAmount: input.targetAmount,
        creditBalanceAmount: input.creditBalanceAmount,
        availableCreditAmount: input.availableCreditAmount,
        modelList,
        itemsSummary,
      }),
    };
  }

  return {
    templateId: input.template.id,
    templateTitle: input.template.title,
    itemsSummary,
    usedFallback: false,
    messageText: replaceTemplatePlaceholders(input.template.content, placeholders),
  };
}

function buildEmptyMessagePreview(customerDisplayName: string): OpportunityMessagePreview {
  return {
    templateId: null,
    templateTitle: null,
    itemsSummary: "",
    usedFallback: true,
    messageText: `Olá, ${customerDisplayName} 😊`,
  };
}

function buildOpportunityDetail(args: {
  customerId: string;
  customerCode: string;
  customerDisplayName: string;
  creditSnapshot: CustomerOpportunityDetail["creditSnapshot"];
  inventorySnapshot: InventorySnapshotMeta | null;
  creditRow: CustomerCreditRow | null;
  topProducts: TopProduct[];
  inventoryItems: InventoryItem[];
  template: MessageTemplate | null;
}): CustomerOpportunityDetail {
  const primarySource = args.creditRow ? primarySourceForRow(args.creditRow) : "CREDIT_BALANCE";
  const targetAmount = args.creditRow ? targetAmountForRow(args.creditRow) : 0;
  const creditBalanceAmount = args.creditRow?.creditBalanceAmount ?? 0;
  const availableCreditAmount = args.creditRow?.availableCreditAmount ?? 0;

  const baseDetail = {
    customerId: args.customerId,
    customerCode: args.customerCode,
    customerDisplayName: args.customerDisplayName,
    creditSnapshot: args.creditSnapshot,
    inventorySnapshot: args.inventorySnapshot,
    primarySource,
    targetAmount,
    creditBalanceAmount,
    availableCreditAmount,
  };

  if (!args.creditRow) {
    return {
      ...baseDetail,
      isEligible: false,
      reason: "Cliente nao apareceu no snapshot financeiro mais recente.",
      suggestedAmount: 0,
      remainingGapAmount: targetAmount,
      coverageRatio: 0,
      availableProducts: [],
      suggestedLines: [],
      messagePreview: buildEmptyMessagePreview(args.customerDisplayName),
    };
  }

  if (!isOpportunityEligibleCreditRow(args.creditRow)) {
    return {
      ...baseDetail,
      isEligible: false,
      reason: "Cliente nao entra na fila de venda porque esta fora das regras financeiras da oportunidade.",
      suggestedAmount: 0,
      remainingGapAmount: targetAmount,
      coverageRatio: 0,
      availableProducts: [],
      suggestedLines: [],
      messagePreview: buildEmptyMessagePreview(args.customerDisplayName),
    };
  }

  if (!args.inventorySnapshot) {
    return {
      ...baseDetail,
      isEligible: false,
      reason: "Ainda nao existe snapshot de estoque carregado.",
      suggestedAmount: 0,
      remainingGapAmount: targetAmount,
      coverageRatio: 0,
      availableProducts: [],
      suggestedLines: [],
      messagePreview: buildEmptyMessagePreview(args.customerDisplayName),
    };
  }

  const availableProducts = args.topProducts
    .map((topProduct) => {
      const match = matchTopProductToInventory(topProduct, args.inventoryItems);
      if (!match) {
        return null;
      }

      return createOpportunityLine(topProduct, match);
    })
    .filter((line): line is OpportunitySuggestedLine => Boolean(line));

  if (!availableProducts.length) {
    return {
      ...baseDetail,
      isEligible: false,
      reason: "Cliente tem saldo ou credito, mas nenhum item do mix principal esta em estoque agora.",
      suggestedAmount: 0,
      remainingGapAmount: targetAmount,
      coverageRatio: 0,
      availableProducts: [],
      suggestedLines: [],
      messagePreview: buildEmptyMessagePreview(args.customerDisplayName),
    };
  }

  const suggestedLines = buildSuggestedOpportunityLines(availableProducts, targetAmount);
  const suggestedAmount = suggestedLines.reduce((sum, line) => sum + line.lineSubtotal, 0);
  const remainingGapAmount = Math.max(0, targetAmount - suggestedAmount);

  return {
    ...baseDetail,
    isEligible: suggestedLines.length > 0,
    reason:
      suggestedLines.length > 0
        ? null
        : "Encontramos itens em estoque, mas o valor unitario deles nao permite montar uma sugestao sem ultrapassar o alvo.",
    suggestedAmount,
    remainingGapAmount,
    coverageRatio: targetAmount > 0 ? Math.min(suggestedAmount / targetAmount, 1) : 0,
    availableProducts,
    suggestedLines,
    messagePreview:
      suggestedLines.length > 0
        ? buildOpportunityMessagePreview({
            customerDisplayName: args.customerDisplayName,
            primarySource,
            targetAmount,
            creditBalanceAmount,
            availableCreditAmount,
            suggestedAmount,
            remainingGapAmount,
            suggestedLines,
            template: args.template,
          })
        : buildEmptyMessagePreview(args.customerDisplayName),
  };
}

async function getTopProductsByCustomerIds(customerIds: string[]) {
  if (!customerIds.length) {
    return new Map<string, TopProduct[]>();
  }

  const result = await pool.query(
    `
      WITH aggregated AS (
        SELECT
          o.customer_id,
          MAX(NULLIF(oi.sku, '')) AS sku,
          MAX(COALESCE(NULLIF(oi.item_description, ''), 'Produto sem descricao')) AS item_description,
          COALESCE(SUM(oi.quantity), 0)::numeric(14,2) AS total_quantity,
          COUNT(DISTINCT o.id)::int AS order_count,
          MAX(o.order_date)::date::text AS last_bought_at
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE o.customer_id = ANY($1::uuid[])
        GROUP BY
          o.customer_id,
          COALESCE(NULLIF(oi.sku, ''), CONCAT('__desc__', COALESCE(NULLIF(oi.item_description, ''), 'sem-descricao')))
      ),
      ranked AS (
        SELECT
          *,
          ROW_NUMBER() OVER (
            PARTITION BY customer_id
            ORDER BY total_quantity DESC, order_count DESC, item_description ASC
          ) AS rank
        FROM aggregated
      )
      SELECT
        customer_id,
        sku,
        item_description,
        total_quantity,
        order_count,
        last_bought_at
      FROM ranked
      WHERE rank <= 10
      ORDER BY customer_id, rank
    `,
    [customerIds],
  );

  const map = new Map<string, TopProduct[]>();
  for (const row of result.rows) {
    const current = map.get(String(row.customer_id)) ?? [];
    current.push({
      sku: row.sku ? String(row.sku) : null,
      itemDescription: String(row.item_description ?? ""),
      totalQuantity: Number(row.total_quantity ?? 0),
      orderCount: Number(row.order_count ?? 0),
      lastBoughtAt: row.last_bought_at ? String(row.last_bought_at) : null,
    });
    map.set(String(row.customer_id), current);
  }

  return map;
}

async function getCustomerSnapshotInfo(customerIds: string[]) {
  if (!customerIds.length) {
    return new Map<
      string,
      {
        lastPurchaseAt: string | null;
        daysSinceLastPurchase: number | null;
        lastAttendant: string | null;
      }
    >();
  }

  const result = await pool.query(
    `
      SELECT
        customer_id,
        last_purchase_at::date::text AS last_purchase_at,
        days_since_last_purchase,
        last_attendant
      FROM customer_snapshot
      WHERE customer_id = ANY($1::uuid[])
    `,
    [customerIds],
  );

  return new Map(
    result.rows.map((row) => [
      String(row.customer_id),
      {
        lastPurchaseAt: row.last_purchase_at ? String(row.last_purchase_at) : null,
        daysSinceLastPurchase:
          row.days_since_last_purchase === null || row.days_since_last_purchase === undefined
            ? null
            : Number(row.days_since_last_purchase),
        lastAttendant: row.last_attendant ? String(row.last_attendant) : null,
      },
    ]),
  );
}

async function getLatestCreditTemplate() {
  const templates = await listMessageTemplates();
  return templates.find((template) => template.category === "credito") ?? null;
}

export async function getCustomerCreditOpportunities(): Promise<CustomerOpportunityQueueResponse> {
  const [creditOverview, inventory] = await Promise.all([
    getCustomerCreditOverview(),
    getInventorySnapshotWithItems(),
  ]);

  const candidateRows = creditOverview.linkedRows.filter((row) => isOpportunityEligibleCreditRow(row));
  const candidateIds = candidateRows.map((row) => row.customerId).filter((value): value is string => Boolean(value));

  const [topProductsMap, snapshotInfoMap] = await Promise.all([
    getTopProductsByCustomerIds(candidateIds),
    getCustomerSnapshotInfo(candidateIds),
  ]);

  const items = candidateRows
    .map((row) => {
      if (!row.customerId) {
        return null;
      }

      const detail = buildOpportunityDetail({
        customerId: row.customerId,
        customerCode: row.customerCode,
        customerDisplayName: row.customerDisplayName,
        creditSnapshot: creditOverview.snapshot,
        inventorySnapshot: inventory.snapshot,
        creditRow: row,
        topProducts: topProductsMap.get(row.customerId) ?? [],
        inventoryItems: inventory.items,
        template: null,
      });

      if (!detail.isEligible) {
        return null;
      }

      const snapshotInfo = snapshotInfoMap.get(row.customerId) ?? {
        lastPurchaseAt: null,
        daysSinceLastPurchase: null,
        lastAttendant: null,
      };

      return {
        customerId: row.customerId,
        customerCode: row.customerCode,
        customerDisplayName: row.customerDisplayName,
        primarySource: detail.primarySource,
        targetAmount: detail.targetAmount,
        creditBalanceAmount: detail.creditBalanceAmount,
        availableCreditAmount: detail.availableCreditAmount,
        suggestedAmount: detail.suggestedAmount,
        remainingGapAmount: detail.remainingGapAmount,
        coverageRatio: detail.coverageRatio,
        matchedProductCount: detail.availableProducts.length,
        suggestedLineCount: detail.suggestedLines.length,
        topModelsInStock: detail.availableProducts.slice(0, 4).map((line) => prettifyModelLabel(line.model)),
        lastPurchaseAt: snapshotInfo.lastPurchaseAt,
        daysSinceLastPurchase: snapshotInfo.daysSinceLastPurchase,
        lastAttendant: snapshotInfo.lastAttendant,
      } satisfies CustomerOpportunityQueueItem;
    })
    .filter((item): item is CustomerOpportunityQueueItem => Boolean(item))
    .sort(
      (left, right) =>
        Number(right.primarySource === "CREDIT_BALANCE") - Number(left.primarySource === "CREDIT_BALANCE") ||
        right.targetAmount - left.targetAmount ||
        right.coverageRatio - left.coverageRatio ||
        left.customerDisplayName.localeCompare(right.customerDisplayName, "pt-BR"),
    );

  return {
    creditSnapshot: creditOverview.snapshot,
    inventorySnapshot: inventory.snapshot,
    summary: {
      totalCustomers: items.length,
      prioritizedCustomers: items.filter((item) => item.primarySource === "CREDIT_BALANCE").length,
      totalTargetAmount: items.reduce((sum, item) => sum + item.targetAmount, 0),
      totalSuggestedAmount: items.reduce((sum, item) => sum + item.suggestedAmount, 0),
      customersWithBalance: items.filter((item) => item.creditBalanceAmount > 0).length,
      customersWithAvailableCredit: items.filter((item) => item.availableCreditAmount > 0).length,
    },
    items,
  };
}

export async function getCustomerOpportunity(customerId: string): Promise<CustomerOpportunityDetail | null> {
  const [customer, creditDetail, inventory, template] = await Promise.all([
    getCustomerDetail(customerId),
    getCustomerCreditDetail(customerId),
    getInventorySnapshotWithItems(),
    getLatestCreditTemplate(),
  ]);

  if (!customer) {
    return null;
  }

  return buildOpportunityDetail({
    customerId: customer.id,
    customerCode: customer.customerCode,
    customerDisplayName: customer.displayName,
    creditSnapshot: creditDetail.snapshot,
    inventorySnapshot: inventory.snapshot,
    creditRow: creditDetail.row,
    topProducts: customer.topProducts,
    inventoryItems: inventory.items,
    template,
  });
}

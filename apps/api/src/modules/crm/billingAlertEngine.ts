/**
 * Motor de cobranca: regras que o financeiro passou para o alerta diario.
 *
 * 1. LIMITE — RESUMO coluna G (CREDITO) e H (CREDITO INTERNO). O interno e um
 *    teto maior que o financeiro tolera: passou do CREDITO mas ainda dentro do
 *    interno = alerta; passou dos dois (ou do unico limite cadastrado) = alerta
 *    extremo. Quem esta perto do limite aparece como aviso.
 * 2. PRAZO — cada pedido (aba OUT) vence em data do pedido + PRAZO (coluna I).
 *    Os pagamentos (aba PAG) nao dizem qual pedido quitam: todo valor que entra
 *    abate os pedidos MAIS ANTIGOS primeiro (mesma logica da Planilha2). Pedido
 *    com saldo pendente depois do vencimento = cobranca, mesmo que falte pouco.
 *
 * Tudo aqui e puro (sem banco/rede) para ser testado com os casos do financeiro.
 */

export type BillingLimitLevel = "OVER_LIMIT" | "OVER_CREDIT" | "NEAR_LIMIT" | "OK" | "NO_LIMIT";

export interface BillingCustomerInput {
  customerCode: string;
  customerId: string | null;
  displayName: string;
  /** Quanto o cliente deve hoje (positivo). */
  debtAmount: number;
  /** RESUMO coluna G (ou override manual do CRM). */
  creditLimit: number | null;
  /** RESUMO coluna H. */
  internalCreditLimit: number | null;
  /** RESUMO coluna I, em dias (ou override manual do CRM). */
  paymentTerm: number | null;
  /** RESUMO coluna J (GOLPE, DESATIVADO, PENDENCIA...). */
  status: string | null;
}

export interface BillingOrderInput {
  customerCode: string;
  orderKey: string;
  orderNumber: string;
  orderDate: string | null;
  totalAmount: number;
}

export interface BillingPaymentInput {
  customerCode: string;
  amount: number;
}

export interface BillingPendingOrder {
  orderKey: string;
  orderNumber: string;
  orderDate: string | null;
  dueDate: string | null;
  totalAmount: number;
  pendingAmount: number;
  /** Positivo = dias apos o vencimento; negativo = dias que faltam. */
  daysOverdue: number | null;
  overdue: boolean;
}

export interface BillingCustomerResult {
  customerCode: string;
  customerId: string | null;
  displayName: string;
  status: string | null;
  debtAmount: number;
  creditLimit: number | null;
  internalCreditLimit: number | null;
  paymentTerm: number | null;
  limitLevel: BillingLimitLevel;
  /** Divida / limite de referencia (CREDITO, ou o interno quando so ele existe). */
  limitUsage: number | null;
  pendingOrders: BillingPendingOrder[];
  overdueAmount: number;
  oldestOverdueDays: number | null;
  hasOverdue: boolean;
  missingPaymentTerm: boolean;
}

export interface BillingAlertOptions {
  /** Data de hoje em YYYY-MM-DD (fuso de Sao Paulo). */
  today: string;
  /** Uso do limite a partir do qual o cliente entra em "perto do limite". */
  nearLimitRatio?: number;
  /** Abaixo disso o pendente e tratado como arredondamento, nao cobranca. */
  minPendingAmount?: number;
  /** Status da coluna J que ficam fora do alerta. */
  ignoredStatuses?: string[];
}

export interface BillingAlertReport {
  today: string;
  overLimit: BillingCustomerResult[];
  overCredit: BillingCustomerResult[];
  overdue: BillingCustomerResult[];
  nearLimit: BillingCustomerResult[];
  missingPaymentTerm: BillingCustomerResult[];
  ignored: BillingCustomerResult[];
  customers: BillingCustomerResult[];
}

export const DEFAULT_NEAR_LIMIT_RATIO = 0.8;
export const DEFAULT_MIN_PENDING_AMOUNT = 1;
export const DEFAULT_IGNORED_STATUSES = ["GOLPE", "DESATIVADO"];

const DAY_MS = 24 * 60 * 60 * 1000;

function positiveOrNull(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return new Date(date.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export function diffDays(fromIsoDate: string, toIsoDate: string) {
  const from = Date.parse(`${fromIsoDate}T00:00:00Z`);
  const to = Date.parse(`${toIsoDate}T00:00:00Z`);
  return Math.round((to - from) / DAY_MS);
}

function normalizeStatus(value: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase();
}

export function classifyLimit(
  debtAmount: number,
  creditLimit: number | null,
  internalCreditLimit: number | null,
  nearLimitRatio = DEFAULT_NEAR_LIMIT_RATIO,
): { level: BillingLimitLevel; usage: number | null } {
  const credit = positiveOrNull(creditLimit);
  const internal = positiveOrNull(internalCreditLimit);
  const softLimit = credit ?? internal;
  if (!softLimit) {
    return { level: "NO_LIMIT", usage: null };
  }

  const hardLimit = Math.max(credit ?? 0, internal ?? 0);
  const usage = debtAmount / softLimit;

  if (debtAmount > hardLimit) {
    return { level: "OVER_LIMIT", usage };
  }
  if (debtAmount > softLimit) {
    return { level: "OVER_CREDIT", usage };
  }
  if (debtAmount > 0 && usage >= nearLimitRatio) {
    return { level: "NEAR_LIMIT", usage };
  }
  return { level: "OK", usage };
}

function compareOrders(left: BillingOrderInput, right: BillingOrderInput) {
  // Pedido sem data vai para o inicio: e o mais antigo que conseguimos supor.
  const leftDate = left.orderDate ?? "";
  const rightDate = right.orderDate ?? "";
  if (leftDate !== rightDate) {
    return leftDate < rightDate ? -1 : 1;
  }
  return left.orderKey.localeCompare(right.orderKey, "pt-BR", { numeric: true });
}

/**
 * Abate o total pago nos pedidos mais antigos e devolve os que ainda tem saldo.
 */
export function allocatePaymentsFifo(
  orders: BillingOrderInput[],
  totalPaid: number,
  paymentTerm: number | null,
  today: string,
  minPendingAmount = DEFAULT_MIN_PENDING_AMOUNT,
): BillingPendingOrder[] {
  // Estorno/ajuste negativo no OUT funciona como credito, independente da data
  // em que foi lancado (a devolucao reduz a divida do pedido original).
  let available =
    totalPaid - orders.reduce((sum, order) => (order.totalAmount < 0 ? sum + order.totalAmount : sum), 0);
  const pending: BillingPendingOrder[] = [];

  for (const order of [...orders].sort(compareOrders)) {
    if (order.totalAmount <= 0) {
      continue;
    }

    const covered = Math.min(Math.max(available, 0), order.totalAmount);
    available -= covered;
    const pendingAmount = roundMoney(order.totalAmount - covered);
    if (pendingAmount < minPendingAmount) {
      continue;
    }

    const dueDate =
      order.orderDate && paymentTerm !== null ? addDays(order.orderDate, paymentTerm) : null;
    const daysOverdue = dueDate ? diffDays(dueDate, today) : null;

    pending.push({
      orderKey: order.orderKey,
      orderNumber: order.orderNumber,
      orderDate: order.orderDate,
      dueDate,
      totalAmount: roundMoney(order.totalAmount),
      pendingAmount,
      daysOverdue,
      overdue: daysOverdue !== null && daysOverdue > 0,
    });
  }

  return pending;
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const groupKey = key(item);
    const bucket = grouped.get(groupKey);
    if (bucket) {
      bucket.push(item);
    } else {
      grouped.set(groupKey, [item]);
    }
  }
  return grouped;
}

export function buildBillingAlertReport(
  customers: BillingCustomerInput[],
  orders: BillingOrderInput[],
  payments: BillingPaymentInput[],
  options: BillingAlertOptions,
): BillingAlertReport {
  const nearLimitRatio = options.nearLimitRatio ?? DEFAULT_NEAR_LIMIT_RATIO;
  const minPendingAmount = options.minPendingAmount ?? DEFAULT_MIN_PENDING_AMOUNT;
  const ignoredStatuses = new Set((options.ignoredStatuses ?? DEFAULT_IGNORED_STATUSES).map(normalizeStatus));

  const ordersByCode = groupBy(orders, (order) => order.customerCode);
  const paidByCode = new Map<string, number>();
  for (const payment of payments) {
    paidByCode.set(payment.customerCode, (paidByCode.get(payment.customerCode) ?? 0) + payment.amount);
  }

  const report: BillingAlertReport = {
    today: options.today,
    overLimit: [],
    overCredit: [],
    overdue: [],
    nearLimit: [],
    missingPaymentTerm: [],
    ignored: [],
    customers: [],
  };

  for (const customer of customers) {
    if (customer.debtAmount < minPendingAmount) {
      continue;
    }

    const paymentTerm =
      typeof customer.paymentTerm === "number" && Number.isFinite(customer.paymentTerm) && customer.paymentTerm >= 0
        ? customer.paymentTerm
        : null;
    const { level, usage } = classifyLimit(
      customer.debtAmount,
      customer.creditLimit,
      customer.internalCreditLimit,
      nearLimitRatio,
    );
    const pendingOrders = allocatePaymentsFifo(
      ordersByCode.get(customer.customerCode) ?? [],
      paidByCode.get(customer.customerCode) ?? 0,
      paymentTerm,
      options.today,
      minPendingAmount,
    );
    const overdueOrders = pendingOrders.filter((order) => order.overdue);

    const result: BillingCustomerResult = {
      customerCode: customer.customerCode,
      customerId: customer.customerId,
      displayName: customer.displayName,
      status: customer.status,
      debtAmount: roundMoney(customer.debtAmount),
      creditLimit: positiveOrNull(customer.creditLimit),
      internalCreditLimit: positiveOrNull(customer.internalCreditLimit),
      paymentTerm,
      limitLevel: level,
      limitUsage: usage,
      pendingOrders,
      overdueAmount: roundMoney(overdueOrders.reduce((sum, order) => sum + order.pendingAmount, 0)),
      oldestOverdueDays: overdueOrders.length
        ? Math.max(...overdueOrders.map((order) => order.daysOverdue ?? 0))
        : null,
      hasOverdue: overdueOrders.length > 0,
      missingPaymentTerm: paymentTerm === null,
    };

    report.customers.push(result);

    if (ignoredStatuses.has(normalizeStatus(customer.status))) {
      report.ignored.push(result);
      continue;
    }

    if (level === "OVER_LIMIT") report.overLimit.push(result);
    else if (level === "OVER_CREDIT") report.overCredit.push(result);
    else if (level === "NEAR_LIMIT") report.nearLimit.push(result);

    if (result.hasOverdue) report.overdue.push(result);
    if (result.missingPaymentTerm) report.missingPaymentTerm.push(result);
  }

  const byDebt = (left: BillingCustomerResult, right: BillingCustomerResult) => right.debtAmount - left.debtAmount;
  report.overLimit.sort(byDebt);
  report.overCredit.sort(byDebt);
  report.nearLimit.sort((left, right) => (right.limitUsage ?? 0) - (left.limitUsage ?? 0));
  report.overdue.sort(
    (left, right) => (right.oldestOverdueDays ?? 0) - (left.oldestOverdueDays ?? 0) || right.overdueAmount - left.overdueAmount,
  );
  report.missingPaymentTerm.sort(byDebt);

  return report;
}

/**
 * Chaves estaveis de cada alerta ativo. Comparando as chaves entre duas
 * leituras da planilha sabemos o que e NOVO (para avisar na hora) sem repetir
 * o que o relatorio da manha ja mostrou.
 */
export function collectAlertKeys(report: BillingAlertReport) {
  const keys = new Set<string>();
  for (const customer of report.overLimit) keys.add(`limit:${customer.customerCode}:OVER_LIMIT`);
  for (const customer of report.overCredit) keys.add(`limit:${customer.customerCode}:OVER_CREDIT`);
  for (const customer of report.overdue) {
    for (const order of customer.pendingOrders) {
      if (order.overdue) keys.add(`overdue:${customer.customerCode}:${order.orderKey}`);
    }
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Mensagens de WhatsApp
// ---------------------------------------------------------------------------

const WHATSAPP_MESSAGE_MAX_CHARS = 3500;

export function formatBrl(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export function formatBrDate(isoDate: string | null) {
  if (!isoDate) return "—";
  const [year, month, day] = isoDate.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function customerLabel(customer: BillingCustomerResult) {
  return `*${customer.customerCode}* ${customer.displayName}`;
}

function limitDescription(customer: BillingCustomerResult) {
  const parts: string[] = [];
  if (customer.creditLimit) parts.push(`crédito ${formatBrl(customer.creditLimit)}`);
  if (customer.internalCreditLimit) parts.push(`interno ${formatBrl(customer.internalCreditLimit)}`);
  return parts.join(" / ");
}

export function describeLimitLine(customer: BillingCustomerResult) {
  const usage = customer.limitUsage !== null ? ` (${Math.round(customer.limitUsage * 100)}%)` : "";
  return `• ${customerLabel(customer)} — deve ${formatBrl(customer.debtAmount)}${usage} | ${limitDescription(customer)}`;
}

export function describeOverdueLine(customer: BillingCustomerResult) {
  const overdueOrders = customer.pendingOrders.filter((order) => order.overdue);
  const oldest = overdueOrders[0];
  const orderInfo = oldest
    ? ` | mais antigo: pedido ${oldest.orderNumber || "s/ nº"} de ${formatBrDate(oldest.orderDate)}, venceu ${formatBrDate(oldest.dueDate)}`
    : "";
  const count = overdueOrders.length > 1 ? ` em ${overdueOrders.length} pedidos` : "";
  return `• ${customerLabel(customer)} — ${formatBrl(customer.overdueAmount)} vencido${count} há ${customer.oldestOverdueDays} dia(s) (prazo ${customer.paymentTerm}d)${orderInfo}`;
}

function section(title: string, lines: string[]) {
  return lines.length ? [`${title}`, ...lines].join("\n") : null;
}

/** Quebra o texto em mensagens que cabem no WhatsApp sem cortar linhas. */
export function splitIntoMessages(blocks: string[], maxChars = WHATSAPP_MESSAGE_MAX_CHARS) {
  const messages: string[] = [];
  let current = "";

  const push = (text: string) => {
    if (!current) {
      current = text;
    } else if (current.length + 2 + text.length <= maxChars) {
      current = `${current}\n\n${text}`;
    } else {
      messages.push(current);
      current = text;
    }
  };

  for (const block of blocks) {
    if (block.length <= maxChars) {
      push(block);
      continue;
    }
    // Bloco grande demais: quebra por linha.
    let chunk = "";
    for (const line of block.split("\n")) {
      if (chunk && chunk.length + 1 + line.length > maxChars) {
        push(chunk);
        chunk = line;
      } else {
        chunk = chunk ? `${chunk}\n${line}` : line;
      }
    }
    if (chunk) push(chunk);
  }

  if (current) messages.push(current);
  return messages;
}

export function buildDailyReportMessages(report: BillingAlertReport, options: { missingTermPreview?: number } = {}) {
  const missingTermPreview = options.missingTermPreview ?? 10;
  const missingTermTotal = report.missingPaymentTerm.reduce((sum, customer) => sum + customer.debtAmount, 0);

  const header = [
    `💰 *Cobrança — ${formatBrDate(report.today)}*`,
    `🔴 Estourou o limite: ${report.overLimit.length}`,
    `🟠 Acima do crédito (dentro do interno): ${report.overCredit.length}`,
    `⏰ Pedido com prazo vencido: ${report.overdue.length}`,
    `🟡 Perto do limite: ${report.nearLimit.length}`,
    `📋 Devendo sem prazo cadastrado: ${report.missingPaymentTerm.length}`,
  ].join("\n");

  const blocks = [
    header,
    section("🔴 *ESTOUROU O LIMITE* (acima do crédito e do crédito interno)", report.overLimit.map(describeLimitLine)),
    section("🟠 *ACIMA DO CRÉDITO* (ainda dentro do crédito interno)", report.overCredit.map(describeLimitLine)),
    section("⏰ *PRAZO VENCIDO* (pagamentos abatem os pedidos mais antigos)", report.overdue.map(describeOverdueLine)),
    section("🟡 *PERTO DO LIMITE* — avisar antes do próximo pedido", report.nearLimit.map(describeLimitLine)),
    report.missingPaymentTerm.length
      ? [
          `📋 *SEM PRAZO CADASTRADO* — ${report.missingPaymentTerm.length} clientes devendo ${formatBrl(missingTermTotal)}. Preencher a coluna PRAZO no RESUMO para entrarem na cobrança por prazo.`,
          ...report.missingPaymentTerm
            .slice(0, missingTermPreview)
            .map((customer) => `• ${customerLabel(customer)} — deve ${formatBrl(customer.debtAmount)}`),
          report.missingPaymentTerm.length > missingTermPreview
            ? `…e mais ${report.missingPaymentTerm.length - missingTermPreview}. Lista completa no CRM (Financeiro › Cobrança).`
            : null,
        ]
          .filter(Boolean)
          .join("\n")
      : null,
  ].filter((block): block is string => Boolean(block));

  return splitIntoMessages(blocks);
}

export function buildNewAlertsMessages(report: BillingAlertReport, newKeys: Set<string>) {
  const isNew = (prefix: string, customer: BillingCustomerResult) =>
    [...newKeys].some((key) => key.startsWith(`${prefix}:${customer.customerCode}:`));

  const overLimit = report.overLimit.filter((customer) => isNew("limit", customer));
  const overCredit = report.overCredit.filter((customer) => isNew("limit", customer));
  const overdue = report.overdue.filter((customer) => isNew("overdue", customer));

  if (!overLimit.length && !overCredit.length && !overdue.length) {
    return [];
  }

  const blocks = [
    "🚨 *Novo alerta de cobrança* (planilha atualizada agora)",
    section("🔴 Estourou o limite", overLimit.map(describeLimitLine)),
    section("🟠 Passou do crédito", overCredit.map(describeLimitLine)),
    section("⏰ Prazo vencido", overdue.map(describeOverdueLine)),
  ].filter((block): block is string => Boolean(block));

  return splitIntoMessages(blocks);
}

/**
 * Mensagens de cobranca para o grupo do financeiro.
 *
 * Formato pensado para quem cobra: uma mensagem POR VENDEDORA, marcando ela
 * (@) com a lista dos clientes dela. Cada cliente vira um cartao curto com a
 * situacao e o "👉 o que fazer". O financeiro recebe o resumo no topo e, no
 * fim, o que depende dele (prazo nao cadastrado, codigo invalido).
 */
import type { BillingAlertReport, BillingCustomerResult, BillingUnmatchedEntry } from "./billingAlertEngine.js";

export interface BillingOutgoingMessage {
  text: string;
  /** Numeros (so digitos, com DDI) marcados com @ nesta mensagem. */
  mentions: string[];
}

/** Nome da vendedora (minusculo, sem acento) -> numero de WhatsApp com DDI. */
export type SellerPhoneDirectory = Map<string, string>;

const WHATSAPP_MESSAGE_MAX_CHARS = 3500;
const NO_SELLER = "Sem vendedora definida";

export function formatBrl(value: number) {
  return value
    .toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
    .replace(/ /g, " ");
}

export function formatBrDate(isoDate: string | null) {
  if (!isoDate) return "—";
  const [year, month, day] = isoDate.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

/** "05/09" no ano corrente; "27/08/2025" quando for de outro ano. */
function formatShortDate(isoDate: string, today: string) {
  const [year, month, day] = isoDate.slice(0, 10).split("-");
  return year === today.slice(0, 4) ? `${day}/${month}` : `${day}/${month}/${year}`;
}

export function normalizeSellerName(name: string | null | undefined) {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function softLimit(customer: BillingCustomerResult) {
  return customer.creditLimit ?? customer.internalCreditLimit ?? 0;
}

/** Quanto precisa entrar para o cliente voltar para dentro do credito. */
function excessOverCredit(customer: BillingCustomerResult) {
  return Math.max(0, customer.debtAmount - softLimit(customer));
}

/** Valor principal a cobrar: o vencido, ou o que passou do credito. */
export function amountToCharge(customer: BillingCustomerResult) {
  return Math.max(customer.overdueAmount, excessOverCredit(customer));
}

function priority(customer: BillingCustomerResult) {
  if (customer.limitLevel === "OVER_LIMIT") return 0;
  if (customer.hasOverdue) return 1;
  if (customer.limitLevel === "OVER_CREDIT") return 2;
  return 3;
}

function compareCustomers(left: BillingCustomerResult, right: BillingCustomerResult) {
  return priority(left) - priority(right) || amountToCharge(right) - amountToCharge(left);
}

function limitText(customer: BillingCustomerResult) {
  const parts: string[] = [];
  if (customer.creditLimit) parts.push(`crédito ${formatBrl(customer.creditLimit)}`);
  if (customer.internalCreditLimit && customer.internalCreditLimit !== customer.creditLimit) {
    parts.push(`interno ${formatBrl(customer.internalCreditLimit)}`);
  }
  return parts.join(" / ");
}

function usageText(customer: BillingCustomerResult) {
  return customer.limitUsage === null ? "" : ` (${Math.round(customer.limitUsage * 100)}% do crédito)`;
}

function statusLines(customer: BillingCustomerResult, today: string) {
  const lines: string[] = [];
  if (customer.limitLevel === "OVER_LIMIT") {
    lines.push(`🔴 Estourou o limite${usageText(customer)}`);
  } else if (customer.limitLevel === "OVER_CREDIT") {
    lines.push(`🟠 Passou do crédito, ainda dentro do interno${usageText(customer)}`);
  } else if (customer.limitLevel === "NEAR_LIMIT") {
    const available = Math.max(0, softLimit(customer) - customer.debtAmount);
    lines.push(
      available >= 1
        ? `🟡 Perto do limite${usageText(customer)} — cabe só mais ${formatBrl(available)}`
        : `🟡 Já está no limite${usageText(customer)} — não cabe mais pedido`,
    );
  }

  if (customer.hasOverdue) {
    const overdueOrders = customer.pendingOrders.filter((order) => order.overdue);
    const oldest = overdueOrders[0];
    const orders = overdueOrders.length > 1 ? ` em ${overdueOrders.length} pedidos` : "";
    const since = oldest?.dueDate ? `, venceu ${formatShortDate(oldest.dueDate, today)}` : "";
    lines.push(
      `⏰ ${formatBrl(customer.overdueAmount)} vencido${orders} — atrasado há ${plural(customer.oldestOverdueDays ?? 0, "dia", "dias")}${since} (prazo ${customer.paymentTerm} dias)`,
    );
  }
  return lines;
}

function actionLine(customer: BillingCustomerResult) {
  const holdOrders = customer.limitLevel === "OVER_LIMIT" ? " Segurar novos pedidos até pagar." : "";
  if (customer.hasOverdue) {
    return `👉 Cobrar ${formatBrl(customer.overdueAmount)} vencido.${holdOrders}`;
  }
  if (customer.limitLevel === "OVER_LIMIT" || customer.limitLevel === "OVER_CREDIT") {
    return `👉 Pedir pagamento de ${formatBrl(excessOverCredit(customer))} para voltar ao crédito.${holdOrders}`;
  }
  return "👉 Avisar o cliente antes do próximo pedido.";
}

export function customerCard(customer: BillingCustomerResult, today: string, headline?: string) {
  const limit = limitText(customer);
  return [
    headline ?? null,
    `*${customer.customerCode} · ${customer.displayName}*`,
    `Deve ${formatBrl(customer.debtAmount)}${limit ? ` · ${limit}` : ""}`,
    ...statusLines(customer, today),
    actionLine(customer),
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

/** Quebra blocos em mensagens que cabem no WhatsApp sem cortar linhas. */
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

interface SellerGroup {
  seller: string;
  phone: string | null;
  customers: BillingCustomerResult[];
}

function groupBySeller(customers: BillingCustomerResult[], phones: SellerPhoneDirectory): SellerGroup[] {
  const groups = new Map<string, SellerGroup>();
  for (const customer of customers) {
    const seller = customer.seller?.trim() || NO_SELLER;
    const key = normalizeSellerName(seller);
    const group = groups.get(key) ?? { seller, phone: phones.get(key) ?? null, customers: [] };
    group.customers.push(customer);
    groups.set(key, group);
  }

  const total = (group: SellerGroup) => group.customers.reduce((sum, customer) => sum + amountToCharge(customer), 0);
  return [...groups.values()]
    .map((group) => ({ ...group, customers: [...group.customers].sort(compareCustomers) }))
    .sort((left, right) => {
      // "Sem vendedora" vai por ultimo; o resto por valor a cobrar.
      if (left.seller === NO_SELLER) return 1;
      if (right.seller === NO_SELLER) return -1;
      return total(right) - total(left);
    });
}

function sellerTag(group: SellerGroup) {
  if (group.seller === NO_SELLER) return `📌 *${NO_SELLER}* — financeiro, favor direcionar`;
  if (group.phone) return `👤 @${group.phone} *${group.seller}*`;
  return `👤 *${group.seller}* (sem WhatsApp cadastrado no CRM)`;
}

/** Monta as mensagens de uma vendedora; a marcacao (@) vai so na primeira. */
function sellerMessages(group: SellerGroup, title: string, cards: string[]): BillingOutgoingMessage[] {
  const texts = splitIntoMessages([title ? `${sellerTag(group)}\n${title}` : sellerTag(group), ...cards]);
  return texts.map((text, index) => ({
    text: index === 0 ? text : `${group.seller} (continuação)\n\n${text}`,
    mentions: index === 0 && group.phone ? [group.phone] : [],
  }));
}

function describeUnmatched(entry: BillingUnmatchedEntry) {
  const kind = entry.source === "PAG" ? "Pagamento" : "Pedido";
  const reference = entry.reference ? ` (${entry.reference})` : "";
  return `• ${kind} com código *${entry.customerCode}* em ${formatBrDate(entry.entryDate)}${reference}: ${formatBrl(entry.amount)}`;
}

function financeBlocks(report: BillingAlertReport, missingTermPreview: number) {
  const blocks: string[] = [];
  if (report.missingPaymentTerm.length) {
    const total = report.missingPaymentTerm.reduce((sum, customer) => sum + customer.debtAmount, 0);
    const top = report.missingPaymentTerm
      .slice(0, missingTermPreview)
      .map((customer) => `• ${customer.customerCode} · ${customer.displayName} — deve ${formatBrl(customer.debtAmount)}`);
    const rest = report.missingPaymentTerm.length - top.length;
    blocks.push(
      [
        `📋 *Sem prazo cadastrado:* ${plural(report.missingPaymentTerm.length, "cliente devendo", "clientes devendo")} ${formatBrl(total)}. Sem o PRAZO (coluna I do RESUMO) não dá para saber se está vencido. Maiores:`,
        ...top,
        rest > 0 ? `…e mais ${rest}. Lista completa no CRM › Financeiro.` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  if (report.unmatchedEntries.length) {
    blocks.push(
      [
        "⚠️ *Código inválido na planilha* — estes lançamentos não contam para nenhum cliente. Corrigir o COD:",
        ...report.unmatchedEntries.map(describeUnmatched),
      ].join("\n"),
    );
  }
  return blocks;
}

export function buildDailyReportMessages(
  report: BillingAlertReport,
  phones: SellerPhoneDirectory = new Map(),
  options: { missingTermPreview?: number } = {},
): BillingOutgoingMessage[] {
  const toCharge = [...new Set([...report.overLimit, ...report.overCredit, ...report.overdue, ...report.nearLimit])];
  const groups = groupBySeller(toCharge, phones);
  const overdueTotal = report.overdue.reduce((sum, customer) => sum + customer.overdueAmount, 0);

  const header = [
    `💰 *COBRANÇA DO DIA — ${formatBrDate(report.today)}*`,
    "",
    "Abaixo, cada vendedor(a) é marcado(a) com os clientes que precisa cobrar hoje.",
    "",
    `🔴 Estourou o limite: ${plural(report.overLimit.length, "cliente", "clientes")}`,
    `🟠 Passou do crédito: ${plural(report.overCredit.length, "cliente", "clientes")}`,
    `⏰ Pagamento vencido: ${plural(report.overdue.length, "cliente", "clientes")} · ${formatBrl(overdueTotal)}`,
    `🟡 Perto do limite: ${plural(report.nearLimit.length, "cliente", "clientes")}`,
    "",
    "_Como ler:_",
    "🔴 deve mais que o crédito e o crédito interno",
    "🟠 passou do crédito, mas ainda está dentro do interno",
    "⏰ pedido não pago depois do prazo (cada pagamento quita primeiro os pedidos mais antigos)",
    "🟡 já usou 80% ou mais do crédito",
  ].join("\n");

  const messages: BillingOutgoingMessage[] = [{ text: header, mentions: [] }];

  for (const group of groups) {
    const total = group.customers.reduce((sum, customer) => sum + amountToCharge(customer), 0);
    const title = `${plural(group.customers.length, "cliente", "clientes")} para acompanhar · cobrar ${formatBrl(total)}`;
    const cards = group.customers.map((customer, index) => `${index + 1}. ${customerCard(customer, report.today)}`);
    messages.push(...sellerMessages(group, title, cards));
  }

  const finance = financeBlocks(report, options.missingTermPreview ?? 10);
  if (finance.length) {
    for (const text of splitIntoMessages(["🧾 *Para o financeiro*", ...finance])) {
      messages.push({ text, mentions: [] });
    }
  }

  return messages;
}

/**
 * Aviso na hora (planilha atualizada durante o dia): so o que e novo, tambem
 * separado por vendedora e com o motivo no topo de cada cartao.
 */
export function buildNewAlertsMessages(
  report: BillingAlertReport,
  newKeys: Set<string>,
  phones: SellerPhoneDirectory = new Map(),
): BillingOutgoingMessage[] {
  const has = (key: string) => newKeys.has(key);
  const cards = new Map<BillingCustomerResult, string[]>();
  const addEvent = (customer: BillingCustomerResult, headline: string) => {
    const list = cards.get(customer) ?? [];
    list.push(headline);
    cards.set(customer, list);
  };

  for (const customer of report.overLimit) {
    if (has(`limit:${customer.customerCode}:OVER_LIMIT`)) addEvent(customer, "🔴 *Acabou de estourar o limite*");
  }
  for (const customer of report.overCredit) {
    if (has(`limit:${customer.customerCode}:OVER_CREDIT`)) addEvent(customer, "🟠 *Acabou de passar do crédito*");
  }
  for (const customer of [...report.overLimit, ...report.overCredit]) {
    if (cards.has(customer)) continue;
    for (const order of customer.pendingOrders) {
      if (has(`order:${customer.customerCode}:${order.orderKey}`)) {
        addEvent(
          customer,
          `🛒 *Pedido novo lançado para cliente que já passou do crédito* — pedido ${order.orderNumber || "s/ nº"}, ${formatBrl(order.totalAmount)}`,
        );
      }
    }
  }
  for (const customer of report.overdue) {
    const newlyOverdue = customer.pendingOrders.filter(
      (order) => order.overdue && has(`overdue:${customer.customerCode}:${order.orderKey}`),
    );
    if (newlyOverdue.length) {
      const amount = newlyOverdue.reduce((sum, order) => sum + order.pendingAmount, 0);
      addEvent(customer, `⏰ *Pagamento venceu* — ${formatBrl(amount)} de ${plural(newlyOverdue.length, "pedido", "pedidos")}`);
    }
  }
  for (const customer of report.nearLimit) {
    if (has(`limit:${customer.customerCode}:NEAR_LIMIT`)) addEvent(customer, "🟡 *Chegou perto do limite*");
  }

  const unmatched = report.unmatchedEntries.filter((entry) => has(`unmatched:${entry.source}:${entry.entryKey}`));
  if (!cards.size && !unmatched.length) {
    return [];
  }

  const messages: BillingOutgoingMessage[] = [
    { text: "🚨 *Alerta de cobrança* — a planilha foi atualizada agora", mentions: [] },
  ];
  for (const group of groupBySeller([...cards.keys()], phones)) {
    const groupCards = group.customers.map((customer) => customerCard(customer, report.today, cards.get(customer)!.join("\n")));
    messages.push(...sellerMessages(group, "", groupCards));
  }
  if (unmatched.length) {
    const text = [
      "🧾 *Para o financeiro*",
      "⚠️ Lançamento com código que não existe no RESUMO — não conta para nenhum cliente. Corrigir o COD:",
      ...unmatched.map(describeUnmatched),
    ].join("\n");
    messages.push({ text, mentions: [] });
  }
  return messages;
}

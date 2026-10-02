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
  // Sem credito cadastrado: tudo que deve e para cobrar.
  if (isNoCredit(customer)) return customer.debtAmount;
  return Math.max(customer.overdueAmount, excessOverCredit(customer));
}

function isNoCredit(customer: BillingCustomerResult) {
  return customer.limitLevel === "NO_LIMIT" && customer.debtAmount > 0;
}

function priority(customer: BillingCustomerResult) {
  if (customer.limitLevel === "OVER_LIMIT") return 0;
  if (customer.hasOverdue) return 1;
  if (customer.limitLevel === "OVER_CREDIT") return 2;
  if (isNoCredit(customer)) return 3;
  return 4;
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
  } else if (isNoCredit(customer)) {
    lines.push("⚪ Deve sem ter crédito liberado");
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
  const holdOrders =
    customer.limitLevel === "OVER_LIMIT"
      ? " Segurar novos pedidos até pagar."
      : isNoCredit(customer)
        ? " Sem crédito: próximo pedido só com pagamento."
        : "";
  if (isNoCredit(customer) && !customer.hasOverdue) {
    return `👉 Cobrar ${formatBrl(customer.debtAmount)}.${holdOrders}`;
  }
  if (customer.hasOverdue) {
    return `👉 Cobrar ${formatBrl(customer.overdueAmount)} vencido.${holdOrders}`;
  }
  if (customer.limitLevel === "OVER_LIMIT" || customer.limitLevel === "OVER_CREDIT") {
    return `👉 Pedir pagamento de ${formatBrl(excessOverCredit(customer))} para voltar ao crédito.${holdOrders}`;
  }
  return "👉 Avisar o cliente antes do próximo pedido.";
}

/** "🛒 Última venda: 25/09 por Thais (R$ 12.000)" — para saber quem liberou. */
export function lastSaleLine(customer: BillingCustomerResult, today: string) {
  const sale = customer.lastSale;
  if (!sale?.orderDate) return null;
  const who = sale.seller ? ` por ${sale.seller}` : "";
  return `🛒 Última venda: ${formatShortDate(sale.orderDate, today)}${who} (${formatBrl(sale.totalAmount)})`;
}

export function customerCard(customer: BillingCustomerResult, today: string, headline?: string) {
  const limit = limitText(customer);
  return [
    headline ?? null,
    `*${customer.customerCode} · ${customer.displayName}*`,
    `Deve ${formatBrl(customer.debtAmount)}${limit ? ` · ${limit}` : ""}`,
    ...statusLines(customer, today),
    lastSaleLine(customer, today),
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

const DAILY_TOP_PER_SELLER = 10;
const DAILY_RECENT_SALE_DAYS = 7;
const DAILY_RECENT_NO_CREDIT_LINES = 5;
const DAILY_OTHER_SELLER_LINES = 3;

function statusIcons(customer: BillingCustomerResult) {
  const icons = [
    customer.limitLevel === "OVER_LIMIT" ? "🔴" : null,
    customer.limitLevel === "OVER_CREDIT" ? "🟠" : null,
    isNoCredit(customer) ? "⚪" : null,
    customer.limitLevel === "NEAR_LIMIT" ? "🟡" : null,
    customer.hasOverdue ? "⏰" : null,
  ].filter(Boolean);
  return icons.join("");
}

/** Uma linha por cliente: situacao, quanto deve, vencido e ultima venda. */
export function compactCustomerLine(customer: BillingCustomerResult, today: string) {
  let debt = `deve ${formatBrl(customer.debtAmount)}`;
  if (customer.limitUsage !== null && customer.limitLevel !== "OK" && customer.limitLevel !== "NO_LIMIT") {
    debt += ` (${Math.round(customer.limitUsage * 100)}%)`;
  }
  const parts = [debt];
  if (customer.hasOverdue) {
    parts.push(`vencido ${formatBrl(customer.overdueAmount)} há ${customer.oldestOverdueDays}d`);
  }
  const sale = customer.lastSale;
  if (sale?.orderDate) parts.push(`venda ${formatShortDate(sale.orderDate, today)}`);
  return `${statusIcons(customer)} *${customer.customerCode}* ${customer.displayName} — ${parts.join(" · ")}`;
}

function isRecentSale(customer: BillingCustomerResult, today: string, days: number) {
  const date = customer.lastSale?.orderDate;
  if (!date) return false;
  return (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000 <= days;
}

function splitSellerCustomers(group: SellerGroup, today: string) {
  const onlyNoCredit = group.customers.filter((customer) => isNoCredit(customer) && !customer.hasOverdue);
  const priorityList = group.customers.filter((customer) => !onlyNoCredit.includes(customer)).sort(compareCustomers);
  const recentNoCredit = onlyNoCredit
    .filter((customer) => isRecentSale(customer, today, DAILY_RECENT_SALE_DAYS))
    .sort((left, right) => String(right.lastSale?.orderDate ?? "").localeCompare(String(left.lastSale?.orderDate ?? "")));
  const noCreditTotal = onlyNoCredit.reduce((sum, customer) => sum + customer.debtAmount, 0);
  return { onlyNoCredit, priorityList, recentNoCredit, noCreditTotal };
}

function sellerDailyText(group: SellerGroup, today: string) {
  const { onlyNoCredit, priorityList, recentNoCredit, noCreditTotal } = splitSellerCustomers(group, today);
  const total = group.customers.reduce((sum, customer) => sum + amountToCharge(customer), 0);
  const lines = [`${sellerTag(group)} — ${plural(group.customers.length, "cliente", "clientes")} · ${formatBrl(total)}`];

  if (priorityList.length) {
    lines.push("", "*Mais urgentes:*");
    priorityList
      .slice(0, DAILY_TOP_PER_SELLER)
      .forEach((customer, index) => lines.push(`${index + 1}. ${compactCustomerLine(customer, today)}`));
    if (priorityList.length > DAILY_TOP_PER_SELLER) {
      lines.push(`…e mais ${priorityList.length - DAILY_TOP_PER_SELLER} no CRM`);
    }
  }

  if (onlyNoCredit.length) {
    lines.push("", `⚪ *Sem crédito:* ${plural(onlyNoCredit.length, "cliente", "clientes")} · ${formatBrl(noCreditTotal)}`);
    if (recentNoCredit.length) {
      lines.push(`🛒 Venderam sem crédito nos últimos ${DAILY_RECENT_SALE_DAYS} dias:`);
      for (const customer of recentNoCredit.slice(0, DAILY_RECENT_NO_CREDIT_LINES)) {
        const sale = customer.lastSale!;
        lines.push(
          `• *${customer.customerCode}* ${customer.displayName} — deve ${formatBrl(customer.debtAmount)} · venda ${formatShortDate(sale.orderDate!, today)} ${formatBrl(sale.totalAmount)}`,
        );
      }
      if (recentNoCredit.length > DAILY_RECENT_NO_CREDIT_LINES) {
        lines.push(`…e mais ${recentNoCredit.length - DAILY_RECENT_NO_CREDIT_LINES} no CRM`);
      }
    }
  }
  return lines.join("\n");
}

/** Vendedor(a) sem WhatsApp no CRM ou sem vendedora: resumo curto para o financeiro direcionar. */
function otherSellerSummary(group: SellerGroup, today: string) {
  const { onlyNoCredit, priorityList, noCreditTotal } = splitSellerCustomers(group, today);
  const total = group.customers.reduce((sum, customer) => sum + amountToCharge(customer), 0);
  const lines = [`• *${group.seller}* — ${plural(group.customers.length, "cliente", "clientes")} · ${formatBrl(total)}`];
  for (const customer of priorityList.slice(0, DAILY_OTHER_SELLER_LINES)) {
    lines.push(`   ${compactCustomerLine(customer, today)}`);
  }
  if (priorityList.length > DAILY_OTHER_SELLER_LINES) {
    lines.push(`   …e mais ${priorityList.length - DAILY_OTHER_SELLER_LINES}`);
  }
  if (onlyNoCredit.length) {
    lines.push(`   ⚪ sem crédito: ${plural(onlyNoCredit.length, "cliente", "clientes")} · ${formatBrl(noCreditTotal)}`);
  }
  return lines.join("\n");
}

/**
 * Relatorio das 9h, curto: resumo + uma mensagem por vendedora com os 10 mais
 * urgentes (uma linha cada) e o resumo de sem credito, destacando quem vendeu
 * sem credito nos ultimos dias. A lista completa fica no CRM.
 */
export function buildDailyReportMessages(
  report: BillingAlertReport,
  phones: SellerPhoneDirectory = new Map(),
): BillingOutgoingMessage[] {
  const toCharge = [
    ...new Set([...report.overLimit, ...report.overCredit, ...report.overdue, ...report.noCredit, ...report.nearLimit]),
  ];
  const groups = groupBySeller(toCharge, phones);
  const overdueTotal = report.overdue.reduce((sum, customer) => sum + customer.overdueAmount, 0);
  const noCreditTotal = report.noCredit.reduce((sum, customer) => sum + customer.debtAmount, 0);

  const header = [
    `💰 *COBRANÇA DO DIA — ${formatBrDate(report.today)}*`,
    `🔴 Estourou o limite: ${report.overLimit.length} · 🟠 Passou do crédito: ${report.overCredit.length}`,
    `⏰ Vencido: ${plural(report.overdue.length, "cliente", "clientes")} · ${formatBrl(overdueTotal)}`,
    `⚪ Sem crédito: ${plural(report.noCredit.length, "cliente", "clientes")} · ${formatBrl(noCreditTotal)}`,
    `🟡 Perto do limite: ${report.nearLimit.length}`,
    "",
    "Cada vendedor(a) recebe abaixo os mais urgentes. Lista completa e filtros: CRM › Financeiro › Quem cobrar hoje.",
  ].join("\n");

  const messages: BillingOutgoingMessage[] = [{ text: header, mentions: [] }];

  const withWhatsapp = groups.filter((group) => group.phone);
  const others = groups.filter((group) => !group.phone);

  for (const group of withWhatsapp) {
    const texts = splitIntoMessages([sellerDailyText(group, report.today)]);
    texts.forEach((text, index) =>
      messages.push({
        text: index === 0 ? text : `${group.seller} (continuação)\n\n${text}`,
        mentions: index === 0 ? [group.phone!] : [],
      }),
    );
  }

  const financeLines: string[] = [];
  if (others.length) {
    financeLines.push(
      "👥 *Sem WhatsApp no CRM / sem vendedora* — financeiro, favor direcionar:",
      ...others.map((group) => otherSellerSummary(group, report.today)),
    );
  }
  if (report.missingPaymentTerm.length) {
    const total = report.missingPaymentTerm.reduce((sum, customer) => sum + customer.debtAmount, 0);
    financeLines.push(
      `📋 *Sem prazo cadastrado:* ${plural(report.missingPaymentTerm.length, "cliente", "clientes")} · ${formatBrl(total)} — preencher a coluna PRAZO no RESUMO.`,
    );
  }
  if (report.unmatchedEntries.length) {
    financeLines.push(
      ["⚠️ *Código inválido na planilha* (não conta para ninguém):", ...report.unmatchedEntries.map(describeUnmatched)].join("\n"),
    );
  }
  if (financeLines.length) {
    for (const text of splitIntoMessages(["🧾 *Para o financeiro*", ...financeLines])) {
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
  for (const customer of report.noCredit) {
    if (has(`limit:${customer.customerCode}:NO_CREDIT`)) addEvent(customer, "⚪ *Passou a dever sem ter crédito liberado*");
  }
  for (const customer of [...report.overLimit, ...report.overCredit, ...report.noCredit]) {
    if (cards.has(customer)) continue;
    const who = isNoCredit(customer) ? "cliente sem crédito liberado" : "cliente que já passou do crédito";
    for (const order of customer.pendingOrders) {
      if (has(`order:${customer.customerCode}:${order.orderKey}`)) {
        addEvent(
          customer,
          `🛒 *Pedido novo lançado para ${who}* — pedido ${order.orderNumber || "s/ nº"}, ${formatBrl(order.totalAmount)}${order.seller ? `, vendido por *${order.seller}*` : ""}`,
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

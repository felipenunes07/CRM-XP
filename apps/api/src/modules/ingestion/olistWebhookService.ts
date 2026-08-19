import { z } from "zod";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";
import { syncOlistOrderById } from "./olistSyncService.js";
import { refreshDashboardDailyMetrics } from "../analytics/analyticsService.js";
import { clearDashboardCache } from "../crm/dashboardService.js";
import { clearExecutiveDashboardCache } from "../crm/executiveDashboardService.js";
import { publishExecutiveDashboardUpdate } from "../crm/executiveDashboardBus.js";

// A Olist tem dois webhooks de pedido, com formatos diferentes:
//  - extensao Webhooks (conta inteira): tipo inclusao_pedido/atualizacao_pedido,
//    id do pedido em dados.id;
//  - integracao "API do ERP" (aba Notificacoes): tipo situacao_pedido, id do
//    pedido em dados.idVendaTiny (dados.id nao vem).
// Aceitamos os tres tipos e procuramos o id nos dois campos.
const ORDER_EVENT_TYPES = new Set([
  "inclusao_pedido",
  "atualizacao_pedido",
  "situacao_pedido",
]);

// A Olist reenvia o payload ate 10 vezes quando nao recebe HTTP 200, e um
// mesmo pedido costuma gerar varios eventos seguidos (inclusao, faturamento,
// envio). Sem esta janela, cada repeticao viraria uma chamada pedidos.obter.
const DEDUPE_WINDOW_MS = 10_000;
const recentOrders = new Map<string, number>();

const webhookPayloadSchema = z.object({
  versao: z.string().optional(),
  cnpj: z.string().optional(),
  tipo: z.string().optional(),
  dados: z
    .object({
      id: z.union([z.string(), z.number()]).optional(),
      idVendaTiny: z.union([z.string(), z.number()]).optional(),
      numero: z.union([z.string(), z.number()]).optional(),
      codigoSituacao: z.union([z.string(), z.number()]).optional(),
      situacao: z.union([z.string(), z.number()]).optional(),
      descricaoSituacao: z.string().optional(),
    })
    .passthrough()
    .optional(),
});

export function isOlistWebhookConfigured() {
  return Boolean(String(env.OLIST_WEBHOOK_TOKEN ?? "").trim());
}

export function isValidOlistWebhookToken(token: unknown) {
  const expected = String(env.OLIST_WEBHOOK_TOKEN ?? "").trim();
  if (!expected) return false;
  return String(token ?? "") === expected;
}

/**
 * A Tiny pode entregar o payload como JSON ou como formulario com um campo
 * `payload` em string. Normalizamos os dois para o mesmo objeto.
 */
export function normalizeOlistWebhookBody(body: unknown): unknown {
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }

  if (body && typeof body === "object") {
    const payload = (body as Record<string, unknown>).payload;
    if (typeof payload === "string") {
      try {
        return JSON.parse(payload);
      } catch {
        return body;
      }
    }
  }

  return body;
}

export function shouldProcessOrderEvent(orderId: string, now = Date.now()) {
  for (const [key, seenAt] of recentOrders) {
    if (now - seenAt > DEDUPE_WINDOW_MS) recentOrders.delete(key);
  }

  const seenAt = recentOrders.get(orderId);
  if (seenAt !== undefined && now - seenAt <= DEDUPE_WINDOW_MS) {
    return false;
  }

  recentOrders.set(orderId, now);
  return true;
}

export function parseOlistWebhook(body: unknown) {
  const parsed = webhookPayloadSchema.safeParse(normalizeOlistWebhookBody(body));
  if (!parsed.success) {
    return { accepted: false as const, reason: "invalid-payload" };
  }

  const tipo = String(parsed.data.tipo ?? "").trim();
  if (tipo && !ORDER_EVENT_TYPES.has(tipo)) {
    // Estoque, nota fiscal, rastreio... chegam na mesma URL se estiverem
    // ligados. Nao sao erro; so nao mexem no relatorio de vendas.
    return { accepted: false as const, reason: `ignored-type:${tipo}` };
  }

  const dados = parsed.data.dados;
  // idVendaTiny e o id do pedido dentro da Olist — o mesmo que pedidos.obter
  // espera. idPedidoEcommerce e o id no sistema do integrador e nao serve aqui.
  const orderId = String(dados?.id ?? dados?.idVendaTiny ?? "").trim();
  if (!orderId || orderId === "0") {
    return { accepted: false as const, reason: "missing-order-id" };
  }

  return { accepted: true as const, orderId, tipo: tipo || "inclusao_pedido" };
}

/**
 * Processa a notificacao da Olist e avisa a TV. Roda depois da resposta HTTP:
 * a Olist so precisa do 200 para nao reenviar, e segurar a conexao durante a
 * importacao so aumentaria a chance de timeout e reenvio.
 */
export async function processOlistWebhookOrder(orderId: string, tipo: string) {
  try {
    const result = await syncOlistOrderById(orderId);

    if (result.skipped) {
      logger.warn("olist webhook order skipped", { orderId, tipo, reason: result.reason });
      return;
    }

    await refreshDashboardDailyMetrics();
    await clearDashboardCache();
    clearExecutiveDashboardCache();

    publishExecutiveDashboardUpdate({
      reason: `olist-webhook:${tipo}`,
      source: "olist_webhook",
      recordsInserted: result.recordsInserted,
      orderId,
      updatedAt: new Date().toISOString(),
    });

    logger.info("olist webhook processed", {
      orderId,
      tipo,
      orderNumber: result.orderNumber,
      recordsInserted: result.recordsInserted,
    });
  } catch (error) {
    logger.error("olist webhook processing failed", { orderId, tipo, error: String(error) });
  }
}

export async function handleOlistWebhook(body: unknown) {
  const parsed = parseOlistWebhook(body);
  if (!parsed.accepted) {
    return { received: true, processed: false, reason: parsed.reason };
  }

  if (!shouldProcessOrderEvent(parsed.orderId)) {
    return { received: true, processed: false, reason: "duplicate" };
  }

  // Deliberadamente sem await: a resposta 200 sai na frente.
  void processOlistWebhookOrder(parsed.orderId, parsed.tipo);

  return { received: true, processed: true, orderId: parsed.orderId };
}

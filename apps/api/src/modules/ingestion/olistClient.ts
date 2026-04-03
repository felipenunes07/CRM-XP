import { z } from "zod";
import { env } from "../../lib/env.js";
import { HttpError } from "../../lib/httpError.js";
import { logger } from "../../lib/logger.js";
import { OlistRateLimiter } from "./rateLimiter.js";

const pedidosPesquisaSchema = z.object({
  retorno: z.object({
    status: z.string(),
    pagina: z.coerce.number().optional(),
    numero_paginas: z.coerce.number().optional(),
    pedidos: z
      .array(
        z.object({
          pedido: z.object({
            id: z.coerce.number(),
            numero: z.union([z.string(), z.number()]),
            data_pedido: z.string(),
            nome: z.string(),
            valor: z.union([z.string(), z.number()]),
            situacao: z.string().optional(),
          }),
        }),
      )
      .optional(),
    erros: z.array(z.object({ erro: z.string() })).optional(),
  }),
});

const pedidoObterSchema = z.object({
  retorno: z.object({
    status: z.string(),
    pedido: z
      .object({
        id: z.coerce.number(),
        numero: z.union([z.string(), z.number()]),
        data_pedido: z.string().optional(),
        cliente: z.object({
          codigo: z.string().optional(),
          nome: z.string(),
          fone: z.string().optional(),
          email: z.string().optional(),
        }),
        itens: z.array(
          z.object({
            item: z.object({
              codigo: z.string().optional(),
              descricao: z.string(),
              quantidade: z.union([z.string(), z.number()]),
              valor_unitario: z.union([z.string(), z.number()]),
            }),
          }),
        ),
        situacao: z.string().optional(),
      })
      .optional(),
    erros: z.array(z.object({ erro: z.string() })).optional(),
  }),
});

export interface SearchOrdersParams {
  page?: number;
  startDate?: string;
  endDate?: string;
  updatedSince?: string;
}

function toOlistDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${day}/${month}/${year}`;
}

function toOlistDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

export class OlistClient {
  private limiter = new OlistRateLimiter("olist-api");

  private async request(pathName: string, params: Record<string, string>) {
    if (!env.OLIST_API_TOKEN) {
      throw new HttpError(400, "OLIST_API_TOKEN não configurado");
    }

    await this.limiter.acquire();
    try {
      const body = new URLSearchParams({
        token: env.OLIST_API_TOKEN,
        formato: "json",
        ...params,
      });

      const response = await fetch(`${env.OLIST_API_BASE_URL}/${pathName}`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body,
      });

      await this.limiter.registerLimitHeader(response.headers.get("x-limit-api"));

      return (await response.json()) as unknown;
    } finally {
      this.limiter.release();
    }
  }

  async searchOrders(params: SearchOrdersParams) {
    const payload = await this.request("pedidos.pesquisa.php", {
      ...(params.page ? { pagina: String(params.page) } : {}),
      ...(params.startDate ? { dataInicial: toOlistDate(params.startDate) } : {}),
      ...(params.endDate ? { dataFinal: toOlistDate(params.endDate) } : {}),
      ...(params.updatedSince ? { dataAtualizacao: toOlistDateTime(params.updatedSince) } : {}),
      sort: "ASC",
    });

    const parsed = pedidosPesquisaSchema.parse(payload);
    if (parsed.retorno.status !== "OK") {
      throw new Error(parsed.retorno.erros?.[0]?.erro ?? "Erro na consulta de pedidos");
    }

    return {
      page: parsed.retorno.pagina ?? 1,
      totalPages: parsed.retorno.numero_paginas ?? 1,
      orders: parsed.retorno.pedidos?.map((entry) => entry.pedido) ?? [],
    };
  }

  async getOrder(id: string | number) {
    const payload = await this.request("pedido.obter.php", {
      id: String(id),
    });

    const parsed = pedidoObterSchema.parse(payload);
    if (parsed.retorno.status !== "OK" || !parsed.retorno.pedido) {
      throw new Error(parsed.retorno.erros?.[0]?.erro ?? "Erro ao obter pedido");
    }

    return parsed.retorno.pedido;
  }
}

export async function withRetry<T>(task: () => Promise<T>, attempts = 5) {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      const delay = Math.min(32_000, 1_000 * 2 ** attempt) + Math.floor(Math.random() * 300);
      logger.warn("olist request retry", {
        attempt: attempt + 1,
        delay,
        error: String(error),
      });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

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

const produtosPesquisaSchema = z.object({
  retorno: z.object({
    status: z.string(),
    pagina: z.coerce.number().optional(),
    numero_paginas: z.coerce.number().optional(),
    produtos: z
      .array(
        z.object({
          produto: z
            .object({
              id: z.union([z.string(), z.number()]),
              nome: z.string().optional(),
              codigo: z.string().optional(),
              preco: z.union([z.string(), z.number()]).optional(),
              preco_promocional: z.union([z.string(), z.number()]).optional(),
              preco_custo: z.union([z.string(), z.number()]).optional(),
              preco_custo_medio: z.union([z.string(), z.number()]).optional(),
              localizacao: z.string().optional(),
              situacao: z.string().optional(),
              data_criacao: z.string().optional(),
            })
            .passthrough(),
        }),
      )
      .optional(),
    erros: z.array(z.object({ erro: z.string() })).optional(),
  }),
});

const produtoObterSchema = z.object({
  retorno: z.object({
    status: z.string(),
    produto: z
      .object({
        id: z.union([z.string(), z.number()]),
        nome: z.string().optional(),
        codigo: z.string().optional(),
        preco: z.union([z.string(), z.number()]).optional(),
        preco_promocional: z.union([z.string(), z.number()]).optional(),
        preco_custo: z.union([z.string(), z.number()]).optional(),
        preco_custo_medio: z.union([z.string(), z.number()]).optional(),
        localizacao: z.string().optional(),
        situacao: z.string().optional(),
        data_criacao: z.string().optional(),
        data_atualizacao: z.string().optional(),
        categoria: z.string().optional(),
        codigo_fornecedor: z.string().optional(),
        id_fornecedor: z.union([z.string(), z.number()]).optional(),
        nome_fornecedor: z.string().optional(),
      })
      .passthrough()
      .optional(),
    erros: z.array(z.object({ erro: z.string() })).optional(),
  }),
});

const produtoObterEstoqueSchema = z.object({
  retorno: z.object({
    status: z.string(),
    produto: z
      .object({
        id: z.union([z.string(), z.number()]).optional(),
        codigo: z.string().optional(),
        nome: z.string().optional(),
        saldo: z.union([z.string(), z.number()]).optional(),
        saldo_reservado: z.union([z.string(), z.number()]).optional(),
        depositos: z
          .array(
            z.object({
              deposito: z
                .object({
                  id: z.union([z.string(), z.number()]).optional(),
                  nome: z.string().optional(),
                  empresa: z.string().optional(),
                  saldo: z.union([z.string(), z.number()]).optional(),
                  saldo_reservado: z.union([z.string(), z.number()]).optional(),
                  considera_saldo: z.union([z.string(), z.number(), z.boolean()]).optional(),
                })
                .passthrough(),
            }),
          )
          .optional(),
      })
      .passthrough()
      .optional(),
    erros: z.array(z.object({ erro: z.string() })).optional(),
  }),
});

const contatosPesquisaSchema = z.object({
  retorno: z.object({
    status: z.string(),
    pagina: z.coerce.number().optional(),
    numero_paginas: z.coerce.number().optional(),
    contatos: z
      .array(
        z.object({
          contato: z
            .object({
              id: z.union([z.string(), z.number()]),
              codigo: z.string().optional(),
              nome: z.string().optional(),
              fantasia: z.string().optional(),
              cidade: z.string().optional(),
              uf: z.string().optional(),
              nome_vendedor: z.string().optional(),
              id_vendedor: z.union([z.string(), z.number()]).optional(),
              data_atualizacao: z.string().optional(),
            })
            .passthrough(),
        }),
      )
      .optional(),
    erros: z.array(z.object({ erro: z.string() })).optional(),
  }),
});

const contatoObterSchema = z.object({
  retorno: z.object({
    status: z.string(),
    contato: z
      .object({
        id: z.union([z.string(), z.number()]),
        codigo: z.string().optional(),
        nome: z.string().optional(),
        fantasia: z.string().optional(),
        cidade: z.string().optional(),
        uf: z.string().optional(),
        id_vendedor: z.union([z.string(), z.number()]).optional(),
        nome_vendedor: z.string().optional(),
        data_criacao: z.string().optional(),
        data_atualizacao: z.string().optional(),
      })
      .passthrough()
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

export interface SearchProductsParams {
  page?: number;
  search: string;
  gtin?: string;
  situation?: "A" | "I" | "E";
  createdSince?: string;
}

export interface SearchContactsParams {
  page?: number;
  search: string;
  cpfCnpj?: string;
  sellerId?: string | number;
  sellerName?: string;
  situation?: "A" | "E";
  createdSince?: string;
  updatedSince?: string;
}

export interface OlistProductSearchItem {
  id: string;
  code: string | null;
  name: string;
  price: number | null;
  promotionalPrice: number | null;
  costPrice: number | null;
  averageCostPrice: number | null;
  location: string | null;
  situation: string | null;
  createdAt: string | null;
  raw: Record<string, unknown>;
}

export interface OlistProductDetail {
  id: string;
  code: string | null;
  name: string;
  categoryTree: string | null;
  supplierCode: string | null;
  supplierId: string | null;
  supplierName: string | null;
  price: number | null;
  promotionalPrice: number | null;
  costPrice: number | null;
  averageCostPrice: number | null;
  location: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  raw: Record<string, unknown>;
}

export interface OlistProductStockDeposit {
  id: string | null;
  name: string;
  companyName: string | null;
  balance: number;
  reservedBalance: number | null;
  includesInTotal: boolean | null;
  raw: Record<string, unknown>;
}

export interface OlistProductStock {
  productId: string | null;
  productCode: string | null;
  productName: string | null;
  balance: number | null;
  reservedBalance: number | null;
  deposits: OlistProductStockDeposit[];
  raw: Record<string, unknown>;
}

export interface OlistContactSearchItem {
  id: string;
  code: string | null;
  name: string;
  fantasyName: string | null;
  city: string | null;
  state: string | null;
  sellerId: string | null;
  sellerName: string | null;
  updatedAt: string | null;
  raw: Record<string, unknown>;
}

export interface OlistContactDetail {
  id: string;
  code: string | null;
  name: string;
  fantasyName: string | null;
  city: string | null;
  state: string | null;
  sellerId: string | null;
  sellerName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  raw: Record<string, unknown>;
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

function normalizeDateTimeOrNull(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }

  const matched = text.match(
    /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  );

  if (!matched) {
    return null;
  }

  const [, day, month, year, hours = "00", minutes = "00", seconds = "00"] = matched;
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.000Z`;
}

function asObjectRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function toMaybeString(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function toMaybeNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const maybe = Number(String(value).replace(",", "."));
  return Number.isFinite(maybe) ? maybe : null;
}

function toMaybeBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  const text = String(value ?? "").trim().toLowerCase();
  if (["s", "sim", "true", "1"].includes(text)) {
    return true;
  }
  if (["n", "nao", "não", "false", "0"].includes(text)) {
    return false;
  }

  return null;
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
        signal: AbortSignal.timeout(10_000),
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

  async searchProducts(params: SearchProductsParams) {
    const payload = await this.request("produtos.pesquisa.php", {
      pesquisa: params.search,
      ...(params.page ? { pagina: String(params.page) } : {}),
      ...(params.gtin ? { gtin: params.gtin } : {}),
      ...(params.situation ? { situacao: params.situation } : {}),
      ...(params.createdSince ? { dataCriacao: toOlistDateTime(params.createdSince) } : {}),
    });

    const parsed = produtosPesquisaSchema.parse(payload);
    if (parsed.retorno.status !== "OK") {
      throw new Error(parsed.retorno.erros?.[0]?.erro ?? "Erro na consulta de produtos");
    }

    return {
      page: parsed.retorno.pagina ?? 1,
      totalPages: parsed.retorno.numero_paginas ?? 1,
      products: (parsed.retorno.produtos ?? []).map(({ produto }) => ({
        id: String(produto.id),
        code: toMaybeString(produto.codigo),
        name: String(produto.nome ?? produto.codigo ?? produto.id),
        price: toMaybeNumber(produto.preco),
        promotionalPrice: toMaybeNumber(produto.preco_promocional),
        costPrice: toMaybeNumber(produto.preco_custo),
        averageCostPrice: toMaybeNumber(produto.preco_custo_medio),
        location: toMaybeString(produto.localizacao),
        situation: toMaybeString(produto.situacao),
        createdAt: normalizeDateTimeOrNull(produto.data_criacao),
        raw: asObjectRecord(produto),
      }) satisfies OlistProductSearchItem),
    };
  }

  async getProduct(id: string | number) {
    const payload = await this.request("produto.obter.php", {
      id: String(id),
    });

    const parsed = produtoObterSchema.parse(payload);
    if (parsed.retorno.status !== "OK" || !parsed.retorno.produto) {
      throw new Error(parsed.retorno.erros?.[0]?.erro ?? "Erro ao obter produto");
    }

    const product = parsed.retorno.produto;
    return {
      id: String(product.id),
      code: toMaybeString(product.codigo),
      name: String(product.nome ?? product.codigo ?? product.id),
      categoryTree: toMaybeString(product.categoria),
      supplierCode: toMaybeString(product.codigo_fornecedor),
      supplierId: toMaybeString(product.id_fornecedor),
      supplierName: toMaybeString(product.nome_fornecedor),
      price: toMaybeNumber(product.preco),
      promotionalPrice: toMaybeNumber(product.preco_promocional),
      costPrice: toMaybeNumber(product.preco_custo),
      averageCostPrice: toMaybeNumber(product.preco_custo_medio),
      location: toMaybeString(product.localizacao),
      createdAt: normalizeDateTimeOrNull(product.data_criacao),
      updatedAt: normalizeDateTimeOrNull(product.data_atualizacao),
      raw: asObjectRecord(product),
    } satisfies OlistProductDetail;
  }

  async getProductStock(id: string | number) {
    const payload = await this.request("produto.obter.estoque.php", {
      id: String(id),
    });

    const parsed = produtoObterEstoqueSchema.parse(payload);
    if (parsed.retorno.status !== "OK" || !parsed.retorno.produto) {
      throw new Error(parsed.retorno.erros?.[0]?.erro ?? "Erro ao obter estoque do produto");
    }

    const product = parsed.retorno.produto;
    return {
      productId: toMaybeString(product.id),
      productCode: toMaybeString(product.codigo),
      productName: toMaybeString(product.nome),
      balance: toMaybeNumber(product.saldo),
      reservedBalance: toMaybeNumber(product.saldo_reservado),
      deposits: (product.depositos ?? []).map(({ deposito }) => ({
        id: toMaybeString(deposito.id),
        name: String(deposito.nome ?? "Sem deposito"),
        companyName: toMaybeString(deposito.empresa),
        balance: toMaybeNumber(deposito.saldo) ?? 0,
        reservedBalance: toMaybeNumber(deposito.saldo_reservado),
        includesInTotal: toMaybeBoolean(deposito.considera_saldo),
        raw: asObjectRecord(deposito),
      }) satisfies OlistProductStockDeposit),
      raw: asObjectRecord(product),
    } satisfies OlistProductStock;
  }

  async searchContacts(params: SearchContactsParams) {
    const payload = await this.request("contatos.pesquisa.php", {
      pesquisa: params.search,
      ...(params.page ? { pagina: String(params.page) } : {}),
      ...(params.cpfCnpj ? { cpf_cnpj: params.cpfCnpj } : {}),
      ...(params.sellerId ? { idVendedor: String(params.sellerId) } : {}),
      ...(params.sellerName ? { nomeVendedor: params.sellerName } : {}),
      ...(params.situation ? { situacao: params.situation } : {}),
      ...(params.createdSince ? { dataCriacao: toOlistDateTime(params.createdSince) } : {}),
      ...(params.updatedSince ? { dataMinimaAtualizacao: toOlistDateTime(params.updatedSince) } : {}),
    });

    const parsed = contatosPesquisaSchema.parse(payload);
    if (parsed.retorno.status !== "OK") {
      throw new Error(parsed.retorno.erros?.[0]?.erro ?? "Erro na consulta de contatos");
    }

    return {
      page: parsed.retorno.pagina ?? 1,
      totalPages: parsed.retorno.numero_paginas ?? 1,
      contacts: (parsed.retorno.contatos ?? []).map(({ contato }) => ({
        id: String(contato.id),
        code: toMaybeString(contato.codigo),
        name: String(contato.nome ?? contato.codigo ?? contato.id),
        fantasyName: toMaybeString(contato.fantasia),
        city: toMaybeString(contato.cidade),
        state: toMaybeString(contato.uf),
        sellerId: toMaybeString(contato.id_vendedor),
        sellerName: toMaybeString(contato.nome_vendedor),
        updatedAt: normalizeDateTimeOrNull(contato.data_atualizacao),
        raw: asObjectRecord(contato),
      }) satisfies OlistContactSearchItem),
    };
  }

  async getContact(id: string | number) {
    const payload = await this.request("contato.obter.php", {
      id: String(id),
    });

    const parsed = contatoObterSchema.parse(payload);
    if (parsed.retorno.status !== "OK" || !parsed.retorno.contato) {
      throw new Error(parsed.retorno.erros?.[0]?.erro ?? "Erro ao obter contato");
    }

    const contact = parsed.retorno.contato;
    return {
      id: String(contact.id),
      code: toMaybeString(contact.codigo),
      name: String(contact.nome ?? contact.codigo ?? contact.id),
      fantasyName: toMaybeString(contact.fantasia),
      city: toMaybeString(contact.cidade),
      state: toMaybeString(contact.uf),
      sellerId: toMaybeString(contact.id_vendedor),
      sellerName: toMaybeString(contact.nome_vendedor),
      createdAt: normalizeDateTimeOrNull(contact.data_criacao),
      updatedAt: normalizeDateTimeOrNull(contact.data_atualizacao),
      raw: asObjectRecord(contact),
    } satisfies OlistContactDetail;
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

/**
 * Lancamento durante o dia: a planilha e reimportada com um pedido novo de um
 * cliente que ja estava acima do limite -> o grupo do financeiro recebe o aviso
 * na hora, sem esperar o ciclo de 5 minutos.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const todayWeekday = new Date(`${today}T12:00:00-03:00`).getDay();

const db = {
  activeSnapshotId: "snap-manha",
  cursors: new Map<string, string>(),
  orders: new Map<string, Array<Record<string, unknown>>>(),
};

function leomarOrders(extra: Array<Record<string, unknown>> = []) {
  return [
    { customer_code: "CL034", order_key: "CL034|2026-07-01|41000", order_number: "41000", order_date: "2026-07-01", total_amount: 600_000 },
    ...extra,
  ];
}

async function query(sql: string, params: unknown[] = []) {
  if (sql.includes("FROM customer_credit_snapshots")) return { rows: [{ id: db.activeSnapshotId }] };
  if (sql.includes("SELECT cursor_value FROM sync_cursors")) {
    const value = db.cursors.get(String(params[0]));
    return { rows: value ? [{ cursor_value: value }] : [] };
  }
  if (sql.includes("INSERT INTO sync_cursors")) {
    db.cursors.set(String(params[0]), String(params[1]));
    return { rows: [] };
  }
  if (sql.includes("FROM customer_credit_snapshot_rows snapshot_row")) {
    const debt = db.activeSnapshotId === "snap-manha" ? 600_000 : 612_000;
    return {
      rows: [
        {
          customer_id: "c-34",
          customer_code: "CL034",
          display_name: "Leomar",
          balance_amount: -debt,
          credit_limit: 300_000,
          payment_term: 30,
          internal_credit_limit: " R$ 500,000.00 ",
          customer_status: null,
          seller: "Suelen",
        },
      ],
    };
  }
  if (sql.includes("FROM customer_credit_order_entries") && sql.includes("customer_code = ANY")) {
    return { rows: db.orders.get(String(params[0])) ?? [] };
  }
  if (sql.includes("FROM customer_credit_payment_entries") && sql.includes("GROUP BY")) return { rows: [] };
  if (sql.includes("WITH known AS")) return { rows: [] };
  if (sql.includes("FROM whatsapp_instances")) {
    return { rows: [{ assigned_user_name: "Suelen", display_label: "XP Suelen", instance_name: "suelen", phone_number: "+55 (11) 91111-1111" }] };
  }
  return { rows: [] };
}

vi.mock("../../db/client.js", () => ({
  pool: {
    query: (sql: string, params?: unknown[]) => query(sql, params),
    connect: async () => ({ query: (sql: string, params?: unknown[]) => query(sql, params), release: () => undefined }),
  },
}));

const mockedEnv = {
    BILLING_ALERT_ENABLED: true,
    BILLING_ALERT_GROUP_JID: "financeiro@g.us",
    BILLING_ALERT_WEEKDAY: todayWeekday,
    BILLING_ALERT_HOUR: 0,
    BILLING_ALERT_TIMEZONE: "America/Sao_Paulo",
    BILLING_ALERT_INSTANCE_ID: "",
    BILLING_ALERT_NEAR_LIMIT_PERCENT: 80,
    BILLING_ALERT_INSTANT_ENABLED: true,
    BILLING_ALERT_INSTANT_UNTIL_HOUR: 23,
    BILLING_ALERT_SELLER_PHONES: "",
    BILLING_ALERT_NO_CREDIT_ENABLED: true,
    BILLING_ALERT_NO_CREDIT_MIN_DEBT: 1,
};
vi.mock("../../lib/env.js", () => ({ env: mockedEnv }));

vi.mock("../../lib/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const sent: string[] = [];
const sentMentions: string[][] = [];
vi.mock("./offboardingAlertService.js", () => ({
  sendToGroup: async (_jid: string, text: string, _instanceId: string, mentions: string[] = []) => {
    sent.push(text);
    sentMentions.push(mentions);
  },
}));

const { startBillingAlertScheduler } = await import("./billingAlertService.js");

async function flush() {
  for (let index = 0; index < 20; index += 1) await new Promise((resolve) => setTimeout(resolve, 5));
}

// As mensagens saem com 1,5 s de intervalo (anti rate-limit do WhatsApp).
async function waitFor(condition: () => boolean, timeoutMs = 8000) {
  const start = Date.now();
  while (!condition() && Date.now() - start < timeoutMs) await new Promise((resolve) => setTimeout(resolve, 50));
}

beforeEach(() => {
  sent.length = 0;
  sentMentions.length = 0;
  db.cursors.clear();
  db.activeSnapshotId = "snap-manha";
  mockedEnv.BILLING_ALERT_WEEKDAY = todayWeekday;
  db.orders.set("snap-manha", leomarOrders());
  db.orders.set(
    "snap-tarde",
    leomarOrders([
      { customer_code: "CL034", order_key: `CL034|${today}|43300`, order_number: "43300", order_date: today, total_amount: 12_000 },
    ]),
  );
});

describe("alerta semanal de cobranca", () => {
  it("manda o relatorio geral somente no dia semanal configurado", { timeout: 20_000 }, async () => {
    const scheduler = startBillingAlertScheduler();
    await waitFor(() => sent.some((text) => text.includes("Leomar")));

    expect(sent.join("\n")).toContain("COBRANÇA SEMANAL");
    expect(sent.join("\n")).toContain("Leomar");
    // A mensagem do Leomar marca a Suelen (vendedora dele) pelo numero da instancia dela.
    const suelenIndex = sent.findIndex((text) => text.includes("*Suelen*"));
    expect(sent[suelenIndex]).toContain("@5511911111111");
    expect(sentMentions[suelenIndex]).toEqual(["5511911111111"]);
    await scheduler.close();
  });

  it("nao manda o relatorio geral nos outros dias da semana", async () => {
    mockedEnv.BILLING_ALERT_WEEKDAY = (todayWeekday + 1) % 7;
    const scheduler = startBillingAlertScheduler();
    await flush();
    expect(sent).toEqual([]);
    await scheduler.close();
  });
});

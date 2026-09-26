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
        },
      ],
    };
  }
  if (sql.includes("FROM customer_credit_order_entries") && sql.includes("customer_code = ANY")) {
    return { rows: db.orders.get(String(params[0])) ?? [] };
  }
  if (sql.includes("FROM customer_credit_payment_entries") && sql.includes("GROUP BY")) return { rows: [] };
  if (sql.includes("WITH known AS")) return { rows: [] };
  return { rows: [] };
}

vi.mock("../../db/client.js", () => ({
  pool: {
    query: (sql: string, params?: unknown[]) => query(sql, params),
    connect: async () => ({ query: (sql: string, params?: unknown[]) => query(sql, params), release: () => undefined }),
  },
}));

vi.mock("../../lib/env.js", () => ({
  env: {
    BILLING_ALERT_ENABLED: true,
    BILLING_ALERT_GROUP_JID: "financeiro@g.us",
    BILLING_ALERT_HOUR: 0,
    BILLING_ALERT_TIMEZONE: "America/Sao_Paulo",
    BILLING_ALERT_INSTANCE_ID: "",
    BILLING_ALERT_NEAR_LIMIT_PERCENT: 80,
    BILLING_ALERT_INSTANT_ENABLED: true,
    BILLING_ALERT_INSTANT_UNTIL_HOUR: 23,
  },
}));

vi.mock("../../lib/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const sent: string[] = [];
vi.mock("./offboardingAlertService.js", () => ({
  sendToGroup: async (_jid: string, text: string) => {
    sent.push(text);
  },
}));

let snapshotListener: (() => Promise<void> | void) | null = null;
vi.mock("./customerCreditService.js", () => ({
  onCustomerCreditSnapshotChanged: (listener: () => Promise<void> | void) => {
    snapshotListener = listener;
    return () => undefined;
  },
}));

const { startBillingAlertScheduler } = await import("./billingAlertService.js");

async function flush() {
  for (let index = 0; index < 20; index += 1) await new Promise((resolve) => setTimeout(resolve, 5));
}

beforeEach(() => {
  sent.length = 0;
  db.cursors.clear();
  db.activeSnapshotId = "snap-manha";
  db.orders.set("snap-manha", leomarOrders());
  db.orders.set(
    "snap-tarde",
    leomarOrders([
      { customer_code: "CL034", order_key: `CL034|${today}|43300`, order_number: "43300", order_date: today, total_amount: 12_000 },
    ]),
  );
});

describe("alerta de cobranca durante o dia", () => {
  it("manda o relatorio da manha e, quando lancam pedido novo, avisa na hora", async () => {
    const scheduler = startBillingAlertScheduler();
    await flush();

    // 1) Relatorio do dia saiu.
    expect(sent.join("\n")).toContain("Cobrança —");
    expect(sent.join("\n")).toContain("Leomar");
    const afterMorning = sent.length;

    // 2) Financeiro lanca um pedido e salva a planilha -> nova importacao.
    db.activeSnapshotId = "snap-tarde";
    await snapshotListener?.();
    await flush();

    const instant = sent.slice(afterMorning).join("\n");
    expect(instant).toContain("Novo alerta de cobrança");
    expect(instant).toContain("Pedido novo para cliente acima do crédito");
    expect(instant).toContain("pedido 43300");

    // 3) Mesma planilha de novo (nada mudou): nao repete o aviso.
    const beforeRepeat = sent.length;
    await snapshotListener?.();
    await flush();
    expect(sent.length).toBe(beforeRepeat);

    await scheduler.close();
  });
});

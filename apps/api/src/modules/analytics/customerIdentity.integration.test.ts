import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { customerIdentitySchema } from "../../db/customerIdentitySchema.js";

vi.mock("../../db/client.js", () => ({ pool: { query: () => { throw new Error("O teste exige o cliente do schema isolado"); } } }));
import { rebuildReadModels } from "./analyticsService.js";

describe.runIf(Boolean(process.env.TEST_DATABASE_URL))("correcao de identidades com vendas originais preservadas", () => {
  const schema = `identity_test_${randomUUID().replace(/-/g, "")}`;
  const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
  let isolated: Pool;
  let db: PoolClient;
  const tables = ["customers", "sales_raw", "orders", "order_items", "customer_snapshot", "dashboard_daily_metrics"];
  beforeAll(async () => {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    for (const table of tables) await admin.query(`CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
    isolated = new Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema},pg_catalog`, max: 1, statement_timeout: 20000 });
    db = await isolated.connect();
    await db.query("ALTER TABLE order_items ADD FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE");
    await db.query(customerIdentitySchema);
  }, 60000);
  beforeEach(async () => {
    await db.query("TRUNCATE order_items,orders,customers,sales_raw,customer_snapshot,dashboard_daily_metrics,customer_identity_corrections");
  });
  afterAll(async () => {
    db?.release();await isolated?.end();
    if (!/^identity_test_[a-f0-9]{32}$/.test(schema)) throw new Error("Schema de teste invalido");
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();
  });
  async function sale(code: string, label: string, days: number, orderNumber = randomUUID(), source = "history_xls", total = 100) {
    const id = randomUUID();
    await db.query(`INSERT INTO sales_raw(id,source_system,source_file_id,import_run_id,external_customer_id,sale_date,item_description,quantity,customer_code,unit_price,line_total,order_number,sku,customer_label,order_status,fingerprint,raw_payload)
      VALUES($1,$2,$3,$4,$5,CURRENT_DATE-$6::int,'Tela teste',2,$7,$8,$9,$10,'TEST',$11,'enviado',$12,$13::jsonb)`,
      [id,source,randomUUID(),randomUUID(),code,days,code,total/2,total,orderNumber,label,randomUUID(),JSON.stringify({originalCode:code,originalLabel:label})]);
    return id;
  }
  async function correction(source: string, target: string, labelCode = "") {
    await db.query("INSERT INTO customer_identity_corrections(source_customer_code,label_customer_code,canonical_customer_code,reason) VALUES($1,$2,$3,'Revisao de teste')",[source,labelCode,target]);
  }
  const people = async () => (await db.query(`SELECT c.customer_code,c.display_name,c.external_customer_id,count(o.id)::int orders,MAX(o.order_date)::text last_purchase
    FROM customers c LEFT JOIN orders o ON o.customer_id=c.id GROUP BY c.id ORDER BY c.customer_code`)).rows;

  it("separa pessoas com codigo repetido, inclusive o prefixo duplo gerado pela Olist", async () => {
    await sale('CL9001','CL9001 - Pessoa Um',100);
    await sale('CL9001','CL9002 - Pessoa Dois',40);
    await sale('CL9001','CL9001 - CL9002 - Pessoa Dois',35,randomUUID(),'olist_v2');
    const rawBefore=(await db.query('SELECT * FROM sales_raw ORDER BY id')).rows;
    await correction('CL9001','CL9002','CL9002');
    await rebuildReadModels(['CL9001'],db);
    expect(await people()).toEqual([
      expect.objectContaining({customer_code:'CL9001',display_name:'Pessoa Um',external_customer_id:'CL9001',orders:1}),
      expect.objectContaining({customer_code:'CL9002',display_name:'Pessoa Dois',external_customer_id:null,orders:2}),
    ]);
    expect((await db.query('SELECT * FROM sales_raw ORDER BY id')).rows).toEqual(rawBefore);
    expect((await db.query('SELECT SUM(line_total)::text total FROM order_items')).rows[0]?.total).toBe('300.00');
    expect((await db.query('SELECT SUM(total_amount)::text total FROM orders')).rows[0]?.total).toBe('300.00');
  });
  it("consolida codigo com hifen e conserva o cadastro antigo e suas anotacoes", async () => {
    await sale('CL9003','CL9003 - Loja Teste',150);
    await sale('CL9003-','CL9003 - Loja Teste',100);
    await rebuildReadModels(['CL9003','CL9003-'],db);
    await db.query("UPDATE customers SET internal_notes='Anotacao preservada' WHERE customer_code='CL9003-'");
    const oldId=(await db.query("SELECT id FROM customers WHERE customer_code='CL9003-'")).rows[0].id;
    await correction('CL9003-','CL9003');
    await rebuildReadModels(['CL9003-'],db);
    expect(await people()).toEqual([
      expect.objectContaining({customer_code:'CL9003',display_name:'Loja Teste',orders:2}),
      expect.objectContaining({customer_code:'CL9003-',orders:0}),
    ]);
    expect((await db.query('SELECT internal_notes FROM customers WHERE id=$1',[oldId])).rows[0]?.internal_notes).toBe('Anotacao preservada');
    expect((await db.query("SELECT total_orders FROM customer_snapshot WHERE customer_code='CL9003'")).rows[0]?.total_orders).toBe(2);
  });
  it("mantem a correcao em importacoes novas usando so o codigo antigo no rebuild", async () => {
    await correction('CL9001','CL9002','CL9002');
    await sale('CL9001','CL9001 - Pessoa Um',100);
    await sale('CL9001','CL9002 - Pessoa Dois',40);
    await rebuildReadModels(['CL9001'],db);
    await sale('CL9001','CL9001 - CL9002 - Pessoa Dois',10,randomUUID(),'olist_v2');
    await rebuildReadModels(['CL9001'],db);
    await rebuildReadModels(['CL9001'],db);
    expect((await people()).map(p=>[p.customer_code,p.orders])).toEqual([['CL9001',1],['CL9002',2]]);
    expect((await db.query('SELECT count(*)::int n FROM sales_raw')).rows[0]?.n).toBe(3);
    expect((await db.query('SELECT count(*)::int n FROM order_items')).rows[0]?.n).toBe(3);
  });
  it("usa a mesma origem no total do pedido e nos itens ao unir codigos", async () => {
    const order=randomUUID();
    await sale('CL9003-','CL9003 - Loja Teste',100,order,'supabase_2026',100);
    await sale('CL9003','CL9003 - Loja Teste',100,order,'olist_v2',120);
    await correction('CL9003-','CL9003');
    await rebuildReadModels(['CL9003'],db);
    expect((await db.query('SELECT source_system,total_amount::text FROM orders')).rows).toEqual([{source_system:'supabase_2026',total_amount:'100.00'}]);
    expect((await db.query('SELECT count(*)::int n,SUM(line_total)::text total,SUM(quantity)::text qty FROM order_items')).rows[0]).toMatchObject({n:1,total:'100.00',qty:'2.00'});
    expect((await db.query('SELECT count(*)::int n FROM sales_raw')).rows[0]?.n).toBe(2);
  });
  it("aplica apenas a regra revisada e respeita o limite do codigo no prefixo", async () => {
    await correction('CL9001','CL9002','CL9002');
    await sale('CL9001','CL90020 - Outra Loja',50);
    await sale('CL9004','CL9002 - Nome digitado incorretamente',40);
    await rebuildReadModels(['CL9001','CL9004'],db);
    expect((await people()).map(p=>p.customer_code)).toEqual(['CL9001','CL9004']);
  });
  it("permite reverter a correcao e a reconstrucao na mesma transacao", async () => {
    await sale('CL9001','CL9002 - Pessoa Dois',50);
    await db.query('BEGIN');
    await correction('CL9001','CL9002','CL9002');
    await rebuildReadModels(['CL9001'],db);
    await db.query('ROLLBACK');
    expect((await db.query('SELECT * FROM customers')).rows).toHaveLength(0);
    expect((await db.query('SELECT * FROM customer_identity_corrections')).rows).toHaveLength(0);
    expect((await db.query('SELECT * FROM sales_raw')).rows).toHaveLength(1);
  });
});

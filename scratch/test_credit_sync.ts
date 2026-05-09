
import { ensureCustomerCreditSnapshot } from "../apps/api/src/modules/crm/customerCreditService.js";
import { pool } from "../apps/api/src/db/client.js";

async function test() {
  try {
    console.log("Iniciando refresh de credito...");
    const result = await ensureCustomerCreditSnapshot(true);
    console.log("Resultado:", JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.error("Erro no refresh:", err.message);
    if (err.stack) console.error(err.stack);
  } finally {
    await pool.end();
  }
}

test();

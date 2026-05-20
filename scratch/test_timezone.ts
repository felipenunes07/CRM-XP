import { pool } from "../apps/api/src/db/client.js";

async function run() {
  try {
    const res = await pool.query(`
      SELECT 
        ('2026-05-13'::date AT TIME ZONE 'America/Sao_Paulo') as val1,
        (('2026-05-13'::date + INTERVAL '1 day') AT TIME ZONE 'America/Sao_Paulo') as val2
    `);
    console.log(res.rows);
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
run();

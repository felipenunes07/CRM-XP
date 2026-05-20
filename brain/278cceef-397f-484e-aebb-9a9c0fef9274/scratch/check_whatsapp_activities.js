import { pool } from "../../../apps/api/src/db/client.js";

async function check() {
  const result = await pool.query(`
    SELECT da.activity_type, da.content, da.metadata ->> 'fromMe' as from_me_meta, da.created_at
    FROM deal_activities da
    WHERE da.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
    ORDER BY da.created_at DESC
    LIMIT 20
  `);
  
  console.table(result.rows);
  process.exit(0);
}

check();

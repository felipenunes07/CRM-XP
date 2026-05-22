import { pool } from "../apps/api/src/db/client.js";

async function main() {
  const instances = await pool.query("SELECT id, instance_name FROM whatsapp_instances");
  console.log("Instances:", instances.rows);

  for (const instance of instances.rows) {
    const res = await pool.query(`
      SELECT count(*)
      FROM deals d
      WHERE 
        EXISTS (
          SELECT 1
          FROM whatsapp_incoming_messages wim_inst
          WHERE wim_inst.remote_jid = d.whatsapp_jid
            AND LOWER(COALESCE(wim_inst.instance_name, '')) = LOWER($1)
        )
        OR d.whatsapp_instance_id = $2
    `, [instance.instance_name, instance.id]);
    console.log("Conversations for", instance.instance_name, ":", res.rows[0].count);
  }

  process.exit(0);
}
main();

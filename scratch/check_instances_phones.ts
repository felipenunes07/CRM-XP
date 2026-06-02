import { pool } from "../apps/api/src/db/client.js";
import { formatWhatsappPhoneJid } from "../apps/api/src/modules/whatsapp/whatsappMonitorCore.js";

async function run() {
  try {
    const res = await pool.query("SELECT id, display_label, phone_number, assigned_user_name FROM whatsapp_instances");
    console.table(res.rows.map(row => ({
      ...row,
      formattedJid: formatWhatsappPhoneJid(row.phone_number)
    })));
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}
run();

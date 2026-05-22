import pg from "pg";
const { Pool } = pg;

const connectionString = "postgres://postgres:postgres@localhost:5432/olist_crm";
const pool = new Pool({ connectionString });

async function main() {
  try {
    const deals = await pool.query("SELECT id, title, whatsapp_jid, customer_display_name FROM deals LIMIT 20");
    console.log("Deals in local db:", deals.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();

import { pool } from "../db/client.js";

async function run() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chart_annotations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        date TEXT NOT NULL,
        label TEXT NOT NULL,
        description TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_chart_annotations_date ON chart_annotations(date);
    `);
    console.log("Table created successfully!");
  } catch (error) {
    console.error("Error creating table:", error);
  } finally {
    await pool.end();
  }
}

run();

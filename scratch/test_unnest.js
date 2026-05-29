const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  console.log("Testing UNNEST bulk upsert...");
  const client = await pool.connect();
  
  const jids = ['test_jid_1@g.us', 'test_jid_2@g.us'];
  const sourceNames = ['Test Group 1', 'Test Group 2'];
  const normalizedSourceNames = ['test group 1', 'test group 2'];
  const sourceCodes = [null, 'CL9999'];
  const classifications = ['WITH_ORDER', 'OTHER'];
  const mappingStatuses = ['PENDING_REVIEW', 'AUTO_MAPPED'];
  const matchMethods = [null, 'CODE'];
  const customerIds = [null, null]; // pass nulls to test uuid[]
  const mappingNotes = ['Note 1', 'Note 2'];
  const lastImportedAts = [new Date().toISOString(), new Date().toISOString()];

  try {
    await client.query("BEGIN");
    const res = await client.query(
      `
        INSERT INTO whatsapp_groups (
          jid,
          source_name,
          normalized_source_name,
          source_code,
          classification,
          mapping_status,
          match_method,
          customer_id,
          mapping_note,
          last_imported_at,
          updated_at
        )
        SELECT tmp.*, NOW() FROM UNNEST(
          $1::text[],
          $2::text[],
          $3::text[],
          $4::text[],
          $5::text[],
          $6::text[],
          $7::text[],
          $8::uuid[],
          $9::text[],
          $10::timestamptz[]
        ) AS tmp(
          jid,
          source_name,
          normalized_source_name,
          source_code,
          classification,
          mapping_status,
          match_method,
          customer_id,
          mapping_note,
          last_imported_at
        )
        ON CONFLICT (jid) DO UPDATE
        SET
          source_name = EXCLUDED.source_name,
          normalized_source_name = EXCLUDED.normalized_source_name,
          source_code = EXCLUDED.source_code,
          classification = EXCLUDED.classification,
          mapping_status = EXCLUDED.mapping_status,
          match_method = EXCLUDED.match_method,
          customer_id = EXCLUDED.customer_id,
          mapping_note = EXCLUDED.mapping_note,
          last_imported_at = EXCLUDED.last_imported_at,
          updated_at = NOW()
        RETURNING jid
      `,
      [
        jids,
        sourceNames,
        normalizedSourceNames,
        sourceCodes,
        classifications,
        mappingStatuses,
        matchMethods,
        customerIds,
        mappingNotes,
        lastImportedAts
      ]
    );
    console.log("Upserted successfully! Rows returned:", res.rowCount);
    await client.query("ROLLBACK");
  } catch (err) {
    console.error("Bulk upsert failed:", err);
  } finally {
    client.release();
  }
  pool.end();
}

run().catch(console.error);

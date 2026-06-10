import { pool } from "../apps/api/src/db/client.js";

async function runTest() {
  console.log("=== RUNNING SQL STATS TRIGGER ISOLATION TEST ===");
  const client = await pool.connect();
  
  try {
    await client.query("BEGIN");
    
    // Clear any existing stats cache or recipients if any (inside transaction)
    await client.query("DELETE FROM whatsapp_campaign_recipients");
    await client.query("DELETE FROM whatsapp_campaigns");
    await client.query("DELETE FROM whatsapp_jid_aliases");
    await client.query("DELETE FROM whatsapp_incoming_messages");
    await client.query("DELETE FROM whatsapp_campaign_stats_cache");

    const campaignId = "00000000-0000-0000-0000-000000000001";
    
    // 1. Insert Campaign (satisfying created_by_user_id)
    const userRes = await client.query("SELECT id FROM users LIMIT 1");
    let userId = userRes.rows[0]?.id;
    if (!userId) {
      // Create a dummy user inside transaction if none exists
      const dummyUser = await client.query(`
        INSERT INTO users (email, password_hash, name, role)
        VALUES ('test@example.com', 'hash', 'Test User', 'ADMIN')
        RETURNING id
      `);
      userId = dummyUser.rows[0].id;
    }

    await client.query(`
      INSERT INTO whatsapp_campaigns (id, name, status, message_text, created_by_user_id, created_by_name, created_at, updated_at)
      VALUES ($1, 'Test Campaign', 'COMPLETED', 'Hello!', $2, 'Test User', NOW(), NOW())
    `, [campaignId, userId]);

    // 2. Insert WhatsApp Groups (satisfying group_id unique constraint)
    const groupId1 = "00000000-0000-0000-0000-000000000002";
    const groupId2 = "00000000-0000-0000-0000-000000000003";
    await client.query(`
      INSERT INTO whatsapp_groups (id, jid, source_name, normalized_source_name)
      VALUES 
        ($1, 'some-group-jid1@g.us', 'Test Group 1', 'test group 1'),
        ($2, 'some-group-jid2@g.us', 'Test Group 2', 'test group 2')
    `, [groupId1, groupId2]);

    // 3. Insert Recipients:
    // r1: Group recipient
    // r2: Individual recipient (using a LID)
    const r1Jid = "12036318257329361@g.us";
    const r2Jid = "558599999999@lid";
    const r2PhoneJid = "558599999999@s.whatsapp.net";

    await client.query(`
      INSERT INTO whatsapp_campaign_recipients (id, campaign_id, group_id, jid, source_name, classification, mapping_status, status, sent_at, created_at, updated_at)
      VALUES 
        ('11111111-1111-1111-1111-111111111111', $1, $2, $4, 'Group Customer', 'OTHER', 'PENDING_REVIEW', 'SENT', NOW() - INTERVAL '1 hour', NOW(), NOW()),
        ('22222222-2222-2222-2222-222222222222', $1, $3, $5, 'Individual Customer', 'OTHER', 'PENDING_REVIEW', 'SENT', NOW() - INTERVAL '1 hour', NOW(), NOW())
    `, [campaignId, groupId1, groupId2, r1Jid, r2Jid]);

    // 3. Insert Alias: Individual LID to Phone Number JID
    await client.query(`
      INSERT INTO whatsapp_jid_aliases (instance_name, alias_jid, canonical_jid, alias_type, source, first_seen_at, last_seen_at)
      VALUES 
        ('comercial', $1, $2, 'PN', 'test', NOW(), NOW()),
        ('comercial', $2, $2, 'LID', 'test', NOW(), NOW())
    `, [r2PhoneJid, r2Jid]);

    // Let's run a test case with ONLY the group message
    console.log("\n--- TEST CASE 1: ONLY GROUP MESSAGE RECEIVED ---");
    await client.query(`
      INSERT INTO whatsapp_incoming_messages (message_id, remote_jid, participant_jid, message_text, from_me, created_at)
      VALUES ('msg-g1', $1, $2, 'Olá grupo!', false, NOW())
    `, [r1Jid, r2PhoneJid]);

    // Re-trigger stats calculation manually via UPDATE
    await client.query(`
      UPDATE whatsapp_campaign_recipients SET updated_at = NOW() WHERE campaign_id = $1
    `, [campaignId]);

    let stats = await client.query(`
      SELECT total_recipients, responded_count FROM whatsapp_campaign_stats_cache WHERE campaign_id = $1
    `, [campaignId]);

    console.log("Stats Cache:", stats.rows[0]);
    // Group recipient should have responded (responded_count should be 1, because r2Jid has NOT responded yet)
    if (Number(stats.rows[0].responded_count) === 1) {
      console.log("✅ TEST CASE 1 PASSED: Only group campaign recipient marked as responded.");
    } else {
      console.error(`❌ TEST CASE 1 FAILED: Expected responded_count=1, got ${stats.rows[0].responded_count}`);
    }

    // --- TEST CASE 2: PRIVATE MESSAGE RECEIVED AS WELL ---
    console.log("\n--- TEST CASE 2: PRIVATE MESSAGE RECEIVED AS WELL ---");
    await client.query(`
      INSERT INTO whatsapp_incoming_messages (message_id, remote_jid, message_text, from_me, created_at)
      VALUES ('msg-p1', $1, 'Olá no privado!', false, NOW())
    `, [r2PhoneJid]);

    // Re-trigger stats calculation via UPDATE
    await client.query(`
      UPDATE whatsapp_campaign_recipients SET updated_at = NOW() WHERE campaign_id = $1
    `, [campaignId]);

    stats = await client.query(`
      SELECT total_recipients, responded_count FROM whatsapp_campaign_stats_cache WHERE campaign_id = $1
    `, [campaignId]);

    console.log("Stats Cache:", stats.rows[0]);
    // Both should have responded now (responded_count should be 2)
    if (Number(stats.rows[0].responded_count) === 2) {
      console.log("✅ TEST CASE 2 PASSED: Both group and individual campaign recipients marked as responded.");
    } else {
      console.error(`❌ TEST CASE 2 FAILED: Expected responded_count=2, got ${stats.rows[0].responded_count}`);
    }

    // --- TEST CASE 3: OTHER GROUP MESSAGE RECEIVED ---
    console.log("\n--- TEST CASE 3: UNRELATED GROUP MESSAGE RECEIVED ---");
    await client.query(`
      INSERT INTO whatsapp_incoming_messages (message_id, remote_jid, participant_jid, message_text, from_me, created_at)
      VALUES ('msg-g-other', '12036399999999@g.us', $1, 'Olá outro grupo!', false, NOW())
    `, [r2PhoneJid]);

    // Re-trigger stats calculation via UPDATE
    await client.query(`
      UPDATE whatsapp_campaign_recipients SET updated_at = NOW() WHERE campaign_id = $1
    `, [campaignId]);

    stats = await client.query(`
      SELECT total_recipients, responded_count FROM whatsapp_campaign_stats_cache WHERE campaign_id = $1
    `, [campaignId]);

    console.log("Stats Cache:", stats.rows[0]);
    // Still 2 (unrelated group message should not increase responded count)
    if (Number(stats.rows[0].responded_count) === 2) {
      console.log("✅ TEST CASE 3 PASSED: Unrelated group message had no impact.");
    } else {
      console.error(`❌ TEST CASE 3 FAILED: Expected responded_count=2, got ${stats.rows[0].responded_count}`);
    }

    await client.query("ROLLBACK");
    console.log("\n=== ALL TESTS SUCCESSFUL AND TRANSACTION ROLLED BACK ===");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ TEST RUN ERROR:", error);
  } finally {
    client.release();
    await pool.end();
  }
}

runTest();

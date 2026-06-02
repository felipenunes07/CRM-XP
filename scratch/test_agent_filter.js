const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  console.log("Connecting to DB...");
  
  // 1. List whatsapp_instances
  const instances = await pool.query("SELECT id, instance_name, assigned_user_id, assigned_user_name, display_label FROM whatsapp_instances");
  console.log("\n--- WHATSAPP INSTANCES ---");
  for (const row of instances.rows) {
    console.log(`ID: ${row.id} | Name: ${row.instance_name} | UserID: ${row.assigned_user_id} | Username: ${row.assigned_user_name} | Label: ${row.display_label}`);
  }

  // 2. Sample deal_activities of type WHATSAPP_SENT/WHATSAPP_RECEIVED and metadata
  const activities = await pool.query(`
    SELECT id, deal_id, activity_type, actor_user_id, actor_name, created_at,
           metadata ->> 'instanceId' as instance_id,
           metadata ->> 'instance' as instance,
           metadata ->> 'isFromMe' as is_from_me,
           metadata ->> 'fromMe' as from_me,
           metadata ->> 'isOutbound' as is_outbound,
           metadata ->> 'sentFromMonitor' as sent_from_monitor
    FROM deal_activities
    WHERE activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
    ORDER BY created_at DESC
    LIMIT 10
  `);
  console.log("\n--- RECENT WHATSAPP ACTIVITIES ---");
  for (const row of activities.rows) {
    console.log(`ActID: ${row.id} | DealID: ${row.deal_id} | Type: ${row.activity_type} | ActorUser: ${row.actor_user_id} | ActorName: ${row.actor_name} | InstID: ${row.instance_id} | Inst: ${row.instance} | Outbound: ${row.is_outbound || row.is_from_me || row.from_me || row.sent_from_monitor}`);
  }

  // 3. Let's see if the filter "sent" is working when using specific active agents in frontend
  // Wait, let's query the specific user that the user was selecting in the screenshot!
  // In the screenshot, we see the user has:
  // - "Agentes" panel on the left with "Todos os agentes", "Amanda", "Ragnar"
  // - "Amanda" is selected (indicated by the red background and green dot)
  // - On the top filter bar:
  //   - Nome do contato (empty)
  //   - Telefone do contato (empty)
  //   - Hoje (dropdown)
  //   - Sem grupo (dropdown)
  //   - Status: todos (dropdown)
  //   - Usuario: todas as conversas (which is the agentInteraction filter dropdown!)
  // Wait, in the screenshot, the filter dropdown has "Usuario: todas as conversas" selected, but the user says:
  // "verifique esse filtro tbm somente menssagens do usuario nao esta funciinando"
  // meaning when they change that dropdown to "Somente mensagens do usuario", it is not working correctly!
  // Let's find Amanda's instance and run tests for it!
  const amandaInstance = instances.rows.find(i => i.display_label && i.display_label.includes("Amanda"));
  if (amandaInstance) {
    console.log(`\nTesting Amanda's instance:`, amandaInstance);
    // Let's get count of deals matching Amanda's instance
    // And count of deals matching selectedAgentInteractionSql for Amanda's instance
    const totalDeals = await pool.query(`
      SELECT COUNT(DISTINCT d.id) as count
      FROM deals d
      WHERE EXISTS (
        SELECT 1
        FROM whatsapp_instances wif
        WHERE wif.id = $1::uuid
          AND (
            d.whatsapp_instance_id = wif.id
            OR LOWER(COALESCE(d.metadata ->> 'instance', '')) = LOWER(wif.instance_name)
          )
      )
    `, [amandaInstance.id]);
    console.log(`Total deals for Amanda: ${totalDeals.rows[0].count}`);

    const sentDeals = await pool.query(`
      SELECT COUNT(DISTINCT d.id) as count
      FROM deals d
      WHERE EXISTS (
        SELECT 1
        FROM whatsapp_instances wif
        WHERE wif.id = $1::uuid
          AND (
            d.whatsapp_instance_id = wif.id
            OR LOWER(COALESCE(d.metadata ->> 'instance', '')) = LOWER(wif.instance_name)
          )
      )
      AND EXISTS (
        SELECT 1
        FROM deal_activities agent_interaction_activity
        WHERE agent_interaction_activity.deal_id = d.id
          AND agent_interaction_activity.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
          AND (
            agent_interaction_activity.activity_type = 'WHATSAPP_SENT'
            OR (
              agent_interaction_activity.activity_type = 'WHATSAPP_RECEIVED'
              AND (
                agent_interaction_activity.metadata ->> 'isFromMe' IN ('true', '1', 'yes', 'sim')
                OR agent_interaction_activity.metadata ->> 'fromMe' IN ('true', '1', 'yes', 'sim')
              )
            )
            OR (
              COALESCE(
                agent_interaction_activity.metadata ->> 'isOutbound',
                agent_interaction_activity.metadata ->> 'sentFromMonitor',
                ''
              ) IN ('true', '1', 'yes', 'sim')
            )
          )
          AND (
            agent_interaction_activity.metadata ->> 'instanceId' = $1::text
            OR LOWER(COALESCE(agent_interaction_activity.metadata ->> 'instance', '')) = LOWER($2)
            OR (agent_interaction_activity.actor_user_id IS NOT NULL AND agent_interaction_activity.actor_user_id = $3)
            OR LOWER(COALESCE(agent_interaction_activity.actor_name, '')) = LOWER($4)
            OR LOWER(REGEXP_REPLACE(COALESCE(agent_interaction_activity.actor_name, ''), '^xp\\\\s+', '', 'i')) = LOWER(REGEXP_REPLACE(COALESCE($5, ''), '^xp\\\\s+', '', 'i'))
            OR LOWER(REGEXP_REPLACE(COALESCE(agent_interaction_activity.actor_name, ''), '^xp\\\\s+', '', 'i')) = LOWER(REGEXP_REPLACE(COALESCE($4, ''), '^xp\\\\s+', '', 'i'))
            OR d.whatsapp_instance_id = $1::uuid
          )
      )
    `, [amandaInstance.id, amandaInstance.instance_name, amandaInstance.assigned_user_id, amandaInstance.assigned_user_name, amandaInstance.display_label]);
    console.log(`Deals with "sent" (Somente mensagens do usuario) for Amanda: ${sentDeals.rows[0].count}`);

    // Let's print the actual activities in Amanda's deals to see why they might not match
    const amandaDeals = await pool.query(`
      SELECT d.id, d.title, d.whatsapp_jid, d.whatsapp_instance_id
      FROM deals d
      WHERE EXISTS (
        SELECT 1
        FROM whatsapp_instances wif
        WHERE wif.id = $1::uuid
          AND (
            d.whatsapp_instance_id = wif.id
            OR LOWER(COALESCE(d.metadata ->> 'instance', '')) = LOWER(wif.instance_name)
          )
      )
      LIMIT 5
    `, [amandaInstance.id]);
    for (const deal of amandaDeals.rows) {
      console.log(`\nDeal: ${deal.title} (${deal.id})`);
      const dealActs = await pool.query(`
        SELECT id, activity_type, actor_user_id, actor_name, created_at, metadata
        FROM deal_activities
        WHERE deal_id = $1::uuid
          AND activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
        ORDER BY created_at DESC
      `, [deal.id]);
      for (const act of dealActs.rows) {
        console.log(`  ActID: ${act.id} | Type: ${act.activity_type} | ActorName: ${act.actor_name} | ActorUserID: ${act.actor_user_id} | Metadata: ${JSON.stringify(act.metadata)}`);
      }
    }
  } else {
    console.log("\nCould not find Amanda instance. Finding any instance with matched conversations...");
  }

  pool.end();
}

run().catch(console.error);

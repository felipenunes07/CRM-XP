import { pool } from "../apps/api/src/db/client.ts";

async function run() {
  console.log("Testing agent filter logic...");
  try {
    // Let's find an active instance
    const inst = { id: "683b8034-eca4-4996-8f56-deaec7e6bb86", display_label: "CRM Expor Telas" };
    console.log(`Using instance: ${inst.display_label} (${inst.id})`);

    // Count with original query (including OR d.whatsapp_instance_id = ...)
    const countWithOr = await pool.query(`
      SELECT COUNT(DISTINCT d.id) as count
      FROM deals d
      WHERE EXISTS (
        SELECT 1
        FROM deal_activities agent_interaction_activity
        JOIN whatsapp_instances agent_interaction_instance
          ON agent_interaction_instance.id = $1::uuid
        WHERE agent_interaction_activity.deal_id = d.id
          AND agent_interaction_activity.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
          AND (
            agent_interaction_activity.activity_type = 'WHATSAPP_SENT'
            OR LOWER(COALESCE(
              agent_interaction_activity.metadata ->> 'fromMe',
              agent_interaction_activity.metadata ->> 'isOutbound',
              agent_interaction_activity.metadata ->> 'sentFromMonitor',
              ''
            )) IN ('true', '1', 'yes', 'sim')
          )
          AND (
            agent_interaction_activity.metadata ->> 'instanceId' = agent_interaction_instance.id::text
            OR LOWER(COALESCE(agent_interaction_activity.metadata ->> 'instance', '')) = LOWER(agent_interaction_instance.instance_name)
            OR (agent_interaction_activity.actor_user_id IS NOT NULL AND agent_interaction_activity.actor_user_id = agent_interaction_instance.assigned_user_id)
            OR LOWER(COALESCE(agent_interaction_activity.actor_name, '')) = LOWER(agent_interaction_instance.assigned_user_name)
            OR LOWER(REGEXP_REPLACE(COALESCE(agent_interaction_activity.actor_name, ''), '^xp\\\\s+', '', 'i')) = LOWER(REGEXP_REPLACE(COALESCE(agent_interaction_instance.display_label, ''), '^xp\\\\s+', '', 'i'))
            OR LOWER(REGEXP_REPLACE(COALESCE(agent_interaction_activity.actor_name, ''), '^xp\\\\s+', '', 'i')) = LOWER(REGEXP_REPLACE(COALESCE(agent_interaction_instance.assigned_user_name, ''), '^xp\\\\s+', '', 'i'))
            OR d.whatsapp_instance_id = agent_interaction_instance.id
          )
      )
    `, [inst.id]);

    // Count without original query (excluding OR d.whatsapp_instance_id = ...)
    const countWithoutOr = await pool.query(`
      SELECT COUNT(DISTINCT d.id) as count
      FROM deals d
      WHERE EXISTS (
        SELECT 1
        FROM deal_activities agent_interaction_activity
        JOIN whatsapp_instances agent_interaction_instance
          ON agent_interaction_instance.id = $1::uuid
        WHERE agent_interaction_activity.deal_id = d.id
          AND agent_interaction_activity.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
          AND (
            agent_interaction_activity.activity_type = 'WHATSAPP_SENT'
            OR LOWER(COALESCE(
              agent_interaction_activity.metadata ->> 'fromMe',
              agent_interaction_activity.metadata ->> 'isOutbound',
              agent_interaction_activity.metadata ->> 'sentFromMonitor',
              ''
            )) IN ('true', '1', 'yes', 'sim')
          )
          AND (
            agent_interaction_activity.metadata ->> 'instanceId' = agent_interaction_instance.id::text
            OR LOWER(COALESCE(agent_interaction_activity.metadata ->> 'instance', '')) = LOWER(agent_interaction_instance.instance_name)
            OR (agent_interaction_activity.actor_user_id IS NOT NULL AND agent_interaction_activity.actor_user_id = agent_interaction_instance.assigned_user_id)
            OR LOWER(COALESCE(agent_interaction_activity.actor_name, '')) = LOWER(agent_interaction_instance.assigned_user_name)
            OR LOWER(REGEXP_REPLACE(COALESCE(agent_interaction_activity.actor_name, ''), '^xp\\\\s+', '', 'i')) = LOWER(REGEXP_REPLACE(COALESCE(agent_interaction_instance.display_label, ''), '^xp\\\\s+', '', 'i'))
            OR LOWER(REGEXP_REPLACE(COALESCE(agent_interaction_activity.actor_name, ''), '^xp\\\\s+', '', 'i')) = LOWER(REGEXP_REPLACE(COALESCE(agent_interaction_instance.assigned_user_name, ''), '^xp\\\\s+', '', 'i'))
          )
      )
    `, [inst.id]);

    console.log(`Count with OR: ${countWithOr.rows[0].count}`);
    console.log(`Count without OR: ${countWithoutOr.rows[0].count}`);

  } catch(e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

run();

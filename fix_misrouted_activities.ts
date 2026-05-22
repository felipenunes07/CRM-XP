import pg from "pg";
import dotenv from "dotenv";
import path from "path";

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("FATAL: DATABASE_URL environment variable is not defined.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

// Robust JID/phone equality comparison replicating backend areWhatsappJidsEqual logic
function areWhatsappJidsEqual(jidA: string | null | undefined, jidB: string | null | undefined): boolean {
  if (!jidA || !jidB) return false;
  const cleanA = jidA.trim().toLowerCase();
  const cleanB = jidB.trim().toLowerCase();
  if (cleanA === cleanB) return true;

  const digitsA = (cleanA.split("@")[0] || "").replace(/\D/g, "");
  const digitsB = (cleanB.split("@")[0] || "").replace(/\D/g, "");
  if (!digitsA || !digitsB) return cleanA === cleanB;
  if (digitsA === digitsB) return true;

  // Brazilian 9th-digit variation
  if (digitsA.startsWith("55") && digitsB.startsWith("55")) {
    const lenA = digitsA.length;
    const lenB = digitsB.length;
    if (lenA >= 10 && lenB >= 10) {
      const dddA = digitsA.substring(2, 4);
      const dddB = digitsB.substring(2, 4);
      if (dddA === dddB) {
        if (lenA === lenB) return digitsA === digitsB;
        const digits13 = lenA === 13 ? digitsA : lenB === 13 ? digitsB : null;
        const digits12 = lenA === 12 ? digitsA : lenB === 12 ? digitsB : null;
        if (digits13 && digits12) {
          const isMobile13 = digits13.charAt(4) === "9";
          const firstDigit8 = digits12.charAt(4);
          const isMobile12 = ["6", "7", "8", "9"].includes(firstDigit8);
          if (isMobile13 && isMobile12) {
            return digits13.substring(5) === digits12.substring(4);
          }
        }
      }
    }
  }
  return digitsA === digitsB;
}

async function fixMisroutedActivities() {
  const isDryRun = process.argv.includes("--commit") ? false : true;
  console.log(`=== WHATSAPP HISTORY RE-ROUTING TOOL ===`);
  console.log(`Database: ${connectionString.split("@")[1] || "Local / Hidden"}`);
  console.log(`Mode: ${isDryRun ? "DRY RUN (No database updates will be made)" : "COMMIT MODE (DATABASE WILL BE UPDATED)"}`);
  console.log(`========================================\n`);

  const client = await pool.connect();
  try {
    // Start transaction
    await client.query("BEGIN");

    // Fetch instances to map names to IDs
    console.log("Fetching WhatsApp instances...");
    const instancesRes = await client.query(`
      SELECT id, instance_name, display_label 
      FROM whatsapp_instances
    `);
    const instances = instancesRes.rows;
    console.log(`Loaded ${instances.length} WhatsApp instances.\n`);

    // Fetch all WhatsApp deal activities and their deal details
    console.log("Fetching WhatsApp activities...");
    const activitiesRes = await client.query(`
      SELECT 
        da.id as activity_id,
        da.deal_id as current_deal_id,
        da.activity_type,
        da.actor_name,
        da.content,
        da.metadata,
        da.created_at,
        d.title as deal_title,
        d.whatsapp_jid as deal_whatsapp_jid,
        d.whatsapp_instance_id as deal_whatsapp_instance_id
      FROM deal_activities da
      JOIN deals d ON d.id = da.deal_id
      WHERE da.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
      ORDER BY da.created_at ASC;
    `);

    console.log(`Found ${activitiesRes.rows.length} total WhatsApp activities.\n`);

    // Fetch all deals to match them later
    const dealsRes = await client.query(`
      SELECT d.id, d.title, d.whatsapp_jid, d.whatsapp_instance_id, d.customer_display_name, ps.is_won, ps.is_lost
      FROM deals d
      LEFT JOIN pipeline_stages ps ON ps.id = d.stage_id;
    `);
    const deals = dealsRes.rows;

    let misroutedCount = 0;
    let fixedCount = 0;

    for (const activity of activitiesRes.rows) {
      const metadata = activity.metadata || {};
      const activityJid = metadata.remoteJid;

      if (!activityJid) {
        continue;
      }

      const currentDealJid = activity.deal_whatsapp_jid;
      const currentDealInstanceId = activity.deal_whatsapp_instance_id;

      // Determine the instance name or ID associated with this message/activity
      let activityInstanceId: string | null = null;
      if (metadata.instanceId) {
        activityInstanceId = String(metadata.instanceId);
      } else if (metadata.instance) {
        const instName = String(metadata.instance).toLowerCase();
        const foundInst = instances.find(inst => inst.instance_name.toLowerCase() === instName);
        if (foundInst) {
          activityInstanceId = String(foundInst.id);
        }
      }

      // Check if this activity is misrouted:
      // 1. JID is different from the deal's JID
      // 2. OR the activity's instance is different from the deal's instance (for multi-instance collisions, like Thais chatting with multiple agents)
      const jidMismatch = !areWhatsappJidsEqual(activityJid, currentDealJid);
      const instanceMismatch = activityInstanceId && currentDealInstanceId && activityInstanceId !== currentDealInstanceId;

      if (jidMismatch || instanceMismatch) {
        misroutedCount++;
        console.log(`[MISROUTED] Activity ${activity.activity_id} ("${(activity.content || "").substring(0, 45)}...")`);
        console.log(`  - Metadata JID: ${activityJid} | Instance: ${metadata.instance || "unknown"} (ID: ${activityInstanceId || "unknown"})`);
        console.log(`  - Current Deal JID: ${currentDealJid} | Instance ID: ${currentDealInstanceId} (Deal: "${activity.deal_title}" [ID: ${activity.current_deal_id}])`);
        if (jidMismatch) console.log(`  - Reason: JID Mismatch`);
        if (instanceMismatch) console.log(`  - Reason: Instance Mismatch (Colliding chats across agents)`);

        // Find the CORRECT deal:
        // Must match JID AND the specific WhatsApp instance to keep separate chats for different agents!
        let correctDeal = deals.find(d => 
          !d.is_won && 
          !d.is_lost && 
          areWhatsappJidsEqual(d.whatsapp_jid, activityJid) &&
          (activityInstanceId ? d.whatsapp_instance_id === activityInstanceId : true)
        );
        
        // If not found in active deals, search won/lost deals
        if (!correctDeal) {
          correctDeal = deals.find(d => 
            areWhatsappJidsEqual(d.whatsapp_jid, activityJid) &&
            (activityInstanceId ? d.whatsapp_instance_id === activityInstanceId : true)
          );
        }

        // Fallback: If we couldn't match the specific instance but have a deal matching the JID, print a warning or match it
        if (!correctDeal && activityInstanceId) {
          correctDeal = deals.find(d => areWhatsappJidsEqual(d.whatsapp_jid, activityJid));
          if (correctDeal) {
            console.log(`  [NOTE] Direct instance match not found. Falling back to deal matching JID: "${correctDeal.title}"`);
          }
        }

        if (correctDeal) {
          console.log(`  -> CORRECT DEAL FOUND: "${correctDeal.title}" (JID: ${correctDeal.whatsapp_jid} | Instance ID: ${correctDeal.whatsapp_instance_id} [ID: ${correctDeal.id}])`);
          
          if (!isDryRun) {
            // Update activity in database
            await client.query(
              "UPDATE deal_activities SET deal_id = $1 WHERE id = $2",
              [correctDeal.id, activity.activity_id]
            );
            
            // Touch deal's last_activity_at if newer
            await client.query(`
              UPDATE deals 
              SET last_activity_at = GREATEST(last_activity_at, $1)
              WHERE id = $2
            `, [activity.created_at, correctDeal.id]);
          }
          
          fixedCount++;
          console.log(`  [OK] Re-routed activity to Deal: "${correctDeal.title}"`);
        } else {
          console.log(`  [WARNING] No matching deal found for JID ${activityJid} with Instance ${metadata.instance} in database!`);
        }
        console.log();
      }
    }

    if (isDryRun) {
      console.log(`\nDry run completed.`);
      console.log(`- Misrouted activities found: ${misroutedCount}`);
      console.log(`- Activities that can be fixed: ${fixedCount}`);
      console.log(`\nTo execute these changes in the database, run: npx tsx fix_misrouted_activities.ts --commit`);
      await client.query("ROLLBACK");
    } else {
      console.log(`\nCommit completed successfully!`);
      console.log(`- Fixed ${fixedCount} out of ${misroutedCount} misrouted activities.`);
      await client.query("COMMIT");
    }

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error executing re-routing:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

fixMisroutedActivities();

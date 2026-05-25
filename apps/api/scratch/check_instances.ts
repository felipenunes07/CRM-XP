import { pool } from "../src/db/client.js";

async function run() {
  try {
    // Get the Evolution API instance config - use the env vars directly
    const baseUrl = "https://exportelas-evolution.f0dgeg.easypanel.host";
    const apiKey = "D0AD7ED20164-454D-A1AF-D71226A35A60";
    const instanceName = "exportelas";

    // Check webhook config
    try {
      const webhookUrl = `${baseUrl}/webhook/find/${encodeURIComponent(instanceName)}`;
      console.log("Fetching webhook config from:", webhookUrl);
      const resp = await fetch(webhookUrl, {
        headers: { apikey: apiKey }
      });
      const webhookConfig = await resp.json();
      console.log("Webhook config:", JSON.stringify(webhookConfig, null, 2));
    } catch (err: any) {
      console.log("Error fetching webhook config:", err.message);
    }

    // Check settings
    try {
      const settingsUrl = `${baseUrl}/settings/find/${encodeURIComponent(instanceName)}`;
      console.log("\nFetching settings from:", settingsUrl);
      const resp = await fetch(settingsUrl, {
        headers: { apikey: apiKey }
      });
      const settings = await resp.json();
      console.log("Settings:", JSON.stringify(settings, null, 2));
    } catch (err: any) {
      console.log("Error fetching settings:", err.message);
    }

    // Check instance status
    try {
      const statusUrl = `${baseUrl}/instance/connectionState/${encodeURIComponent(instanceName)}`;
      console.log("\nFetching instance status from:", statusUrl);
      const resp = await fetch(statusUrl, {
        headers: { apikey: apiKey }
      });
      const status = await resp.json();
      console.log("Instance status:", JSON.stringify(status, null, 2));
    } catch (err: any) {
      console.log("Error fetching instance status:", err.message);
    }

    // List all instances
    try {
      const listUrl = `${baseUrl}/instance/fetchInstances`;
      console.log("\nFetching all instances from:", listUrl);
      const resp = await fetch(listUrl, {
        headers: { apikey: apiKey }
      });
      const instances = await resp.json();
      console.log("Instances:", JSON.stringify(instances, null, 2).slice(0, 2000));
    } catch (err: any) {
      console.log("Error fetching instances:", err.message);
    }

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await pool.end();
  }
}

run();

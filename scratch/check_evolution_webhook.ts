import { pool } from "../apps/api/src/db/client.js";

async function run() {
  const baseUrl = "https://exportelas-evolution.f0dgeg.easypanel.host";
  
  // Try combinations from DB
  const configurations = [
    { name: "exportelas", key: "D0AD7ED20164-454D-A1AF-D71226A35A60" },
    { name: "CRM Expor Telas", key: "BC65A4254618-492F-AA62-6A380EE6B3AF" },
    { name: "exportelas", key: "BC65A4254618-492F-AA62-6A380EE6B3AF" },
    { name: "CRM Expor Telas", key: "D0AD7ED20164-454D-A1AF-D71226A35A60" },
    { name: "comercial-amanda", key: "D0AD7ED20164-454D-A1AF-D71226A35A60" },
    { name: "comercial-amanda", key: "BC65A4254618-492F-AA62-6A380EE6B3AF" },
  ];

  for (const config of configurations) {
    try {
      console.log(`\nTesting instance "${config.name}" with key "${config.key.slice(0, 8)}..."`);
      const response = await fetch(`${baseUrl}/webhook/find/${encodeURIComponent(config.name)}`, {
        method: "GET",
        headers: {
          "apikey": config.key
        }
      });

      const json = await response.json();
      console.log("Status:", response.status);
      if (response.status === 200) {
        console.log("SUCCESS! Webhook configuration:", JSON.stringify(json, null, 2));
      } else {
        console.log("Error response:", JSON.stringify(json));
      }
    } catch (e: any) {
      console.error("Fetch failed:", e.message);
    }
  }
  await pool.end();
}

run();

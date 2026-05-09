import { configureInstanceWebhook } from "../apps/api/src/modules/whatsapp/evolutionService.js";

async function test() {
  process.env.PUBLIC_URL = "https://xpcrm-crm-backend.f0dgeg.easypanel.host";
  
  try {
    const result = await configureInstanceWebhook({
      instanceName: "exportelas", 
      evolutionBaseUrl: "https://exportelas-evolution.f0dgeg.easypanel.host",
      evolutionApiKey: "D0AD7ED20164-454D-A1AF-D71226A35A60", 
    });
    console.log("Success:", JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.error("Error:", err.message);
    if (err.responsePayload) {
      console.error("Payload:", err.responsePayload);
    }
  }
}

test();

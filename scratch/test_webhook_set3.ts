import { configureInstanceWebhook } from "../apps/api/src/modules/whatsapp/evolutionService.js";

async function test() {
  process.env.PUBLIC_URL = "https://xpcrm-crm-backend.f0dgeg.easypanel.host";
  
  try {
    const result = await configureInstanceWebhook({
      instanceName: "exportelas", 
      evolutionBaseUrl: "https://exportelas-evolution.f0dgeg.easypanel.host",
      evolutionApiKey: "SUA_CHAVE_ANTIGA_DA_EVOLUTION_API", 
    });
    console.log("Success:", JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.error("Error:", err.message);
    if (err.responsePayload) {
      console.dir(err.responsePayload, { depth: null });
    }
  }
}

test();

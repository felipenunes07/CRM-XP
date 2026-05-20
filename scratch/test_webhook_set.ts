import { configureInstanceWebhook } from "../apps/api/src/modules/whatsapp/evolutionService.js";

async function test() {
  try {
    const result = await configureInstanceWebhook({
      instanceName: "comercial-amanda", // Or whatever instance name
      evolutionBaseUrl: "https://exportelas-evolution.f0dgeg.easypanel.host",
      evolutionApiKey: process.env.EVOLUTION_API_KEY || "",
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

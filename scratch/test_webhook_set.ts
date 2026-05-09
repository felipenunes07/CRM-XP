import { configureInstanceWebhook } from "../apps/api/src/modules/whatsapp/evolutionService.js";

async function test() {
  try {
    const result = await configureInstanceWebhook({
      instanceName: "comercial-amanda", // Or whatever instance name
      evolutionBaseUrl: "https://exportelas-evolution.f0dgeg.easypanel.host",
      evolutionApiKey: "D0AD7ED20164-454D-A1AF-D71226A35A60", // From previous env
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

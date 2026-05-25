import { env } from "../src/lib/env.js";

async function testEvolution() {
  const baseUrl = "https://exportelas-evolution.f0dgeg.easypanel.host";
  const apiKey = "D0AD7ED20164-454D-A1AF-D71226A35A60";
  const instanceName = "exportelas";
  const testNumber = "5511911279702"; // Test number

  const url = `${baseUrl}/message/sendText/${encodeURIComponent(instanceName)}`;
  console.log("Sending POST to:", url);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({
        number: testNumber,
        text: "Teste Evolution",
      }),
    });

    console.log("Status:", res.status, res.statusText);
    const data = await res.json().catch(() => null);
    console.log("Response:", JSON.stringify(data, null, 2));
  } catch (err: any) {
    console.error("Error:", err.message);
  }
}

testEvolution();

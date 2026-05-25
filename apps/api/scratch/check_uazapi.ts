const baseUrl = "https://f0dgeg.uazapi.com";
const token = "03051154-8f6e-4cde-b761-fb4a92564a3d";

async function testEndpoint(path: string) {
  const url = `${baseUrl}${path}`;
  console.log(`\nTesting: GET ${url}`);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        token: token,
      },
    });
    console.log(`Status: ${res.status} ${res.statusText}`);
    const data = await res.json().catch(() => null);
    console.log("Response:", JSON.stringify(data, null, 2));
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
  }
}

async function run() {
  // Test common status/info endpoints for UazAPI
  await testEndpoint("/instance/status");
  await testEndpoint("/instance/connection");
  await testEndpoint("/instance/info");
  await testEndpoint("/instance/fetch");
}

run();

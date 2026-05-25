const baseUrl = "https://f0dgeg.uazapi.com";
const token = "03051154-8f6e-4cde-b761-fb4a92564a3d";
const testNumber = "5511959502231"; // Connected number or user's test number

async function testSend() {
  const url = `${baseUrl}/send/text`;
  const body = {
    number: testNumber,
    text: "Teste de conexao UazAPI direta",
  };

  console.log("Sending POST to:", url);
  console.log("Body:", JSON.stringify(body));

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        token: token,
      },
      body: JSON.stringify(body),
    });

    console.log("Status:", res.status, res.statusText);
    const data = await res.json().catch(() => null);
    console.log("Response:", JSON.stringify(data, null, 2));
  } catch (err: any) {
    console.error("Error:", err.message);
  }
}

testSend();

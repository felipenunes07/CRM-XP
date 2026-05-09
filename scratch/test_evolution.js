
async function testSettings() {
  const baseUrl = "https://exportelas-evolution.f0dgeg.easypanel.host";
  const apiKey = "D0AD7ED20164-454D-A1AF-D71226A35A60";

  // Settings expects the fields directly (no wrapper)
  console.log("=== Test: settings/set WITHOUT wrapper ===");
  const url = `${baseUrl}/settings/set/exportelas`;
  console.log(`POST ${url}`);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": apiKey },
      body: JSON.stringify({
        rejectCall: false,
        groupsIgnore: false,
        alwaysOnline: true,
        readMessages: true,
        readStatus: true,
        syncFullHistory: false
      })
    });
    const data = await res.json().catch(() => null);
    console.log("Status:", res.status);
    console.log("Response:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error:", err.message);
  }
}

testSettings();

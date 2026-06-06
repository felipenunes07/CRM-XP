const baseUrl = "https://xpcrm-crm-backend.f0dgeg.easypanel.host";

async function run() {
  console.log("Attempting to login to production API...");
  
  // Try to login with fereservas@gmail.com first
  let token = "";
  try {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "fereservas@gmail.com",
        password: "9630Jinren$"
      })
    });
    
    const loginJson = await loginRes.json();
    if (loginRes.ok) {
      console.log("Login successful!");
      token = loginJson.token;
    } else {
      console.error("Login failed:", loginJson);
      
      // Let's try admin@example.com
      console.log("Trying admin@example.com...");
      const loginRes2 = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "admin@example.com",
          password: "9630Jinren$"
        })
      });
      const loginJson2 = await loginRes2.json();
      if (loginRes2.ok) {
        console.log("Login successful for admin@example.com!");
        token = loginJson2.token;
      } else {
        console.error("Login failed for admin@example.com too:", loginJson2);
        return;
      }
    }
  } catch (err) {
    console.error("Auth error:", err.message);
    return;
  }

  // 1. Get agents/instances on production
  console.log("\n--- PRODUCTION AGENTS ---");
  try {
    const res = await fetch(`${baseUrl}/api/whatsapp-monitor/agents`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const agents = await res.json();
    console.table(agents);
  } catch (err) {
    console.error("Error fetching agents:", err.message);
  }

  // 2. Get today's activity report on production
  console.log("\n--- PRODUCTION ACTIVITY REPORT ---");
  try {
    const res = await fetch(`${baseUrl}/api/whatsapp-monitor/activity-report?days=1`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const report = await res.json();
    console.dir(report, { depth: null });
  } catch (err) {
    console.error("Error fetching activity report:", err.message);
  }

  // 3. Get recent conversations on production
  console.log("\n--- PRODUCTION CONVERSATIONS ---");
  try {
    const res = await fetch(`${baseUrl}/api/whatsapp-monitor/conversations?limit=10`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const convs = await res.json();
    console.log("Conversations count:", convs.conversations?.length);
    console.dir(convs.conversations?.map(c => ({
      id: c.id,
      contactName: c.contactName,
      isGroup: c.isGroup,
      profilePictureUrl: c.profilePictureUrl,
    })), { depth: null });
  } catch (err) {
    console.error("Error fetching conversations:", err.message);
  }

  // 4. Get daily summary on production
  console.log("\n--- PRODUCTION DAILY SUMMARY ---");
  try {
    const res = await fetch(`${baseUrl}/api/whatsapp-monitor/daily-summary`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const summary = await res.json();
    console.dir(summary, { depth: null });
  } catch (err) {
    console.error("Error fetching daily summary:", err.message);
  }
}

run().catch(console.error);

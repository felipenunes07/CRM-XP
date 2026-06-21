const baseUrl = "https://xpcrm-crm-backend.f0dgeg.easypanel.host";

async function login() {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "fereservas@gmail.com", password: "9630Jinren$" }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error("login: " + JSON.stringify(json));
  return json.token;
}

async function get(token, path) {
  const res = await fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path}: ${JSON.stringify(json)}`);
  return json;
}

async function run() {
  console.log("Hoje:", new Date().toISOString());
  const token = await login();
  console.log("login OK\n");

  // Top privados
  const priv = await get(token, "/api/whatsapp-monitor/conversations?group=contacts&limit=6");
  const convs = priv.conversations || [];
  console.log("=== DETALHE das conversas privadas (sem corte de data) ===");
  for (const c of convs) {
    try {
      const detail = await get(token, `/api/whatsapp-monitor/conversations/${c.id}?limit=100`);
      const msgs = detail.messages || detail.activities || [];
      const times = msgs.map((m) => new Date(m.createdAt)).filter((d) => !isNaN(d));
      times.sort((a, b) => b - a);
      console.log(`\n${c.contactName}  jid=${c.remoteJid}`);
      console.log(`  list.lastMessageAt=${c.lastMessageAt}`);
      console.log(`  detalhe: ${msgs.length} msgs | mais recente=${times[0]?.toISOString()} | mais antiga=${times.at(-1)?.toISOString()}`);
    } catch (e) {
      console.log(`\n${c.contactName}: ERRO detalhe -> ${e.message}`);
    }
  }

  // Daily summary + activity report (contagem de particular por dia)
  console.log("\n\n=== DAILY SUMMARY ===");
  try { console.dir(await get(token, "/api/whatsapp-monitor/daily-summary"), { depth: 3 }); }
  catch (e) { console.log("erro:", e.message); }

  console.log("\n=== ACTIVITY REPORT days=20 (resumo por dia) ===");
  try {
    const rep = await get(token, "/api/whatsapp-monitor/activity-report?days=20");
    const days = rep.days || [];
    for (const d of days) {
      // tenta achar contadores de particular/privado no objeto do dia
      console.log(`  ${d.date || d.label}: ${JSON.stringify(d).slice(0, 220)}`);
    }
  } catch (e) { console.log("erro:", e.message); }
}

run().catch((e) => { console.error("ERRO:", e); process.exit(1); });

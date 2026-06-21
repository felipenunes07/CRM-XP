// Diagnóstico do filtro "Privados" (group=contacts) contra a API de PRODUÇÃO.
// Loga como admin e compara a lista Privados vs. lista geral.
const baseUrl = "https://xpcrm-crm-backend.f0dgeg.easypanel.host";

async function login() {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "fereservas@gmail.com", password: "9630Jinren$" }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error("login failed: " + JSON.stringify(json));
  return json.token;
}

// Busca várias páginas de conversas com um conjunto de filtros.
async function fetchConversations(token, params, maxPages = 6) {
  const all = [];
  let cursor = null;
  let pages = 0;
  do {
    const qs = new URLSearchParams({ limit: "50", ...params });
    if (cursor) qs.set("cursor", cursor);
    const res = await fetch(`${baseUrl}/api/whatsapp-monitor/conversations?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) throw new Error("conversations failed: " + JSON.stringify(json));
    all.push(...(json.conversations || []));
    cursor = json.pageInfo?.nextCursor || null;
    pages++;
  } while (cursor && pages < maxPages);
  return { all, hasMore: Boolean(cursor) };
}

function summarize(label, list) {
  const sorted = [...list].sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
  const groups = list.filter((c) => c.isGroup).length;
  const privs = list.filter((c) => !c.isGroup).length;
  console.log(`\n=== ${label} ===`);
  console.log(`total=${list.length}  privados=${privs}  grupos=${groups}`);
  console.log(`mais RECENTE: ${sorted[0]?.lastMessageAt}  (${sorted[0]?.contactName} | group=${sorted[0]?.isGroup})`);
  console.log(`mais ANTIGA : ${sorted.at(-1)?.lastMessageAt}  (${sorted.at(-1)?.contactName} | group=${sorted.at(-1)?.isGroup})`);
  return sorted;
}

async function run() {
  console.log("Hoje:", new Date().toISOString());
  const token = await login();
  console.log("login OK");

  // 1) Lista Privados (group=contacts) — o que o usuário vê com o filtro
  const priv = await fetchConversations(token, { group: "contacts" });
  const privSorted = summarize("FILTRO PRIVADOS (group=contacts)", priv.all);
  console.log("hasMore:", priv.hasMore);
  console.log("Top 10 privados por data:");
  privSorted.slice(0, 10).forEach((c) =>
    console.log(`  ${c.lastMessageAt}  ${c.contactName}  jid=${c.remoteJid}`)
  );

  // 2) Lista geral (sem filtro de grupo) — pegar os privados (isGroup=false) daqui
  const allConv = await fetchConversations(token, {});
  const allSorted = summarize("LISTA GERAL (sem filtro)", allConv.all);
  const privFromAll = allSorted.filter((c) => !c.isGroup);
  console.log(`\nPrivados encontrados na lista GERAL: ${privFromAll.length}`);
  console.log("Top 10 privados (vindos da lista geral):");
  privFromAll.slice(0, 10).forEach((c) =>
    console.log(`  ${c.lastMessageAt}  ${c.contactName}  jid=${c.remoteJid}`)
  );

  // 3) Diferença: privados que aparecem na geral mas NÃO no filtro Privados
  const privIds = new Set(priv.all.map((c) => c.id));
  const missing = privFromAll.filter((c) => !privIds.has(c.id));
  console.log(`\n>>> Privados na GERAL mas AUSENTES do filtro Privados: ${missing.length}`);
  missing.slice(0, 20).forEach((c) =>
    console.log(`  ${c.lastMessageAt}  ${c.contactName}  jid=${c.remoteJid}  id=${c.id}`)
  );
}

run().catch((e) => {
  console.error("ERRO:", e);
  process.exit(1);
});

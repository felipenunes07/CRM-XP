# Fase 2 — Leitura rápida do monitor de WhatsApp (estilo Chatwoot)

> Objetivo: abrir uma conversa virar **1 query indexada** (milissegundos), eliminando os
> `LEFT JOIN LATERAL` por mensagem, os `OR ... = ANY(...)` e o merge de duas fontes que hoje
> custam até **116s** em `getWhatsappMonitorConversation`.
>
> **Princípio de segurança (leia antes de tudo):** todo o trabalho é **aditivo e reversível**.
> Criamos uma tabela nova e populamos na escrita. A troca da leitura só acontece no último passo,
> **com fallback automático** para o caminho antigo quando a tabela nova ainda não tem dados.
> Em nenhum momento mexemos nas tabelas existentes (`whatsapp_incoming_messages`, `deal_activities`).

---

## Pré-requisito: limpar o índice fantasma do git (no Windows)

Antes de qualquer commit, na sua máquina, dentro de `C:\Users\Felipe\Desktop\CRM XP\CRM-XP`:

```powershell
git status
# Se aparecer um monte de arquivo "deleted" no stage (resíduo da corrupção do índice):
git reset            # desfaz o stage; NÃO use git commit -a
git status           # deve voltar limpo, refletindo só o que você realmente mudar
```

Aplique cada passo abaixo em um commit separado, rodando a verificação antes de seguir.

---

## Passo 1 — Migração: tabela achatada + índices (risco ~zero, só adiciona)

Crie `supabase/migrations/202606040001_whatsapp_monitor_messages.sql`:

```sql
-- Tabela de leitura desnormalizada do monitor de WhatsApp.
-- Cada linha é uma mensagem JÁ RESOLVIDA (remetente, foto, lado), pronta para exibir.
-- Populada na escrita (webhook + envio de resposta). Espelho de leitura — nunca a verdade canônica.
create table if not exists public.whatsapp_monitor_messages (
  id                uuid primary key default gen_random_uuid(),
  deal_id           uuid not null,
  message_id        varchar(200) not null,
  remote_jid        varchar(200),
  instance_name     varchar(100),
  direction         varchar(10) not null,          -- 'INBOUND' | 'OUTBOUND'
  from_me           boolean not null default false,
  sender_name       varchar(200),
  sender_jid        varchar(200),
  sender_pic_url    text,
  content           text not null default '',
  media_json        jsonb,                          -- mídia/contato já extraídos (ou null)
  source            varchar(20) not null,           -- 'incoming' | 'activity'
  created_at        timestamptz not null default now(),
  -- idempotência: a mesma mensagem (mesma fonte) nunca duplica
  constraint uq_wmm_deal_msg_source unique (deal_id, message_id, source)
);

-- Leitura do detalhe da conversa: filtra por deal_id e ordena por created_at desc.
create index if not exists idx_wmm_deal_created
  on public.whatsapp_monitor_messages (deal_id, created_at desc, id desc);
```

> Se o projeto roda migrações por `apps/api/src/db/migrations.ts` (e não só pelo Supabase),
> replique o mesmo `CREATE TABLE`/`CREATE INDEX` lá, dentro de um bloco
> `CREATE TABLE IF NOT EXISTS ... / CREATE INDEX IF NOT EXISTS ...`, para que rode no deploy.

**Verificação Passo 1:** rodar a migração e confirmar que a tabela e o índice existem
(`\d whatsapp_monitor_messages`). Nada mais muda. Deploy seguro sozinho.

---

## Passo 2 — Popular na escrita (o trabalho pesado sai da leitura)

Crie um helper único e chame nos pontos onde a mensagem já é gravada hoje.

### 2a. Helper — `apps/api/src/modules/whatsapp/whatsappMonitorMessages.ts` (novo arquivo)

```ts
import { pool } from "../../db/client.js"; // pool principal: a escrita do webhook NÃO usa o pool isolado de leitura

export interface MonitorMessageInput {
  dealId: string;
  messageId: string;
  remoteJid: string | null;
  instanceName: string | null;
  fromMe: boolean;
  senderName: string | null;
  senderJid: string | null;
  senderPicUrl: string | null;
  content: string;
  mediaJson: unknown | null;
  source: "incoming" | "activity";
  createdAt: Date | string;
}

/**
 * Grava (ou atualiza) a linha achatada de leitura. Idempotente por (deal_id, message_id, source).
 * Best-effort: NUNCA deve derrubar o fluxo do webhook se falhar.
 */
export async function recordMonitorMessage(input: MonitorMessageInput): Promise<void> {
  try {
    await pool.query(
      `
      INSERT INTO whatsapp_monitor_messages (
        deal_id, message_id, remote_jid, instance_name, direction, from_me,
        sender_name, sender_jid, sender_pic_url, content, media_json, source, created_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13)
      ON CONFLICT (deal_id, message_id, source) DO UPDATE SET
        content        = EXCLUDED.content,
        sender_name    = COALESCE(EXCLUDED.sender_name, whatsapp_monitor_messages.sender_name),
        sender_pic_url = COALESCE(EXCLUDED.sender_pic_url, whatsapp_monitor_messages.sender_pic_url),
        media_json     = COALESCE(EXCLUDED.media_json, whatsapp_monitor_messages.media_json),
        from_me        = EXCLUDED.from_me
      `,
      [
        input.dealId,
        input.messageId,
        input.remoteJid,
        input.instanceName,
        input.fromMe ? "OUTBOUND" : "INBOUND",
        input.fromMe,
        input.senderName,
        input.senderJid,
        input.senderPicUrl,
        input.content ?? "",
        input.mediaJson ? JSON.stringify(input.mediaJson) : null,
        input.source,
        input.createdAt,
      ],
    );
  } catch (err) {
    // best-effort: loga e segue. A verdade continua em whatsapp_incoming_messages/deal_activities.
    console.error("recordMonitorMessage falhou (ignorado):", (err as Error).message);
  }
}
```

### 2b. Chamar no webhook — `evolutionWebhook.ts`

No webhook, a mensagem é gravada em `whatsapp_incoming_messages` (linha ~601) e logo depois o
`deal_id` é resolvido no bloco `dealMatch`. **Depois que o `deal_id` estiver resolvido**, adicione:

```ts
// depois de obter o dealId do dealMatch (ex.: const dealId = dealMatch.rows[0]?.id)
if (dealId) {
  await recordMonitorMessage({
    dealId,
    messageId,
    remoteJid: resolvedRemoteJid,
    instanceName,
    fromMe: isFromMe,
    senderName: activitySenderName ?? senderName,
    senderJid: activitySenderJid,
    senderPicUrl: senderProfilePictureUrl,
    content: messageContent,
    mediaJson: media ?? null,
    source: "incoming",
    createdAt: context.createdAt,
  });
}
```

> Use exatamente as variáveis que já existem nesse escopo (vistas no INSERT atual:
> `resolvedRemoteJid, instanceName, isFromMe, activitySenderName, senderName, activitySenderJid,`
> `senderProfilePictureUrl, messageContent, media, messageId, context.createdAt`). Não invente nomes.

### 2c. Chamar no envio de resposta — `sendWhatsappMonitorReply` / `sendWhatsappMonitorMediaReply`

Onde a resposta enviada é registrada como `deal_activity` (WHATSAPP_SENT), chame o helper com
`source: "activity"`, `fromMe: true`, `dealId` da conversa, `content` do texto enviado e o
`messageId` do provedor. Assim a mensagem enviada também aparece instantaneamente.

**Verificação Passo 2:** mande uma mensagem de teste para uma instância e confira:
`SELECT * FROM whatsapp_monitor_messages ORDER BY created_at DESC LIMIT 5;`
A linha deve aparecer com remetente/lado corretos. **A leitura ainda usa o caminho antigo** —
nada quebrou; só passamos a alimentar a tabela nova em paralelo.

---

## Passo 3 — Backfill do histórico (uma vez)

Crie `apps/api/src/scripts/backfillMonitorMessages.ts` para popular a tabela nova a partir do que
já existe. Faça em lotes por `deal_id`, reaproveitando a MESMA resolução que o read faz hoje
(remetente via `whatsapp_participant_profiles`, lado via `from_me`). Esqueleto:

```ts
// 1) para cada deal com mensagens, ler de whatsapp_incoming_messages + deal_activities
// 2) montar MonitorMessageInput por mensagem (mesma lógica do getWhatsappMonitorConversation)
// 3) recordMonitorMessage(...) em lote
// Rodar UMA vez: npm run script -- backfillMonitorMessages   (idempotente: pode rodar de novo)
```

**Verificação Passo 3:** comparar contagem por conversa entre a tabela nova e a leitura antiga em
3–5 conversas conhecidas. Bater o número e o conteúdo das últimas mensagens.

---

## Passo 4 — Trocar a leitura, COM fallback (a parte que deixa instantâneo)

Em `getWhatsappMonitorConversation` (`whatsappMonitorService.ts`), antes do bloco pesado atual,
tente a leitura rápida na tabela nova; se vier vazia, **cai no caminho antigo** (que continua
intacto no arquivo). Controle por env para poder desligar sem deploy:

```ts
// nova leitura rápida
if (process.env.WHATSAPP_FAST_READ !== "off") {
  const fast = await pool.query(
    `
    SELECT id, message_id, direction, from_me, sender_name, sender_jid,
           sender_pic_url, content, media_json, created_at
    FROM whatsapp_monitor_messages
    WHERE deal_id = ANY($1::uuid[])
      AND created_at >= NOW() - (${WHATSAPP_MONITOR_HISTORY_DAYS} * INTERVAL '1 day')
    ORDER BY created_at DESC, id DESC
    LIMIT $2
    `,
    [linkedDealIds, messageLimit + 1],
  );

  if (fast.rows.length > 0) {
    // mapear fast.rows -> WhatsappMonitorMessage (mesma forma que o front já espera),
    // montar pageInfo (cursor por created_at/id) e RETORNAR aqui.
    // ... return { ...conversation, messages, pageInfo };
  }
  // se vazio: segue para o caminho antigo abaixo (fallback automático)
}

// ... (todo o código pesado atual permanece como está, como fallback) ...
```

> Mantenha a paginação por cursor `(created_at, id)` — já existe a infra `messageCursorFor` etc.
> A nova query usa o índice `idx_wmm_deal_created`, então é range scan puro: milissegundos.

**Verificação Passo 4 (gate final):**
1. Build + testes do backend passam no Windows (`npm run build:legacy-api`, vitest do whatsapp).
2. Abrir 3 conversas no app: carregam rápido, mensagens corretas, ordem certa, paginação (scroll
   pra cima) funciona.
3. Mandar uma mensagem nova: aparece (com o polling atual de 8s — vira <1s na Fase 3).
4. Se algo divergir: `WHATSAPP_FAST_READ=off` no EasyPanel e redeploy → volta 100% ao
   comportamento antigo, sem reverter código.

---

## Sequência de commits (no Windows, um por vez)

```
git reset                              # limpar índice fantasma primeiro
# Passo 1
git add supabase/migrations/202606040001_whatsapp_monitor_messages.sql apps/api/src/db/migrations.ts
git commit -m "feat(wa): tabela de leitura desnormalizada whatsapp_monitor_messages (Fase 2.1)"
# Passo 2
git add apps/api/src/modules/whatsapp/whatsappMonitorMessages.ts apps/api/src/modules/whatsapp/evolutionWebhook.ts apps/api/src/modules/whatsapp/whatsappMonitorService.ts
git commit -m "feat(wa): popular whatsapp_monitor_messages na escrita (Fase 2.2)"
# Passo 3
git add apps/api/src/scripts/backfillMonitorMessages.ts
git commit -m "chore(wa): script de backfill do monitor (Fase 2.3)"
# Passo 4
git add apps/api/src/modules/whatsapp/whatsappMonitorService.ts
git commit -m "feat(wa): leitura rápida com fallback via WHATSAPP_FAST_READ (Fase 2.4)"
git push
```

Deploy nesta ordem: 1 e 2 podem ir juntos (não mudam a leitura). Rode o backfill (passo 3) em
produção. Só então faça o deploy do passo 4. Mantenha `WHATSAPP_FAST_READ` como interruptor.

---

## Depois (Fase 3 — "live" de verdade)

Com a leitura barata, troque o polling por **push SSE**: endpoint `/api/whatsapp-monitor/stream`
que o front assina; no `recordMonitorMessage` (passo 2), publique a mensagem nova num canal Redis;
o servidor empurra pro navegador. O front para de fazer polling → mensagem em <1s e **a VPS alivia**
(fim do martelo de queries a cada 8s). É uma adição pequena depois que a Fase 2 estiver de pé.

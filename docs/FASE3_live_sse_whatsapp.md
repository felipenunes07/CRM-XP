# Fase 3 — "Live" de verdade via SSE (push backend → navegador)

> Objetivo: a mensagem nova aparece na tela do atendente em **<1s, sem polling**. O front para de
> bater de 8 em 8 segundos na API → a **VPS alivia**. É o último pedaço do "igual Chatwoot".
>
> **Pré-requisitos já prontos:** Fase 1 (pool isolado) e Fase 2 (tabela achatada + `recordMonitorMessage`).
> A Fase 3 só **adiciona** um canal de eventos e um endpoint de stream; não muda a leitura nem a escrita.
> Se algo der errado, o polling continua funcionando como rede de segurança (mantemos os dois durante a transição).

---

## Arquitetura (simples e barata)

```
webhook/resposta → recordMonitorMessage()  ──emite──▶  bus de eventos (in-process)
                                                            │
navegador  ──EventSource (SSE)──▶  GET /api/whatsapp-monitor/stream  ──push──▶  navegador
```

Usamos um **EventEmitter em processo** (sem dependência nova). O webhook do Evolution roda no mesmo
processo da API, então quem grava a mensagem e quem mantém o SSE estão no mesmo lugar — funciona para
o deploy atual (1 instância de API no EasyPanel). *Escalar para várias instâncias → trocar o emitter
por Redis pub/sub (nota no fim).*

---

## Passo 1 — Bus de eventos

#### [NOVO] `apps/api/src/modules/whatsapp/whatsappMonitorBus.ts`

```ts
import { EventEmitter } from "events";

export interface MonitorStreamMessage {
  dealId: string;
  messageId: string;
  direction: "INBOUND" | "OUTBOUND";
  fromMe: boolean;
  senderName: string | null;
  content: string;
  createdAt: string; // ISO
}

const bus = new EventEmitter();
bus.setMaxListeners(0); // muitos atendentes conectados ao mesmo tempo

const CHANNEL = "wa-monitor-message";

export function publishMonitorMessage(msg: MonitorStreamMessage): void {
  bus.emit(CHANNEL, msg);
}

export function subscribeMonitorMessages(handler: (msg: MonitorStreamMessage) => void): () => void {
  bus.on(CHANNEL, handler);
  return () => bus.off(CHANNEL, handler); // função de cleanup
}
```

---

## Passo 2 — Emitir quando a mensagem é gravada

No helper da Fase 2, `apps/api/src/modules/whatsapp/whatsappMonitorMessages.ts`, **depois do INSERT
ter sucesso** (dentro do `try`, após o `await pool.query(...)`), publique no bus:

```ts
import { publishMonitorMessage } from "./whatsappMonitorBus.js";

// ... dentro de recordMonitorMessage, logo após o await pool.query(...):
publishMonitorMessage({
  dealId: input.dealId,
  messageId: input.messageId,
  direction: input.fromMe ? "OUTBOUND" : "INBOUND",
  fromMe: input.fromMe,
  senderName: input.senderName,
  content: input.content ?? "",
  createdAt: typeof input.createdAt === "string" ? input.createdAt : new Date(input.createdAt).toISOString(),
});
```

> Como o `recordMonitorMessage` já é chamado no webhook (entrada) e no envio de resposta (saída),
> os dois lados disparam o push automaticamente. Zero mudança nos call sites.

---

## Passo 3 — Endpoint SSE (com a pegadinha do auth)

**Atenção:** em `app.ts` existe `app.use("/api", requireAuth)` (linha ~636), e o `requireAuth` lê o
token do header `Authorization`. O **EventSource do navegador não consegue mandar header** → o token
vai por **query string**. Por isso o endpoint de stream precisa ser registrado **ANTES** daquele
`app.use("/api", requireAuth)` e fazer a verificação do token manualmente.

#### [MODIFY] `apps/api/src/app.ts` — registrar ANTES da linha `app.use("/api", requireAuth)`:

```ts
import { verifyToken } from "./modules/platform/authService.js";
import { subscribeMonitorMessages } from "./modules/whatsapp/whatsappMonitorBus.js";

// >>> registrar ANTES de app.use("/api", requireAuth) <<<
app.get("/api/whatsapp-monitor/stream", async (request, response) => {
  // auth via query (EventSource não envia header)
  const token = typeof request.query.token === "string" ? request.query.token : "";
  let user;
  try {
    user = await verifyToken(token);
  } catch {
    response.status(401).end();
    return;
  }

  // cabeçalhos SSE
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // evita buffering em proxy (EasyPanel/Nginx)
  });
  response.write(`event: ready\ndata: "ok"\n\n`);

  // (opcional) filtrar por acesso do SELLER às instâncias — se quiser, faça aqui usando `user`.
  const unsubscribe = subscribeMonitorMessages((msg) => {
    response.write(`data: ${JSON.stringify(msg)}\n\n`);
  });

  // heartbeat: mantém a conexão viva atrás de proxy
  const heartbeat = setInterval(() => response.write(`: ping\n\n`), 25_000);

  request.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    response.end();
  });
});
```

> Segurança: o exemplo acima entrega todas as mensagens a qualquer usuário autenticado. Se você tem
> SELLERs que só podem ver as próprias instâncias, filtre dentro do `subscribeMonitorMessages`
> (compare `msg.dealId`/instância com o que o `user` pode acessar) antes do `response.write`.

**Verificação Passo 3:** com o backend rodando, abra (logado) no navegador o DevTools → Network e
acesse `…/api/whatsapp-monitor/stream?token=SEU_TOKEN`. Deve ficar "pendente" (streaming) e mandar
uma mensagem real deve empurrar uma linha `data: {...}`.

---

## Passo 4 — Frontend: assinar o stream e desligar o martelo do polling

Em `apps/web/src/pages/MessagesPage.tsx`:

```ts
// 1) abrir o EventSource uma vez (quando há token). Use a base URL do backend (a mesma do api.ts).
useEffect(() => {
  if (!token) return;
  const base = API_BASE_URL; // a mesma constante usada no api.ts
  const es = new EventSource(`${base}/api/whatsapp-monitor/stream?token=${encodeURIComponent(token)}`);

  es.onmessage = (ev) => {
    const msg = JSON.parse(ev.data) as { dealId: string; messageId: string; direction: string; fromMe: boolean; senderName: string | null; content: string; createdAt: string; };

    // se for da conversa aberta → anexar na thread (mesmo formato que o detalhe já usa)
    if (msg.dealId === selectedConversationIdRef.current) {
      queryClient.setQueryData(["whatsapp-monitor-conversation", msg.dealId], (old: any) => appendMessage(old, msg));
    }
    // sempre → subir a conversa no topo da lista
    queryClient.invalidateQueries({ queryKey: ["whatsapp-monitor-conversations"] });
  };

  es.onerror = () => { /* EventSource reconecta sozinho; deixar o polling como rede de segurança */ };
  return () => es.close();
}, [token]);
```

E **aumente bastante os intervalos de polling** (rede de segurança, não mais a fonte primária) — em
`MessagesPage.tsx`, troque:

```ts
const CONVERSATION_REFRESH_MS = 20000;  // → 120000 (2 min)
const CHAT_REFRESH_MS = 8000;           // → 60000  (1 min)
```

> Resultado: o push do SSE faz a mensagem aparecer em <1s; o polling lento só cobre um eventual
> buraco de reconexão. A carga no banco cai drasticamente (era o que sobrecarregava a VPS).

**Verificação Passo 4 (gate final):**
1. Dois navegadores logados, mesma conversa aberta. Mandar mensagem no WhatsApp → aparece nos dois
   em ~1s, sem refresh.
2. Network: confirmar que as chamadas repetidas a `/conversations/:id` praticamente sumiram (só o
   heartbeat do stream fica aberto).
3. Derrubar/reabrir a aba: o EventSource reconecta; mensagens continuam chegando.

---

## Sequência de commits (no Windows)

```
git reset    # se aparecer "deletados" fantasmas no stage
# Passo 1+2 (bus + emissão)
git add apps/api/src/modules/whatsapp/whatsappMonitorBus.ts apps/api/src/modules/whatsapp/whatsappMonitorMessages.ts
git commit -m "feat(wa): bus de eventos + emissão de mensagens (Fase 3.1)"
# Passo 3 (endpoint SSE)
git add apps/api/src/app.ts
git commit -m "feat(wa): endpoint SSE /whatsapp-monitor/stream (Fase 3.2)"
# Passo 4 (front)
git add apps/web/src/pages/MessagesPage.tsx
git commit -m "feat(wa): assinar SSE e reduzir polling no MessagesPage (Fase 3.3)"
git push
```

Deploy: backend primeiro (EasyPanel) e front depois (Vercel). Sem migração, sem backfill —
é só código.

---

## Nota: escalar para várias instâncias de API

O EventEmitter funciona com **1 processo de API**. Se um dia rodar 2+ instâncias atrás de load
balancer, uma mensagem recebida na instância A não chega ao SSE aberto na instância B. Solução:
trocar o `publish/subscribe` do bus por **Redis pub/sub** (você já tem o `redis` em `db/client.js`):
`publish` faz `redis.publish(CHANNEL, json)`, e o stream usa uma **conexão Redis dedicada** em modo
`subscribe`. A interface `whatsappMonitorBus.ts` continua a mesma — só a implementação interna muda,
então o resto do código (passos 2, 3, 4) não precisa de alteração.
```

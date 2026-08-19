# Painel executivo ao vivo

Como a venda sai da Olist e chega na TV (`/relatorio-executivo`) em segundos.

## Cadeia

```
Venda lancada na Olist/Tiny
   │
   ├── sync agendada a cada 1min                       ──▶ runPrimarySync            ATIVO hoje
   ├── n8n grava no Supabase → NOTIFY crm_sales_changed ──▶ runPrimarySync            ATIVO hoje
   └── webhook da Olist                                ──▶ POST /api/webhooks/olist   ver secao 2
                                             │
                            grava em sales_raw, limpa os caches
                                             │
                            publishExecutiveDashboardUpdate (Redis pub/sub)
                                             │
                     GET /api/dashboard/executive/stream  ──SSE──▶  TV refaz a consulta
```

**Estado atual:** a conta Olist da XP nao tem a extensao **Webhooks** — em
Configuracoes > Configuracoes de API so aparecem os toggles de Estoque API. O
codigo do webhook esta pronto e testado; basta contratar a extensao e preencher
a URL para o painel cair de ~1min para ~2s. Ate la, quem manda a venda para a TV
e a varredura de 1 minuto.

Os tres caminhos convivem: qualquer um deles que traga venda nova limpa os
caches e acorda a TV pelo mesmo canal SSE.

## Latencia esperada

| Cenario | Venda na TV |
|---|---|
| Antes deste trabalho | 3 a 8 min |
| Hoje (sync 1min + SSE) | ~30 a 70s |
| Com a extensao Webhooks contratada | ~2 a 5s |

## 1. Definir o segredo do webhook (quando a extensao existir)

A Tiny nao assina o payload, entao o segredo vai na URL. Gere um valor longo:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

No EasyPanel, no servico da API:

```env
OLIST_WEBHOOK_TOKEN=cole-o-valor-gerado-aqui
```

Redeploy da API. Sem essa variavel o endpoint responde 401 e o webhook fica
desligado — de proposito.

## 2. Configurar o webhook na Olist/Tiny

Existem dois webhooks diferentes na Olist. Verificado em 2026-08-19 na conta da
XP: a extensao Webhooks (Opcao B) **nao esta contratada** — em **Configurações →
Outras configurações → Configurações de API** so existem os toggles de Estoque
API. A Opcao A esta disponivel e nao custa nada.

### Opcao A — webhook da integracao (gratis, ja disponivel)

Nao precisa de extensao. Vale para pedidos vinculados a integracao:

1. **Início → Integrações → Integração com API do ERP → gerenciar**
2. Aba **Notificações → Urls de notificações**
3. No campo **URL para envio de alteração na situação de pedidos**, informe a URL
   abaixo e salve.

Este webhook manda `tipo: "situacao_pedido"` e o id do pedido em
`dados.idVendaTiny` (nao em `dados.id`). O receptor aceita os dois formatos.

Limite conhecido: ele dispara na **mudanca de situacao** de pedidos ligados a
essa integracao. Venda lancada a mao no ERP pelas vendedoras pode nao disparar —
so o teste em producao confirma. A varredura de 1 minuto cobre o que ele deixar
passar.

### Opcao B — extensao Webhooks (paga, cobre a conta inteira)

Ativada em **Início → Loja de extensões**, pesquisando "Webhook". Cobre pedidos
criados a mao no ERP, que e o caso da XP.

1. No Tiny: **Menu → Configurações → aba Geral → Outras configurações → Webhooks**
2. Ative **Receber notificações de vendas**
3. Em **URL da notificação de pedidos**, informe:

```text
https://xpcrm-crm-backend.f0dgeg.easypanel.host/api/webhooks/olist?token=SEU_TOKEN
```

4. Salve.

O CRM responde HTTP 200 sempre — inclusive para eventos que nao interessam
(estoque, nota fiscal). Isso e proposital: qualquer outra resposta faz a Olist
reenviar o mesmo evento ate 10 vezes, com atraso progressivo de 5 minutos.

## 3. Conferir

```bash
curl -i -X POST "https://xpcrm-crm-backend.f0dgeg.easypanel.host/api/webhooks/olist?token=SEU_TOKEN" -H "Content-Type: application/json" -d '{"tipo":"inclusao_pedido","dados":{"id":0}}'
```

Esperado: `200` com `{"received":true,"processed":false,"reason":"missing-order-id"}`
(o id 0 e invalido de proposito, so testa a autenticacao). Com token errado: `401`.

Para ver o canal ao vivo:

```bash
curl -N "https://xpcrm-crm-backend.f0dgeg.easypanel.host/api/dashboard/executive/stream"
```

Deve abrir e ficar parado, imprimindo `event: ready` e depois `: ping` a cada 25s.

Na TV, o badge do canto passa a mostrar **AO VIVO** quando o SSE esta conectado,
e volta para **ATUALIZA SOZINHO / 5min** se a conexao cair.

## Custo de API

A sync incremental guarda em `olist_order_summaries` o resumo (situacao, valor,
data) que `pedidos.pesquisa` ja devolve, e so gasta um `pedidos.obter` quando o
resumo muda. Antes: ~78 chamadas por ciclo (2 dias de pedidos, todos rebaixados).
Depois: as paginas de busca mais os pedidos que realmente mudaram.

Limite da API 2.0 por conta, conforme o plano: 60/min (Básico, Crescer),
120/min (Essencial, Evoluir), 240/min (Grande, Potencializar). O
`OlistRateLimiter` le o header `x-limit-api` e se ajusta sozinho.

Pedido que ficou **sem vendedora** e sempre reprocessado, mesmo com o resumo
igual, para o ranking se corrigir quando o vinculo do cliente aparecer.

Rodando de minuto em minuto, a maioria dos ciclos nao traz venda nenhuma. Por
isso `completeSync` so paga `refreshDashboardDailyMetrics` (agregacao pesada
sobre orders/customers) e so acorda a TV quando alguma linha entrou de verdade.

## Limites da janela de sync

`shouldRunPeriodicSync` so roda **seg–sex 8h–18h e sáb 9h–13h**; domingo nunca.
Venda fora dessa janela so aparece na proxima. Se a TV ficar ligada alem desse
horario, ajuste `shouldRunPeriodicSync` em
`apps/api/src/modules/platform/syncService.ts`.

O webhook, quando existir, nao respeita essa janela — venda fora do horario
aparece na hora.

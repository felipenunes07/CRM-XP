# Correção do Monitor de WhatsApp — 2026-06-03

## Sintomas relatados
1. Abrir uma conversa demora ~3 min ou não abre.
2. "Nenhuma conversa encontrada" / thread vazia (mistura de LID com JID).
3. Muitos clientes com a foto errada (foto da vendedora/instância no cliente).

## Causa raiz
1. **Lentidão:** `getWhatsappMonitorConversation` chama `getLinkedWhatsappConversationDealIds`
   em toda abertura. A query usava `WHERE d.id = $1 OR (...)`. O `OR` com a PK
   força varredura sequencial da tabela `deals` inteira + LATERAL por linha.
   Escala com o volume (cresceu muito com a importação). A lista já tinha sido
   otimizada antes; esse caminho do detalhe ficou de fora.
   - Agravante: o pool (`db/client.ts`) não tem `statement_timeout`, então a query
     lenta fica pendurada e o front fica "abrindo" pra sempre.
2. **Mensagens vazias:** o commit `6ccadc1` (perf) removeu o matching por
   `raw_payload`. Agora a busca de mensagens só casa por `remote_jid`/`participant_jid`,
   o que depende da tabela `whatsapp_jid_aliases` estar populada (LID↔telefone).
   A migração de reparo que roda no startup (`migrations.ts`, última) só cobre
   **3 dias** (`INTERVAL '3 days'`), mas o monitor lê **90 dias** → conversas mais
   antigas que 3 dias ficam sem alias e voltam vazias.
3. **Foto errada:** `resolveWhatsappMessageMetadata` busca a foto pelo `remoteJid`.
   Quando o `remoteJid` é um `@lid` não resolvido, a Evolution devolve a foto do
   DONO da instância (a vendedora), que era gravada no perfil do cliente.

## O que foi alterado (código)
- `apps/api/src/modules/whatsapp/whatsappMonitorService.ts`
  `getLinkedWhatsappConversationDealIds` reescrita: expande os aliases num CTE
  (lookup indexado em `whatsapp_jid_aliases`) e casa `deals.whatsapp_jid` por
  semi-join indexado (`idx_deals_whatsapp_jid`), sem `OR` com a PK e sem LATERAL
  por linha. Mesmo resultado, sem varrer a tabela toda. (A raiz já entra garantida
  pelo guard em JS.)
- `apps/api/src/modules/whatsapp/evolutionMetadataService.ts`
  Novo `getInstanceOwnAvatarUrl` + `sanitizePicture`: nunca grava uma foto igual
  ao avatar da própria instância (vendedora) no cliente.
- `apps/api/src/scripts/repairWhatsappIdentity.ts` (NOVO) + script npm
  `repair:whatsapp-identity`: reparo idempotente sobre janela configurável
  (default 90 dias): backfill de aliases LID↔telefone, conversão de deals @lid
  para o JID de telefone, e limpeza das fotos da vendedora em chat/participant
  profiles. NÃO roda no startup (pra não travar o boot).

## Passos de deploy
1. Rebuild da API: `npm run build:legacy-api` (ou `tsc -p apps/api/tsconfig.json`).
   Obs.: o `tsc` emite mesmo com warnings de tipo pré-existentes do projeto.
2. Redeploy da API (EasyPanel) — produção roda `node dist/server.js`.
3. Rodar UMA vez, em horário de baixo movimento:
   `npm run repair:whatsapp-identity -w @olist-crm/api`        (90 dias)
   ou `npm run repair:whatsapp-identity -w @olist-crm/api -- 120`  (janela custom)
   O script imprime contadores antes/depois (lid_deals, numeric_names,
   seller_avatar_profiles).

## Opcional recomendado
- Considerar elevar o reparo automático do startup de 3 → 90 dias, OU manter o
  reparo só via script manual (mais seguro pro boot).
- Considerar um `statement_timeout` no pool de leitura do monitor (ex.: 15s) como
  rede de segurança contra travas futuras.

## Nota de integridade de arquivos
Durante a sessão, 3 arquivos apresentaram corrupção de gravação (bytes NUL /
truncamento): `whatsappMonitorService.ts`, `evolutionMetadataService.ts` e
`apps/api/package.json`. Foram reconstruídos a partir da versão commitada (HEAD)
+ os ajustes acima, e validados (JSON válido, 0 bytes NUL, `tsc` sem erros novos).
Backup do estado anterior em `outputs/corrupted_backup_2026-06-03/`.

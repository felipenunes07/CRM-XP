# Trocas: fábrica, créditos, entrega e encerramento

Continuação do recebimento/triagem publicado no PR93. A operação permanece em **Trocas**, `/trocas`; **Envios de fábrica** reúne remessas de vários clientes. Não há importação automática do histórico das planilhas.

## Operação

1. Concluir a triagem e definir responsável/prazo. O protocolo continua na fila aberta até o encerramento integral. A fila mostra pendências de fábrica, créditos, atendimento e peças.
2. Em **Envios de fábrica → Novo envio**, selecionar as quantidades e informar fábrica, saída, prazo, transportador e comprovante único. Os itens precisam estar encaminhados para análise externa e ter a mesma fábrica. A relação é fechada ao registrar a saída; complementos são novos envios. Imprimir a relação conserva cliente/protocolo de cada linha.
3. Abrir o protocolo para registrar pareceres parciais: quantidade, aprovação/recusa, documento, texto original e tradução conferida. Uma quantidade aprovada escolhe **uma** compensação da fábrica: substituta, crédito ou ausência de compensação autorizada. A quantidade restante permanece pendente.
4. Registrar separadamente o que foi recebido: original, substituta, retenção definitiva na fábrica ou substituta separada do estoque XP. A original e a substituta são peças distintas. Retenção definitiva exige autorização; uma peça apenas aguardando retorno não deve ser marcada como retida definitivamente.
5. Em **Acerto e créditos**, definir o atendimento de cada quantidade decidida: crédito, substituta, devolução da original ou ausência de obrigação autorizada. A soma nunca pode exceder a decisão de origem. Para crédito/reposição de uma recusa, exige-se referência de autorização da gestão. Crédito antecipado sem decisão técnica não é automatizado.
6. O financeiro registra **crédito autorizado**, com valor total, moeda, base de preço e aprovação. Depois de efetivar a operação no sistema financeiro oficial, usa **Confirmar lançamento**, informando sistema, referência única e data. Crédito do cliente é em BRL; ressarcimento de fornecedor aceita BRL/USD/CNY. Moedas não são somadas entre si.
7. Em **Contato e entrega**, registrar apenas a comunicação realmente realizada. Preparar/imprimir um resumo não marca envio de mensagem. Retirada exige retirante e comprovante. Despacho exige rastreio e continua aberto até a confirmação do recebimento. Entregas parciais preservam o restante.
8. Em **Destino e encerramento**, encaminhar as peças retidas a reparo/outlet/estoque/China/descarte, registrando quantidade, origem/destino, custodiante, teste/condição e documento. O encaminhamento permanece pendente até a confirmação da conclusão com recebedor e comprovante. Entrada em estoque exige o registro oficial correspondente; este módulo não cria estoque vendável.
9. Resolver revisões/divergências, conferir os três resumos e **Encerrar protocolo**. O servidor confere todas as obrigações; não existe opção para ignorar uma pendência. Cliente atendido e destinação interna concluída são fatos independentes.

## Créditos e correções

O financeiro atual é um snapshot importado de XLSX/Dropbox. O módulo de trocas tem seu próprio controle de autorizações e confirmações. Ele **não altera o limite de compra, o saldo importado ou linhas de pagamento do snapshot**. A confirmação documenta uma operação efetivada no sistema oficial; não envia uma ordem de crédito para um ERP.

Cada lançamento precisa de referência exclusiva, incluindo linha/parcela se o documento tiver várias operações. Não copiar o valor total do mesmo documento para vários protocolos. Referências são comparadas sem diferença de maiúsculas ou espaços nas pontas. Um lançamento já registrado não pode ser confirmado novamente, mesmo em outro protocolo ou como estorno. A impressão só consulta dados.

Autorização não lançada pode ser cancelada com motivo. Crédito lançado exige estorno efetivamente realizado, com sua própria referência e data. O valor, a origem e a referência original permanecem no histórico. Uma nova autorização pode ser registrada após a correção.

Pareceres, entradas e atendimentos incorretos têm correção com motivo; dependências precisam ser corrigidas/estornadas primeiro. Despacho ainda não recebido e encaminhamento ainda não concluído podem ser corrigidos. Recebimento do cliente e destino físico já confirmados não são apagados: abrir revisão preserva a prova anterior. Devoluções reais posteriores precisam de novo recebimento vinculado pela referência do protocolo anterior; esta entrega não inventa um movimento físico para desfazer um fato confirmado.

Depois que há movimento após a triagem, a origem técnica não pode ser alterada/removida silenciosamente. A reabertura de um protocolo encerrado exige motivo, gera revisão aberta e mantém o histórico do fechamento anterior.

## Acessos

| Permissão | Uso | Padrão |
| --- | --- | --- |
| `returns.view` | Consultar fila, protocolos, relações e anexos privados | Admin, operacional, financeiro |
| `returns.manage` | Receber, atribuir e executar triagem | Admin, operacional |
| `returns.logistics` | Fábrica, atendimento, entradas físicas, entrega, destinos, revisão e encerramento | Admin, operacional |
| `returns.finance` | Autorizar, confirmar e estornar créditos | Admin, financeiro |

Isis recebe logística individualmente, mantendo o perfil existente. Os técnicos Lorenzo, Rick e Kevin continuam com consulta/triagem, sem receber autorização financeira ou logística automaticamente. Responsáveis de financeiro podem assumir um protocolo após a triagem; somente quem pode executar triagem pode ser atribuído às fases técnicas.

## Arquitetura e decisões

O módulo de trocas é o único dono dos movimentos. Reutiliza transação, trava da remessa, versão e evento com ator autenticado em `returnTransactions.ts`. Comandos de execução têm UUID/hash e verificam reenvios antes da versão; uma resposta perdida não cria outra operação. Lotes com vários protocolos travam as remessas em ordem estável e gravam tudo na mesma transação.

O contrato está em `packages/shared/src/returns.ts`. `returnExecutionSchemas.ts` valida comandos; `returnExecutionService.ts` executa as regras; `returnExecutionData.ts` produz a projeção e a mesma conferência usada no detalhe, na fila e no fechamento sob trava. A nova migração é somente a posição105 de `db/migrations.ts`. As primeiras104 são preservadas.

Foram comparados dois desenhos independentes: alocações relacionais e uma árvore de segmentos de quantidade. O desenho de alocações foi escolhido (avaliação22/25 contra20/25): permite que parecer, dinheiro e retorno físico ocorram em momentos diferentes sem repartir uma árvore ao redor de lançamentos já feitos. Do segundo desenho foram incorporados os grupos de decisão disponíveis, compreensíveis na tela, e a identificação explícita da origem das substitutas. Não há motor genérico de workflow nem serialização artificial de cada peça.

Invariantes principais:

- Enviado por item ≤ quantidade tecnicamente encaminhada e fisicamente disponível. Pareceres de uma linha ≤ enviado.
- Retorno da original + retenção definitiva ≤ enviado. Substitutas recebidas ≤ quantidade cujo parecer promete substitutas. O mesmo parecer não promete crédito e substituta para a mesma quantidade.
- Atendimentos por decisão ≤ quantidade decidida. Entregas alocadas ≤ prometido; entregas recebidas, e não só despachadas, concluem o atendimento.
- Cada entrada de substitutas tem quantidade própria, consumida por entregas e destinos. Uma referência de estoque não cria uma fonte ilimitada.
- Encerramento exige nenhuma análise, compensação, crédito, atendimento, destino ou revisão aplicável pendente, além do contato registrado.

## Verificação reproduzível

Usar somente PostgreSQL local, banco `crm_returns_test`; os testes isolam suas tabelas no schema `returns_workflow_test` e o removem ao terminar. O teste recusa outra URL. Não apontar fixtures para produção.

```powershell
$env:RETURN_WORKFLOW_TEST_DATABASE_URL='postgresql://trocas_test@127.0.0.1:15438/crm_returns_test'
$env:DATABASE_URL=$env:RETURN_WORKFLOW_TEST_DATABASE_URL
$env:JWT_SECRET='local-test-only-secret'
$env:REDIS_URL=''
npm run build -w @olist-crm/shared
npx vitest run --exclude '**/.runtime/**' apps/api/src/modules/returns/returnService.integration.test.ts apps/api/src/modules/platform/permissionService.test.ts apps/api/src/modules/platform/authService.localToken.test.ts apps/web/src/lib/navigationPermissions.test.ts apps/web/src/lib/returnMoney.test.ts
npm run build -w @olist-crm/api
npm run build -w @olist-crm/web
```

`scripts/preview-returns.mts` aplica as migrações e inicia somente a API local, sem agendadores ou mensagens. `RETURN_PREVIEW_PORT=15441` e `WEB_ORIGIN=http://127.0.0.1:5189` configuram o piloto desta entrega. Vite usa `VITE_API_BASE_URL=http://127.0.0.1:15441`, Supabase local fictício e porta5189.

`scripts/verify-returns-complete.cjs` percorre as telas reais de duas remessas até o encerramento: lote misto, parecer parcial, compensações distintas, créditos, contato, retirada/despacho, recebimento, reparo/destino interno e impressão sem duplicidade. Recusa URLs remotas. Informe `PLAYWRIGHT_MODULE` e `RETURN_SCREENSHOT_DIR` quando necessário. Os comprovantes e valores desse teste são fictícios e ficam apenas no banco local.

Para publicar, conferir o hash das primeiras104 migrações contra a imagem em execução, guardar a imagem anterior, publicar backend/frontend, verificar migração105, login/permissões e concessão logística da Isis. A publicação não importa planilhas antigas, não envia mensagens e não efetiva operações em sistemas financeiros ou de estoque externos.

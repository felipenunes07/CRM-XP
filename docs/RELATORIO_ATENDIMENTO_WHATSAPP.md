# Relatório de atendimento no WhatsApp

O servidor da API e o worker verificam a agenda a cada 30 segundos. O envio é às
16h55 de segunda a sexta e às 12h55 aos sábados, em `America/Sao_Paulo`.
Domingo não tem envio. Há uma janela de 15 minutos para recuperar uma breve
indisponibilidade; fora dela não se envia um relatório atrasado.

Configuração do backend:

```env
WHATSAPP_ATTENDANCE_REPORT_ENABLED=true
WHATSAPP_ATTENDANCE_REPORT_GROUP_JID=<JID do grupo INT 🏆强大团队🏆 XP BRASIL>
WHATSAPP_ATTENDANCE_REPORT_INSTANCE_ID=Lili
```

A mensagem mantém os totais gerais do relatório existente. O ranking e a
vendedora mais ativa consideram apenas Thaís, Suellen, Amanda e Tamires, incluindo
as variantes dos nomes no cadastro. Não inclui a linha de atendimentos
particulares nem listas de clientes atendidos. Abaixo de clientes recuperados,
mostra o código, nome, vendedora, valor da compra e quantos dias o cliente passou
sem comprar, no mesmo formato do resumo original.
A página e os dados originais continuam iguais.

O relatório também inclui **Grupos Criados no Dia**, com nomes e horário de
criação em Brasília. A fonte é `creation` informada pelo WhatsApp em
`whatsapp_chat_profiles.raw_profile`, não a data de cadastro/importação no CRM.
Cada JID aparece uma vez, mesmo que esteja em várias instâncias. Grupos internos,
comunidades e grupos de avisos de comunidades são excluídos. Não é necessário
ter cliente cadastrado nem compra: o grupo pode ser o primeiro contato comercial.
Essa contagem é independente de clientes novos por primeira compra.

Os eventos `GROUPS_UPSERT` e `GROUP_UPDATE` mantêm esses metadados atualizados
nas instâncias operacionais da Evolution. Uma renomeação preserva a data de
criação conhecida. O watchdog mantém esses eventos habilitados junto aos eventos
de mensagens. Instâncias configuradas somente para envio continuam sem captura.

```sh
npx tsx apps/api/src/scripts/checkCreatedGroupsReport.ts --self-test
npx tsx apps/api/src/scripts/checkCreatedGroupsReport.ts 2026-11-09
```

O primeiro comando verifica o SQL de registro e consulta usando tabelas
temporárias com rollback; o segundo lê os grupos do dia sem enviar mensagens.

Clientes perdidos são clientes cuja última compra, considerando apenas pedidos
até a data do relatório, foi há **exatamente 90 dias**, na mesma data do gatilho
da última mensagem da régua da Lili. Clientes com 91 dias ou mais não entram:
a contagem é apenas das entradas do dia, sem acumular clientes antigos.
Cada cliente é contado uma vez. Quem voltou a comprar no dia não entra nessa contagem.
O cálculo independe dos alertas de saída da base enviados de manhã.

Uma trava do Postgres impede que API e worker disputem o envio. O registro em
`sync_cursors` usa `whatsapp_attendance_report:<grupo>:<data>`, com status `sending`,
`sent` ou `failed`. O registro persiste após reinícios. Se o provedor falhar ou
o processo cair durante o envio, é necessário conferir a entrega antes de
remover esse registro para tentar novamente; não há repetição automática de um
envio cujo resultado é incerto.

Validação sem enviar ao WhatsApp (na raiz do projeto, com ambiente do backend):

```sh
npx tsx apps/api/src/scripts/checkAttendanceReport.ts --self-test
npx tsx apps/api/src/scripts/checkAttendanceReport.ts 2026-11-06
npm run test -w @olist-crm/api -- src/modules/whatsapp/whatsappAttendanceReportService.test.ts
```

O primeiro comando verifica o SQL real usando uma tabela temporária e rollback.
O segundo imprime uma prévia com os dados reais. Nenhum deles envia mensagens.

## Segundo resumo: régua da Lili

Com `WHATSAPP_REACTIVATION_REPORT_ENABLED=true`, o mesmo grupo e a mesma instância
recebem outro resumo às **16h45 de segunda a sexta e às 12h45 aos sábados e domingos**.
Assim, envios da régua feitos no domingo também aparecem no resumo daquele dia.
Esse resumo tem trava e registro diário próprios, sem interferir no
relatório de atendimento.

A fonte são os destinatários das campanhas ligadas à régua `lili-inactivity-v1`,
nas etapas de 30, 60 e 90 dias. Somente envios confirmados (`SENT` com `sent_at`
no dia, horário de Brasília) entram nos clientes com mensagem enviada. As falhas
do dia aparecem em uma seção separada, sempre identificando sua etapa.
Clientes com mais de um grupo não são contados duas vezes na mesma etapa; se um
envio falhar mas outro for concluído para aquele cliente, prevalece o envio.
As respostas usam a mesma atribuição do painel de campanhas, até o horário de
geração do resumo. Ter uma resposta não equivale a uma compra.

Prévia sem enviar mensagens:

```sh
npx tsx apps/api/src/scripts/checkReactivationReport.ts 2026-11-07
```

O registro de envio fica em `sync_cursors`, com chave
`whatsapp_reactivation_report:<grupo>:<data>` e a mesma proteção contra duplicação
e resultado incerto descrita para o relatório de atendimento.

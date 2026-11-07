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
particulares nem listas de clientes. A página e os dados originais continuam iguais.

Clientes perdidos são clientes cuja última compra, considerando apenas pedidos
até a data do relatório, foi há **91 dias**: o primeiro dia acima de 90. Cada
cliente é contado uma vez. Quem voltou a comprar no dia não entra nessa contagem.
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

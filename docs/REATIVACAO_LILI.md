# Reativacao de clientes pela Lili Assistente

A regua verifica diariamente as compras validas e envia a mensagem de 30–59, 60–89 ou 90+ dias no grupo confirmado do cliente. A conta exigida e Lili Assistente, +55 11 91127-9702. O numero e o estado conectado sao conferidos na Evolution antes de criar a campanha e antes de cada envio. Os textos estao em `reactivationCore.ts` e foram transcritos do documento Disparo Clientes Inativos.

O codigo reaproveita automacoes, campanhas, fila, historico e reenvio manual do CRM. API e worker podem iniciar o agendador; uma trava PostgreSQL por automacao impede concorrencia. A atualizacao do Sheets preserva vinculos manuais. Grupos ausentes, privados ou ambiguos nao recebem mensagens automaticas.

Na reativacao, um unico grupo comercial confirmado manualmente tem prioridade sobre associacoes automaticas por nome. Dois grupos comerciais manuais continuam exigindo revisao. Grupos de pagamento, cobranca, garantia, defeitos ou desativados ficam fora desta regua; seus vinculos continuam disponiveis para outros fluxos. A mesma selecao vale para previa, criacao da campanha e revalidacao antes do envio. A importacao diaria preserva nome e codigo dos grupos revisados para que nomes antigos da planilha nao desfacam a confirmacao.

Quando um cadastro com variacao de codigo aponta para um codigo principal que ja possui grupo, a previa mostra Cadastro duplicado e o grupo encontrado. Esse diagnostico nao move compras nem habilita outro destinatario: a duplicidade continua bloqueada ate reconciliar o cadastro. Codigo e nome divergentes sao sinalizados mesmo sem grupo associado.

Correcoes de identidade revisadas ficam em `customer_identity_corrections`. A regra pode consolidar uma variacao de codigo ou separar vendas cujo nome comeca por outro codigo confirmado. A view `resolved_sales_raw` aplica essas regras sem alterar `sales_raw`, seus valores, payloads ou fingerprints. A reconstrucao considera tanto os codigos antigos quanto os corretos, inclusive quando uma nova importacao menciona somente o codigo antigo. Os itens usam a mesma origem escolhida para o total do pedido, evitando somar novamente a copia de outra origem apos consolidar codigos. Os cadastros antigos continuam disponiveis como referencia, sem compras duplicadas na regua.

Uma reparacao administrativa pode passar um `PoolClient` transacional a `rebuildReadModels` para gravar regras, cadastros, compras e grupos atomicamente. Antes de aplicar em producao, valide em transacao com rollback, confirme os grupos na Lili e confira que os totais de itens correspondem aos pedidos e que a importacao original ficou intacta.

Cada faixa usa a data da ultima compra como ciclo, sem depender do UUID de pedidos recriados. A base antiga entra apenas na faixa atual. Uma recompra reinicia o ciclo. A data atual usa America/Sao_Paulo. Pedidos futuros, cancelados, sem valor e pedidos Olist ainda nao enviados ficam fora, seguindo o criterio de vendas do CRM.

A simulacao da tela e somente leitura e nao reserva clientes. Uma execucao para aprovacao reserva os clientes ate aprovar ou rejeitar; a compra e conferida novamente ao aprovar. Clientes sem grupo ou bloqueados por contato recente continuam elegiveis depois da correcao. Falhas de envio ficam no Disparador para reenvio manual. Um envio interrompido sem confirmacao nunca e repetido automaticamente: confira a conversa antes de retentar.

As vendas precisam ter uma sincronizacao concluida nas ultimas duas horas. Destinatarios ja enfileirados aguardam a sincronizacao se ela estiver atrasada. Antes da verificacao diaria, a regua solicita uma atualizacao das vendas se necessario, mesmo fora da janela da sincronizacao periodica. O agendador importa os grupos do Sheets antes de cada faixa. Novas regras sao criadas pausadas, com verificacao diaria as 09:00 de Sao Paulo e os intervalos de envio configurados no CRM. Preparar novamente nao altera regras existentes.

## Operacao

Na tela Automacoes, o painel Proximos disparos abre automaticamente com os clientes elegiveis e atualiza a previsao a cada minuto. Os cards filtram as faixas; os controles Prontos, Pendencias e Todos separam as situacoes. A busca encontra cliente, codigo ou grupo, e Ver mensagem mostra o texto personalizado sem enviar. A tabela tem paginacao de 25 clientes e informa a proxima verificacao em horario de Sao Paulo. Acompanhar envios abre o Disparador para consultar campanhas efetivamente criadas.

Se a regua ainda nao existir, use Preparar regua 30 / 60 / 90. As novas regras ficam pausadas e podem ser ativadas individualmente na lista abaixo. Pausar uma regra tambem pausa suas campanhas pendentes; uma campanha pausada so volta pelo comando Retomar no Disparador.

Com DATABASE_URL apontando para o banco correto:

```powershell
npm run reactivation:lili -w @olist-crm/api -- prepare
npm run reactivation:lili -w @olist-crm/api -- preview --output preview.json
npm run reactivation:lili -w @olist-crm/api -- activate
npm run reactivation:lili -w @olist-crm/api -- pause
```

Preparar e simular nao enviam mensagens. Ativar agenda a proxima verificacao das 09:00, sem disparo imediato. Nao execute testes de envio usando grupos reais de clientes.

## Verificacao

```powershell
npm run build -w @olist-crm/api
npm run build -w @olist-crm/web
npx vitest run apps/api/src/modules/crm/reactivationCore.test.ts apps/api/src/modules/whatsapp/whatsappGroupCsv.test.ts
```

Os testes de integracao exigem TEST_DATABASE_URL, alem de DATABASE_URL e JWT_SECRET para carregar o ambiente. Eles clonam somente a estrutura de tabelas CRM para um schema temporario `reactivation_test_<uuid>`, usam somente esse schema no search_path, bloqueiam a rede e substituem a fila e a consulta da identidade do remetente. O schema temporario e removido no final. A URL deve apontar para PostgreSQL com a estrutura do CRM e permissao para criar e remover schemas de teste.

```powershell
npx vitest run apps/api/src/modules/crm/reactivation.integration.test.ts
```

Os cenarios cobrem faixas, personalizacao, simulacao sem efeitos, preparacao idempotente, recompra, UUIDs recriados, bloqueios, grupos ambiguos, compra antes de aprovar/enviar, concorrencia, falha de Redis, vendas atrasadas, numero incorreto, reinicio com envio incerto e execucoes atrasadas.

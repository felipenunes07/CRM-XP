# Operação de trocas por fábrica e migração

O CRM controla novos recebimentos, protocolo, triagem, encaminhamento por fábrica, parecer, compensação, custódia, crédito, entrega, recondicionamento e encerramento. A planilha do Dropbox permanece como origem de consulta até a conferência e o corte da migração. O CRM não escreve nela.

## Responsabilidades

- Isis acompanha a fila, atribui responsáveis e prazos, forma e envia lotes, confere movimentações e entregas. Não recebe autorização financeira por assumir a coordenação.
- Técnicos registram triagem, separação e reteste e concluem os trabalhos de recondicionamento atribuídos, com condição, selo e testes. Não lançam valores nem movimentam estoque.
- Financeiro autoriza valores, cancelamentos de venda, uso e estorno de créditos. A quantidade e o valor do cancelamento precisam corresponder à venda conferida.
- Administrador configura fábricas, consulta e confere a migração. Avisos usam permissão própria e remetente autorizado.

## Encaminhamento por fábrica

VV exige identificação de lote. Em formação reserva as quantidades e permite corrigir sua composição; só a confirmação da saída física libera parecer e retorno. Após a saída a relação conserva o cliente, modelo e quantidade de cada protocolo. Complementos exigem outro envio.

D.E., STC e TC-OMG começam com encaminhamento individual por protocolo. D.E. também permite agrupamento opcional, comprovado pela célula A4 “LOTE 7º” do histórico; VV exige lote. STC e TC-OMG não são tratadas como a mesma fábrica. Outras fábricas podem seguir análise interna. Fábrica, apelidos, instruções e responsável padrão ficam em **Regras por fábrica**.

J, S e Y indicam análise; não comprovam aprovação, crédito ou condição nova. Fábrica desconhecida precisa ser identificada antes de concluir a triagem. Exceção de encaminhamento exige logística, justificativa e histórico.

## Créditos e cancelamento

1. A logística define o atendimento por quantidade, respeitando a decisão técnica ou o parecer da fábrica.
2. O CRM calcula o crédito do cliente com a fórmula da planilha: média ponderada assinada das vendas do cliente e SKU, arredondada para reais inteiros; sem média utilizável, consulta o catálogo. Cancelamento usa o preço da venda original conferida. O financeiro autoriza e lança o valor. Preço inválido, catálogo ambíguo e valor unitário acima de R$ 2.500 exigem conferência, sem crédito automático. Nenhuma duração de garantia foi inventada.
3. Para operar dentro do CRM, use **Operação no CRM → Lançar crédito na carteira do CRM**. Confirme a exclusividade do lançamento durante a transição.
4. A carteira permite usar valores em documentos/acertos e estornar um uso. O saldo nunca pode ficar negativo. Estornar o crédito exige desfazer seus usos.
5. Créditos da fábrica e do cliente permanecem independentes, inclusive por moeda. O extrato conserva referências e histórico.

Créditos nativos de clientes em BRL compõem o saldo financeiro efetivo do cliente, com origem e contribuição visíveis. As linhas importadas e o limite de empréstimo permanecem preservados. Uso em documento é alocação do crédito existente e não desconta seu valor monetário uma segunda vez. Os consumidores financeiros usam a mesma projeção; conflitos impedem liberação e cobrança automática. Aplicar um crédito registra o acerto no CRM; não executa pagamento bancário ou alteração de um ERP externo.

Se um crédito for transferido ao legado, a conciliação exige lançamento importado único, do mesmo cliente, referência original do CRM, tipo de troca/defeito/cancelamento e valor positivo igual ao saldo transferido. A transferência baixa a carteira nativa. Referência também encontrada no legado bloqueia uso nativo. Divergências posteriores precisam de conferência; não criam saldo automaticamente.

Um documento DEF importado pode corresponder a vários créditos de peças. Vincule a linha de origem ao protocolo e use **Conciliar com documento importado**: o financeiro confere a identidade, cliente, tipo e valor, e o sistema limita a soma das alocações ao valor comprovado. Enquanto houver autoridade importada, o saldo nativo fica retido. Mudança na origem gera divergência. **Devolver autoridade do crédito ao CRM** exige que o documento já tenha sido retirado da origem financeira e atualizada a importação; a operação não cria outro crédito. Não há correspondência presumida por nome, data ou total.

Cancelamento de venda é separado de crédito por defeito e de estorno de crédito. Exige recuperação concluída, entrada inspecionada como nova, identificação da venda e linha, quantidade original, preço unitário e autorização. Os cancelamentos acumulados não podem ultrapassar a quantidade original. Condições 1 e 2 continuam identificadas como recondicionadas.

## Recondicionamento e estoque recuperado

Para o reteste do Rick, encaminhe para **Separação e reteste interno** e atribua técnico e prazo. O parecer indica o destino, sem fingir que a movimentação física terminou. Revenda exige recuperação antes da entrada em estoque. Encaminhe o destino para recondicionamento e atribua o trabalho a um técnico ativo. O protocolo entra em sua fila. O técnico registra condição, selo e testes, e devolve a pendência à coordenação. A logística confirma fisicamente o destino e registra a entrada do lote, com SKU e localização. Condição e selo precisam corresponder ao trabalho técnico concluído.

O estoque recuperado tem entrada, separação para substituição, devolução de separação inteira ainda não utilizada, transferência de localização e baixa justificada. Separar uma substituta gera atomicamente a entrada física no protocolo atendido. Peças já entregues ou destinadas exigem revisão e novo recebimento; o sistema não apaga uma entrega confirmada. O estoque geral importado permanece uma origem distinta; este controle é das peças recuperadas de trocas.

## Avisos e encerramento

O WhatsApp permanece sem configuração nesta implantação, por decisão do usuário; registre os contatos efetivamente realizados por telefone ou presencialmente. Quando a operação decidir habilitar o canal, prepare o aviso, confira remetente, telefone e texto, depois envie a mensagem aprovada. O CRM registra a aceitação somente com identificador do provedor. Aceitação não é comprovação de leitura ou entrega ao aparelho. Uma tentativa incerta não é repetida automaticamente: confira o provedor e registre o resultado. O registro de telefone/presencial continua disponível para contatos realizados fora do WhatsApp.

Em **Regras por fábrica → WhatsApp para avisos de trocas**, o administrador vincula o canal aprovado às pessoas que já tenham permissão de comunicação. O vínculo é específico das trocas, com justificativa e histórico. Não altera a atribuição geral do WhatsApp. Remover esse vínculo impede novas tentativas, inclusive de um aviso preparado e ainda não enviado. O remetente precisa ser definido pela operação; o sistema não escolhe automaticamente o telefone de outra pessoa.

Encerramento exige triagem, decisões, atendimento, créditos, entregas, destinos e comunicação conferidos, sem revisão aberta ou vínculo de migração divergente. Despacho sozinho não comprova recebimento do cliente.

## Consulta e migração

Origem inicial identificada: `/DEFEITOS - XP/坏品表 PLANILHA DEFEITOS 2026.xlsx`, aba DEFEITOS. O sincronizador consulta a revisão a cada dois minutos e só publica uma leitura completa validada. Falha conserva a última versão válida e mostra o erro. Linhas sem OK, valores assinados e marcações originais são preservados.

Em **Planilha e migração**, procure cliente/documento/SKU e confira cada linha. Registre no CRM o recebimento efetivamente conferido e vincule a origem; não registre novamente um caso que já tenha protocolo. Histórico encerrado ou fora do escopo pode ser excluído da migração com justificativa. O vínculo não cria crédito, estoque ou conclusão automática. Linhas idênticas bloqueiam vínculo ambíguo. Mudança ou desaparecimento de linha vinculada sinaliza conflito e impede encerramento até conferência.

Revisões, hashes e linhas conferidas ficam preservados. Linhas não conferidas de versões substituídas são cache de leitura; a versão corrente e as evidências vinculadas permanecem. Os arquivos do Dropbox não são alterados.

O administrador registra o corte somente após conferir todas as linhas e divergências e realizar uma leitura recente. Até esse momento, a origem continua disponível. O corte de trocas não muda a autoridade dos saldos de vendas importados.

## Verificação reproduzível

`returnService.integration.test.ts` usa exclusivamente PostgreSQL local `crm_returns_test`; cobre concorrência, idempotência, fábricas, carteira, estoque, permissões e provedor simulado. `returnLegacyParser.test.ts` verifica linhas não OK, sinais, identidade e erros da origem. Os scripts `verify-returns-complete.cjs` e `verify-returns-native.cjs` recusam URLs remotas e percorrem a interface com o banco isolado. O segundo prepara um aviso sem enviá-lo. Em produção, a verificação usa apenas consultas e recusas de acesso; não cria lançamentos, mercadoria ou mensagens de teste.

## Catálogo, motivos e histórico

A triagem pesquisa modelo/SKU no catálogo SISTEMA e no cadastro Modelos preservado, preenche modelo, aro e cor disponíveis, e aplica motivos padronizados. Vender de novo encaminha para revenda, embora a planilha o agrupe em Tela Nova. Evidência do cliente com defeito não reproduzido exige revisão da coordenação. Selo J/S/Y ou condição 1/2 impede classificar como nova.

A coordenação configurada recebe a triagem concluída; tarefas simultâneas permanecem nas filas dos técnicos responsáveis. A consulta de histórico conserva as abas de apoio e as extrações integrais dos arquivos CL178 e TROCAS-DEFEITOS TELAS VV. Linhas sem modelo continuam incompletas e exigem identificação; nenhum saldo, entrega ou estoque histórico é inventado.

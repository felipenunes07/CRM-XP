# Trocas: interface guiada

Atendimentos é a entrada da operação diária. Receber troca permanece visível no cabeçalho; o estado vazio explica como começar. O primeiro formulário pede cliente, quantidade e localização. Data, volumes e observações ficam em Mais detalhes do recebimento.

Cada atendimento ocupa a largura disponível e tem cinco etapas: Receber, Testar, Resolver, Entregar e Concluir. O quadro Próximo passo considera a situação real registrada: atribuição, testes, fábrica, solução, crédito, peças e recebimento do cliente. Uma peça original disponível para retirada sugere Entregar, sem obrigar a passar por reparo. As etapas não criam confirmações nem substituem os bloqueios do servidor.

Resolver reúne quatro áreas: Solução para o cliente, Fábrica, Peças e reparos e Créditos. O técnico vê os trabalhos atribuídos a ele; a coordenação acompanha os trabalhos de todos. Cálculo, carteira e conciliação ficam em Créditos; funções financeiras continuam protegidas no servidor. Documentos e opções reúne anexos, histórico e impressão.

Histórico importado e Regras e configurações ficam em Mais opções. O histórico conserva a origem e a conferência da migração, separado dos novos atendimentos. Sua presença não significa que as linhas antigas foram convertidas em protocolos ou que o corte foi realizado.

As rotas anteriores com `visao=fabricas`, `visao=saldos`, `visao=transicao`, `visao=regras` e `protocolo=` permanecem válidas. A alteração da interface preserva os lançamentos e as regras dos serviços existentes. A correção financeira da migração 111 mantém os filtros de snapshot/cliente visíveis ao planejador, preservando tipos, valores e conciliação das views anteriores.

## Verificação

- `verify-returns-guided.cjs`: primeiro uso pelo navegador, atribuição, testes, devolução da original, contato, retirada, anexo/download, impressão, encerramento e celular.
- `verify-returns-complete.cjs`: lote de clientes mistos, pareceres e entregas parciais, créditos independentes, custódia, recuperação e encerramento.
- `verify-returns-operations.cjs`: catálogo, motivo, reteste, recuperação, estoque, venda original, cálculo, carteira, conciliação e retorno da autoridade.
- `returnJourney.test.ts` e `ReturnNativePanel.test.tsx`: orientação por pendência e apresentação das tarefas conforme acesso.

Os scripts de escrita recusam URLs remotas. A conferência de produção consulta versão, telas, permissões e fontes, sem criar operações de teste.

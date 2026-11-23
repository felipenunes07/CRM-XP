# Interface de Trocas

A interface atual usa uma folha de peças por protocolo e uma tabela de responsabilidades. O desenho e as verificações estão em [Lançamento em tabela e responsabilidades](trocas-lancamento-em-tabela.md).

Recebimento, Peças e testes, Trabalhos e resolução, Entrega e Conferência final são áreas do atendimento. A fase real, a coordenação e as tarefas simultâneas aparecem acima delas. A indicação de vez própria distingue pessoa atribuída, equipe habilitada e espera externa.

Histórico importado e Regras e configurações permanecem em Mais opções. Fontes antigas não representam atendimentos novos. A conferência de migração e o corte continuam independentes da apresentação.

Rotas existentes com `visao=fabricas`, `visao=saldos`, `visao=transicao`, `visao=regras` e `protocolo=` continuam válidas. A gravação em tabela reaproveita regras de item, comandos idempotentes e bloqueio por versão, sem migração nova. WhatsApp permanece adiado.

Os quatro scripts de navegador `verify-returns-guided.cjs`, `verify-returns-complete.cjs`, `verify-returns-operations.cjs` e `verify-returns-worksheet.cjs` recusam URLs remotas e usam PostgreSQL isolado. A verificação publicada consulta telas, responsáveis e permissões sem operações fictícias.

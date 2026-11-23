# Lançamento em tabela e responsabilidades

A equipe reconhece modelo, SKU, aro, cor, quantidade e motivo como colunas do formulário anterior. Uma folha por protocolo substitui o formulário de um grupo por vez. Catálogo preenche identificação; diagnóstico, evidência e autorização continuam explícitos. Resultado final é o confirmado pelo servidor.

A fila continua paginada por protocolo. “Protocolos que acompanho” identifica o filtro existente; não representa uma lista global de ações pessoais. Cada linha e cada atendimento exibem as mesmas responsabilidades derivadas: pessoa atribuída, equipe habilitada, espera externa ou atribuição pendente. Trabalhos técnicos, fábrica e financeiro coexistem. Os separadores da tela são áreas de consulta; a fase real e a vez de cada pessoa aparecem separadamente.

Uso: abrir protocolo, preencher várias linhas, salvar alterações, conferir o resultado e concluir os testes. A conclusão já devolve o acompanhamento à coordenação configurada. Abrir uma tarefa leva à área correspondente e conserva as demais pendências visíveis.

Contratos: `ReturnItemSheetInput` transporta um comando com versão e alterações `add/update/remove`; novas linhas recebem UUID estável. `ReturnWork` é leitura de coordenação, jobs, lotes e obrigações existentes. `ReturnTask.target` identifica área e entidade, sem carregar comandos financeiros ou autorizações.

O comando da folha usa `return_commands`, bloqueia request antes do protocolo, valida a quantidade final e aplica as regras comuns de item dentro de uma transação. Um erro reverte o conjunto. Repetição do mesmo comando confirma a gravação sem duplicar. Endpoints individuais permanecem compatíveis e compartilham o escritor. Anexos mantêm seu comando próprio.

O rascunho é separado por usuário/protocolo na sessão da aba. Resposta perdida mantém o comando imutável para verificação; conflito conserva as linhas e exige conferência com a versão atual. A conclusão dos testes exige folha salva.

Escolha de desenho: folha por protocolo (candidato A), com alvos estruturados e bloqueios explícitos do candidato B. Ambos preservam os mesmos fatos. O julgamento independente recomendou A; a fila global por ação foi rejeitada nesta entrega por exigir outra paginação/consulta e ampliar a superfície sem melhorar o lançamento solicitado. Não há nova tabela ou migração de dados operacionais.

Verificação: lote atômico, redistribuição de quantidades, replay após resposta perdida, conflito/pertencimento de IDs, triagem e passagem à coordenação, trabalhos paralelos e permissões; navegador com múltiplas linhas, rascunho, evidência, catálogo e celular. Produção é conferida sem criar operações fictícias.

# Regras de trocas conferidas com as fontes

Revisão de 22/11/2026. As transcrições completas dos três áudios foram usadas conforme confirmação do usuário. Os áudios originais não estavam mais nos caminhos fornecidos; esta revisão não afirma uma nova escuta. Os arquivos de origem e os resultados com dados de clientes ficam em armazenamento privado, fora do Git.

| Fonte | Regra extraída | Implementação e prova |
| --- | --- | --- |
| Áudio 1, 595–706 s | Protocolo único por remessa, identificação do cliente e separação por modelo, qualidade e fábrica | Recebimento/triagem, catálogo, etiquetas, resumo do cliente; integração e E2E de interface |
| Áudio 1, 766–856 s | Rick separa modelos e testa peças aceitas; precisa de fila própria | Reteste com responsável/prazo, diagnóstico e recomendação; teste de atribuição e tarefas simultâneas |
| Áudio 2, 2–75 s e 128–131 s | VV exige lote; outros fluxos começam individuais | Matriz VV/D.E./STC/TC-OMG: envio, recusa, retorno físico, retirada e encerramento; DE permite lote opcional comprovado no histórico D.E. A4 |
| Áudio 2, 84–116 s | Vender de novo passa por recuperação; cancelamento pressupõe peça nova vendável | Revenda, reparo atribuído, inspeção, entrada de estoque e venda original; E2E até encerramento |
| Áudio 2, 303–406 s | Novo e vender de novo são resultados diferentes; vídeo e defeito não reproduzido exigem análise | Motivos estruturados, revisão da coordenação, impedimento de concluir triagem incompleta |
| Áudio 2, 521–608 s | Preço unitário, total, motivos e separação de telas e baterias | Fórmula de preço exata, resumo por resultado/modelo e créditos por categoria |
| Áudio 2, 679 s | Identificar modelos recusados, em vez de informar só o total | Item exige modelo, quantidade, teste e motivo; dados históricos sem modelo não são inventados |
| VL MANUAL F2 / G2 | Média ponderada assinada por cliente/SKU, ROUND 0; fallback SISTEMA coluna 6; NOVO acima de 2500 | BigInt em centavos, validação da fórmula/faixa, provas independentes e preços cacheados do Excel |
| DEFEITOS B2 | OK apenas significa que CL foi preenchido | Consulta preserva status original; importação não aprova, entrega ou lança crédito |
| DEFEITOS M2 / O2 | Baterias quando SKU começa B; equivalência de SKU em Inativo | Resumo por categoria, equivalência na conservação de estoque; preço continua ligado ao SKU original |
| RESUMO E:J / Estoque Defeitos | Acompanhar originais recebidos, destinos, recuperação e China | Controle nativo por protocolo/modelo/fábrica, período de recebimento e destinos pendentes/concluídos; estoque recuperado exige entrada inspecionada |
| Usuário: paralelo durante aprendizado | Mesma troca pode constar nos dois controles | Vínculo de identidade, conflito de revisão, conciliação de créditos por documento com limite financeiro, devolução de autoridade sem novo dinheiro |
| Usuário: Isis coordena | Retorno e acompanhamento das pendências | Coordenadora configurada, retorno automático da triagem, fila geral e tarefas técnicas |
| Usuário: WhatsApp adiado | Sem configuração/envio agora | Contato manual disponível; nenhum envio real de teste |

## Cobertura das abas

| Arquivo / abas | Função que passou ao sistema |
| --- | --- |
| CL178: Formulario | Referência de recebimento/resultado e impressão por cliente. Histórico integral preservado sem fabricar o destino físico antigo. |
| CL178: Modelos / Planilha1 / Clientes | Catálogo de identificação, apoio de referências e consulta histórica. O cadastro de clientes operacional é o do CRM. |
| TROCAS-DEFEITOS: VV / D.E. / TC-OMG | Encaminhamento por fábrica e histórico consultável. STC permanece distinta de TC-OMG. |
| Principal: VL MANUAL / VL AUTO | Cálculo, seleção de modelos e motivos, resultados recusados/análise/novo/revenda. |
| Principal: DEFEITOS | Consulta viva durante transição; protocolos e movimentos nativos para os novos fatos. |
| Principal: Resumo de trocas | Resumo do protocolo para cliente, quantidades, motivos, telas/baterias e créditos. |
| Principal: SALDO / SALDO 2 | Posição derivada de créditos; carteira e projeção financeira com origem e conciliação. Não importar o mesmo crédito duas vezes. |
| Principal: OUT | Base assinada de vendas para média; após o corte, base preservada mais vendas novas do CRM. |
| Principal: Inativo | 270 equivalências de SKU, com proteção de ciclos e ambiguidades. |
| Principal: Recondicionado / Estoque Defeitos / RESUMO / CHINA | Histórico consultável e controle nativo de originais/destinos, fila técnica e estoque recuperado. Os totais antigos não geram estoque novo sem conferência. |
| Principal: SISTEMA | Catálogo e preço de fallback; manutenção nativa com justificativa para operar após corte. |

## Limites das fontes que o sistema conserva

A origem contém erros Excel e referências sem preço. A comparação não transforma erro, zero ou preço negativo em dinheiro. Das 144.640 combinações cliente/SKU, 144.414 permitiram comparação independente sem diferença; 398 valores numéricos cacheados também coincidiram. As 226 restantes exigem conferência (109 com preço zero/negativo; 117 sem média/catálogo utilizável). Esses números são da revisão de arquivo identificada no relatório de prova, não uma contagem de protocolos de troca.

O formulário Juari soma 68 peças: 21 aprovadas, 4 VV para análise, 36 para revenda e 7 sem modelo individual identificado. Preserve esses dados sem inventar os sete modelos. A foto CL1339 informa 27/11 sem ano confirmado; não foi convertida em recebimento datado automaticamente.

Não existe prazo numérico de garantia comprovado nas fontes fornecidas. A constatação fora do prazo e as exceções precisam de evidência e autorização registradas. A automação calcula, encaminha e cobra pendências; testes físicos, laudos de fábrica, recebimento e entrega são fatos registrados pelas pessoas responsáveis.

## Como reproduzir

Use os testes PostgreSQL e scripts de verificação citados em trocas-fabricas-e-transicao.md. verify-return-workbook-rules.mjs compara o arquivo real sem modificá-lo; verify-return-workbook-database.mjs importa em esquema local isolado duas vezes, confere contagens e ausência de dinheiro/estoque operacional. verify-returns-complete.cjs prova lote de clientes mistos, decisões/entregas parciais e encerramento; verify-returns-operations.cjs prova catálogo, reteste, recuperação, estoque, cancelamento calculado, saldo financeiro e histórico.

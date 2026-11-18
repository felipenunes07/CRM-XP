# Trocas — recebimento, protocolo, triagem e fila da Isis

Primeira parte do processo operacional definido em 18/11/2026. A nova página fica em `/trocas`, no menu **Trocas**. Isis coordena a fila; cada executor registra o trabalho realizado.

## O que funciona nesta entrega

- Um protocolo numerado por remessa, ligado ao cliente existente. Duas remessas do mesmo cliente têm protocolos distintos. Reenviar a mesma solicitação de criação não duplica o recebimento.
- Registro de data/hora, recebedor autenticado, volumes, quantidades declarada e contada, localização e observações. Diferenças ficam destacadas. Correções da contagem exigem motivo e não podem ficar abaixo da soma dos itens.
- Responsável ativo com acesso às trocas, prazo interno e próxima ação. A fila oferece busca por protocolo/cliente, situação, prazo vencido, responsabilidade do usuário e paginação.
- Triagem por grupos de quantidade: modelo, SKU opcional, aro, cor, fábrica/selo, teste/inspeção, motivo e resultado. Um mesmo modelo com resultados diferentes fica em grupos separados.
- Resultados: pendente, aprovado, recusado, análise externa, sem defeito constatado para devolução, conferência para revenda e revisão técnica pendente.
- JPG, PNG ou PDF de até 5 MB, até 20 anexos por protocolo, armazenados no Postgres e acessíveis apenas pela API autenticada. Metadados são separados dos bytes.
- Etiqueta imprimível com protocolo, cliente, quantidades, recebedor, data e localização.
- Histórico com autoria, data e dados anteriores/novos. Edições simultâneas do mesmo protocolo são detectadas e não sobrescrevem uma à outra.

## Como operar

1. Recepção abre **Novo recebimento**, seleciona o cliente e registra a contagem/localização. Após salvar, imprime a etiqueta e pode anexar fotos/documentos.
2. Isis define responsável, prazo e próxima ação. Apenas usuários ativos com `returns.view` e `returns.manage` aparecem como executores.
3. O técnico inicia a triagem e cadastra os grupos. Para dividir cinco peças em dois resultados, registra, por exemplo, um grupo de duas e outro de três.
4. Recusa, devolução sem defeito e conferência para revenda precisam de motivo; análise externa precisa de fábrica. Todo resultado técnico definitivo precisa de modelo e teste/inspeção registrado.
5. **Concluir triagem** só funciona quando todas as peças contadas estão cadastradas e nenhuma permanece em identificação/revisão pendente. O encaminhamento para fábrica conclui a decisão de encaminhamento desta etapa, não a análise da fábrica.
6. A triagem concluída permanece consultável no filtro específico ou em **Todos**. A próxima ação passa a ser conferir os destinos com Isis; ela pode reatribuir responsável e prazo para o acompanhamento.
7. Correções de itens após essa conclusão exigem **Reabrir triagem**, com motivo e responsável ativo/prazo definidos. Não existe botão para encerrar toda a troca nesta entrega.

## Limite funcional

Triagem concluída **não** comprova crédito, cancelamento, lote enviado, retorno de fábrica, entrega, recondicionamento ou destino final. Esses fluxos pertencem às entregas seguintes. Esta entrega não importa as planilhas antigas nem cria operações financeiras ou mensagens de WhatsApp.

## Implantação

- O banco principal é o Postgres da API, não o Supabase auxiliar. A migração foi acrescentada ao final de `apps/api/src/db/migrations.ts`, usando o mecanismo versionado existente.
- A migração cria `return_cases`, `return_items`, `return_events` e `return_attachments`, seus índices e as permissões. Não altera dados operacionais existentes.
- O servidor já executa as migrações no startup. Frontend e backend precisam ser publicados juntos; publicar só o frontend deixa as novas rotas indisponíveis.
- `returns.view` libera consulta e anexos; `returns.manage`, junto da primeira, libera operação. Os padrões de admin e operacional incluem ambos. Perfis de vendas/viewer/financeiro não ganham acesso automaticamente. A tela administrativa pode conceder exceções individuais.
- Conferir o perfil real de Isis e dos técnicos no ambiente publicado. Usuários exclusivos de tarefas continuam sujeitos à restrição existente desse papel; não houve alteração de contas reais nesta entrega.
- Ainda não houve migração ou publicação no ambiente de produção.

## Verificação reproduzível

Foi usado um Postgres local independente, ouvindo em `127.0.0.1:15438`, banco `crm_returns_test`. O teste recusa URLs fora de localhost ou com outro nome de banco; suas tabelas ficam em schema próprio removido ao terminar.

```powershell
$env:RETURN_WORKFLOW_TEST_DATABASE_URL='postgresql://trocas_test@127.0.0.1:15438/crm_returns_test'
$env:DATABASE_URL=$env:RETURN_WORKFLOW_TEST_DATABASE_URL
$env:JWT_SECRET='local-test-only-secret'
$env:REDIS_URL=''
npx vitest run apps/api/src/modules/returns/returnService.integration.test.ts
npm run build -w @olist-crm/api
npm run build -w @olist-crm/web
```

`scripts/preview-returns.mts` inicia as rotas reais da API nesse banco isolado, com clientes/perfis de demonstração e sem iniciar worker/agendadores. Escuta apenas em `127.0.0.1:15439`. Para iniciá-lo, use as variáveis acima e `WEB_ORIGIN=http://127.0.0.1:5187`.

Para o frontend de demonstração, use `VITE_API_BASE_URL=http://127.0.0.1:15439`, `VITE_SUPABASE_URL=http://127.0.0.1:54321` e uma chave local fictícia em `VITE_SUPABASE_ANON_KEY`; rode Vite na porta 5187. São fixtures locais, não credenciais do ambiente publicado.

`scripts/verify-returns.cjs` percorre o fluxo no Chrome usando Playwright: recebimento, atribuição, resultados mistos, obrigatoriedade do motivo, anexo/download, conclusão, recarga, impressão e tela estreita. Informe `PLAYWRIGHT_MODULE` quando Playwright estiver em um runtime externo e `RETURN_SCREENSHOT_DIR` para guardar as evidências. O teste usa somente as portas locais acima.

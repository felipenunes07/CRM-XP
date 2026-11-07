# Packlist e planejamento de compras

A aba **Estoque → Compras** cruza o estoque atual do CRM, as vendas por SKU do banco principal e os lotes da aba `PACKLIST` do Excel. Há duas listas:

1. **Reposição sem lote a caminho**: demanda com cobertura insuficiente e nenhuma quantidade pendente cadastrada.
2. **Reposição insuficiente e urgências**: existe quantidade a caminho, mas a quantidade ou a data de chegada não evita falta nos próximos 60 dias.

## Fonte e atualização

O worker verifica o arquivo na inicialização e a cada 15 minutos. Compara caminho, tamanho e data de modificação antes de baixar ou processar novamente. Usa o arquivo local quando disponível; em outros ambientes, usa o cliente Dropbox já configurado no CRM.

```dotenv
DROPBOX_PACKLIST_FILE_PATH=/Packlist/Telas PACKLIST.xlsx
PACKLIST_WORKBOOK_PATH=C:\Users\Felipe\Dropbox\Packlist\Telas PACKLIST.xlsx
PACKLIST_SYNC_INTERVAL_MINUTES=15
```

No servidor, configure as credenciais Dropbox existentes (`DROPBOX_REFRESH_TOKEN`, `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`, ou `DROPBOX_ACCESS_TOKEN`). Não há credencial nova específica para Packlist. A migração de `inventory_packlist_snapshot` é aplicada pelo bootstrap normal da API/worker.

Administradores e gerentes podem antecipar a checagem com **Atualizar Packlist**, que chama `POST /api/inventory/packlist/refresh`. A leitura aparece em `GET /api/inventory/buying`, junto das recomendações. As telas atualizam a consulta de compras a cada minuto.

## Regras

- Apenas `PACKLIST` é lida na importação. As vendas e o saldo do Excel não são importados.
- SKU em B, produto em C, cabeçalhos nas linhas 1–3 e quantidades a partir da linha 4. Colunas ocultas participam. Linhas sem SKU, cabeçalhos repetidos e colunas sem número de lote são ignorados.
- `RECEIVED` não entra como chegada futura. `NOT FINISHED` fica identificado como cadastro incompleto. Os números já são unidades por SKU/lote e não são multiplicados pelo número de caixas.
- Todos os lotes usam **saída + 60 dias**, enquanto não houver convenção confirmada para identificar os aéreos. Um `R` no identificador não altera o prazo nesta versão.
- As datas de saída podem estar junto do texto de caixas. Quando não têm ano, usa-se a ocorrência mais recente até a data de modificação do arquivo, no fuso de São Paulo. Essa inferência aparece nos detalhes do lote.
- A demanda diária usa vendas dos últimos 90 dias divididas por 90, acompanhando a base já usada pelo CRM para cobertura.
- A projeção consome o saldo entre as chegadas e até o dia 60. A compra sugerida é o maior déficit nessa trajetória, arredondado para cima. Assim, um lote grande que chega depois da ruptura não esconde a falta anterior.
- Lotes atrasados, incompletos, sem data ou com saída futura não reduzem a compra sugerida. Seus valores continuam visíveis para conferência. Saldo negativo é tratado como indisponibilidade, sem inventar pedidos em atraso.
- Falta antes de 60 dias gera a indicação **Avaliar envio aéreo**. Isso é recomendação, sem emitir pedidos.
- SKUs do Packlist fora do catálogo do estoque são sinalizados; não são associados por aproximação de nome ou por qualidade.
- Uma falha de leitura preserva a última importação válida e fica visível na tela. Sem leitura válida, não se apresenta uma projeção com zero mercadorias a caminho.

## Conferência reproduzível

O comando abaixo lê o Excel, confere as quantidades por SKU/lote com a aba `IMPORT` e não altera arquivos nem banco:

```powershell
npx tsx apps/api/src/scripts/checkPacklist.ts 'C:\Users\Felipe\Dropbox\Packlist\Telas PACKLIST.xlsx'
```

Um terceiro argumento opcional com o caminho de um `.env` habilita a comparação com estoque e vendas do CRM. Essa comparação usa uma transação `READ ONLY`, sem executar migrações ou importar dados. A saída contém contagens e exemplos de SKUs, sem dados de clientes.

Testes direcionados, com variáveis de teste definidas:

```powershell
cd apps/api
npx vitest run src/modules/crm/packlistCore.test.ts src/modules/crm/packlistService.test.ts src/modules/crm/inventoryIntelligenceService.test.ts
```

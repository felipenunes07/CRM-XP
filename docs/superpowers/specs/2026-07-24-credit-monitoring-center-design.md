# Especificação de Design: Centro de Monitoramento de Crédito dos Clientes

## Visão Geral
Redesign completo da interface de acompanhamento financeiro de clientes (`CustomerCreditExecutiveSummary`, `CustomerCreditCardList`, `CustomerFinancialPage` e estilos associados), transformando-a em um **Centro de Monitoramento de Crédito e Risco** com a mesma linguagem visual, sofisticação e facilidade de uso da tela de *Inteligência do WhatsApp (`/eventos`)*.

---

## Componentes e Layout Propostos

### 1. Cabecalho de Comando e Status (Command Center Header)
- **Título & Subtítulo**: "Centro de Monitoramento de Crédito & Risco" com subtexto explicativo sobre monitoramento de limites, dívidas e oportunidades em tempo real.
- **Badges de Status em Tempo Real**:
  - `Última leitura / Snapshot`: Data e horário do arquivo importado.
  - `Clientes vinculados`: Total de clientes mapeados no sistema.
  - `Códigos para revisar`: Alerta visual para clientes não pareados.
  - `Indicador de Saúde da Carteira`: Badge com brilho e tom dinâmico (`Atenção Máxima`, `Risco Elevado`, `Carteira Controlada`).
- **Ação Principal**: Botão "Atualizar Planilha" com animação de spinner quando em atualização.

### 2. KPIs de Alto Impacto e Insights Automáticos
- **Cards de Métricas Executivas (4 Cards com Bordas e Tons Temáticos)**:
  1. `Total em Aberto`: Valor total devedor + contagem de clientes devedores.
  2. `Dívida Vencida`: Valor vencido + % em relação ao total em aberto (destaque vermelho).
  3. `Exposição Acima do Limite`: Valor excedente + contagem de clientes estourados.
  4. `Crédito Disponível`: Valor livre para novas vendas + contagem de clientes sem dívida.
- **Faixa de Insights Inteligentes (3 Pílulas de Conclusão Automática)**:
  - Percentual da dívida fora do prazo.
  - Concentração nos 5 maiores saldos.
  - Clientes em situação crítica ou sem pagamentos registrados.

### 3. Radar por Abas de Risco (Feed de Monitoramento Estilo `/eventos`)
Filtros rápidos em formato de abas/pílulas com contadores dinâmicos:
- `🚨 Alertas Críticos`: Clientes acima do limite ou vencidos há +30 dias.
- `⚡ Cobrar Hoje`: Clientes com cobrança prioritária necessária no dia.
- `⚠️ Vencidos`: Clientes com saldo vencido em aberto.
- `⏳ Vencendo em 7d`: Clientes com vencimento próximo.
- `✅ Crédito Livre`: Clientes com limite disponível e sem atrasos.
- `🌐 Todos os Clientes`: Visão completa da carteira.

### 4. Cards do Centro de Monitoramento (Cards Ricos de Clientes)
Redesign total do componente `CustomerCreditCardList` / `CustomerCreditCard`:
- **Cabeçalho do Card**: Nome do Cliente, Código, Fonte e Badge de Grau de Risco (`CRÍTICO`, `ALTO`, `MÉDIO`, `CONTROLADO`).
- **Métrica Principal**: Valor em dívida / a favor com tipografia destacada e cores contextuais.
- **Barra Visual de Uso de Limite**: Progresso de consumo do limite de crédito com indicador vermelho em caso de estouro (+100%).
- **Tags de Alerta Inteligente**: Pílulas coloridas para *Excesso de limite*, *Sem pagamento*, *Vencido +30d*, etc.
- **Barra de Ações Rápidas (1-Clique)**:
  - Botão **"Cobrar via WhatsApp"**: Envio imediato/abertura de chat para cobrança com texto dinâmico.
  - Botão **"Ver Extrato / Pedidos"**: Abre o drawer de detalhes financeiros e títulos do cliente.
  - Botão **"Ficha do Cliente"**: Navega diretamente para a página do cliente.

### 5. Análise de Risco (Envelhecimento & Concentração)
- **Painel Envelhecimento da Dívida**: Barras de progresso dinâmicas e clicáveis para filtrar a carteira por faixa de vencimento.
- **Painel Maiores Saldos (Ranking de Concentração)**: Ranking visual com barras relativas dos 5 maiores saldos devedores da carteira.

---

## Verificação e Testes
- Executar os testes unitários da página de crédito (`CustomerFinancialPage.test.tsx`, `customerCredit.test.ts`).
- Validar a renderização no navegador.

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const DATABASE_URL = process.env.DATABASE_URL;
const ARTIFACT_DIR = "C:\\Users\\Felipe\\.gemini\\antigravity-ide\\brain\\5bf2ac87-0808-4aff-91ef-60e6b41647ac";
const PROJECT_ART_DIR = "c:\\Users\\Felipe\\Desktop\\CRM XP\\CRM-XP\\artifacts";

const MIN_QTY = 30;
const MIN_STOCK = 50;

async function run() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
  });

  try {
    console.log('Connecting to database...');
    
    // 1. Query Top 30 SKUs globally for Active/Attention customers which have at least MIN_STOCK in stock
    const top30Query = `
      SELECT 
        oi.sku,
        MAX(oi.item_description) as description,
        SUM(oi.quantity) as total_quantity_bought,
        COUNT(DISTINCT o.customer_id) as unique_customers_buying,
        COUNT(DISTINCT o.id) as number_of_orders,
        MAX(isi.stock_quantity) as current_stock,
        MAX(isi.price) as unit_price
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN customer_snapshot cs ON cs.customer_id = o.customer_id
      JOIN inventory_snapshots snap ON snap.is_active = TRUE
      JOIN inventory_snapshot_items isi ON (isi.sku = oi.sku AND isi.snapshot_id = snap.id)
      WHERE cs.status IN ('ACTIVE', 'ATTENTION')
        AND oi.sku IS NOT NULL
        AND isi.stock_quantity >= $1
      GROUP BY oi.sku
      ORDER BY total_quantity_bought DESC
      LIMIT 30
    `;

    console.log(`Running global top 30 in-stock SKUs query (stock >= ${MIN_STOCK})...`);
    const top30Res = await pool.query(top30Query, [MIN_STOCK]);
    const top30Rows = top30Res.rows;

    // 2. Query per-customer SKU sales ranked (qty >= MIN_QTY, stock >= MIN_STOCK)
    const customerSkuQuery = `
      WITH customer_sku_sales AS (
        SELECT 
          cs.customer_code as cl,
          cs.display_name as customer_name,
          cs.status as customer_status,
          oi.sku,
          MAX(oi.item_description) as product_name,
          SUM(oi.quantity) as total_quantity_bought,
          COALESCE(isi.stock_quantity, 0) as stock_balance,
          COALESCE(isi.price, 0) as unit_price
        FROM customer_snapshot cs
        JOIN orders o ON o.customer_id = cs.customer_id
        JOIN order_items oi ON oi.order_id = o.id
        JOIN inventory_snapshots snap ON snap.is_active = TRUE
        JOIN inventory_snapshot_items isi ON (isi.sku = oi.sku AND isi.snapshot_id = snap.id)
        WHERE cs.status IN ('ACTIVE', 'ATTENTION')
          AND oi.sku IS NOT NULL
        GROUP BY cs.customer_code, cs.display_name, cs.status, oi.sku, isi.stock_quantity, isi.price
        HAVING SUM(oi.quantity) >= $1 AND COALESCE(isi.stock_quantity, 0) >= $2
      ),
      ranked_sales AS (
        SELECT 
          cl,
          customer_name,
          customer_status,
          sku,
          product_name,
          total_quantity_bought,
          stock_balance,
          unit_price,
          ROW_NUMBER() OVER(PARTITION BY cl ORDER BY total_quantity_bought DESC) as customer_sku_rank
        FROM customer_sku_sales
      )
      SELECT * 
      FROM ranked_sales
      ORDER BY customer_name ASC, total_quantity_bought DESC
    `;

    console.log(`Running customer-specific SKU cross-referencing (purchased >= ${MIN_QTY}, stock >= ${MIN_STOCK})...`);
    const custSkuRes = await pool.query(customerSkuQuery, [MIN_QTY, MIN_STOCK]);
    const custSkuRows = custSkuRes.rows;

    // 3. Generate CSV
    console.log('Generating CSV files...');
    const csvHeader = 'CL;Cliente;Status;Rank SKU Cliente;SKU;Descricao Produto;Qtd Comprada;Saldo Estoque;Preco Unitario;Valor Total Comprado\n';
    const csvRows = custSkuRows.map(row => {
      const cl = (row.cl || '').replace(/;/g, ' ');
      const client = (row.customer_name || '').replace(/;/g, ' ');
      const status = (row.customer_status || '').replace(/;/g, ' ');
      const product = (row.product_name || '').replace(/;/g, ' ');
      const sku = (row.sku || '').replace(/;/g, ' ');
      const qty = parseFloat(row.total_quantity_bought || 0);
      const stock = parseInt(row.stock_balance || 0);
      const price = parseFloat(row.unit_price || 0);
      const totalVal = qty * price;
      return `"${cl}";"${client}";"${status}";${row.customer_sku_rank};"${sku}";"${product}";${qty};${stock};${price.toFixed(2)};${totalVal.toFixed(2)}`;
    }).join('\n');
    const csvContent = csvHeader + csvRows;

    // Save CSV to artifact dir and project dir
    const artifactCsvPath = path.join(ARTIFACT_DIR, 'cruzamento_clientes_estoque.csv');
    const projectCsvPath = path.join(PROJECT_ART_DIR, 'cruzamento_clientes_estoque.csv');

    fs.writeFileSync(artifactCsvPath, csvContent, 'utf-8');
    try {
      if (!fs.existsSync(PROJECT_ART_DIR)) {
        fs.mkdirSync(PROJECT_ART_DIR, { recursive: true });
      }
      fs.writeFileSync(projectCsvPath, csvContent, 'utf-8');
    } catch (e) {
      console.warn('Could not write to project artifacts directory:', e.message);
    }

    console.log(`CSV saved to ${artifactCsvPath}`);

    // 4. Generate Markdown Artifact Content
    console.log('Generating Markdown Report...');

    // Summary metrics
    const totalActiveCustomers = new Set(custSkuRows.filter(r => r.customer_status === 'ACTIVE').map(r => r.cl)).size;
    const totalAttentionCustomers = new Set(custSkuRows.filter(r => r.customer_status === 'ATTENTION').map(r => r.cl)).size;
    const totalMatchRows = custSkuRows.length;
    const totalVolumeSold = custSkuRows.reduce((acc, r) => acc + parseFloat(r.total_quantity_bought), 0);

    let md = `# Relatório de Oportunidades: Clientes Ativos/Atenção vs Estoque Atual

Este relatório apresenta o cruzamento de dados de vendas de clientes em status **ATIVO (ACTIVE)** e **ATENÇÃO (ATTENTION)** com os produtos que eles mais compram, filtrados estrategicamente por alta relevância de compras e grande disponibilidade física.

---

## 📊 Filtros Estratégicos Aplicados

> [!IMPORTANT]
> A pedido do usuário, foram definidos filtros estritos para focar apenas em ações com alto retorno comercial e logístico viável:
> - **Filtro de Compras por Cliente**: O cliente deve ter comprado **no mínimo ${MIN_QTY} unidades** do produto no histórico (evita sugerir itens de compras eventuais/baixas).
> - **Filtro de Estoque Atual**: O produto deve possuir **no mínimo ${MIN_STOCK} unidades** disponíveis em estoque no momento (evita campanhas de itens com estoque baixo que esgotariam rapidamente).

---

## 📈 Métricas do Cruzamento Filtrado

| Métrica | Valor | Descrição |
| :--- | :---: | :--- |
| **Clientes Ativos Analisados** | \`${totalActiveCustomers}\` | Clientes com forte volume de compras regular |
| **Clientes em Atenção Analisados** | \`${totalAttentionCustomers}\` | Clientes com alto volume histórico, excelentes alvos de reativação |
| **Total de Oportunidades Geradas** | \`${totalMatchRows}\` | Cruzamentos de alta aderência (Cliente ↔ SKU relevante) |
| **Volume Total Histórico (Desses SKUs)** | \`${totalVolumeSold.toLocaleString('pt-BR')}\` unidades | Volume consolidado de vendas dessas peças para esta base |

---

## 🏆 Top 30 Peças/SKUs Mais Comprados (Em Estoque >= ${MIN_STOCK})

A tabela abaixo exibe as **30 peças mais compradas** pelos clientes selecionados e que possuem **estoque disponível igual ou superior a ${MIN_STOCK} unidades**.

| Rank | SKU | Descrição do Produto | Qtd Comprada (Total) | Clientes Únicos | Pedidos | Estoque Atual | Preço Unit. (R$) |
| :---: | :---: | :--- | :---: | :---: | :---: | :---: | :---: |
`;

    top30Rows.forEach((row, index) => {
      const desc = row.description ? row.description.trim().replace(/\|/g, '\\|') : 'N/A';
      md += `| **${index + 1}** | \`${row.sku}\` | ${desc} | ${parseFloat(row.total_quantity_bought).toLocaleString('pt-BR')} | ${row.unique_customers_buying} | ${row.number_of_orders} | **${row.current_stock}** | R$ ${parseFloat(row.unit_price).toFixed(2)} |\n`;
    });

    md += `
---

## 👥 Resumo de Oportunidades por Cliente (Amostra dos Top Clientes)

Exibição parcial dos principais clientes e os SKUs mais relevantes associados a eles que cumprem os critérios mínimos estabelecidos (**Compra >= ${MIN_QTY} unids** e **Estoque >= ${MIN_STOCK} unids**).

| CL | Cliente | Status | SKU | Descrição do Produto | Qtd Comprada | Saldo Estoque | Preço (R$) |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: | :---: |
`;

    // Take top 25 rows for preview
    const previewRows = custSkuRows.slice(0, 25);
    previewRows.forEach(row => {
      const clientName = row.customer_name.length > 25 ? row.customer_name.substring(0, 25) + '...' : row.customer_name;
      const desc = row.product_name ? row.product_name.trim().replace(/\|/g, '\\|') : 'N/A';
      const truncatedDesc = desc.length > 35 ? desc.substring(0, 35) + '...' : desc;
      const statusLabel = row.customer_status === 'ACTIVE' ? '🟢 Ativo' : '🟡 Atenção';
      md += `| \`${row.cl}\` | ${clientName} | ${statusLabel} | \`${row.sku}\` | ${truncatedDesc} | ${parseFloat(row.total_quantity_bought).toLocaleString('pt-BR')} | **${row.stock_balance}** | R$ ${parseFloat(row.unit_price).toFixed(2)} |\n`;
    });

    md += `
---

## 💾 Download do Relatório Completo Filtrado

> [!TIP]
> A planilha completa foi exportada em formato CSV (separador ponto-e-vírgula \`;\`). Os registros de quantidade comprada baixa (abaixo de ${MIN_QTY}) e estoque baixo (abaixo de ${MIN_STOCK}) foram totalmente removidos.
>
> Você pode abrir ou baixar a planilha pelos caminhos abaixo:
> - **Planilha CSV Completa (Filtrada):** [cruzamento_clientes_estoque.csv](file:///C:/Users/Felipe/.gemini/antigravity-ide/brain/5bf2ac87-0808-4aff-91ef-60e6b41647ac/cruzamento_clientes_estoque.csv)
> - **Cópia no Repositório:** [cruzamento_clientes_estoque.csv](file:///c:/Users/Felipe/Desktop/CRM%20XP/CRM-XP/artifacts/cruzamento_clientes_estoque.csv)

### Colunas da planilha CSV:
1. **CL**: Código identificador do cliente.
2. **Cliente**: Nome do cliente.
3. **Status**: Status do cliente (\`ACTIVE\` ou \`ATTENTION\`).
4. **Rank SKU Cliente**: Posição do produto no histórico de compras daquele cliente específico (1 = o produto que ele mais compra, 2 = o segundo mais comprado, etc.).
5. **SKU**: Código do produto.
6. **Descricao Produto**: Descrição técnica da peça.
7. **Qtd Comprada**: Quantidade total comprada por este cliente (garantida >= ${MIN_QTY}).
8. **Saldo Estoque**: Estoque disponível no momento (garantido >= ${MIN_STOCK}).
9. **Preco Unitario**: Preço unitário.
10. **Valor Total Comprado**: Faturamento histórico deste item para este cliente (\`Qtd Comprada × Preço Unitário\`).
`;

    const artifactMdPath = path.join(ARTIFACT_DIR, 'relatorio_cruzamento.md');
    fs.writeFileSync(artifactMdPath, md, 'utf-8');
    console.log(`Markdown report saved to ${artifactMdPath}`);

  } catch (err) {
    console.error('Error running report generation:', err);
  } finally {
    await pool.end();
  }
}

run();

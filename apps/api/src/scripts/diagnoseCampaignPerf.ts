/**
 * Diagnóstico de performance do detalhe de campanha.
 *
 * Rodar no console do serviço crm-backend (EasyPanel):
 *   npm run db:diagnose -w @olist-crm/api
 *
 * Não precisa de psql, extensão ou nome de banco — usa a própria conexão da API
 * (DATABASE_URL). Mede o detalhe COM e SEM a atribuição ao vivo e mostra o
 * tamanho das tabelas e o uso (idx_scan) dos índices, pra provar o gargalo.
 */
import { pool } from "../db/client.js";
import { getWhatsappCampaignDetail } from "../modules/whatsapp/whatsappCampaignService.js";

function ms(start: number) {
  return `${Date.now() - start} ms`;
}

async function main() {
  console.log("\n========== TAMANHO DAS TABELAS QUENTES ==========");
  const sizes = await pool.query(
    `
    SELECT relname AS tabela,
           n_live_tup AS linhas,
           pg_size_pretty(pg_total_relation_size(relid)) AS tamanho
    FROM pg_stat_user_tables
    WHERE relname IN (
      'deal_activities','whatsapp_incoming_messages','whatsapp_monitor_messages',
      'whatsapp_campaign_recipients','message_logs','whatsapp_jid_aliases',
      'orders','order_items'
    )
    ORDER BY n_live_tup DESC
    `,
  );
  console.table(sizes.rows);

  console.log("\n========== USO DOS ÍNDICES (idx_scan baixo = índice ignorado) ==========");
  const idx = await pool.query(
    `
    SELECT relname AS tabela,
           indexrelname AS indice,
           idx_scan AS usos,
           pg_size_pretty(pg_relation_size(indexrelid)) AS tamanho
    FROM pg_stat_user_indexes
    WHERE relname IN (
      'whatsapp_incoming_messages','deal_activities','whatsapp_campaign_recipients',
      'whatsapp_monitor_messages','message_logs','whatsapp_jid_aliases'
    )
    ORDER BY relname, idx_scan ASC
    `,
  );
  console.table(idx.rows);

  console.log("\n========== BLOAT: LINHAS MORTAS vs VIVAS (a causa da lentidão) ==========");
  const bloat = await pool.query(
    `
    SELECT relname AS tabela,
           n_live_tup AS vivas,
           n_dead_tup AS mortas,
           CASE WHEN n_live_tup > 0
                THEN round(n_dead_tup::numeric * 100 / n_live_tup, 0)
                ELSE NULL END AS pct_morto,
           to_char(last_autovacuum, 'YYYY-MM-DD HH24:MI') AS ultimo_autovacuum,
           pg_size_pretty(pg_table_size(relid)) AS heap,
           pg_size_pretty(pg_indexes_size(relid)) AS indices
    FROM pg_stat_user_tables
    WHERE relname IN (
      'deal_activities','whatsapp_incoming_messages','whatsapp_monitor_messages',
      'whatsapp_campaign_recipients','message_logs','orders','order_items'
    )
    ORDER BY n_dead_tup DESC
    `,
  );
  console.table(bloat.rows);

  console.log("\n========== CONFIG DO AUTOVACUUM ==========");
  const av = await pool.query(
    `
    SELECT name, setting
    FROM pg_settings
    WHERE name IN (
      'autovacuum','autovacuum_max_workers','autovacuum_naptime',
      'autovacuum_vacuum_scale_factor','autovacuum_vacuum_threshold',
      'autovacuum_vacuum_cost_limit','autovacuum_vacuum_cost_delay'
    )
    ORDER BY name
    `,
  );
  console.table(av.rows);

  const camp = await pool.query(
    `
    SELECT c.id, c.name, COUNT(*) FILTER (WHERE r.status = 'SENT') AS sent
    FROM whatsapp_campaigns c
    JOIN whatsapp_campaign_recipients r ON r.campaign_id = c.id
    GROUP BY c.id, c.name
    HAVING COUNT(*) FILTER (WHERE r.status = 'SENT') > 0
    ORDER BY c.created_at DESC
    LIMIT 1
    `,
  );

  if (!camp.rows[0]) {
    console.log("\nNenhuma campanha com envios encontrada — pulando medição de tempo.");
    await pool.end();
    return;
  }

  const { id, name, sent } = camp.rows[0];
  console.log(`\n========== CAMPANHA TESTADA: "${name}" (${sent} enviados) ==========`);

  let start = Date.now();
  await getWhatsappCampaignDetail(id, 5000, 0, true);
  console.log(`Detalhe SEM métricas (excludePerformance=true): ${ms(start)}`);

  start = Date.now();
  try {
    await getWhatsappCampaignDetail(id, 5000, 0, false);
    console.log(`Detalhe COM métricas (atribuição ao vivo):       ${ms(start)}`);
  } catch (error) {
    console.log(
      `Detalhe COM métricas: ESTOUROU após ${ms(start)} -> ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    console.log("(estouro = bateu no statement_timeout do pool; confirma que a atribuição passa do limite)");
  }

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

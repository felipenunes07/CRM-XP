import fs from 'fs';
const path = 'c:/Users/Felipe/Desktop/CRM XP/CRM-XP/apps/api/src/modules/crm/dashboardService.ts';
let content = fs.readFileSync(path, 'utf8');

// Update the second query inside the if block
const search2 = "SELECT\n          m.day::text AS date,\n          m.total_customers,\n          m.active_count,\n          m.attention_count,\n          m.inactive_count,\n          m.new_count,\n          COALESCE(s.daily_items_sold, 0)::int AS daily_items_sold\n        FROM dashboard_daily_metrics m\n        LEFT JOIN (\n          SELECT \n            o.order_date::date as day, \n            COALESCE(SUM(oi.quantity), 0)::int as daily_items_sold\n          FROM orders o\n          LEFT JOIN order_items oi ON oi.order_id = o.id\n          WHERE o.order_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date - ($1::int - 1)\n          GROUP BY o.order_date::date\n        ) s ON s.day = m.day\n        WHERE m.day >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date - ($1::int - 1)\n        ORDER BY m.day";

const replacement2 = "SELECT\n          day::text AS date,\n          total_customers,\n          active_count,\n          attention_count,\n          inactive_count,\n          new_count,\n          daily_items_sold\n        FROM dashboard_daily_metrics\n        WHERE day >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date - ($1::int - 1)\n        ORDER BY day";

// Use a more robust replace that handles variations in whitespace/indentation if possible, 
// but since I just viewed it, I'll use the exact strings.
// Actually, I'll use a regex for safety.

content = content.replace(/SELECT\s+m\.day::text AS date,[\s\S]+?ORDER BY m\.day/, replacement2);

fs.writeFileSync(path, content, 'utf8');
console.log("Done");
